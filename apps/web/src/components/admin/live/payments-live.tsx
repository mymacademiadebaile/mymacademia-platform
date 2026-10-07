"use client";

import {
  Ban,
  Check,
  Download,
  FileText,
  Mail,
  Paperclip,
  Plus,
  Search
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage, apiUrl } from "@/lib/api";
import { todayInArgentina } from "@/lib/dates";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import type {
  BillingPreference,
  Branch,
  DanceClass,
  Paginated,
  Payment,
  PaymentMethod,
  PaymentType,
  Student
} from "./live-types";
import { ErrorBlock, Field, LiveModal, LoadingBlock } from "./live-common";
import styles from "./payments-live.module.css";

type PaymentSummary = {
  total: number;
  count: number;
  paidAmount: number;
  paidCount: number;
  pendingAmount: number;
  pendingCount: number;
  overdueAmount: number;
  overdueCount: number;
  cancelledAmount: number;
  cancelledCount: number;
};

type StudentEnrollment = {
  _id: string;
  billingPreference?: BillingPreference;
  classId: DanceClass | string;
};

function studentName(value: Payment["studentId"]) {
  return typeof value === "string" ? value : value.firstName + " " + value.lastName;
}

function statusOf(payment: Payment) {
  return payment.effectiveStatus ?? payment.status;
}

function statusLabel(status: string) {
  if (status === "PAID") return "Pagado";
  if (status === "OVERDUE") return "Vencido";
  if (status === "CANCELLED") return "Cancelado";
  return "Pendiente";
}

function methodLabel(method?: PaymentMethod) {
  return {
    CASH: "Efectivo",
    TRANSFER: "Transferencia",
    CARD: "Tarjeta",
    OTHER: "Otro"
  }[method ?? "OTHER"];
}

function billingMode(danceClass?: DanceClass) {
  return danceClass?.billingMode ?? "MONTHLY";
}

function defaultPaymentType(
  danceClass?: DanceClass,
  preference?: BillingPreference
): PaymentType {
  const mode = billingMode(danceClass);
  if (mode === "PER_CLASS") return "PER_CLASS";
  if (mode === "MONTHLY") return "MONTHLY";
  if (mode === "BOTH") return preference ?? "PER_CLASS";
  return "PER_CLASS";
}

function priceFor(danceClass: DanceClass | undefined, type: PaymentType) {
  if (!danceClass) return 0;
  return type === "PER_CLASS"
    ? danceClass.pricePerClass ?? 0
    : danceClass.monthlyPrice ?? 0;
}

