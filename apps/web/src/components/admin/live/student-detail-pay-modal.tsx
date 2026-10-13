import { ProofField } from "../billing/proof";
import type { FormEvent } from "react";
import { todayInArgentina } from "@/lib/dates";
import type { AccountCharge } from "./student-detail-types";
import { Field, LiveModal } from "./live-common";

export function StudentPayModal({
  charge,
  busy,
  onClose,
  onSubmit
}: {
  charge: AccountCharge | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <LiveModal
      open={Boolean(charge)}
      title="Registrar cobro"
      description={charge ? charge.concept + " · $ " + charge.balance.toLocaleString("es-AR") : ""}
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
      <ProofField />
    </LiveModal>
  );
}
