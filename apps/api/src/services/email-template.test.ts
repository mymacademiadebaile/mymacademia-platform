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

  it("escapes custom content and renders secure URLs as action buttons", () => {
    const html = emailTemplate({
      subject: "Aviso <importante>",
      text: "Abrí https://academia.test/reset?token=abc&next=login <script>alert(1)</script>"
    });

    expect(html).toContain("Aviso &lt;importante&gt;");
    expect(html).toContain('href="https://academia.test/reset?token=abc&amp;next=login"');
    expect(html).toContain("Restablecer contraseña");
    expect(html).toContain('bgcolor="#5b21b6"');
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("uses a specific reset-password call to action instead of exposing the URL in the message", () => {
    const html = emailTemplate({
      subject: "Restablecer contraseña - M&M Academia",
      text: "Usá este enlace dentro de 30 minutos:\n\nhttps://academia.test/reset-password?token=abc."
    });

    expect(html).toContain("SEGURIDAD DE LA CUENTA");
    expect(html).toContain("Restablecer contraseña <span");
    expect(html).toContain('href="https://academia.test/reset-password?token=abc"');
    expect(html).not.toContain('>https://academia.test/reset-password?token=abc<');
  });
});
