type EmailTemplateInput = {
  subject: string;
  text: string;
};

type MessageLink = {
  url: string;
  label: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function previewText(text: string) {
  return text
    .replace(/https?:\/\/[^\s<]+/g, "enlace seguro")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

function subjectWithoutBrand(subject: string) {
  return subject.replace(/\s*-\s*M&M Academia\s*$/i, "").trim();
}

function emailCategory(subject: string) {
  const normalized = subject.toLocaleLowerCase("es-AR");

  if (/(contraseña|password|acceso|seguridad)/.test(normalized)) return "SEGURIDAD DE LA CUENTA";
  if (/(pago|cuota|deuda)/.test(normalized)) return "ADMINISTRACIÓN";
  if (/(clase|horario|asistencia)/.test(normalized)) return "VIDA ACADÉMICA";
  return "COMUNICACIÓN";
}

function actionLabel(url: string, subject: string, index: number) {
  const normalized = `${url} ${subject}`.toLocaleLowerCase("es-AR");
  let label = "Abrir enlace";

  if (/(reset(?:-|_)?password|\/reset[/?]|contraseña|password)/.test(normalized)) label = "Restablecer contraseña";
  else if (/(pago|cuota|payment|checkout)/.test(normalized)) label = "Ver información de pago";
  else if (/(clase|horario|calendar)/.test(normalized)) label = "Ver detalles";
  else if (/(login|admin|portal)/.test(normalized)) label = "Ingresar a la plataforma";

  return index === 0 ? label : `${label} ${index + 1}`;
}

function extractMessageLinks(text: string, subject: string) {
  const links: MessageLink[] = [];
  const body = text.replace(/https?:\/\/[^\s<>"']+/g, (candidate) => {
    // Periods and similar punctuation generally close a sentence, rather than the URL.
    const url = candidate.replace(/[.,;:!?]+$/g, "");
    const trailingPunctuation = candidate.slice(url.length);

    links.push({
      url,
      label: actionLabel(url, subject, links.length)
    });

    return trailingPunctuation;
  });

  return { body, links };
}

function messageHtml(text: string) {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 18px;color:#40354a;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;">${escapeHtml(paragraph).replaceAll("\n", "<br />")}</p>`
    )
    .join("");
}

function actionButtons(links: MessageLink[]) {
  if (links.length === 0) return "";

  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 28px;">
    <tr>
      <td>${links
        .map(
          (link, index) => `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="${index > 0 ? "margin-top:12px;" : ""}">
        <tr>
          <td align="center" bgcolor="#5b21b6" style="border-radius:8px;background:#5b21b6;">
            <a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 22px;border:1px solid #5b21b6;border-radius:8px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;line-height:20px;text-align:center;text-decoration:none;">${escapeHtml(link.label)} <span aria-hidden="true">→</span></a>
          </td>
        </tr>
      </table>`
        )
        .join("")}</td>
    </tr>
  </table>`;
}

export function emailTemplate({ subject, text }: EmailTemplateInput) {
  const cleanSubject = subjectWithoutBrand(subject);
  const title = escapeHtml(cleanSubject);
  const preview = escapeHtml(previewText(text));
  const category = escapeHtml(emailCategory(cleanSubject));
  const { body, links } = extractMessageLinks(text, cleanSubject);

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="color-scheme" content="light" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f3f7;color:#241b2b;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preview}&nbsp;&zwnj;</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f5f3f7;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:28px 36px 26px;background:#281048;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td valign="middle" width="42" height="42" align="center" style="width:42px;height:42px;border:1px solid #a78bfa;border-radius:21px;color:#ffffff;font-family:Georgia,serif;font-size:15px;font-weight:700;letter-spacing:-1px;">M&amp;M</td>
                    <td valign="middle" style="padding-left:12px;">
                      <p style="margin:0;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:700;line-height:1.2;">M&amp;M Academia</p>
                      <p style="margin:4px 0 0;color:#d8ccf6;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.3px;line-height:1.2;text-transform:uppercase;">Academia de baile · La Plata</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="height:5px;background:#a78bfa;font-size:1px;line-height:1px;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:38px 36px 8px;">
                <p style="margin:0 0 12px;color:#6d28d9;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.4px;line-height:1.3;text-transform:uppercase;">${category}</p>
                <h1 style="margin:0 0 24px;color:#271334;font-family:Arial,Helvetica,sans-serif;font-size:30px;font-weight:700;letter-spacing:-0.5px;line-height:1.18;">${title}</h1>
                ${messageHtml(body)}
                ${actionButtons(links)}
              </td>
            </tr>
            <tr>
              <td style="padding:22px 36px 30px;">
                <div style="height:1px;background:#e8e1ee;font-size:1px;line-height:1px;">&nbsp;</div>
                <p style="margin:18px 0 0;color:#786d83;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.55;">Este es un mensaje automático de M&amp;M Academia de Baile.</p>
              </td>
            </tr>
          </table>
          <p style="margin:18px 0 0;color:#8b8192;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.5;text-align:center;">M&amp;M Academia · La Plata, Buenos Aires</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
