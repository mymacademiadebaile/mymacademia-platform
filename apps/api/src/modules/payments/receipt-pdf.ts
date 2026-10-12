import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import PDFDocument from "pdfkit";
import { ACADEMY_TIME_ZONE } from "../../common/dates";

// The academy mark is embedded so receipts keep their identity whether they are opened,
// downloaded or sent by email (the API service does not serve the web app's public assets).
function loadAcademyLogo() {
  const candidates = [
    resolve(process.cwd(), "../web/public/mym-academia-logo.png"),
    resolve(process.cwd(), "apps/web/public/mym-academia-logo.png")
  ];
  const path = candidates.find(existsSync);
  return path ? readFileSync(path) : undefined;
}

const ACADEMY_LOGO_PNG = loadAcademyLogo();

const METHOD_LABELS: Record<string, string> = { CASH: "Efectivo", TRANSFER: "Transferencia", CARD: "Tarjeta", OTHER: "Otro" };
const MAX_ITEMS = 8;

export type ReceiptStudent = {
  _id?: unknown;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
};

export type ReceiptOrganization = { name?: string; email?: string; phone?: string } | null;

/** Everything the receipt layout needs, independent of whether it comes from a payment or a collection. */
export type ReceiptData = {
  receiptNumber?: string | null;
  paidAt: Date;
  method?: string;
  /** YYYY-MM or free text. */
  period?: string;
  concepts: Array<{ concept: string; amount?: number }>;
  className?: string;
  amount: number;
  credit?: number;
};

export function formatReceiptMoney(value: number) {
  return `$ ${value.toLocaleString("es-AR")}`;
}

