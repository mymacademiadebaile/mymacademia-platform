import { createServer } from "node:http";

// Synthetic published catalog; no writes, MongoDB, SMTP or external services.
const styles = [
  ["salsa", "Salsa"], ["fitdance", "Fitdance"], ["stretching", "Stretching"],
  ["ritmos-latinos", "Ritmos Latinos"], ["bachata-sensual", "Bachata Sensual"]
].map(([slug, name]) => ({
  slug, name, tagline: `Clases de ${name}.`, description: ["Contenido de prueba local."],
  image: { src: "/mym-academia-logo.png", width: 160, height: 160 },
  levels: ["Inicial"], professorSlugs: ["docente-prueba"]
}));

const catalog = {
  styles,
  professors: [{
    slug: "docente-prueba", displayName: "Docente de prueba", firstName: "Docente", lastName: "de prueba",
    bioShort: "Perfil de prueba local.", bio: [], disciplines: styles.map(({ slug }) => slug),
    avatar: { src: "/mym-academia-logo.png", width: 160, height: 160 }
  }],
  schedule: []
};

let mode = "ok";
createServer((request, response) => {
  if (request.method === "POST" && request.url?.startsWith("/__test/mode/")) {
    const requested = request.url.slice("/__test/mode/".length);
    if (!["ok", "down", "empty"].includes(requested)) {
      response.writeHead(400).end();
      return;
    }
    mode = requested;
    response.writeHead(204).end();
    return;
  }
  const payloads = {
    "/api/public/catalog": mode === "empty" ? { ...catalog, styles: [] } : catalog,
    "/api/public/social-links": {},
    "/api/public/site-images": { academySpace: {} }
  };
  const payload = request.method === "GET" ? payloads[request.url] : undefined;
  response.writeHead(mode === "down" && payload ? 503 : payload ? 200 : 404, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload ?? { error: "NOT_FOUND" }));
}).listen(4100, "127.0.0.1");
