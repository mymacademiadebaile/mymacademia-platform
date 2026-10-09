"use client";

import { CheckCircle2, CircleDollarSign, FileText, RefreshCcw } from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch, apiMessage, apiUrl } from "@/lib/api";
import { formatDateOnly, todayInArgentina } from "@/lib/dates";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import { ErrorBlock, Field, LiveModal, LoadingBlock } from "../live/live-common";
import { fetchAllPaginated } from "../live/live-common";
import type { Student } from "../live/live-types";
import liveStyles from "../live/live.module.css";
import styles from "../scheduling/calendar.module.css";
import { METHOD_LABEL, formatMoney, newIdempotencyKey, type CollectionMethod } from "../scheduling/scheduling-types";
import { CHARGE_STATUS_LABEL, type ChargeView, type CollectionView } from "./billing-types";
import billingStyles from "./billing-live.module.css";

type Tab = "charges" | "monthly" | "collections" | "review";

const TAB_LABEL: Record<Tab, string> = {
  charges: "Por cobrar",
  monthly: "Mensualidades",
  collections: "Historial",
  review: "Revisión"
};

export function BillingLive() {
  const [tab, setTab] = useState<Tab>("charges");

  return (
    <section className={billingStyles.page}>
      <header className={billingStyles.header}>
        <h1>Cobros</h1>
        <p>Consultá lo pendiente, registrá el pago y entregá el recibo. Las mensualidades vigentes se preparan al abrir este mes.</p>
      </header>

      <div className={billingStyles.navigation}>
        <div className={billingStyles.tabs} role="tablist" aria-label="Secciones de cobros">
          {(["charges", "collections"] as const).map((item) => (
            <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>
              {TAB_LABEL[item]}
            </button>
          ))}
        </div>
      </div>

      {tab === "charges" && <ChargesTab />}
      {tab === "collections" && <CollectionsTab />}
    </section>
  );
}

