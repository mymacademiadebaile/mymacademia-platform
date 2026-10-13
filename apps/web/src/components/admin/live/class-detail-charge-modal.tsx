import { ProofField } from "../billing/proof";
import { FormEvent } from "react";
import { todayInArgentina } from "@/lib/dates";
import type { BillingPreference, DanceClass } from "./live-types";
import { Field, LiveModal } from "./live-common";
import type { Enrollment } from "./class-detail-types";
import { normalizedMode } from "./class-detail-helpers";

type Props = {
  danceClass: DanceClass;
  chargingEnrollment: Enrollment | null;
  chargePaymentType: BillingPreference;
  chargeAmount: number;
  chargeSubmitting: boolean;
  onPaymentTypeChange: (paymentType: BillingPreference) => void;
  onAmountChange: (amount: number) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function ClassChargeModal({
  danceClass,
  chargingEnrollment,
  chargePaymentType,
  chargeAmount,
  chargeSubmitting,
  onPaymentTypeChange,
  onAmountChange,
  onClose,
  onSubmit
}: Props) {
  const mode = normalizedMode(danceClass);

  return (
    <LiveModal
      open={Boolean(chargingEnrollment)}
      title="Registrar cobro"
      description={chargingEnrollment ? chargingEnrollment.studentId.firstName + " " + chargingEnrollment.studentId.lastName + " · " + danceClass.name : ""}
      submitting={chargeSubmitting}
      onClose={onClose}
      onSubmit={onSubmit}
      submitLabel="Registrar cobro"
    >
      {mode === "BOTH" && (
        <Field label="Modalidad">
          <select value={chargePaymentType} onChange={(event) => onPaymentTypeChange(event.target.value as BillingPreference)}>
            <option value="PER_CLASS">Por clase</option>
            <option value="MONTHLY">Mensual</option>
          </select>
        </Field>
      )}
      {chargePaymentType === "PER_CLASS" ? (
        <Field label="Fecha de la clase"><input name="classDate" type="date" defaultValue={todayInArgentina()} required /></Field>
      ) : (
        <Field label="Período"><input name="period" type="month" defaultValue={todayInArgentina().slice(0, 7)} required /></Field>
      )}
      <Field label="Importe">
        <input value={chargeAmount || ""} onChange={(event) => onAmountChange(Number(event.target.value))} type="number" min="1" step="0.01" required />
      </Field>
      <Field label="Medio de pago">
        <select name="paymentMethod" defaultValue="CASH" required>
          <option value="CASH">Efectivo</option>
          <option value="TRANSFER">Transferencia</option>
          <option value="CARD">Tarjeta</option>
          <option value="OTHER">Otro</option>
        </select>
      </Field>
      <Field label="Fecha de pago"><input name="paidAt" type="date" defaultValue={todayInArgentina()} /></Field>
      <ProofField />
      <Field label="Notas" wide><textarea name="notes" rows={3} /></Field>
    </LiveModal>
  );
}