export function PaymentsLive() {
  const { toast } = useAdminFeedback();
  const [items, setItems] = useState<Payment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [classes, setClasses] = useState<DanceClass[]>([]);
  const [studentEnrollments, setStudentEnrollments] = useState<StudentEnrollment[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedPaymentType, setSelectedPaymentType] = useState<PaymentType>("PER_CLASS");
  const [chargeAmount, setChargeAmount] = useState(0);
  const [classId, setClassId] = useState("");
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("");
  const [status, setStatus] = useState("");
  const [branchId, setBranchId] = useState("");
  const [paymentTypeFilter, setPaymentTypeFilter] = useState("");
  const [chargeModal, setChargeModal] = useState(false);
  const [pendingModal, setPendingModal] = useState(false);
  const [paying, setPaying] = useState<Payment | null>(null);
  const [cancelling, setCancelling] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const selectedEnrollment = useMemo(
    () => studentEnrollments.find((item) =>
      typeof item.classId !== "string" && item.classId._id === selectedClassId
    ),
    [studentEnrollments, selectedClassId]
  );

  const selectedClass =
    selectedEnrollment && typeof selectedEnrollment.classId !== "string"
      ? selectedEnrollment.classId
      : undefined;

  const studentClasses = studentEnrollments
    .map((item) => item.classId)
    .filter((item): item is DanceClass => typeof item !== "string" && item.status === "ACTIVE");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({ limit: "100" });
      const summaryParams = new URLSearchParams();
      if (search) params.set("q", search);
      if (period) {
        params.set("period", period);
        summaryParams.set("period", period);
      }
      if (status) params.set("status", status);
      if (branchId) {
        params.set("branchId", branchId);
        summaryParams.set("branchId", branchId);
      }
      if (classId) params.set("classId", classId);
      if (paymentTypeFilter) params.set("paymentType", paymentTypeFilter);

      const [payments, studentList, branchList, classList, paymentSummary] = await Promise.all([
        apiFetch<Paginated<Payment>>("/admin/payments?" + params.toString()),
        apiFetch<Paginated<Student>>("/admin/students?limit=100&isActive=true"),
        apiFetch<Branch[]>("/admin/branches"),
        apiFetch<DanceClass[]>("/admin/classes?status=ACTIVE"),
        apiFetch<PaymentSummary>("/admin/payments/summary?" + summaryParams.toString())
      ]);

      setItems(payments.items);
      setStudents(studentList.items);
      setBranches(branchList.filter((item) => item.isActive));
      setClasses(classList);
      setSummary(paymentSummary);
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [search, period, status, branchId, classId, paymentTypeFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180);
    return () => window.clearTimeout(timer);
  }, [load]);

  function resetComposer() {
    setSelectedStudentId("");
    setSelectedClassId("");
    setStudentEnrollments([]);
    setSelectedPaymentType("PER_CLASS");
    setChargeAmount(0);
  }

  async function selectStudent(studentId: string) {
    setSelectedStudentId(studentId);
    setSelectedClassId("");
    setStudentEnrollments([]);
    setChargeAmount(0);

    if (!studentId) return;

    try {
      const response = await apiFetch<{ items: StudentEnrollment[] }>(
        "/admin/enrollments/student/" + studentId
      );
      setStudentEnrollments(
        response.items.filter((item) => typeof item.classId !== "string" && item.classId.status === "ACTIVE")
      );
    } catch (requestError) {
      const message = apiMessage(requestError);
      setError(message);
      toast({ title: "No se pudieron cargar las clases", description: message, tone: "error" });
    }
  }

  function selectClass(nextClassId: string) {
    setSelectedClassId(nextClassId);
    const enrollment = studentEnrollments.find((item) =>
      typeof item.classId !== "string" && item.classId._id === nextClassId
    );
    const danceClass = enrollment && typeof enrollment.classId !== "string" ? enrollment.classId : undefined;
    const nextType = defaultPaymentType(danceClass, enrollment?.billingPreference);
    setSelectedPaymentType(nextType);
    setChargeAmount(priceFor(danceClass, nextType));
  }

  function changePaymentType(nextType: PaymentType) {
    setSelectedPaymentType(nextType);
    setChargeAmount(priceFor(selectedClass, nextType));
  }

  async function quickCharge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedStudentId || !selectedClass) return;

    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError("");

    try {
      await apiFetch<Payment>("/admin/payments/quick-charge", {
        method: "POST",
        body: JSON.stringify({
          studentId: selectedStudentId,
          classId: selectedClass._id,
          paymentType: selectedPaymentType,
          classDate: selectedPaymentType === "PER_CLASS" ? form.get("classDate") : undefined,
          period: selectedPaymentType === "MONTHLY" ? form.get("period") : undefined,
          amount: chargeAmount,
          paymentMethod: form.get("paymentMethod"),
          paidAt: form.get("paidAt") || undefined,
          notes: form.get("notes")
        })
      });

      setChargeModal(false);
      toast({
        title: "Cobro registrado",
        description: selectedClass.name + (selectedPaymentType === "PER_CLASS" ? " · clase abonada" : " · mensualidad abonada")
      });
      resetComposer();
      await load(true);
    } catch (requestError) {
      const message = apiMessage(requestError);
      setError(message);
      toast({ title: "No se pudo registrar el cobro", description: message, tone: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  async function createPending(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedStudentId || !selectedClass) return;

    const form = new FormData(event.currentTarget);
    const classDate = selectedPaymentType === "PER_CLASS" ? String(form.get("classDate") || "") : "";
    const selectedPeriod = selectedPaymentType === "PER_CLASS"
      ? classDate.slice(0, 7)
      : String(form.get("period") || "");

    setSubmitting(true);
    setError("");

    try {
      await apiFetch<Payment>("/admin/payments", {
        method: "POST",
        body: JSON.stringify({
          studentId: selectedStudentId,
          classId: selectedClass._id,
          paymentType: selectedPaymentType,
          classDate: classDate || undefined,
          concept: (selectedPaymentType === "PER_CLASS" ? "Clase · " : "Mensualidad · ") + selectedClass.name,
          period: selectedPeriod,
          amount: chargeAmount,
          dueDate: form.get("dueDate"),
          notes: form.get("notes")
        })
      });
      setPendingModal(false);
      toast("Pago pendiente registrado");
      resetComposer();
      await load(true);
    } catch (requestError) {
      const message = apiMessage(requestError);
      setError(message);
      toast({ title: "No se pudo crear el pendiente", description: message, tone: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  async function markPaid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!paying) return;

    const form = new FormData(event.currentTarget);
    setSubmitting(true);

    try {
      await apiFetch<Payment>("/admin/payments/" + paying._id + "/mark-paid", {
        method: "POST",
        body: JSON.stringify({
          paymentMethod: form.get("paymentMethod"),
          paidAt: form.get("paidAt") || undefined
        })
      });
      setPaying(null);
      toast("Cobro registrado y recibo generado");
      await load(true);
    } catch (requestError) {
      toast({ title: "No se pudo cobrar", description: apiMessage(requestError), tone: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cancelling) return;

    const form = new FormData(event.currentTarget);
    setSubmitting(true);

    try {
      await apiFetch("/admin/payments/" + cancelling._id + "/cancel", {
        method: "POST",
        body: JSON.stringify({ reason: form.get("reason") })
      });
      setCancelling(null);
      toast("Registro cancelado y conservado en el historial");
      await load(true);
    } catch (requestError) {
      toast({ title: "No se pudo cancelar", description: apiMessage(requestError), tone: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  async function remind(id: string) {
    setBusyId(id);
    try {
      await apiFetch<{ ok: boolean }>("/admin/payments/" + id + "/remind", { method: "POST" });
      toast("Recordatorio enviado por email");
    } catch (requestError) {
      toast({ title: "No se pudo enviar el recordatorio", description: apiMessage(requestError), tone: "error" });
    } finally {
      setBusyId("");
    }
  }

  async function uploadProof(paymentId: string, file?: File) {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    setBusyId(paymentId);

    try {
      await apiFetch("/admin/payments/" + paymentId + "/proof", { method: "POST", body: form });
      toast("Comprobante guardado");
      await load(true);
    } catch (requestError) {
      toast({ title: "No se pudo guardar el comprobante", description: apiMessage(requestError), tone: "error" });
    } finally {
      setBusyId("");
    }
  }

  function exportExcel() {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (period) params.set("period", period);
    if (status) params.set("status", status);
    if (branchId) params.set("branchId", branchId);
    if (classId) params.set("classId", classId);
    if (paymentTypeFilter) params.set("paymentType", paymentTypeFilter);
    window.open(apiUrl("/admin/payments/export.xlsx?" + params.toString()), "_blank");
  }

  function openComposer(kind: "charge" | "pending") {
    resetComposer();
    if (kind === "charge") setChargeModal(true);
    else setPendingModal(true);
  }

  const composerFields = (mode: "charge" | "pending") => (
    <>
      <Field label="Alumno" wide>
        <select required value={selectedStudentId} onChange={(event) => void selectStudent(event.target.value)}>
          <option value="" disabled>Seleccionar alumno</option>
          {students.map((student) => <option key={student._id} value={student._id}>{student.firstName} {student.lastName}</option>)}
        </select>
      </Field>
      <Field label="Clase" wide>
        <select required value={selectedClassId} onChange={(event) => selectClass(event.target.value)} disabled={!selectedStudentId}>
          <option value="">{selectedStudentId ? "Seleccionar clase inscripta" : "Primero seleccioná un alumno"}</option>
          {studentClasses.filter((danceClass) => billingMode(danceClass) !== "FREE").map((danceClass) => (
            <option key={danceClass._id} value={danceClass._id}>{danceClass.name}</option>
          ))}
        </select>
      </Field>

      {selectedClass && billingMode(selectedClass) === "BOTH" && (
        <Field label="Modalidad">
          <select value={selectedPaymentType} onChange={(event) => changePaymentType(event.target.value as PaymentType)}>
            <option value="PER_CLASS">Por clase</option>
            <option value="MONTHLY">Mensual</option>
          </select>
        </Field>
      )}

      {selectedPaymentType === "PER_CLASS" ? (
        <Field label="Fecha de la clase">
          <input name="classDate" type="date" defaultValue={todayInArgentina()} required />
        </Field>
      ) : (
        <Field label="Período">
          <input name="period" type="month" defaultValue={todayInArgentina().slice(0, 7)} required />
        </Field>
      )}

      <Field label="Importe">
        <input
          value={chargeAmount || ""}
          onChange={(event) => setChargeAmount(Number(event.target.value))}
          type="number"
          min="1"
          step="0.01"
          required
        />
      </Field>

      {mode === "charge" ? (
        <>
          <Field label="Medio de pago">
            <select name="paymentMethod" defaultValue="CASH" required>
              <option value="CASH">Efectivo</option>
              <option value="TRANSFER">Transferencia</option>
              <option value="CARD">Tarjeta</option>
              <option value="OTHER">Otro</option>
            </select>
          </Field>
          <Field label="Fecha de pago">
            <input name="paidAt" type="date" defaultValue={todayInArgentina()} />
          </Field>
        </>
      ) : (
        <Field label="Vencimiento">
          <input name="dueDate" type="date" defaultValue={todayInArgentina()} required />
        </Field>
      )}

      <Field label="Notas" wide><textarea name="notes" rows={3} /></Field>
    </>
  );

  return (
    <>
      <PageHeader
        eyebrow="CAJA"
        title="Pagos"
        description="Cobrá una clase en segundos, registrá mensualidades y seguí los pendientes."
        actionLabel="Registrar cobro"
        onAction={() => openComposer("charge")}
      />

      <div className={styles.summaryGrid}>
        <article><span>Cobrado</span><strong>$ {(summary?.paidAmount ?? 0).toLocaleString("es-AR")}</strong><small>{summary?.paidCount ?? 0} pagos</small></article>
        <article><span>Pendiente</span><strong>$ {(summary?.pendingAmount ?? 0).toLocaleString("es-AR")}</strong><small>{summary?.pendingCount ?? 0} registros</small></article>
        <article data-tone="danger"><span>Vencido</span><strong>$ {(summary?.overdueAmount ?? 0).toLocaleString("es-AR")}</strong><small>{summary?.overdueCount ?? 0} registros</small></article>
        <article><span>Movimientos</span><strong>{summary?.count ?? 0}</strong><small>incluye cancelados</small></article>
      </div>

      <div className={styles.filters}>
        <div className={styles.search}>
          <Search size={17} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Alumno, concepto o recibo..." />
        </div>
        <input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
        <select value={paymentTypeFilter} onChange={(event) => setPaymentTypeFilter(event.target.value)}>
          <option value="">Todas las modalidades</option>
          <option value="PER_CLASS">Por clase</option>
          <option value="MONTHLY">Mensual</option>
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">Todos los estados</option>
          <option value="PENDING">Pendientes</option>
          <option value="OVERDUE">Vencidos</option>
          <option value="PAID">Pagados</option>
          <option value="CANCELLED">Cancelados</option>
        </select>
        <select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
          <option value="">Todas las sedes</option>
          {branches.map((branch) => <option value={branch._id} key={branch._id}>{branch.name}</option>)}
        </select>
        <select value={classId} onChange={(event) => setClassId(event.target.value)}>
          <option value="">Todas las clases</option>
          {classes.map((danceClass) => <option value={danceClass._id} key={danceClass._id}>{danceClass.name}</option>)}
        </select>
        <button onClick={() => openComposer("pending")}><Plus size={15} /> Pendiente</button>
        <button onClick={exportExcel}><Download size={15} /> Excel</button>
      </div>

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}
      {loading && !items.length && <LoadingBlock />}

      {(items.length > 0 || !loading) && (
        <div className={styles.table}>
          <div className={styles.head}>
            <span>Alumno / concepto</span><span>Modalidad</span><span>Importe</span><span>Estado</span><span>Documentos</span><span>Acciones</span>
          </div>
          {items.length === 0 && <div className={styles.empty}>No hay pagos para estos filtros.</div>}
          {items.map((payment) => {
            const currentStatus = statusOf(payment);
            const student = typeof payment.studentId === "string" ? null : payment.studentId;
            const paymentType = payment.paymentType ?? "MONTHLY";

            return (
              <div className={styles.row} key={payment._id}>
                <span className={styles.mainCell}>
                  <strong>{studentName(payment.studentId)}</strong>
                  <small>
                    {typeof payment.classId === "string" ? payment.classId : payment.classId?.name ?? "Clase no vinculada"}
                    {" · "}{payment.concept}
                    {payment.classDate ? " · " + new Date(payment.classDate).toLocaleDateString("es-AR") : " · " + payment.period}
                  </small>
                </span>
                <span>{paymentType === "PER_CLASS" ? "Por clase" : "Mensual"}</span>
                <strong>$ {payment.amount.toLocaleString("es-AR")}</strong>
                <span className={styles.status} data-status={currentStatus}>{statusLabel(currentStatus)}</span>
                <span className={styles.documents}>
                  {payment.receiptNumber && (
                    <a href={apiUrl("/admin/payments/" + payment._id + "/receipt.pdf")} target="_blank" rel="noreferrer" title={payment.receiptNumber}>
                      <FileText size={15} /> Recibo
                    </a>
                  )}
                  {payment.proofUrl && <a href={payment.proofUrl} target="_blank" rel="noreferrer"><Paperclip size={15} /> Comprobante</a>}
                </span>
                <span className={styles.actions}>
                  {currentStatus !== "PAID" && currentStatus !== "CANCELLED" && (
                    <button disabled={busyId === payment._id} onClick={() => setPaying(payment)}><Check size={14} /> Cobrar</button>
                  )}
                  {currentStatus !== "PAID" && currentStatus !== "CANCELLED" && student?.email && (
                    <button disabled={busyId === payment._id} onClick={() => void remind(payment._id)}><Mail size={14} /></button>
                  )}
                  {currentStatus !== "CANCELLED" && (
                    <label className={styles.uploadAction}>
                      <Paperclip size={14} />
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,.pdf"
                        disabled={busyId === payment._id}
                        onChange={(event) => {
                          void uploadProof(payment._id, event.target.files?.[0]);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                  )}
                  {currentStatus !== "CANCELLED" && (
                    <button className={styles.cancel} onClick={() => setCancelling(payment)}><Ban size={14} /></button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <LiveModal
        open={chargeModal}
        title="Registrar cobro"
        description="Alumno, clase y medio de pago. El importe sugerido sale de la clase."
        submitting={submitting}
        onClose={() => { setChargeModal(false); resetComposer(); }}
        onSubmit={quickCharge}
        submitLabel="Registrar cobro"
      >
        {composerFields("charge")}
      </LiveModal>

      <LiveModal
        open={pendingModal}
        title="Registrar pago pendiente"
        description="Usalo cuando el alumno todavía no abonó. Después se cobra desde la misma fila."
        submitting={submitting}
        onClose={() => { setPendingModal(false); resetComposer(); }}
        onSubmit={createPending}
        submitLabel="Crear pendiente"
      >
        {composerFields("pending")}
      </LiveModal>

      <LiveModal
        open={Boolean(paying)}
        title="Cobrar pendiente"
        description={paying ? studentName(paying.studentId) + " · $ " + paying.amount.toLocaleString("es-AR") : ""}
        submitting={submitting}
        onClose={() => setPaying(null)}
        onSubmit={markPaid}
        submitLabel="Confirmar cobro"
      >
        <Field label="Medio de pago">
          <select name="paymentMethod" defaultValue="TRANSFER" required>
            <option value="CASH">Efectivo</option>
            <option value="TRANSFER">Transferencia</option>
            <option value="CARD">Tarjeta</option>
            <option value="OTHER">Otro</option>
          </select>
        </Field>
        <Field label="Fecha de pago"><input name="paidAt" type="date" defaultValue={todayInArgentina()} /></Field>
        {paying?.paymentMethod && <div className={styles.modalHint}>Medio anterior: {methodLabel(paying.paymentMethod)}</div>}
      </LiveModal>

      <LiveModal
        open={Boolean(cancelling)}
        title="Cancelar registro"
        description="No se borra: queda cancelado y auditado."
        submitting={submitting}
        onClose={() => setCancelling(null)}
        onSubmit={cancelPayment}
        submitLabel="Cancelar registro"
      >
        <Field label="Motivo" wide><textarea name="reason" rows={4} minLength={3} required /></Field>
      </LiveModal>
    </>
  );
}
