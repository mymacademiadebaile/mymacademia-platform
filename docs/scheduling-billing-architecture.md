# Scheduling, attendance and billing architecture

Status: implemented on branch `feat/scheduling-billing-redesign` (October 2026).
Audience: engineers working on `apps/api` and `apps/web`.

This document describes how classes, sessions, enrollments, attendance and billing fit
together after the redesign, which existing pieces were kept, and how legacy data keeps
working before and after the migration runs.

## 1. Guiding rules

- Evolve, do not rewrite. Existing collections stay; new fields are additive and optional.
- Financial history is append-only. Confirmed collections are never edited or deleted;
  corrections are new documents (refunds, adjustments, voided charges with a reason).
- Calendar dates are `YYYY-MM-DD` strings in `America/Argentina/Buenos_Aires`.
  Instants (`receivedAt`, `createdAt`) are `Date`. Never derive a calendar day with UTC math.
- Money is stored as integer cents (`*Cents` fields). The legacy `Payment.amount` stays in pesos.
- Every multi-document write that must be atomic goes through `withTransaction`
  (`common/transaction.ts`).

## 2. Concepts

| Concept | Collection | Notes |
|---|---|---|
| Discipline | `CatalogItem` (type `DISCIPLINE`) | unchanged |
| Group | `DanceClass` | the existing "class". New statuses `PAUSED` / `ARCHIVED` (legacy `INACTIVE` = archived) |
| Recurring schedule | `ClassSchedule` (new) | weekly rule with validity `validFrom`/`validTo`; versions share a `seriesId` |
| Session | `ClassSession` | persistent identity `(seriesId, occurrenceDate)`; extra fields for state history, space, professors |
| Physical space | `DanceSpace` (new) | optional on schedules and sessions |
| Holiday | `Holiday` (new) | generated sessions on that date start as `SUSPENDED` |
| Enrollment | `Enrollment` | one document per student and group; validity `periods[]` and `billingChanges[]` keep history |
| Participant / attendance | `ClassAttendance` | now also the frozen roster of a session (snapshot) |
| Charge | `Charge` (new) | an obligation (monthly fee, class fee, other) |
| Collection | `Collection` (new) | money actually received |
| Allocation | `PaymentAllocation` (new) | applies a collection to a charge (partial allowed) |
| Refund | `Refund` (new) | money returned; dated on its own day |
| Adjustment | `FinancialAdjustment` (new) | discount, surcharge, credit transfer, write-off |
| Billing period | `BillingPeriod` (new) | one per organization and month; records generation runs |
| Migration issue | `MigrationIssue` (new) | ambiguous legacy data waiting for an administrator |

`DanceClass.schedules` is kept as a read cache of the rules that are valid today, so the public
site, the professor portal and older screens keep working unchanged.

## 3. Schedules and sessions

- A `ClassSchedule` is `{ seriesId, day, startTime, endTime, validFrom, validTo?, spaceId?, professorIds? }`.
- "This session and the following ones" closes the current version (`validTo = date - 1`) and
  creates a new version with the same `seriesId` from `date`. Materialized future sessions of that
  series that were not edited by hand are updated in place: their identity (`_id`) never changes.
- "Only this session" edits the session itself and sets `manualOverride = true`; the generator never
  touches it again.
- Legacy groups without rules are bootstrapped on demand (`ensureScheduleRules`): one rule per
  weekly slot, valid from the group's creation date. Idempotent through a unique `legacyKey`.

Session generation (`session-generator.ts`) is idempotent: an upsert keyed by
`(organizationId, seriesId, occurrenceDate)` with `$setOnInsert`. It runs:

- from the rolling window job (`scripts/generate-sessions.ts`, intended to be scheduled daily), and
- every time a calendar range is requested (only the missing sessions are inserted).

Legacy sessions (created before the redesign, without `seriesId`) are adopted when they match
`(classId, sessionDate, startTime)` instead of being duplicated.

The generator respects rule validity, group pauses (`DanceClass.pauses[]`), archived groups,
holidays and sessions that were suspended or rescheduled. Past dates are generated only from the
rule's `validFrom`, so changing a schedule never creates ghost sessions in the past.

`slotKey` (`classId:date:startTime`, present only while the session is active) is protected by a
unique partial index: two active sessions of the same group can never share a start time.

### Session states

```
SCHEDULED   -> IN_PROGRESS | COMPLETED | SUSPENDED | CANCELLED | RESCHEDULED
IN_PROGRESS -> COMPLETED | SUSPENDED | CANCELLED
SUSPENDED   -> RESCHEDULED | CANCELLED | SCHEDULED
COMPLETED   -> (final; reopening requires an explicit reason and is audited)
RESCHEDULED -> (final; points to rescheduledToSessionId)
CANCELLED   -> (final)
```

