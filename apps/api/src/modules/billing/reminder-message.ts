const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
];

/** YYYY-MM-DD → DD/MM/AAAA. */
export function formatDateDmy(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

/** YYYY-MM → "octubre 2026". */
function formatPeriod(period: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  return match && month ? `${month} ${match[1]}` : period;
}

/** Concepts embed ISO dates ("Clase 2026-10-12 · ..."); show them as DD/MM/AAAA. */
function readableConcept(concept: string) {
  return concept.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, "$3/$2/$1");
}

/** Digits-only international number for wa.me; bare Argentine mobiles get the 549 prefix. */
export function whatsappNumber(raw: string | undefined) {
  const digits = (raw ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length < 8) return undefined;
  return digits.length <= 11 ? `549${digits.replace(/^15/, "")}` : digits;
}

export function paymentReminderText(input: {
  firstName: string;
  concept: string;
  kind: string;
  period: string;
  amount: number;
  dueDate: string;
  inquiryWhatsApp?: string;
}) {
  const concept = readableConcept(input.concept);
  const detail = input.kind === "CLASS_FEE" || concept.includes(input.period)
    ? concept
    : `${concept} (${formatPeriod(input.period)})`;
  const phone = whatsappNumber(input.inquiryWhatsApp);
  const lines = [
    `Hola ${input.firstName},`,
    "Te escribimos de M&M Academia para recordarte que tenés un pago pendiente:",
    [
      `• Concepto: ${detail}`,
      `• Importe: $ ${input.amount.toLocaleString("es-AR")}`,
      `• Vencimiento: ${formatDateDmy(input.dueDate)}`
    ].join("\n"),
    "Si ya lo abonaste, podés ignorar este mensaje. Ante cualquier duda, escribinos y te ayudamos."
  ];
  if (phone) lines.push(`Escribinos por WhatsApp: https://wa.me/${phone}`);
  return lines.join("\n\n");
}
