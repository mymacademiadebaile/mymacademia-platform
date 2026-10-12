import { apiFetch, apiMessage, apiUrl } from "@/lib/api";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import type { Student } from "./live-types";
import type { AccountCharge } from "./student-detail-types";

export function useStudentPaymentActions({
  student,
  setBusy,
  setError
}: {
  student?: Student;
  setBusy: (busy: boolean) => void;
  setError: (message: string) => void;
}) {
  const { toast } = useAdminFeedback();

  async function remind(chargeId: string) {
    setBusy(true);
    setError("");

    try {
      await apiFetch(`/admin/billing/charges/${chargeId}/remind`, { method: "POST" });
      toast("Recordatorio enviado por email");
    } catch (requestError) {
      const message = apiMessage(requestError);
      setError(message);
      toast({ title: "No se pudo enviar el recordatorio", description: message, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function emailReceipt(collectionId: string) {
    setBusy(true);
    setError("");

    try {
      await apiFetch(`/admin/billing/collections/${collectionId}/receipt/email`, { method: "POST" });
      toast("Recibo enviado por email");
    } catch (requestError) {
      const message = apiMessage(requestError);
      setError(message);
      toast({ title: "No se pudo enviar el recibo", description: message, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  function downloadReceipt(collection: NonNullable<AccountCharge["lastCollection"]>) {
    const link = document.createElement("a");
    link.href = apiUrl(`/admin/billing/collections/${collection.id}/receipt.pdf?download=1`);
    link.download = `${collection.receiptNumber ?? "recibo"}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function shareReceiptWhatsApp(charge: AccountCharge) {
    if (!student?.phone || !charge.lastCollection) return;

    const phone = student.phone.replace(/D/g, "");
    const text = `Hola ${student.firstName}, te compartimos el recibo ${charge.lastCollection.receiptNumber ?? "de pago"} por $ ${charge.paid.toLocaleString("es-AR")} correspondiente a ${charge.concept}.`;
    const chat = window.open(
      `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(text)}`,
      "_blank"
    );
    if (chat) chat.opener = null;

    downloadReceipt(charge.lastCollection);
    toast({
      title: chat ? "WhatsApp Web abierto" : "Recibo descargado",
      description: chat
        ? "El PDF se descargó para que lo adjuntes en el chat abierto."
        : "Permití las ventanas emergentes para abrir WhatsApp Web y adjuntá este PDF al chat."
    });
  }

  return { remind, emailReceipt, shareReceiptWhatsApp };
}