function ChargesTab() {
  const { toast } = useAdminFeedback();
  const [period, setPeriod] = useState(todayInArgentina().slice(0, 7));
  const [status, setStatus] = useState("OPEN");
  const [data, setData] = useState<{ items: ChargeView[]; total: number } | null>(null);
  const [error, setError] = useState("");
  const [collecting, setCollecting] = useState<ChargeView | null>(null);
  const [manualChargeOpen, setManualChargeOpen] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [busy, setBusy] = useState(false);

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

  useEffect(() => {
    if (!manualChargeOpen || students.length) return;
    void fetchAllPaginated<Student>("/admin/students?isActive=true")
      .then(setStudents)
      .catch(() => toast({ title: "No se pudo cargar la lista de alumnos", tone: "error" }));
  }, [manualChargeOpen, students.length, toast]);

  const total = (data?.items ?? []).reduce((sum, item) => sum + item.balance, 0);

  async function collect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!collecting?.student) return;

    const form = new FormData(event.currentTarget);
    const amount = Number(form.get("amount"));
    setBusy(true);
    try {
      await apiFetch("/admin/billing/collections", {
        method: "POST",
        body: JSON.stringify({
          studentId: collecting.student.id,
          amount,
          method: form.get("method"),
          allocations: [{ chargeId: collecting.id, amount }],
          idempotencyKey: newIdempotencyKey()
        })
      });
      setCollecting(null);
      toast({ title: "Cobro registrado", tone: "success" });
      await load();
    } catch (requestError) {
      toast({ title: "No se pudo registrar el cobro", description: apiMessage(requestError), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function createManualCharge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const dueDate = String(form.get("dueDate"));
    setBusy(true);
    try {
      await apiFetch("/admin/billing/charges", {
        method: "POST",
        body: JSON.stringify({
          studentId: form.get("studentId"),
          kind: "OTHER",
          concept: form.get("concept"),
          amount: Number(form.get("amount")),
          dueDate,
          period: dueDate.slice(0, 7)
        })
      });
      setManualChargeOpen(false);
      toast({ title: "Importe agregado", description: "Ya aparece en Por cobrar.", tone: "success" });
      await load();
    } catch (requestError) {
      toast({ title: "No se pudo agregar el importe", description: apiMessage(requestError), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className={billingStyles.controls}>
        <label>
          <span>Mes</span>
          <input type="month" aria-label="Período" value={period} onChange={(event) => setPeriod(event.target.value)} />
        </label>
        <label>
          <span>Ver</span>
          <select aria-label="Estado" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="OPEN">Pendientes</option>
            <option value="OVERDUE">Vencidos</option>
          </select>
        </label>
        <p>{data ? `${data.total} ${data.total === 1 ? "pago pendiente" : "pagos pendientes"} · ${formatMoney(total)}` : ""}</p>
        <button className={billingStyles.manualButton} type="button" onClick={() => setManualChargeOpen(true)}>
          Agregar importe
        </button>
      </div>

      <section className={billingStyles.list} aria-live="polite">
        {error ? (
          <ErrorBlock message={error} onRetry={() => void load()} />
        ) : !data ? (
          <LoadingBlock />
        ) : (
          <>
          {data.items.map((charge) => (
            <article key={charge.id} className={billingStyles.chargeRow}>
              <div>
                <strong>
                  {charge.student ? (
                    <Link href={"/admin/students/" + charge.student.id}>
                      {charge.student.firstName} {charge.student.lastName}
                    </Link>
                  ) : (
                    "Alumno"
                  )}
                </strong>
                <p>{charge.concept} · vence {formatDateOnly(charge.dueDate)}</p>
              </div>
              <div className={billingStyles.amount}>
                <strong>{formatMoney(charge.balance)}</strong>
                <span>{CHARGE_STATUS_LABEL[charge.status]}</span>
              </div>
              {charge.student && charge.balance > 0 && charge.status !== "VOID" ? (
                <button type="button" onClick={() => setCollecting(charge)}><CircleDollarSign size={16} /> Cobrar</button>
              ) : null}
            </article>
          ))}
          {!data.items.length && <p className={billingStyles.empty}>No hay pagos {status === "OVERDUE" ? "vencidos" : "pendientes"} este mes.</p>}
          </>
        )}
      </section>

      <LiveModal
        open={Boolean(collecting)}
        title="Registrar cobro"
        description={collecting?.student ? `${collecting.student.firstName} ${collecting.student.lastName} · ${collecting.concept}` : ""}
        submitting={busy}
        submitLabel="Confirmar cobro"
        onClose={() => setCollecting(null)}
        onSubmit={collect}
      >
        <Field label="Importe">
          <input name="amount" type="number" min="0.01" max={collecting?.balance} step="0.01" defaultValue={collecting?.balance ?? ""} required />
        </Field>
        <Field label="Medio de pago">
          <select name="method" defaultValue="CASH">
            {(Object.keys(METHOD_LABEL) as CollectionMethod[]).map((method) => (
              <option key={method} value={method}>{METHOD_LABEL[method]}</option>
            ))}
          </select>
        </Field>
      </LiveModal>

      <LiveModal
        open={manualChargeOpen}
        title="Agregar importe"
        description="Usalo sólo para un concepto excepcional, como un recargo o una clase anterior."
        submitting={busy}
        submitLabel="Agregar a Por cobrar"
        onClose={() => setManualChargeOpen(false)}
        onSubmit={createManualCharge}
      >
        <Field label="Alumno" wide>
          <select name="studentId" required defaultValue="">
            <option value="" disabled>Seleccionar alumno</option>
            {students.map((student) => (
              <option key={student._id} value={student._id}>{student.lastName}, {student.firstName}</option>
            ))}
          </select>
        </Field>
        <Field label="Concepto" wide>
          <input name="concept" required minLength={2} maxLength={160} placeholder="Ej.: Clase anterior" />
        </Field>
        <Field label="Importe">
          <input name="amount" type="number" min="0.01" step="0.01" required />
        </Field>
        <Field label="Vencimiento">
          <input name="dueDate" type="date" defaultValue={todayInArgentina()} required />
        </Field>
      </LiveModal>
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
  const [period, setPeriod] = useState(todayInArgentina().slice(0, 7));
  const [data, setData] = useState<{ items: CollectionView[]; total: number } | null>(null);
  const [year, month] = period.split("-").map(Number);
  const from = `${period}-01`;
  const to = new Date(year, month, 0).toISOString().slice(0, 10);

  useEffect(() => {
    setData(null);
    void apiFetch<{ items: CollectionView[]; total: number }>(`/admin/billing/collections?from=${from}&to=${to}&limit=200`).then(setData).catch(() => setData({ items: [], total: 0 }));
  }, [from, to]);

  return (
    <>
      <div className={billingStyles.controls}>
        <label>
          <span>Mes</span>
          <input type="month" aria-label="Mes" value={period} onChange={(event) => setPeriod(event.target.value)} />
        </label>
      </div>
      {!data ? (
        <LoadingBlock />
      ) : (
        <div className={billingStyles.list}>
          {data.items.map((item) => (
            <article key={item.id} className={billingStyles.collectionRow}>
              <div>
                <strong>
                  <Link href={"/admin/students/" + item.studentId}>
                    {item.student ? `${item.student.firstName} ${item.student.lastName}` : "Alumno"}
                  </Link>
                </strong>
                <p>{formatDateOnly(item.accountingDate)} · {METHOD_LABEL[item.method]}</p>
              </div>
              <strong className={billingStyles.amount}>{formatMoney(item.amount)}</strong>
              <a className={styles.toggle} href={apiUrl("/admin/billing/collections/" + item.id + "/receipt.pdf")} target="_blank" rel="noopener">
                <FileText size={12} /> Recibo
              </a>
            </article>
          ))}
          {!data.items.length && <p className={billingStyles.empty}>No hay cobros registrados este mes.</p>}
        </div>
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
