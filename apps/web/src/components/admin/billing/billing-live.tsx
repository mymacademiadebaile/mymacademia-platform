"use client";

import { CheckCircle2, FileText, RefreshCcw } from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage, apiUrl } from "@/lib/api";
import { addDays, formatDateOnly, todayInArgentina } from "@/lib/dates";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import { ErrorBlock, Field, LiveModal, LoadingBlock } from "../live/live-common";
import { PaymentsLive } from "../live/payments-live";
import liveStyles from "../live/live.module.css";
import styles from "../scheduling/calendar.module.css";
import { METHOD_LABEL, formatMoney } from "../scheduling/scheduling-types";
import { CHARGE_KIND_LABEL, CHARGE_STATUS_LABEL, type ChargeView, type CollectionView } from "./billing-types";

type Tab = "charges" | "monthly" | "collections" | "cash" | "review" | "legacy";

const TAB_LABEL: Record<Tab, string> = {
  charges: "Cargos",
  monthly: "Mensualidades",
  collections: "Cobros",
  cash: "Caja",
  review: "Revisión",
  legacy: "Sistema anterior"
};

function statusClass(status: ChargeView["status"]) {
  if (status === "PAID") return styles.badgeOk;
  if (status === "OVERDUE") return styles.badgeDanger;
  if (status === "VOID") return styles.badgeOff;
  return styles.badgeWarn;
}

export function BillingLive() {
  const [tab, setTab] = useState<Tab>("charges");
  return (
    <>
      <PageHeader
        eyebrow="CAJA Y DEUDAS"
        title="Pagos"
        description="Lo que deben los alumnos, lo que ingresó y lo que salió. Para cobrar una clase usá el calendario o la ficha del alumno."
      />
      <div className={styles.toolbar}>
        <div className={styles.viewSwitch} role="tablist" aria-label="Secciones de pagos">
          {(Object.keys(TAB_LABEL) as Tab[]).map((item) => (
            <button key={item} role="tab" aria-selected={tab === item} aria-pressed={tab === item} onClick={() => setTab(item)}>
              {TAB_LABEL[item]}
            </button>
          ))}
        </div>
      </div>
      {tab === "charges" && <ChargesTab />}
      {tab === "monthly" && <MonthlyTab />}
      {tab === "collections" && <CollectionsTab />}
      {tab === "cash" && <CashTab />}
      {tab === "review" && <ReviewTab />}
      {tab === "legacy" && <PaymentsLive />}
    </>
  );
}

function ChargesTab() {
  const [period, setPeriod] = useState(todayInArgentina().slice(0, 7));
  const [status, setStatus] = useState("OPEN");
  const [data, setData] = useState<{ items: ChargeView[]; total: number } | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (period) params.set("period", period);
      if (status) params.set("status", status);
      setData(await apiFetch("/admin/billing/charges?" + params.toString()));
    } catch (requestError) {
      setError(apiMessage(requestError));
    }
  }, [period, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = (data?.items ?? []).reduce((sum, item) => sum + item.balance, 0);

  return (
    <>
      <div className={styles.filters}>
        <input type="month" aria-label="Período" value={period} onChange={(event) => setPeriod(event.target.value)} />
        <select aria-label="Estado" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="OPEN">Con saldo pendiente</option>
          <option value="OVERDUE">Vencidos</option>
          <option value="PARTIAL">Pago parcial</option>
          <option value="PAID">Pagados</option>
          <option value="VOID">Anulados</option>
          <option value="">Todos</option>
        </select>
        <span className={styles.sessionMeta} style={{ alignSelf: "center" }}>
          {data ? `${data.total} cargos · saldo ${formatMoney(total)}` : ""}
        </span>
      </div>
      {error ? (
        <ErrorBlock message={error} onRetry={() => void load()} />
      ) : !data ? (
        <LoadingBlock />
      ) : (
        <div className={liveStyles.listCard}>
          {data.items.map((charge) => (
            <div key={charge.id} className={liveStyles.listRow}>
              <div className={liveStyles.rowBody}>
                <strong>
                  {charge.student ? (
                    <Link href={"/admin/students/" + charge.student.id}>
                      {charge.student.firstName} {charge.student.lastName}
                    </Link>
                  ) : (
                    "Alumno"
                  )}{" "}
                  · {charge.concept}
                </strong>
                <small>
                  {CHARGE_KIND_LABEL[charge.kind]} · vence {formatDateOnly(charge.dueDate)} · {formatMoney(charge.owed)}
                  {charge.paid > 0 && charge.balance > 0 ? " · pagado " + formatMoney(charge.paid) : ""}
                  {charge.legacy ? " · sistema anterior" : ""}
                </small>
              </div>
              <span className={`${styles.badge} ${statusClass(charge.status)}`}>
                {CHARGE_STATUS_LABEL[charge.status]}
                {charge.balance > 0 && charge.status !== "VOID" ? " · " + formatMoney(charge.balance) : ""}
              </span>
            </div>
          ))}
          {!data.items.length && <p className={styles.emptyDay}>No hay cargos con estos filtros.</p>}
        </div>
      )}
    </>
  );
}

