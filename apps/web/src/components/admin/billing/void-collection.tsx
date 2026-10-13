"use client";

import { FormEvent, useState } from "react";
import { apiFetch, apiMessage } from "@/lib/api";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import { Field, LiveModal } from "../live/live-common";
import { formatMoney } from "../scheduling/scheduling-types";

export type VoidTarget = { id: string; receiptNumber: string | null; amount: number; studentName: string };

/**
 * "Anular cobro": for a collection registered by mistake. It leaves the month's totals, the
 * charge it paid is owed again (or removed too) and the receipt stays on record as voided.
 */
export function useVoidCollection(onVoided: () => void | Promise<void>) {
  const { toast } = useAdminFeedback();
  const [target, setTarget] = useState<VoidTarget | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await apiFetch(`/admin/billing/collections/${target.id}/void`, {
        method: "POST",
        body: JSON.stringify({ reason: form.get("reason"), voidCharges: form.get("voidCharges") === "on" })
      });
      setTarget(null);
      toast({ title: "Cobro anulado", description: "Ya no cuenta en los totales y el recibo quedó marcado como anulado.", tone: "success" });
      await onVoided();
    } catch (error) {
      toast({ title: "No se pudo anular el cobro", description: apiMessage(error), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  const voidModal = (
    <LiveModal
      open={Boolean(target)}
      title="Anular cobro"
      description={target ? `${target.studentName} · ${formatMoney(target.amount)}${target.receiptNumber ? " · " + target.receiptNumber : ""}` : ""}
      submitting={busy}
      submitLabel="Anular cobro"
      onClose={() => setTarget(null)}
      onSubmit={submit}
    >
      <p style={{ gridColumn: "1 / -1", margin: 0, color: "#5f5566", fontSize: 13, lineHeight: 1.5 }}>
        Usalo solo si el cobro se cargó por error. Deja de contar en el total del mes, el recibo queda marcado como anulado y la cuota vuelve a Por cobrar. No se borra nada: queda registrado quién lo anuló y por qué.
      </p>
      <Field label="Motivo" wide>
        <input name="reason" required minLength={3} maxLength={500} placeholder="Ej.: se cobró al alumno equivocado" />
      </Field>
      <label style={{ gridColumn: "1 / -1", display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: "#3d3344" }}>
        <input name="voidCharges" type="checkbox" style={{ marginTop: 3 }} />
        <span>También eliminar la deuda: el importe no correspondía y no hay que volver a cobrarlo.</span>
      </label>
    </LiveModal>
  );

  return { openVoid: setTarget, voidModal };
}
