import { describe, expect, it } from "vitest";
import { formatDateDmy, paymentReminderText, whatsappNumber } from "./reminder-message";

describe("paymentReminderText", () => {
  const base = { firstName: "Jorge", amount: 8000, dueDate: "2026-10-12", period: "2026-10" };

  it("formats dates as DD/MM/AAAA and avoids repeating the period for class fees", () => {
    const text = paymentReminderText({ ...base, kind: "CLASS_FEE", concept: "Clase 2026-10-12 · Bachata pre-intermedio" });
    expect(text).toContain("Concepto: Clase 12/10/2026 · Bachata pre-intermedio");
    expect(text).toContain("Importe: $ 8.000");
    expect(text).toContain("Vencimiento: 12/10/2026");
    expect(text).not.toContain("2026-10");
  });

  it("shows the period as month and year for monthly fees", () => {
    const text = paymentReminderText({ ...base, kind: "MONTHLY_FEE", concept: "Mensualidad · Grupo" });
    expect(text).toContain("Mensualidad · Grupo (octubre 2026)");
  });

  it("adds a WhatsApp link only when the academy has a number", () => {
    const withPhone = paymentReminderText({ ...base, kind: "OTHER", concept: "Remera", inquiryWhatsApp: "+54 9 221 555-1234" });
    expect(withPhone).toContain("https://wa.me/5492215551234");
    expect(paymentReminderText({ ...base, kind: "OTHER", concept: "Remera" })).not.toContain("wa.me");
  });
});

describe("helpers", () => {
  it("formats dates and normalizes phones", () => {
    expect(formatDateDmy("2026-01-05")).toBe("05/01/2026");
    expect(whatsappNumber("221 555-1234")).toBe("5492215551234");
    expect(whatsappNumber("")).toBeUndefined();
  });
});