type MonthlyPreview = {
  period: string;
  toCreate: number;
  existing: number;
  needsDecision: number;
  items: Array<{ enrollmentId: string; student: string; studentId: string; className: string; amount: number | null; dueDate: string | null; status: "TO_CREATE" | "EXISTS" | "NEEDS_DECISION" }>;
};

function MonthlyTab() {
  const { toast } = useAdminFeedback();
  const [period, setPeriod] = useState(todayInArgentina().slice(0, 7));
  const [preview, setPreview] = useState<MonthlyPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [deciding, setDeciding] = useState<MonthlyPreview["items"][number] | null>(null);

  const load = useCallback(async () => {
    try {
      setPreview(await apiFetch<MonthlyPreview>("/admin/billing/monthly/" + period + "/preview"));
    } catch (error) {
      toast({ title: "No pudimos calcular el mes", description: apiMessage(error), tone: "error" });
    }
  }, [period, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function generate() {
    setBusy(true);
    try {
      const result = await apiFetch<{ created: number; existing: number; pendingDecision: unknown[] }>("/admin/billing/monthly/generate", {
        method: "POST",
        body: JSON.stringify({ period })
      });
      toast({
        title: `${result.created} mensualidades generadas`,
        description: result.pendingDecision.length ? `${result.pendingDecision.length} altas a mitad de mes esperan una decisión.` : undefined,
        tone: "success"
      });
      await load();
    } catch (error) {
      toast({ title: "No se pudo generar", description: apiMessage(error), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function decide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deciding) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await apiFetch("/admin/billing/enrollments/" + deciding.enrollmentId + "/monthly-charge", {
        method: "POST",
        body: JSON.stringify({
          period,
          policy: form.get("policy"),
          customAmount: form.get("policy") === "CUSTOM" ? Number(form.get("customAmount")) : undefined
        })
      });
      toast({ title: "Primer mes definido", tone: "success" });
      setDeciding(null);
      await load();
    } catch (error) {
      toast({ title: "No se pudo crear la cuota", description: apiMessage(error), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className={styles.filters}>
        <input type="month" aria-label="Período" value={period} onChange={(event) => setPeriod(event.target.value)} />
        <button className={`${styles.actionButton} ${styles.actionPrimary}`} disabled={busy || !preview?.toCreate} onClick={() => void generate()}>
          <RefreshCcw size={14} /> Generar {preview?.toCreate ?? 0} mensualidades
        </button>
        <span className={styles.sessionMeta} style={{ alignSelf: "center" }}>
          Se puede ejecutar las veces que haga falta: nunca duplica cuotas. Se generan solas cada día.
        </span>
      </div>
      {!preview ? (
        <LoadingBlock />
      ) : (
        <div className={liveStyles.listCard}>
          {preview.items.map((item) => (
            <div key={item.enrollmentId} className={liveStyles.listRow}>
              <div className={liveStyles.rowBody}>
                <strong>
                  <Link href={"/admin/students/" + item.studentId}>{item.student}</Link> · {item.className}
                </strong>
                <small>
                  {item.amount !== null ? formatMoney(item.amount) : "importe a definir"}
                  {item.dueDate ? " · vence " + formatDateOnly(item.dueDate) : ""}
                </small>
              </div>
              {item.status === "NEEDS_DECISION" ? (
                <button className={styles.toggle} onClick={() => setDeciding(item)}>
                  Definir primer mes
                </button>
              ) : (
                <span className={`${styles.badge} ${item.status === "EXISTS" ? styles.badgeOk : styles.badgeWarn}`}>
                  {item.status === "EXISTS" ? "Generada" : "Por generar"}
                </span>
              )}
            </div>
          ))}
          {!preview.items.length && <p className={styles.emptyDay}>No hay alumnos mensuales para este mes.</p>}
        </div>
      )}

      <LiveModal
        open={Boolean(deciding)}
        title="Primer mes"
        description={deciding ? `${deciding.student} empezó a mitad de mes en ${deciding.className}.` : ""}
        submitting={busy}
        submitLabel="Crear cuota"
        onClose={() => setDeciding(null)}
        onSubmit={decide}
      >
        <Field label="Cómo cobrarlo">
          <select name="policy" defaultValue="FULL">
            <option value="FULL">Cuota completa</option>
            <option value="PRORATED">Proporcional a las clases que quedan</option>
            <option value="CUSTOM">Importe personalizado</option>
          </select>
        </Field>
        <Field label="Importe (solo personalizado)">
          <input name="customAmount" type="number" min="0" step="0.01" />
        </Field>
      </LiveModal>
    </>
  );
}

function CollectionsTab() {
  const [from, setFrom] = useState(addDays(todayInArgentina(), -30));
  const [to, setTo] = useState(todayInArgentina());
  const [data, setData] = useState<{ items: CollectionView[]; total: number } | null>(null);

  useEffect(() => {
    setData(null);
    void apiFetch<{ items: CollectionView[]; total: number }>(`/admin/billing/collections?from=${from}&to=${to}&limit=200`).then(setData).catch(() => setData({ items: [], total: 0 }));
  }, [from, to]);

  return (
    <>
      <div className={styles.filters}>
        <input type="date" aria-label="Desde" value={from} onChange={(event) => setFrom(event.target.value)} />
        <input type="date" aria-label="Hasta" value={to} onChange={(event) => setTo(event.target.value)} />
      </div>
      {!data ? (
        <LoadingBlock />
      ) : (
        <div className={liveStyles.listCard}>
          {data.items.map((item) => (
            <div key={item.id} className={liveStyles.listRow}>
              <div className={liveStyles.rowBody}>
                <strong>
                  <Link href={"/admin/students/" + item.studentId}>
                    {item.student ? `${item.student.firstName} ${item.student.lastName}` : "Alumno"}
                  </Link>{" "}
                  · {formatMoney(item.amount)}
                </strong>
                <small>
                  {formatDateOnly(item.accountingDate)} · {METHOD_LABEL[item.method]} · {item.receiptNumber ?? "sin recibo"}
                  {item.credit > 0 ? " · a favor " + formatMoney(item.credit) : ""}
                  {item.refunded > 0 ? " · devuelto " + formatMoney(item.refunded) : ""}
                </small>
              </div>
              <a className={styles.toggle} href={apiUrl("/admin/billing/collections/" + item.id + "/receipt.pdf")} target="_blank" rel="noopener">
                <FileText size={12} /> Recibo
              </a>
            </div>
          ))}
          {!data.items.length && <p className={styles.emptyDay}>No hay cobros en el período.</p>}
        </div>
      )}
    </>
  );
}

type CashReport = {
  collected: number;
  refunded: number;
  net: number;
  byDay: Array<{ date: string; collected: number; refunded: number; net: number }>;
  byMethod: Array<{ method: keyof typeof METHOD_LABEL; collected: number; refunded: number; net: number }>;
};

function CashTab() {
  const [from, setFrom] = useState(todayInArgentina().slice(0, 7) + "-01");
  const [to, setTo] = useState(todayInArgentina());
  const [data, setData] = useState<CashReport | null>(null);

  useEffect(() => {
    setData(null);
    void apiFetch<CashReport>(`/admin/billing/cash?from=${from}&to=${to}`).then(setData).catch(() => setData(null));
  }, [from, to]);

  return (
    <>
      <div className={styles.filters}>
        <input type="date" aria-label="Desde" value={from} onChange={(event) => setFrom(event.target.value)} />
        <input type="date" aria-label="Hasta" value={to} onChange={(event) => setTo(event.target.value)} />
      </div>
      <p className={styles.sessionMeta}>
        Cada cobro cuenta el día que ingresó el dinero y cada devolución el día que salió: los días cerrados no cambian. Incluye solo movimientos del sistema nuevo.
      </p>
      {!data ? (
        <LoadingBlock />
      ) : (
        <>
          <div className={styles.infoGrid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", margin: "12px 0" }}>
            <div>
              <span>Ingresos</span>
              <strong>{formatMoney(data.collected)}</strong>
            </div>
            <div>
              <span>Devoluciones</span>
              <strong>{formatMoney(data.refunded)}</strong>
            </div>
            <div>
              <span>Neto</span>
              <strong>{formatMoney(data.net)}</strong>
            </div>
            {data.byMethod.map((item) => (
              <div key={item.method}>
                <span>{METHOD_LABEL[item.method] ?? item.method}</span>
                <strong>{formatMoney(item.net)}</strong>
              </div>
            ))}
          </div>
          <div className={liveStyles.listCard}>
            {data.byDay.map((day) => (
              <div key={day.date} className={liveStyles.listRow}>
                <div className={liveStyles.rowBody}>
                  <strong>{formatDateOnly(day.date, { weekday: "long", day: "numeric", month: "long" })}</strong>
                  <small>
                    Ingresos {formatMoney(day.collected)} · devoluciones {formatMoney(day.refunded)}
                  </small>
                </div>
                <strong>{formatMoney(day.net)}</strong>
              </div>
            ))}
            {!data.byDay.length && <p className={styles.emptyDay}>Sin movimientos en el período.</p>}
          </div>
        </>
      )}
    </>
  );
}

type Issue = { _id: string; kind: string; entityType: string; entityId: string; message: string; data?: Record<string, unknown>; createdAt: string };

const ISSUE_LABEL: Record<string, string> = {
  LEGACY_PAID_THEN_CANCELLED: "Pago cobrado y luego cancelado",
  LEGACY_DUPLICATE_CHARGE: "Posible cobro duplicado",
  LEGACY_PAYMENT_WITHOUT_CLASS: "Pago sin clase",
  LEGACY_SYNC_FAILED: "No se pudo replicar un pago",
  SESSION_WITHOUT_SCHEDULE: "Clase fuera de horario"
};

function ReviewTab() {
  const { toast } = useAdminFeedback();
  const [items, setItems] = useState<Issue[] | null>(null);
  const [resolving, setResolving] = useState<Issue | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems((await apiFetch<{ items: Issue[] }>("/admin/billing/migration-issues")).items);
    } catch (error) {
      toast({ title: "No pudimos cargar las observaciones", description: apiMessage(error), tone: "error" });
      setItems([]);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resolving) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await apiFetch("/admin/billing/migration-issues/" + resolving._id + "/resolve", { method: "POST", body: JSON.stringify({ resolution: form.get("resolution") }) });
      toast({ title: "Observación resuelta", tone: "success" });
      setResolving(null);
      await load();
    } catch (error) {
      toast({ title: "No se pudo guardar", description: apiMessage(error), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className={styles.sessionMeta}>
        Datos del sistema anterior que no se pudieron convertir sin adivinar. Revisalos y, si hace falta, registrá la devolución o el ajuste desde la cuenta del alumno.
      </p>
      {!items ? (
        <LoadingBlock />
      ) : (
        <div className={liveStyles.listCard}>
          {items.map((item) => (
            <div key={item._id} className={liveStyles.listRow}>
              <div className={liveStyles.rowBody}>
                <strong>{ISSUE_LABEL[item.kind] ?? item.kind}</strong>
                <small>
                  {item.message}
                  {item.data?.amount ? " · " + formatMoney(Number(item.data.amount)) : ""}
                  {item.data?.period ? " · " + String(item.data.period) : ""}
                </small>
              </div>
              <button className={styles.toggle} onClick={() => setResolving(item)}>
                <CheckCircle2 size={12} /> Resolver
              </button>
            </div>
          ))}
          {!items.length && <p className={styles.emptyDay}>No hay observaciones pendientes.</p>}
        </div>
      )}
      <LiveModal
        open={Boolean(resolving)}
        title="Resolver observación"
        description="Anotá qué se verificó o qué se hizo. Queda en la auditoría."
        submitting={busy}
        submitLabel="Marcar resuelta"
        onClose={() => setResolving(null)}
        onSubmit={resolve}
      >
        <Field label="Resolución" wide>
          <input name="resolution" required minLength={3} maxLength={500} />
        </Field>
      </LiveModal>
    </>
  );
}
