"use client";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiMessage } from "@/lib/api";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import styles from "./contacts.module.css";

export function QrCard({ id, name }: { id: string; name: string }) {
  const { confirm } = useAdminFeedback();
  const [active, setActive] = useState(false), [image, setImage] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setActive((await apiFetch<{ active: boolean }>(`/admin/check-in/contacts/${id}/credential`)).active); setLoading(false); }, [id]);
  useEffect(() => { setImage(""); setLoading(true); void load().catch((error) => setError(apiMessage(error))); }, [load]);
  async function change(revoke: boolean) {
    if (active && !await confirm({ title: revoke ? "Revocar QR" : "Renovar QR", description: "El QR anterior dejará de funcionar. La identidad y el historial se conservan.", confirmLabel: revoke ? "Revocar" : "Renovar" })) return;
    setBusy(true); setError(""); setImage("");
    try {
      const response = await apiFetch<{ qr?: string }>(`/admin/check-in/contacts/${id}/credential/${revoke ? "revoke" : "rotate"}`, { method: "POST" });
      if (response.qr) { const { toDataURL } = await import("qrcode"); setImage(await toDataURL(response.qr, { width: 400, margin: 4, errorCorrectionLevel: "M" })); }
      await load();
    } catch (error) { setError(apiMessage(error)); } finally { setBusy(false); }
  }
  return <section className={styles.surface}><h2>QR personal de asistencia</h2><p>{active ? "Hay una credencial activa. El QR original sólo se muestra al generarlo: guardalo o imprimilo para entregarlo a la persona." : "Generá un QR para usar en recepción. Sirve para interesados y alumnos y conserva su identidad al inscribirse."}</p>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {image && <div className={styles.printArea}><strong>M&M Academia de Baile</strong><img src={image} width={280} height={280} alt={`QR personal de ${name}`} /><strong>{name}</strong><p>Presentá este QR en recepción</p></div>}
    <div className={styles.actions}><button className={styles.button} onClick={() => void change(false)} disabled={busy || loading}>{active ? "Renovar QR" : "Generar QR"}</button>
      {active && <button className={styles.secondary} disabled={busy} onClick={() => void change(true)}>Revocar QR</button>}
      {image && <><a className={styles.secondary} href={image} download="mym-qr-personal.png">Descargar QR</a><button className={styles.secondary} onClick={() => window.print()}>Imprimir QR</button></>}
    </div>
  </section>;
}
