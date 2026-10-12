import { CircleDollarSign, Download, FileText, Mail, MessageCircle } from "lucide-react";
import Link from "next/link";
import { apiUrl } from "@/lib/api";
import { formatDateOnly } from "@/lib/dates";
import type { Student } from "./live-types";
import { CHARGE_KIND_LABEL } from "../billing/billing-types";
import type { AccountCharge } from "./student-detail-types";
import styles from "./student-detail-payments.module.css";
import cardStyles from "./student-detail-cards.module.css";

export function StudentPaymentsCard({
  charges,
  student,
  busy,
  onCharge,
  onRemind,
  onEmailReceipt,
  onShareWhatsApp
}: {
  charges: AccountCharge[];
  student: Student;
  busy: boolean;
  onCharge: (charge: AccountCharge) => void;
  onRemind: (charge: AccountCharge) => void;
  onEmailReceipt: (collectionId: string) => void;
  onShareWhatsApp: (charge: AccountCharge) => void;
}) {
  return (
    <section className={cardStyles.card + " " + cardStyles.paymentsCard}>
      <div className={cardStyles.cardHeader}>
        <div><span>CUENTA</span><h3>Pagos</h3></div>
        <Link href="/admin/payments"><CircleDollarSign size={15} /> Ver módulo pagos</Link>
      </div>

      <div className={styles.paymentTable}>
        <div className={styles.paymentHead}>
          <span>Concepto</span><span>Fecha / período</span><span>Vencimiento</span><span>Importe</span><span>Estado</span><span>Acciones</span>
        </div>
        {charges.length === 0 && <p className={cardStyles.empty}>Todavía no tiene pagos registrados.</p>}
        {charges.map((charge) => {
          const status = charge.status;
          const receipt = charge.lastCollection;
          const open = charge.balance > 0;
          return (
            <div className={styles.paymentRow} key={charge.id}>
              <span>
                <strong>{charge.concept}</strong>
                <small>{CHARGE_KIND_LABEL[charge.kind]}</small>
              </span>
              <span>{charge.kind === "CLASS_FEE" && charge.serviceDate ? formatDateOnly(charge.serviceDate) : charge.period}</span>
              <span>{formatDateOnly(charge.dueDate)}</span>
              <span>$ {charge.owed.toLocaleString("es-AR")}</span>
              <span className={status === "PAID" ? styles.statusPaid : status === "OVERDUE" ? styles.statusOverdue : styles.statusPending}>
                {status === "PAID" ? "Pagado" : status === "OVERDUE" ? "Vencido" : status === "PARTIAL" ? "Pago parcial" : "Pendiente"}
              </span>
              <span className={styles.rowActions}>
                {open && (
                  <button disabled={busy} onClick={() => onCharge(charge)}>Cobrar</button>
                )}
                {open && student.email && (
                  <button disabled={busy} onClick={() => onRemind(charge)}>Recordar</button>
                )}
                {receipt && (
                  <>
                    <a
                      href={apiUrl(`/admin/billing/collections/${receipt.id}/receipt.pdf`)}
                      target="_blank"
                      rel="noreferrer"
                      title="Ver recibo"
                    >
                      <FileText size={13} /> Ver recibo
                    </a>
                    <a
                      href={apiUrl(`/admin/billing/collections/${receipt.id}/receipt.pdf?download=1`)}
                      title="Descargar recibo"
                    >
                      <Download size={13} /> Descargar
                    </a>
                    {student.email && (
                      <button disabled={busy} onClick={() => onEmailReceipt(receipt.id)} title={`Enviar recibo a ${student.email}`}>
                        <Mail size={13} /> Email
                      </button>
                    )}
                    {student.phone && (
                      <button onClick={() => onShareWhatsApp(charge)} title="Abrir WhatsApp Web y descargar el recibo para adjuntarlo">
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
