"use client";

import { Ban, CircleDollarSign, FileText, Percent, Undo2, Wallet } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, apiMessage, apiUrl } from "@/lib/api";
import { formatDateOnly, todayInArgentina } from "@/lib/dates";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import { Field, LiveModal } from "../live/live-common";
import liveStyles from "../live/live.module.css";
import styles from "../scheduling/calendar.module.css";
import { METHOD_LABEL, formatMoney, newIdempotencyKey, type CollectionMethod } from "../scheduling/scheduling-types";
import {
  ADJUSTMENT_LABEL,
  CHARGE_KIND_LABEL,
  CHARGE_STATUS_LABEL,
  type ChargeView,
  type CollectionView,
  type StudentAccount
} from "./billing-types";

type Modal =
  | { kind: "collect"; key: string }
  | { kind: "adjust"; charge: ChargeView }
  | { kind: "void"; charge: ChargeView }
  | { kind: "refund"; collection: CollectionView }
  | { kind: "credit"; collection: CollectionView }
  | null;

function statusClass(status: ChargeView["status"]) {
  if (status === "PAID") return styles.badgeOk;
  if (status === "OVERDUE") return styles.badgeDanger;
  if (status === "VOID") return styles.badgeOff;
  return styles.badgeWarn;
}

/**
 * Current account of a student: what is owed (charges), what came in (collections), credit,
 * refunds and adjustments. Every amount comes from the shared balance service of the API.
 */
