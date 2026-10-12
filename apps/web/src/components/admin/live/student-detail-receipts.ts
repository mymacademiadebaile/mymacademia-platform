import { apiFetch, apiMessage, apiUrl } from "@/lib/api";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import type { Payment, Student } from "./live-types";

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

  async function remind(paymentId: string) {
    setBusy(true);
    setError("");

    try {
      await apiFetch(`/admin/payments/${paymentId}/remind`, { method: "POST" });
      toast("Recordatorio enviado por email");
    } catch (requestError) {
      const message = apiMessage(requestError);
      setError(message);
      toast({ title: "No se pudo enviar el recordatorio", description: message, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function emailReceipt(paymentId: string) {
    setBusy(true);
    setError("");

    try {
      await apiFetch(`/admin/payments/${paymentId}/receipt/email`, { method: "POST" });
      toast("Recibo enviado por email");
    } catch (requestError) {
      const message = apiMessage(requestError);
      setError(message);
      toast({ title: "No se pudo enviar el recibo", description: message, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  function downloadReceipt(payment: Payment) {
    const link = document.createElement("a");
    link.href = apiUrl(`/admin/payments/${payment._id}/receipt.pdf?download=1`);
    link.download = `${payment.receiptNumber ?? "recibo"}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function shareReceiptWhatsApp(payment: Payment) {
    if (!student?.phone) return;

    const phone = student.phone.replace(/\D/g, "");
    const text = `Hola ${student.firstName}, te compartimos el recibo ${payment.receiptNumber ?? "de pago"} por $ ${payment.amount.toLocaleString("es-AR")} correspondiente a ${payment.concept}.`;
    const chat = window.open(
      `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(text)}`,
      "_blank"
    );
    if (chat) chat.opener = null;

    downloadReceipt(payment);
    toast({
      title: chat ? "WhatsApp Web abierto" : "Recibo descargado",
      description: chat
        ? "El PDF se descargó para que lo adjuntes en el chat abierto."
        : "Permití las ventanas emergentes para abrir WhatsApp Web y adjuntá este PDF al chat."
    });
  }

  return { remind, emailReceipt, shareReceiptWhatsApp };
}
