type EmailTemplateInput = {
  subject: string;
  text: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function messageHtml(text: string) {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => {
      const formatted = paragraph
        .split(/(https?:\/\/[^\s<]+)/g)
        .map((part) => {
          if (!/^https?:\/\//.test(part)) return escapeHtml(part);
          const url = escapeHtml(part);
          return `<a href="${url}" style="color:#5b21b6;text-decoration:underline;text-underline-offset:3px;">${url}</a>`;
        })
        .join("")
        .replaceAll("\n", "<br />");

      return `<p style="margin:0 0 18px;color:#342b3d;font-family:'Trebuchet MS',Tahoma,sans-serif;font-size:16px;line-height:1.65;">${formatted}</p>`;
    })
    .join("");
}

function previewText(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 140);
}

export function emailTemplate({ subject, text }: EmailTemplateInput) {
  const title = escapeHtml(subject.replace(/\s*-\s*M&M Academia\s*$/i, "").trim());
  const preview = escapeHtml(previewText(text));

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f1f7;color:#221a2a;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preview}&nbsp;&zwnj;</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f4f1f7;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;">
            <tr>
              <td style="padding:28px 36px;background:#2a0f52;color:#ffffff;">
                <p style="margin:0;font-family:'Trebuchet MS',Tahoma,sans-serif;font-size:18px;font-weight:700;letter-spacing:2px;line-height:1.1;text-transform:uppercase;">M&amp;M Academia</p>
                <p style="margin:7px 0 0;color:#d9ccff;font-family:'Trebuchet MS',Tahoma,sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Academia de baile · La Plata</p>
              </td>
            </tr>
            <tr>
              <td style="padding:40px 36px 26px;">
                <h1 style="margin:0 0 24px;color:#21162b;font-family:'Trebuchet MS',Tahoma,sans-serif;font-size:30px;font-weight:700;line-height:1.16;">${title}</h1>
                ${messageHtml(text)}
              </td>
            </tr>
            <tr>
              <td style="padding:0 36px 36px;">
                <div style="height:1px;background:#e8e0ee;font-size:1px;line-height:1px;">&nbsp;</div>
                <p style="margin:18px 0 0;color:#756b80;font-family:'Trebuchet MS',Tahoma,sans-serif;font-size:12px;line-height:1.55;">Este es un mensaje de M&amp;M Academia de Baile.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
