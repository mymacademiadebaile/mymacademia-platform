import { collectedToast, proofFileOf, tryUploadProof } from "../billing/proof";
import { FormEvent, useState } from "react";
import { apiFetch, apiMessage } from "@/lib/api";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import type { BillingPreference, DanceClass } from "./live-types";
import type { Enrollment } from "./class-detail-types";
import { newIdempotencyKey } from "../scheduling/scheduling-types";
import { normalizedMode, preferenceForClass } from "./class-detail-helpers";

export function useClassCharge(danceClass: DanceClass | null) {
  const { toast } = useAdminFeedback();
  const [chargingEnrollment, setChargingEnrollment] = useState<Enrollment | null>(null);
  const [chargePaymentType, setChargePaymentType] = useState<BillingPreference>("PER_CLASS");
  const [chargeAmount, setChargeAmount] = useState(0);
  const [chargeSubmitting, setChargeSubmitting] = useState(false);
  // One key per charge dialog: a repeated submit answers with the first collection instead of charging twice.
  const [chargeKey, setChargeKey] = useState(newIdempotencyKey);

  function openCharge(enrollment: Enrollment) {
    if (!danceClass || normalizedMode(danceClass) === "FREE") return;

    const paymentType = enrollment.billingPreference ?? preferenceForClass(danceClass) ?? "PER_CLASS";
    setChargingEnrollment(enrollment);
    setChargeKey(newIdempotencyKey());
    setChargePaymentType(paymentType);
    setChargeAmount(0);
  }

  function changeChargePaymentType(paymentType: BillingPreference) {
    if (!danceClass) return;
    setChargePaymentType(paymentType);
    setChargeAmount(0);
  }

  async function registerCharge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chargingEnrollment || !danceClass) return;

    const form = new FormData(event.currentTarget);
    setChargeSubmitting(true);

    try {
      const result = await apiFetch<{ collection: { id: string } | null }>("/admin/billing/classes/" + danceClass._id + "/collect", {
        method: "POST",
        body: JSON.stringify({
          studentId: chargingEnrollment.studentId._id,
          paymentType: chargePaymentType,
          serviceDate: chargePaymentType === "PER_CLASS" ? form.get("classDate") : undefined,
          period: chargePaymentType === "MONTHLY" ? form.get("period") : undefined,
          amount: chargeAmount > 0 ? chargeAmount : undefined,
          method: form.get("paymentMethod"),
          receivedAt: form.get("paidAt") || undefined,
          notes: form.get("notes") || undefined,
          idempotencyKey: chargeKey
        })
      });
      const proofError = result.collection ? await tryUploadProof(result.collection.id, proofFileOf(form)) : null;
      setChargingEnrollment(null);
      toast(result.collection
        ? collectedToast(proofError, chargingEnrollment.studentId.firstName + " " + chargingEnrollment.studentId.lastName + " · " + danceClass.name)
        : { title: "Clase bonificada", description: "El cargo quedó cubierto por la promoción, sin registrar dinero recibido.", tone: "success" });
    } catch (requestError) {
      toast({ title: "No se pudo registrar el cobro", description: apiMessage(requestError), tone: "error" });
    } finally {
      setChargeSubmitting(false);
    }
  }

  return {
    chargingEnrollment,
    chargePaymentType,
    chargeAmount,
    chargeSubmitting,
    setChargingEnrollment,
    setChargeAmount,
    openCharge,
    changeChargePaymentType,
    registerCharge
  };
}