export function writeReceiptPdf(
  document: InstanceType<typeof PDFDocument>,
  receipt: ReceiptData,
  organization: ReceiptOrganization,
  student: ReceiptStudent
) {
  const pageWidth = document.page.width;
  const margin = 52;
  const contentWidth = pageWidth - margin * 2;
  const violet = "#5b21b6";
  const ink = "#241334";
  const muted = "#766a80";
  const surface = "#f5f1fb";
  const paidDate = receipt.paidAt.toLocaleDateString("es-AR", { timeZone: ACADEMY_TIME_ZONE });
  const methodLabel = METHOD_LABELS[receipt.method ?? "OTHER"] ?? receipt.method;
  const periodLabel = /^\d{4}-(0[1-9]|1[0-2])$/.test(receipt.period ?? "")
    ? new Date(`${receipt.period}-01T12:00:00`).toLocaleDateString("es-AR", { month: "long", year: "numeric", timeZone: ACADEMY_TIME_ZONE })
    : receipt.period;

  const shown = receipt.concepts.slice(0, MAX_ITEMS);
  const hidden = receipt.concepts.length - shown.length;
  const multiple = receipt.concepts.length > 1;
  const lines = multiple ? shown.length + (hidden > 0 ? 1 : 0) : 1;
  const extra = Math.max(0, lines - 1) * 16;

  document.rect(0, 0, pageWidth, 126).fill("#20112f");
  document.rect(0, 122, pageWidth, 4).fill("#a78bfa");
  if (ACADEMY_LOGO_PNG) {
    document.image(ACADEMY_LOGO_PNG, margin, 27, { fit: [72, 72] });
  } else {
    document.circle(margin + 36, 63, 31).fillAndStroke("#13091f", "#a78bfa");
    document.fillColor("#ffffff").font("Times-Bold").fontSize(22).text("M&M", margin + 6, 55, { width: 60, align: "center" });
  }
  document.fillColor("#ffffff").font("Helvetica-Bold").fontSize(20).text(
    organization?.name ?? "M&M Academia de Baile",
    142,
    43,
    { width: 240, lineBreak: false }
  );
  document.fillColor("#d8ccf6").font("Helvetica-Bold").fontSize(8).text("ACADEMIA DE BAILE · LA PLATA", 143, 73, {
    characterSpacing: 1.2,
    width: 245
  });
  document.roundedRect(pageWidth - margin - 120, 35, 120, 56, 9).fill("#392251");
  document.fillColor("#d8ccf6").font("Helvetica-Bold").fontSize(8).text("RECIBO DE PAGO", pageWidth - margin - 108, 47, { width: 96, align: "center", characterSpacing: 0.8 });
  document.fillColor("#ffffff").font("Helvetica-Bold").fontSize(12).text(receipt.receiptNumber ?? "—", pageWidth - margin - 108, 65, { width: 96, align: "center" });

  document.fillColor(ink).font("Helvetica-Bold").fontSize(21).text("Comprobante de pago", margin, 160);
  document.fillColor(muted).font("Helvetica").fontSize(10).text("Gracias por ser parte de M&M Academia de Baile.", margin, 188);
  document.moveTo(margin, 213).lineTo(pageWidth - margin, 213).lineWidth(1).strokeColor("#e8e0ef").stroke();

  const columnGap = 20;
  const columnWidth = (contentWidth - columnGap) / 2;
  const cardY = 238;
  const cardHeight = 106;
  document.roundedRect(margin, cardY, columnWidth, cardHeight, 10).fill(surface);
  document.roundedRect(margin + columnWidth + columnGap, cardY, columnWidth, cardHeight, 10).fill(surface);

  document.fillColor(violet).font("Helvetica-Bold").fontSize(8).text("RECIBIMOS DE", margin + 16, cardY + 17, { characterSpacing: 1 });
  document.fillColor(ink).font("Helvetica-Bold").fontSize(13).text(`${student.firstName} ${student.lastName}`, margin + 16, cardY + 34, { width: columnWidth - 32 });
  document.fillColor(muted).font("Helvetica").fontSize(9).text(student.email ?? "Sin email cargado", margin + 16, cardY + 55, { width: columnWidth - 32 });
  if (student.phone) document.text(student.phone, margin + 16, cardY + 71, { width: columnWidth - 32 });

  const detailsX = margin + columnWidth + columnGap + 16;
  document.fillColor(violet).font("Helvetica-Bold").fontSize(8).text("DETALLES DEL COBRO", detailsX, cardY + 17, { characterSpacing: 1 });
  document.fillColor(muted).font("Helvetica-Bold").fontSize(8).text("FECHA DE PAGO", detailsX, cardY + 38);
  document.fillColor(ink).font("Helvetica").fontSize(10).text(paidDate, detailsX, cardY + 50);
  document.fillColor(muted).font("Helvetica-Bold").fontSize(8).text("MEDIO DE PAGO", detailsX + 126, cardY + 38);
  document.fillColor(ink).font("Helvetica").fontSize(10).text(methodLabel ?? "—", detailsX + 126, cardY + 50, { width: columnWidth - 158 });
  document.fillColor(muted).font("Helvetica-Bold").fontSize(8).text("PERÍODO", detailsX, cardY + 74);
  document.fillColor(ink).font("Helvetica").fontSize(10).text(periodLabel || "—", detailsX, cardY + 86, { width: columnWidth - 32 });

  const conceptY = 370;
  const conceptHeight = 78 + extra;
  document.roundedRect(margin, conceptY, contentWidth, conceptHeight, 10).fillColor("#ffffff").strokeColor("#e9e1ef").lineWidth(1).fillAndStroke();
  document.fillColor(muted).font("Helvetica-Bold").fontSize(8).text(multiple ? "CONCEPTOS" : "CONCEPTO", margin + 16, conceptY + 15, { characterSpacing: 1 });
  if (!multiple) {
    document.fillColor(ink).font("Helvetica-Bold").fontSize(12).text(receipt.concepts[0]?.concept ?? "Pago", margin + 16, conceptY + 31, { width: contentWidth - 32, lineBreak: false });
  } else {
    shown.forEach((item, index) => {
      const y = conceptY + 31 + index * 16;
      document.fillColor(ink).font("Helvetica-Bold").fontSize(11).text(item.concept, margin + 16, y, { width: contentWidth - 150, lineBreak: false });
      if (item.amount !== undefined) {
        document.font("Helvetica").text(formatReceiptMoney(item.amount), margin + contentWidth - 126, y, { width: 110, align: "right", lineBreak: false });
      }
    });
    if (hidden > 0) {
      document.fillColor(muted).font("Helvetica").fontSize(9).text(`y ${hidden} más`, margin + 16, conceptY + 31 + shown.length * 16, { width: contentWidth - 32, lineBreak: false });
    }
  }
  if (receipt.className) {
    document.fillColor(muted).font("Helvetica").fontSize(9).text(`Clase: ${receipt.className}`, margin + 16, conceptY + 53 + extra, { width: contentWidth - 32, lineBreak: false });
  }

  const totalY = 474 + extra;
  document.roundedRect(margin, totalY, contentWidth, 74, 10).fill("#ede9fe");
  document.fillColor(violet).font("Helvetica-Bold").fontSize(9).text("TOTAL ABONADO", margin + 18, totalY + 18, { characterSpacing: 1 });
  document.fillColor(ink).font("Helvetica-Bold").fontSize(23).text(formatReceiptMoney(receipt.amount), margin + 18, totalY + 33);
  document.fillColor("#166534").font("Helvetica-Bold").fontSize(9).text("PAGO CONFIRMADO", margin + contentWidth - 132, totalY + 32, { width: 114, align: "right", characterSpacing: 0.6 });
  if (receipt.credit && receipt.credit > 0) {
    document.fillColor(muted).font("Helvetica").fontSize(9).text(`Saldo a favor: ${formatReceiptMoney(receipt.credit)}`, margin + contentWidth - 232, totalY + 48, { width: 214, align: "right" });
  }

  const footerY = 590 + extra;
  document.moveTo(margin, footerY).lineTo(pageWidth - margin, footerY).lineWidth(1).strokeColor("#e8e0ef").stroke();
  const contact = [organization?.email, organization?.phone].filter(Boolean).join(" · ");
  document.fillColor(muted).font("Helvetica").fontSize(8.5).text(
    contact || "Comprobante emitido por el sistema de gestión de M&M Academia de Baile.",
    margin,
    footerY + 16,
    { width: contentWidth, align: "center" }
  );
  document.fillColor("#998ca5").fontSize(8).text("Este comprobante acredita el pago registrado.", margin, footerY + 32, { width: contentWidth, align: "center" });
}

export function receiptPdfBuffer(receipt: ReceiptData, organization: ReceiptOrganization, student: ReceiptStudent) {
  return new Promise<Buffer>((resolvePdf, reject) => {
    const document = new PDFDocument({ size: "A4", margin: 54 });
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolvePdf(Buffer.concat(chunks)));
    document.on("error", reject);
    writeReceiptPdf(document, receipt, organization, student);
    document.end();
  });
}
