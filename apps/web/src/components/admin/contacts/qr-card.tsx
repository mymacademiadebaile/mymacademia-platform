"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, apiMessage } from "@/lib/api";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import { CredentialArtwork, type CredentialPerson } from "./credential-artwork";
import styles from "./contacts.module.css";

export function QrCard({ id, person, academic }: { id: string; person: CredentialPerson; academic: boolean }) {
  const { confirm } = useAdminFeedback();
  const [active, setActive] = useState(false), [image, setImage] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const artwork = useRef<SVGSVGElement>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    const result = await apiFetch<{ active: boolean }>(`/admin/check-in/contacts/${id}/credential`, { signal });
    if (!signal?.aborted) { setActive(result.active); setLoading(false); }
  }, [id]);
  useEffect(() => {
    const controller = new AbortController();
    setImage(""); setLoading(true); setError("");
    void load(controller.signal).catch((cause) => { if (!controller.signal.aborted) setError(apiMessage(cause)); });
    return () => controller.abort();
  }, [load]);
  async function change(revoke: boolean) {
    if (active && !await confirm({ title: revoke ? "Revocar credencial" : "Renovar credencial", description: "El QR anterior dejará de funcionar. La identidad y el historial se conservan. Si renovás, entregá la nueva credencial a la persona.", confirmLabel: revoke ? "Revocar" : "Renovar" })) return;
    setBusy(true); setError("");
    try {
      const response = await apiFetch<{ qr?: string }>(`/admin/check-in/contacts/${id}/credential/${revoke ? "revoke" : "rotate"}`, { method: "POST" });
      if (response.qr) { const { toDataURL } = await import("qrcode"); setImage(await toDataURL(response.qr, { width: 400, margin: 4, errorCorrectionLevel: "M" })); }
      else setImage("");
      await load();
    } catch (error) { setError(apiMessage(error)); } finally { setBusy(false); }
  }
  async function download() {
    if (!image || !artwork.current) return;
    setBusy(true); setError("");
    const svgUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(artwork.current)], { type: "image/svg+xml;charset=utf-8" }));
    try {
      const raster = new window.Image();
      raster.src = svgUrl;
      await raster.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 1712; canvas.height = 1080;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No se pudo crear la imagen de la credencial");
      context.drawImage(raster, 0, 0, canvas.width, canvas.height);
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = `mym-credencial-${academic ? "alumno" : "aspirante"}.png`;
      document.body.appendChild(link); link.click(); link.remove();
    } catch { setError("No pudimos descargar la credencial. Probá imprimirla o volvé a intentarlo."); }
    finally { URL.revokeObjectURL(svgUrl); setBusy(false); }
  }
  function printCredential() {
    if (!image || !artwork.current) return;
    setError("");
    const svg = new XMLSerializer().serializeToString(artwork.current);
    const frame = document.createElement("iframe");
    frame.title = "Impresión de credencial";
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0";
    const printDocument = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Credencial de asistencia</title><style>
      @page { size: A4 portrait; margin: 0; }
      html, body { margin: 0; padding: 0; background: #fff; }
      .card { position: relative; width: 85.6mm; height: 53.98mm; margin: 15mm 0 0 15mm; break-inside: avoid; }
      .card svg { display: block; width: 85.6mm; height: 53.98mm; }
      .card::after { content: ""; position: absolute; inset: 0; box-sizing: border-box; border: .2mm solid #aaa; border-radius: 2.8mm; pointer-events: none; }
      svg { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    </style></head><body><div class="card">${svg}</div></body></html>`;
    let cleanupTimer: number;
    const cleanup = () => { window.clearTimeout(cleanupTimer); frame.remove(); };
    frame.addEventListener("load", async () => {
      const printWindow = frame.contentWindow;
      if (!printWindow) { setError("No pudimos abrir la impresión. Probá descargar la credencial."); cleanup(); return; }
      try {
        await printWindow.document.fonts.ready;
        await new Promise<void>((resolve) => printWindow.requestAnimationFrame(() => resolve()));
        printWindow.addEventListener("afterprint", cleanup, { once: true });
        printWindow.focus();
        printWindow.print();
      } catch { setError("No pudimos abrir la impresión. Probá descargar la credencial."); cleanup(); }
    }, { once: true });
    frame.srcdoc = printDocument;
    document.body.appendChild(frame);
    cleanupTimer = window.setTimeout(cleanup, 60_000);
  }
  return <section className={styles.surface}><h2>Credencial de asistencia</h2><p>{image ? "Esta credencial se muestra una única vez. Descargala o imprimila ahora: si recargás la página, el QR seguirá activo pero no podrá volver a mostrarse." : active
    ? "Hay una credencial activa. Por seguridad no podemos volver a mostrar su QR. Si necesitás otra copia, renovala: el QR anterior dejará de funcionar."
    : "Generá una credencial personal para acreditar asistencia con QR."}</p>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.printArea}><CredentialArtwork ref={artwork} person={person} academic={academic} qrImage={image} /></div>
    <div className={styles.actions}><button className={styles.button} onClick={() => void change(false)} disabled={busy || loading}>{active ? "Renovar credencial" : "Generar credencial"}</button>
      {active && <button className={styles.secondary} disabled={busy} onClick={() => void change(true)}>Revocar credencial</button>}
      {image && <><button className={styles.secondary} disabled={busy} onClick={() => void download()}>Descargar credencial</button><button className={styles.secondary} disabled={busy} onClick={printCredential}>Imprimir credencial</button></>}
      {error && loading && <button className={styles.secondary} onClick={() => { setError(""); void load().catch((cause) => setError(apiMessage(cause))); }}>Reintentar</button>}
    </div>
    {image && <p className={styles.printHint}>Impresión: una credencial de 85,6 × 53,98 mm en hoja A4. Elegí escala 100 % o «Tamaño real».</p>}
  </section>;
}
