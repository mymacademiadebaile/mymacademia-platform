"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Check, Mail, Search } from "lucide-react";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import type { Branch, Paginated, Payment, Student } from "./live-types";
import { ErrorBlock, Field, LiveModal, LoadingBlock } from "./live-common";
import styles from "./live.module.css";

function studentName(value: Payment["studentId"]): string {
  return typeof value === "string"
    ? value
    : `${value.firstName} ${value.lastName}`;
}

function paymentStatus(payment: Payment) {
  if (payment.status === "PENDING" && new Date(payment.dueDate).getTime() < Date.now()) {
    return "OVERDUE";
  }
  return payment.status;
}

export function PaymentsLive() {
  const [items, setItems] = useState<Payment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [payments, studentList, branchList] = await Promise.all([
        apiFetch<Paginated<Payment>>("/admin/payments?limit=100"),
        apiFetch<Paginated<Student>>("/admin/students?limit=100"),
        apiFetch<Branch[]>("/admin/branches")
      ]);
      setItems(payments.items);
      setStudents(studentList.items.filter((item) => item.isActive));
      setBranches(branchList.filter((item) => item.isActive));
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError("");

    try {
      await apiFetch<Payment>("/admin/payments", {
        method: "POST",
        body: JSON.stringify({
          branchId: form.get("branchId"),
          studentId: form.get("studentId"),
          concept: form.get("concept"),
          period: form.get("period"),
          amount: Number(form.get("amount")),
          dueDate: form.get("dueDate")
        })
      });
      setModal(false);
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function markPaid(id: string) {
    setBusyId(id);
    setNotice("");

    try {
      await apiFetch<Payment>(`/admin/payments/${id}/mark-paid`, { method: "POST" });
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setBusyId("");
    }
  }

  async function remind(id: string) {
    setBusyId(id);
    setNotice("");

    try {
      await apiFetch<{ ok: boolean }>(`/admin/payments/${id}/remind`, { method: "POST" });
      setNotice("Recordatorio enviado por email.");
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setBusyId("");
    }
  }

  const visible = items.filter((item) =>
    (studentName(item.studentId) + " " + item.concept + " " + item.period)
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const pendingAmount = items
    .filter((item) => paymentStatus(item) !== "PAID" && paymentStatus(item) !== "CANCELLED")
    .reduce((sum, item) => sum + item.amount, 0);

  return (
    <>
      <PageHeader
        eyebrow="FINANZAS"
        title="Pagos y cuotas"
        description="Cuotas reales, cobros y recordatorios enviados con Gmail + Nodemailer."
        actionLabel="Registrar cuota"
        onAction={() => setModal(true)}
      />

      <div className={styles.liveGrid3}>
        <article className={styles.card}>
          <span className={styles.cardLabel}>Registros</span>
          <strong className={styles.cardValue}>{items.length}</strong>
          <span className={styles.cardDetail}>Cuotas cargadas</span>
        </article>
        <article className={styles.card}>
          <span className={styles.cardLabel}>Pendiente</span>
          <strong className={styles.cardValue}>$ {pendingAmount.toLocaleString("es-AR")}</strong>
          <span className={styles.cardDetail}>Incluye vencidas</span>
        </article>
        <article className={styles.card}>
          <span className={styles.cardLabel}>Pagadas</span>
          <strong className={styles.cardValue}>{items.filter((item) => item.status === "PAID").length}</strong>
          <span className={styles.cardDetail}>Con fecha de pago registrada</span>
        </article>
      </div>

      {notice && <div className={styles.notice}>{notice}</div>}

      <div className={styles.card} style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <Search size={17} />
          <input
            style={{ flex: 1, border: 0, outline: 0, background: "transparent" }}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar alumno, período o concepto..."
          />
        </div>
      </div>

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}
      {loading && !items.length && <LoadingBlock />}

      {!loading && (
        <div className={styles.listCard}>
          {visible.map((payment) => {
            const status = paymentStatus(payment);
            return (
              <div className={styles.listRow} key={payment._id}>
                <span className={styles.avatar}>$</span>
                <span className={styles.rowBody}>
                  <strong>{studentName(payment.studentId)}</strong>
                  <small>{payment.concept} · {payment.period} · vence {new Date(payment.dueDate).toLocaleDateString("es-AR")}</small>
                </span>
                <strong style={{ fontSize: 11 }}>$ {payment.amount.toLocaleString("es-AR")}</strong>
                <span className={status === "PAID" ? styles.pill : status === "OVERDUE" ? styles.pillWarn : styles.pillOff}>
                  {status === "PAID" ? "Pagado" : status === "OVERDUE" ? "Vencido" : "Pendiente"}
                </span>
                {status !== "PAID" && (
                  <>
                    <button className={styles.inlineAction} disabled={busyId === payment._id} onClick={() => void markPaid(payment._id)}>
                      <Check size={14} />
                    </button>
                    <button className={styles.inlineAction} disabled={busyId === payment._id} onClick={() => void remind(payment._id)}>
                      <Mail size={14} />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      <LiveModal
        open={modal}
        title="Registrar cuota"
        description="Generá un concepto de pago para un alumno."
        submitting={submitting}
        onClose={() => setModal(false)}
        onSubmit={create}
      >
        <Field label="Sede">
          <select name="branchId" required defaultValue="">
            <option value="" disabled>Seleccionar sede</option>
            {branches.map((item) => <option value={item._id} key={item._id}>{item.name}</option>)}
          </select>
        </Field>
        <Field label="Alumno">
          <select name="studentId" required defaultValue="">
            <option value="" disabled>Seleccionar alumno</option>
            {students.map((item) => <option value={item._id} key={item._id}>{item.firstName} {item.lastName}</option>)}
          </select>
        </Field>
        <Field label="Concepto"><input name="concept" defaultValue="Cuota mensual" required /></Field>
        <Field label="Período"><input name="period" placeholder="2026-09" required /></Field>
        <Field label="Importe"><input name="amount" type="number" min={0} required /></Field>
        <Field label="Vencimiento"><input name="dueDate" type="date" required /></Field>
      </LiveModal>
    </>
  );
}
