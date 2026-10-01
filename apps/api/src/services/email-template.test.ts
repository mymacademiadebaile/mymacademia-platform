import { describe, expect, it } from "vitest";
import { emailTemplate } from "./email-template";

describe("emailTemplate", () => {
  it("renders the academy identity and preserves a readable message", () => {
    const html = emailTemplate({
      subject: "Recordatorio de pago - M&M Academia",
      text: "Hola Ana, tenés una cuota pendiente."
    });

    expect(html).toContain("M&amp;M Academia");
    expect(html).toContain("Recordatorio de pago</h1>");
    expect(html).toContain("Hola Ana, tenés una cuota pendiente.");
  });

  it("escapes custom content and turns secure URLs into links", () => {
    const html = emailTemplate({
      subject: "Aviso <importante>",
      text: "Abrí https://academia.test/reset?token=abc&next=login <script>alert(1)</script>"
    });

    expect(html).toContain("Aviso &lt;importante&gt;");
    expect(html).toContain('href="https://academia.test/reset?token=abc&amp;next=login"');
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
