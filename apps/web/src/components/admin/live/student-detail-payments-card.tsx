import { CircleDollarSign, Download, FileText, Mail, MessageCircle } from "lucide-react";
import Link from "next/link";
import { apiUrl } from "@/lib/api";
import { formatDateOnly } from "@/lib/dates";
import type { Payment, Student } from "./live-types";
import { paymentReference, paymentStatus } from "./student-detail-helpers";
import styles from "./student-detail.module.css";

export function StudentPaymentsCard({
  payments,
  student,
  busy,
  onCharge,
  onRemind,
  onEmailReceipt,
  onShareWhatsApp
}: {
  payments: Payment[];
  student: Student;
  busy: boolean;
  onCharge: (payment: Payment) => void;
  onRemind: (paymentId: string) => void;
  onEmailReceipt: (paymentId: string) => void;
  onShareWhatsApp: (payment: Payment) => void;
}) {
  return (
    <section className={styles.card + " " + styles.paymentsCard}>
      <div className={styles.cardHeader}>
        <div><span>CUENTA</span><h3>Pagos</h3></div>
        <Link href="/admin/payments"><CircleDollarSign size={15} /> Ver módulo pagos</Link>
      </div>

      <div className={styles.paymentTable}>
        <div className={styles.paymentHead}>
          <span>Concepto</span><span>Fecha / período</span><span>Vencimiento</span><span>Importe</span><span>Estado</span><span>Acciones</span>
        </div>
        {payments.length === 0 && <p className={styles.empty}>Todavía no tiene pagos registrados.</p>}
        {payments.map((payment) => {
          const status = paymentStatus(payment);
          return (
            <div className={styles.paymentRow} key={payment._id}>
              <span>
                <strong>{payment.concept}</strong>
                <small>{(payment.paymentType ?? "MONTHLY") === "PER_CLASS" ? "Por clase" : "Mensual"}</small>
              </span>
              <span>{paymentReference(payment)}</span>
              <span>{formatDateOnly(payment.dueDate)}</span>
              <span>$ {payment.amount.toLocaleString("es-AR")}</span>
              <span className={status === "PAID" ? styles.statusPaid : status === "OVERDUE" ? styles.statusOverdue : styles.statusPending}>
                {status === "PAID" ? "Pagado" : status === "OVERDUE" ? "Vencido" : "Pendiente"}
              </span>
              <span className={styles.rowActions}>
                {status !== "PAID" && status !== "CANCELLED" && (
                  <button disabled={busy} onClick={() => onCharge(payment)}>Cobrar</button>
                )}
                {status !== "PAID" && status !== "CANCELLED" && student.email && (
                  <button disabled={busy} onClick={() => onRemind(payment._id)}>Recordar</button>
                )}
                {status === "PAID" && (
                  <>
                    <a
                      href={apiUrl(`/admin/payments/${payment._id}/receipt.pdf`)}
                      target="_blank"
                      rel="noreferrer"
                      title="Ver recibo"
                    >
                      <FileText size={13} /> Ver recibo
                    </a>
                    <a
                      href={apiUrl(`/admin/payments/${payment._id}/receipt.pdf?download=1`)}
                      title="Descargar recibo"
                    >
                      <Download size={13} /> Descargar
                    </a>
                    {student.email && (
                      <button disabled={busy} onClick={() => onEmailReceipt(payment._id)} title={`Enviar recibo a ${student.email}`}>
                        <Mail size={13} /> Email
                      </button>
                    )}
                    {student.phone && (
                      <button onClick={() => onShareWhatsApp(payment)} title="Abrir WhatsApp Web y descargar el recibo para adjuntarlo">
                        <MessageCircle size={13} /> WhatsApp
                      </button>
                    )}
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
