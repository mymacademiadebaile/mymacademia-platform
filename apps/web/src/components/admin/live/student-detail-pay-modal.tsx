import type { FormEvent } from "react";
import { todayInArgentina } from "@/lib/dates";
import type { Payment } from "./live-types";
import { Field, LiveModal } from "./live-common";

export function StudentPayModal({
  payment,
  busy,
  onClose,
  onSubmit
}: {
  payment: Payment | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <LiveModal
      open={Boolean(payment)}
      title="Registrar cobro"
      description={payment ? payment.concept + " · $ " + payment.amount.toLocaleString("es-AR") : ""}
      submitting={busy}
      onClose={onClose}
      onSubmit={onSubmit}
      submitLabel="Confirmar cobro"
    >
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
    </LiveModal>
  );
}