Every transition appends `{ from, to, reason, userId, at }` to `statusHistory` and writes an audit log.
A reschedule creates a new session with `origin = RESCHEDULED` and `rescheduledFromSessionId`;
charges and payments of the original session cover the new one (coverage follows the chain).

### Spaces and conflicts

`conflict-service.ts` rejects a session or rule that overlaps another active session in the same
space, or that shares a professor at the same time. It runs inside a transaction that also bumps a
`ResourceLock` document per organization and date, so two concurrent writes on the same day are
serialized by MongoDB's write-conflict detection.

## 4. Enrollments and coverage

- `Enrollment.periods[] = { startDate, endDate? }`: when a student was in the group. Leaving the
  group closes the open period; re-enrolling opens a new one. Nothing is overwritten.
- `Enrollment.billingChanges[] = { effectiveDate, mode }`: billing mode history. `billingPreference`
  keeps the current mode for compatibility.
- `Enrollment.seriesIds[]`: habitual schedules (organization and capacity only, never a limit on how
  many classes a monthly student may attend). Legacy `scheduleKeys` are still honoured.
- `Enrollment.priceOverride` holds optional commercial conditions.

Roster of a session = frozen `ClassAttendance` rows, or, while not frozen, enrollments valid on the
session date that match the session's series, plus booking overrides, trials and authorized
participants. The roster is frozen (rows written as `EXPECTED`) when attendance is recorded, when
the session is completed, or when a past session is read. Later drops never remove anyone from a
past session; new students never appear in sessions before their start date.

Capacity is evaluated per session and per space inside a transaction that bumps the session (or
group) document, so concurrent bookings for the last spot cannot both succeed.

## 5. Billing

- Monthly fees: `generateMonthlyCharges(period)` creates one `MONTHLY_FEE` charge per enrollment
  that is valid and in `MONTHLY` mode during the period. Unique `chargeKey`
  (`MONTHLY:<enrollmentId>:<YYYY-MM>`) makes it idempotent under retries and races. Due day is
  `Organization.billing.monthlyDueDay` (default 10).
- Mid-month enrollment: the policy is chosen per enrollment (`FULL`, `PRORATED`, `CUSTOM`).
  The organization default is `ASK`, so the admin screen always asks.
- Class fees: `ensureClassCharge(session, student)` creates `CLASS_FEE` keyed by
  `CLASS:<studentId>:<rootSessionId>` only when the student is not covered by a monthly charge.
- A monthly charge covers every ordinary session of that group in the period. There is no
  attendance limit.
- Collections record the real `receivedAt` instant and its local `accountingDate`. Partial
  payments, several charges per collection, unapplied credit and later application of that credit
  are supported. `idempotencyKey` prevents duplicates on retries.
- Refunds and adjustments are separate documents dated on the day they happen. Cash reports use
  collections and refunds by their own accounting date, so a closed day never changes.
- `balance-service.ts` is the single place that computes pending, overdue, partially paid and
  credit. A pending charge is overdue only when its `dueDate` is before today in Argentina.

## 6. Legacy payments and migration

- The legacy `Payment` collection is kept read-only for history. The old endpoints still work and
  mirror every write into the new model through `legacy-sync.ts`.
- Until the migration runs, read services also include legacy payments that have no mirror yet
  (`legacy-adapter.ts`), using the same conversion, so screens stay consistent.
- `scripts/migrate-scheduling-billing.ts` (dry-run by default, `--apply` to write) bootstraps
  schedule rules, adopts sessions, fills enrollment periods, mirrors payments, swaps the legacy
  session unique index and writes a validation report. It is idempotent: running it again creates
  nothing new. Ambiguous records (for example a payment that was paid and later cancelled) are
  written to `MigrationIssue` instead of inventing money movements.

## 7. Where the rules live

| Rule | File |
|---|---|
| Calendar dates, Argentina day bounds | `apps/api/src/common/dates.ts` |
| Money helpers | `apps/api/src/common/money.ts` |
| Transactions | `apps/api/src/common/transaction.ts` |
| Schedule rules and versions | `modules/scheduling/schedule-service.ts` |
| Session generation | `modules/scheduling/session-generator.ts` |
| Session state machine | `modules/scheduling/session-state.ts` |
| Space and professor conflicts | `modules/scheduling/conflict-service.ts` |
| Roster and capacity | `modules/sessions/roster-service.ts` |
| Coverage | `modules/billing/coverage-service.ts` |
| Charge generation | `modules/billing/charge-service.ts` |
| Collections, refunds, adjustments | `modules/billing/collection-service.ts` |
| Balances and debt | `modules/billing/balance-service.ts` |
