"use client";

import {
  Ban,
  Check,
  Download,
  FileText,
  Mail,
  Paperclip,
  Search
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage, apiUrl } from "@/lib/api";
import type {
  Branch,
  DanceClass,
  Paginated,
  Payment,
  PaymentMethod,
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

function studentName(value: Payment["studentId"]) {
  return typeof value === "string" ? value : `${value.firstName} ${value.lastName}`;
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

export function PaymentsLive() {
  const [items, setItems] = useState<Payment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [classes, setClasses] = useState<DanceClass[]>([]);
  const [studentClasses, setStudentClasses] = useState<DanceClass[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [classId, setClassId] = useState("");
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("");
  const [status, setStatus] = useState("");
  const [branchId, setBranchId] = useState("");
  const [modal, setModal] = useState(false);
  const [paying, setPaying] = useState<Payment | null>(null);
  const [cancelling, setCancelling] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
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

      const [payments, studentList, branchList, classList, paymentSummary] = await Promise.all([
        apiFetch<Paginated<Payment>>(`/admin/payments?${params.toString()}`),
        apiFetch<Paginated<Student>>("/admin/students?limit=100&isActive=true"),
        apiFetch<Branch[]>("/admin/branches"),
        apiFetch<DanceClass[]>("/admin/classes?status=ACTIVE"),
        apiFetch<PaymentSummary>(`/admin/payments/summary?${summaryParams.toString()}`)
      ]);

      setItems(payments.items);
      setStudents(studentList.items);
      setBranches(branchList.filter((item) => item.isActive));
      setClasses(classList);
      setSummary(paymentSummary);
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [search, period, status, branchId, classId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function selectStudent(studentId: string) {
    setSelectedStudentId(studentId);
    setStudentClasses([]);

    if (!studentId) return;

    try {
      const response = await apiFetch<{ items: Array<{ classId: DanceClass | string }> }>(
        `/admin/enrollments/student/${studentId}`
      );
      setStudentClasses(
        response.items
          .map((item) => item.classId)
          .filter((item): item is DanceClass => typeof item !== "string" && item.status === "ACTIVE")
      );
    } catch (requestError) {
      setError(apiMessage(requestError));
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const selectedStudent = students.find((student) => student._id === form.get("studentId"));
    const selectedClass = studentClasses.find((danceClass) => danceClass._id === form.get("classId"));

    if (!selectedStudent) {
      setError("Seleccioná un alumno.");
      return;
    }

    if (!selectedClass) {
      setError("Seleccioná una clase activa del alumno.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await apiFetch<Payment>("/admin/payments", {
        method: "POST",
        body: JSON.stringify({
          studentId: selectedStudent._id,
          classId: selectedClass._id,
          branchId: selectedStudent.branchId,
          concept: form.get("concept"),
          period: form.get("period"),
          amount: Number(form.get("amount")),
          dueDate: form.get("dueDate"),
          notes: form.get("notes")
        })
      });
      setModal(false);
      setSelectedStudentId("");
      setStudentClasses([]);
      setNotice("Cuota creada y vinculada a la clase.");
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function markPaid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!paying) return;

    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError("");

    try {
      await apiFetch<Payment>(`/admin/payments/${paying._id}/mark-paid`, {
        method: "POST",
        body: JSON.stringify({
          paymentMethod: form.get("paymentMethod"),
          paidAt: form.get("paidAt") || undefined
        })
      });
      setPaying(null);
      setNotice("Cobro registrado y recibo generado.");
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cancelling) return;

    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError("");

    try {
      await apiFetch(`/admin/payments/${cancelling._id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: form.get("reason") })
      });
      setCancelling(null);
      setNotice("Registro cancelado y conservado en el historial.");
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function remind(id: string) {
    setBusyId(id);
    setError("");

    try {
      await apiFetch<{ ok: boolean }>(`/admin/payments/${id}/remind`, { method: "POST" });
      setNotice("Recordatorio enviado por email.");
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setBusyId("");
    }
  }

  async function uploadProof(paymentId: string, file?: File) {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    setBusyId(paymentId);
    setError("");

    try {
      await apiFetch(`/admin/payments/${paymentId}/proof`, {
        method: "POST",
        body: form
      });
      setNotice("Comprobante guardado.");
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError));
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
    window.open(apiUrl(`/admin/payments/export.xlsx?${params.toString()}`), "_blank");
  }

  return (
    <>
      <PageHeader
        eyebrow="FINANZAS"
        title="Pagos y cuotas"
        description="Cobros, deuda, comprobantes, recibos y recordatorios con trazabilidad."
        actionLabel="Nueva cuota"
        onAction={() => setModal(true)}
      />

      <div className={styles.summaryGrid}>
        <article><span>Cobrado</span><strong>$ {(summary?.paidAmount ?? 0).toLocaleString("es-AR")}</strong><small>{summary?.paidCount ?? 0} pagos</small></article>
        <article><span>Pendiente</span><strong>$ {(summary?.pendingAmount ?? 0).toLocaleString("es-AR")}</strong><small>{summary?.pendingCount ?? 0} cuotas</small></article>
        <article data-tone="danger"><span>Vencido</span><strong>$ {(summary?.overdueAmount ?? 0).toLocaleString("es-AR")}</strong><small>{summary?.overdueCount ?? 0} cuotas</small></article>
        <article><span>Registros</span><strong>{summary?.count ?? 0}</strong><small>incluye cancelados</small></article>
      </div>

      <div className={styles.filters}>
        <div className={styles.search}>
          <Search size={17} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Alumno, concepto o recibo..." />
        </div>
        <input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
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
        <button onClick={exportExcel}><Download size={15} /> Excel</button>
      </div>

      {notice && <div className={styles.notice}><Check size={15} /> {notice}</div>}
      {error && <ErrorBlock message={error} onRetry={() => void load()} />}
      {loading && !items.length && <LoadingBlock />}

      {!loading && (
        <div className={styles.table}>
          <div className={styles.head}>
            <span>Alumno / concepto</span><span>Período</span><span>Importe</span><span>Estado</span><span>Documentos</span><span>Acciones</span>
          </div>
          {items.length === 0 && <div className={styles.empty}>No hay pagos para estos filtros.</div>}
          {items.map((payment) => {
            const currentStatus = statusOf(payment);
            const student = typeof payment.studentId === "string" ? null : payment.studentId;

            return (
              <div className={styles.row} key={payment._id}>
                <span className={styles.mainCell}>
                  <strong>{studentName(payment.studentId)}</strong>
                  <small>
                    {typeof payment.classId === "string"
                      ? payment.classId
                      : payment.classId?.name ?? "Clase no vinculada"}
                    {" · "}
                    {payment.concept} · vence {new Date(payment.dueDate).toLocaleDateString("es-AR")}
                  </small>
                </span>
                <span>{payment.period}</span>
                <strong>$ {payment.amount.toLocaleString("es-AR")}</strong>
                <span className={styles.status} data-status={currentStatus}>{statusLabel(currentStatus)}</span>
                <span className={styles.documents}>
                  {payment.receiptNumber && (
                    <a href={apiUrl(`/admin/payments/${payment._id}/receipt.pdf`)} target="_blank" rel="noreferrer" title={payment.receiptNumber}>
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

      <LiveModal open={modal} title="Crear cuota" description="La sede se toma automáticamente del alumno." submitting={submitting} onClose={() => setModal(false)} onSubmit={create}>
        <Field label="Alumno" wide>
          <select
            name="studentId"
            required
            value={selectedStudentId}
            onChange={(event) => void selectStudent(event.target.value)}
          >
            <option value="" disabled>Seleccionar alumno</option>
            {students.map((student) => <option key={student._id} value={student._id}>{student.firstName} {student.lastName}</option>)}
          </select>
        </Field>
        <Field label="Clase" wide>
          <select name="classId" required defaultValue="" key={selectedStudentId || "no-student"}>
            <option value="" disabled>
              {selectedStudentId ? "Seleccionar clase inscripta" : "Primero seleccioná un alumno"}
            </option>
            {studentClasses.map((danceClass) => (
              <option key={danceClass._id} value={danceClass._id}>
                {danceClass.name} · $ {(danceClass.monthlyPrice ?? 0).toLocaleString("es-AR")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Concepto"><input name="concept" defaultValue="Cuota mensual" required /></Field>
        <Field label="Período"><input name="period" type="month" required /></Field>
        <Field label="Importe"><input name="amount" type="number" min="1" step="0.01" required /></Field>
        <div className={styles.modalHint}>El importe puede copiarse de la cuota configurada en la clase o ajustarse manualmente para este alumno.</div>
        <Field label="Vencimiento"><input name="dueDate" type="date" required /></Field>
        <Field label="Notas" wide><textarea name="notes" rows={3} /></Field>
      </LiveModal>

      <LiveModal open={Boolean(paying)} title="Registrar cobro" description={paying ? `${studentName(paying.studentId)} · $ ${paying.amount.toLocaleString("es-AR")}` : ""} submitting={submitting} onClose={() => setPaying(null)} onSubmit={markPaid}>
        <Field label="Medio de pago">
          <select name="paymentMethod" defaultValue="TRANSFER" required>
            <option value="CASH">Efectivo</option>
            <option value="TRANSFER">Transferencia</option>
            <option value="CARD">Tarjeta</option>
            <option value="OTHER">Otro</option>
          </select>
        </Field>
        <Field label="Fecha de pago"><input name="paidAt" type="date" /></Field>
      </LiveModal>

      <LiveModal open={Boolean(cancelling)} title="Cancelar registro" description="El registro no se borra: queda cancelado y auditado." submitting={submitting} onClose={() => setCancelling(null)} onSubmit={cancelPayment}>
        <Field label="Motivo" wide><textarea name="reason" rows={4} minLength={3} required /></Field>
      </LiveModal>
    </>
  );
}