export function StudentAccountPanel({ studentId, onChanged }: { studentId: string; onChanged?: () => void }) {
  const { toast } = useAdminFeedback();
  const [account, setAccount] = useState<StudentAccount | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState(false);
  const [allocation, setAllocation] = useState<Record<string, string>>({});
  const [collectionDetail, setCollectionDetail] = useState<{ allocations: Array<{ id: string; amount: number; reversed: number; concept: string }> } | null>(null);
  const [showVoid, setShowVoid] = useState(false);

  const load = useCallback(async () => {
    try {
      setAccount(await apiFetch<StudentAccount>("/admin/billing/students/" + studentId + "/account"));
    } catch (error) {
      toast({ title: "No pudimos cargar la cuenta", description: apiMessage(error), tone: "error" });
    }
  }, [studentId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCharges = useMemo(
    () => (account?.charges ?? []).filter((item) => !item.legacy && item.balance > 0 && item.status !== "VOID").sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [account]
  );

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      toast({ title: success, tone: "success" });
      setModal(null);
      setAllocation({});
      await load();
      onChanged?.();
    } catch (error) {
      toast({ title: "No se pudo completar", description: apiMessage(error), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  function submitCollect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (modal?.kind !== "collect") return;
    const form = new FormData(event.currentTarget);
    const allocations = Object.entries(allocation)
      .map(([chargeId, value]) => ({ chargeId, amount: Number(value) }))
      .filter((item) => item.amount > 0);
    void run(
      () =>
        apiFetch("/admin/billing/collections", {
          method: "POST",
          body: JSON.stringify({
            studentId,
            amount: Number(form.get("amount")),
            method: form.get("method"),
            receivedAt: form.get("receivedAt") || undefined,
            notes: form.get("notes") || undefined,
            allocations: allocations.length ? allocations : undefined,
            autoAllocate: allocations.length ? undefined : true,
            idempotencyKey: modal.key
          })
        }),
      "Cobro registrado"
    );
  }

  function submitAdjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (modal?.kind !== "adjust") return;
    const form = new FormData(event.currentTarget);
    const sourceChargeIds = form.getAll("sourceChargeIds").map(String);
    void run(
      () =>
        apiFetch("/admin/billing/charges/" + modal.charge.id + "/adjustments", {
          method: "POST",
          body: JSON.stringify({
            type: form.get("type"),
            amount: Number(form.get("amount")),
            reason: form.get("reason"),
            sourceChargeIds: sourceChargeIds.length ? sourceChargeIds : undefined
          })
        }),
      "Ajuste registrado"
    );
  }

  function submitVoid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (modal?.kind !== "void") return;
    const form = new FormData(event.currentTarget);
    void run(
      () => apiFetch("/admin/billing/charges/" + modal.charge.id + "/void", { method: "POST", body: JSON.stringify({ reason: form.get("reason") }) }),
      "Cargo anulado"
    );
  }

  async function openRefund(collection: CollectionView) {
    setModal({ kind: "refund", collection });
    try {
      setCollectionDetail(await apiFetch("/admin/billing/collections/" + collection.id));
    } catch {
      setCollectionDetail(null);
    }
  }

  function submitRefund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (modal?.kind !== "refund") return;
    const form = new FormData(event.currentTarget);
    void run(
      () =>
        apiFetch("/admin/billing/collections/" + modal.collection.id + "/refunds", {
          method: "POST",
          body: JSON.stringify({
            amount: Number(form.get("amount")),
            reason: form.get("reason"),
            method: form.get("method"),
            allocationId: form.get("allocationId") || undefined
          })
        }),
      "Devolución registrada"
    );
  }

  function submitCredit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (modal?.kind !== "credit") return;
    const form = new FormData(event.currentTarget);
    void run(
      () =>
        apiFetch("/admin/billing/collections/" + modal.collection.id + "/apply-credit", {
          method: "POST",
          body: JSON.stringify({ chargeId: form.get("chargeId"), amount: Number(form.get("amount")) })
        }),
      "Saldo a favor aplicado"
    );
  }

  async function openProof(collection: CollectionView) {
    try {
      const result = await apiFetch<{ url: string }>("/admin/billing/collections/" + collection.id + "/proof");
      window.open(result.url, "_blank", "noopener");
    } catch (error) {
      toast({ title: "No pudimos abrir el comprobante", description: apiMessage(error), tone: "error" });
    }
  }

  if (!account) return null;
  const charges = account.charges.filter((item) => showVoid || item.status !== "VOID");

  return (
    <section className={styles.section} style={{ margin: "18px 0" }}>
      <div className={styles.actionRow} style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3>Cuenta corriente</h3>
        <button className={`${styles.actionButton} ${styles.actionPrimary}`} onClick={() => setModal({ kind: "collect", key: newIdempotencyKey() })}>
          <CircleDollarSign size={14} /> Registrar cobro
        </button>
      </div>

      <div className={styles.infoGrid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", marginBottom: 12 }}>
        <div>
          <span>Saldo pendiente</span>
          <strong>{formatMoney(account.balance.pending)}</strong>
        </div>
        <div>
          <span>Vencido</span>
          <strong>{formatMoney(account.balance.overdue)}</strong>
        </div>
        <div>
          <span>Pagos parciales</span>
          <strong>{account.balance.partialCount}</strong>
        </div>
        <div>
          <span>Saldo a favor</span>
          <strong>{formatMoney(account.balance.credit)}</strong>
        </div>
      </div>

      <div className={styles.actionRow} style={{ justifyContent: "space-between" }}>
        <h3>Cargos</h3>
        <button className={styles.actionButton} onClick={() => setShowVoid((value) => !value)}>
          {showVoid ? "Ocultar anulados" : "Ver anulados"}
        </button>
      </div>
      <div className={liveStyles.listCard}>
        {charges.map((charge) => (
          <div key={charge.id} className={liveStyles.listRow}>
            <div className={liveStyles.rowBody}>
              <strong>{charge.concept}</strong>
              <small>
                {CHARGE_KIND_LABEL[charge.kind]}
                {charge.className ? " · " + charge.className : ""} · vence {formatDateOnly(charge.dueDate)} · {formatMoney(charge.owed)}
                {charge.paid > 0 && charge.balance > 0 ? " · pagado " + formatMoney(charge.paid) : ""}
                {charge.adjustments ? " · ajustes " + formatMoney(charge.adjustments) : ""}
                {charge.legacy ? " · sistema anterior" : ""}
              </small>
            </div>
            <div className={styles.participantActions}>
              <span className={`${styles.badge} ${statusClass(charge.status)}`}>
                {CHARGE_STATUS_LABEL[charge.status]}
                {charge.balance > 0 && charge.status !== "VOID" ? " · " + formatMoney(charge.balance) : ""}
              </span>
              {!charge.legacy && charge.status !== "VOID" && charge.balance > 0 && (
                <button className={styles.toggle} disabled={busy} onClick={() => setModal({ kind: "adjust", charge })}>
                  <Percent size={12} /> Ajustar
                </button>
              )}
              {!charge.legacy && charge.status !== "VOID" && charge.paid === 0 && (
                <button className={styles.toggle} disabled={busy} onClick={() => setModal({ kind: "void", charge })}>
                  <Ban size={12} /> Anular
                </button>
              )}
            </div>
          </div>
        ))}
        {!charges.length && <p className={styles.emptyDay}>Sin cargos registrados.</p>}
      </div>

      <h3 style={{ marginTop: 14 }}>Cobros</h3>
      <div className={liveStyles.listCard}>
        {account.collections.map((collection) => (
          <div key={collection.id} className={liveStyles.listRow}>
            <div className={liveStyles.rowBody}>
              <strong>
                {formatMoney(collection.amount)} · {METHOD_LABEL[collection.method]}
              </strong>
              <small>
                {formatDateOnly(collection.accountingDate)} · {collection.receiptNumber ?? "sin recibo"}
                {collection.credit > 0 ? " · a favor " + formatMoney(collection.credit) : ""}
                {collection.refunded > 0 ? " · devuelto " + formatMoney(collection.refunded) : ""}
              </small>
            </div>
            <div className={styles.participantActions}>
              <a className={styles.toggle} href={apiUrl("/admin/billing/collections/" + collection.id + "/receipt.pdf")} target="_blank" rel="noopener">
                <FileText size={12} /> Recibo
              </a>
              {collection.hasProof && (
                <button className={styles.toggle} onClick={() => void openProof(collection)}>
                  Comprobante
                </button>
              )}
              {collection.credit > 0 && openCharges.length > 0 && (
                <button className={styles.toggle} disabled={busy} onClick={() => setModal({ kind: "credit", collection })}>
                  <Wallet size={12} /> Aplicar saldo
                </button>
              )}
              {collection.amount - collection.refunded > 0 && (
                <button className={styles.toggle} disabled={busy} onClick={() => void openRefund(collection)}>
                  <Undo2 size={12} /> Devolver
                </button>
              )}
            </div>
          </div>
        ))}
        {!account.collections.length && <p className={styles.emptyDay}>Sin cobros registrados en el sistema nuevo.</p>}
      </div>

      {(account.refunds.length > 0 || account.adjustments.length > 0) && (
        <>
          <h3 style={{ marginTop: 14 }}>Devoluciones y ajustes</h3>
          <ul className={styles.history}>
            {account.refunds.map((item) => (
              <li key={item.id}>
                <strong>Devolución {formatMoney(item.amount)}</strong> · {formatDateOnly(item.accountingDate)} · {item.reason}
              </li>
            ))}
            {account.adjustments.map((item) => (
              <li key={item.id}>
                <strong>
                  {ADJUSTMENT_LABEL[item.type] ?? item.type} {formatMoney(item.amount)}
                </strong>{" "}
                · {formatDateOnly(item.accountingDate)} · {item.reason}
              </li>
            ))}
          </ul>
        </>
      )}

      <LiveModal
        open={modal?.kind === "collect"}
        title="Registrar cobro"
        description="Indicá cuánto pagó. Podés repartirlo entre cargos (también parcialmente); lo que sobre queda como saldo a favor. Sin reparto, se aplica a los cargos más antiguos."
        submitting={busy}
        submitLabel="Registrar"
        onClose={() => setModal(null)}
        onSubmit={submitCollect}
      >
        <Field label="Importe recibido">
          <input name="amount" type="number" min="0.01" step="0.01" required />
        </Field>
        <Field label="Medio de pago">
          <select name="method" defaultValue="CASH">
            {(Object.keys(METHOD_LABEL) as CollectionMethod[]).map((item) => (
              <option key={item} value={item}>
                {METHOD_LABEL[item]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fecha de cobro">
          <input name="receivedAt" type="date" defaultValue={todayInArgentina()} max={todayInArgentina()} />
        </Field>
        <Field label="Nota">
          <input name="notes" maxLength={1000} />
        </Field>
        {openCharges.map((charge) => (
          <Field key={charge.id} label={`${charge.concept} (debe ${formatMoney(charge.balance)})`}>
            <input
              type="number"
              min="0"
              step="0.01"
              max={charge.balance}
              placeholder="0"
              value={allocation[charge.id] ?? ""}
              onChange={(event) => setAllocation({ ...allocation, [charge.id]: event.target.value })}
            />
          </Field>
        ))}
      </LiveModal>

      <LiveModal
        open={modal?.kind === "adjust"}
        title="Ajustar cargo"
        description={modal?.kind === "adjust" ? `${modal.charge.concept} · saldo ${formatMoney(modal.charge.balance)}. Queda registrado con su motivo.` : ""}
        submitting={busy}
        submitLabel="Registrar ajuste"
        onClose={() => setModal(null)}
        onSubmit={submitAdjust}
      >
        <Field label="Tipo">
          <select name="type" defaultValue="DISCOUNT">
            {Object.entries(ADJUSTMENT_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Importe">
          <input name="amount" type="number" min="0.01" step="0.01" required />
        </Field>
        <Field label="Motivo" wide>
          <input name="reason" required minLength={3} maxLength={500} />
        </Field>
        <Field label="Pagos previos que se reconocen (solo crédito)" wide>
          <select name="sourceChargeIds" multiple>
            {(account.charges ?? [])
              .filter((item) => !item.legacy && item.paid > 0 && modal?.kind === "adjust" && item.id !== modal.charge.id)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.concept} · pagado {formatMoney(item.paid)}
                </option>
              ))}
          </select>
        </Field>
      </LiveModal>

      <LiveModal
        open={modal?.kind === "void"}
        title="Anular cargo"
        description="El cargo deja de reclamarse y queda en el historial con el motivo. Si tiene pagos, primero registrá la devolución."
        submitting={busy}
        submitLabel="Anular"
        onClose={() => setModal(null)}
        onSubmit={submitVoid}
      >
        <Field label="Motivo" wide>
          <input name="reason" required minLength={3} maxLength={500} />
        </Field>
      </LiveModal>

      <LiveModal
        open={modal?.kind === "refund"}
        title="Registrar devolución"
        description="Se registra hoy como salida de caja. El cobro original y la caja de su día no cambian."
        submitting={busy}
        submitLabel="Devolver"
        onClose={() => setModal(null)}
        onSubmit={submitRefund}
      >
        <Field label="Qué se devuelve" wide>
          <select name="allocationId" defaultValue="">
            {modal?.kind === "refund" && modal.collection.credit > 0 && <option value="">Saldo a favor ({formatMoney(modal.collection.credit)})</option>}
            {(collectionDetail?.allocations ?? [])
              .filter((item) => item.amount - item.reversed > 0)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.concept} ({formatMoney(item.amount - item.reversed)}) — el cargo vuelve a quedar pendiente
                </option>
              ))}
          </select>
        </Field>
        <Field label="Importe">
          <input name="amount" type="number" min="0.01" step="0.01" required />
        </Field>
        <Field label="Medio">
          <select name="method" defaultValue={modal?.kind === "refund" ? modal.collection.method : "CASH"}>
            {(Object.keys(METHOD_LABEL) as CollectionMethod[]).map((item) => (
              <option key={item} value={item}>
                {METHOD_LABEL[item]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Motivo" wide>
          <input name="reason" required minLength={3} maxLength={500} />
        </Field>
      </LiveModal>

      <LiveModal
        open={modal?.kind === "credit"}
        title="Aplicar saldo a favor"
        description={modal?.kind === "credit" ? `Disponible: ${formatMoney(modal.collection.credit)}` : ""}
        submitting={busy}
        submitLabel="Aplicar"
        onClose={() => setModal(null)}
        onSubmit={submitCredit}
      >
        <Field label="Cargo" wide>
          <select name="chargeId" required>
            {openCharges.map((item) => (
              <option key={item.id} value={item.id}>
                {item.concept} (debe {formatMoney(item.balance)})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Importe">
          <input name="amount" type="number" min="0.01" step="0.01" required />
        </Field>
      </LiveModal>
    </section>
  );
}
