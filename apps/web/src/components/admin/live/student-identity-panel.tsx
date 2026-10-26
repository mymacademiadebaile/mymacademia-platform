"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { ContactDetailResponse } from "@mym/shared";
import { apiFetch, apiMessage } from "@/lib/api";
import { QrCard } from "../contacts/qr-card";
import type { CredentialPerson } from "../contacts/credential-artwork";
import { contactClassHistory } from "../contacts/contact-history";
import contactStyles from "../contacts/contacts.module.css";
import styles from "./student-detail-live.module.css";

const opportunityStatus = { OPEN: "Abierto", FOLLOW_UP: "En seguimiento", TRIAL_BOOKED: "Prueba reservada", CONVERTED: "Convertido en alumno", LOST: "Cerrado" };

export function StudentIdentityPanel({ id, person, refreshKey, onEditStudent }: { id: string; person: CredentialPerson; refreshKey: string; onEditStudent: () => void }) {
  const [data, setData] = useState<ContactDetailResponse | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    const result = await apiFetch<ContactDetailResponse>(`/admin/contacts/${id}`, { signal });
    if (!signal?.aborted) setData(result);
  }, [id]);

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    void load(controller.signal).catch((cause) => { if (!controller.signal.aborted) setError(apiMessage(cause)); });
    return () => controller.abort();
  }, [load, refreshKey]);

  async function savePreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(""); setMessage("");
    try {
      await apiFetch(`/admin/contacts/${id}`, { method: "PATCH", body: JSON.stringify({
        notes: form.get("notes"),
        preferences: { emailReminders: form.has("emailReminders"), marketing: form.has("marketing") }
      }) });
      await load();
      setMessage("Preferencias guardadas");
    } catch (cause) { setError(apiMessage(cause)); }
    finally { setBusy(false); }
  }

  const history = data ? contactClassHistory(data) : [];
  return <div className={styles.identityGrid}>
    <div className={styles.identityMain}>
      <QrCard id={id} person={person} academic />
      <section className={contactStyles.surface}>
        <h2>Historial de clases</h2>
        {!data ? <p role={error ? undefined : "status"}>{error ? "No pudimos cargar el historial." : "Cargando historial…"}</p> : !history.length ? <p>Todavía no tiene clases registradas.</p> :
          <ul className={contactStyles.list}>{history.map((item) => <li key={item.id} className={contactStyles.row}>
            <span><strong>{item.name}</strong><small>{item.type} · {item.date.slice(0, 10).split("-").reverse().join("/")} · {item.status}</small></span>
          </li>)}</ul>}
      </section>
      {!!data?.opportunities.length && <section className={contactStyles.surface}><h2>Seguimientos anteriores</h2><ul className={contactStyles.list}>{data.opportunities.map((item) =>
        <li key={item._id} className={contactStyles.row}><span><strong>{item.classId?.name}</strong><small>{item.notes || opportunityStatus[item.status]}</small></span></li>
      )}</ul></section>}
    </div>
    <section id="student-contact-settings" className={`${contactStyles.surface} ${styles.contactSettings}`}>
      <div className={contactStyles.sectionTop}><h2>Contacto y preferencias</h2><button className={contactStyles.secondary} onClick={onEditStudent}>Editar datos</button></div>
      {!data ? <p role={error ? undefined : "status"}>{error ? "No pudimos cargar el contacto." : "Cargando contacto…"}</p> : <>
        <p><strong>Email:</strong> {data.contact.email || "Sin cargar"}<br /><strong>Teléfono:</strong> {data.contact.phone || "Sin cargar"}<br /><strong>DNI:</strong> {data.contact.dni || "Sin cargar"}</p>
        <form className={contactStyles.form} onSubmit={savePreferences}>
          <label className={contactStyles.wide}>Notas<textarea name="notes" defaultValue={data.contact.notes} maxLength={1000} /></label>
          <label className={`${contactStyles.check} ${contactStyles.wide}`}><input name="emailReminders" type="checkbox" defaultChecked={data.contact.preferences?.emailReminders ?? true} />Aceptar recordatorios de pagos por email</label>
          <label className={`${contactStyles.check} ${contactStyles.wide}`}><input name="marketing" type="checkbox" defaultChecked={data.contact.preferences?.marketing ?? false} />Aceptar novedades y promociones</label>
          <button className={contactStyles.button} disabled={busy}>Guardar preferencias</button>
        </form>
      </>}
      {error && <p className={contactStyles.error} role="alert">{error}</p>}
      {message && <p className={contactStyles.message} role="status">{message}</p>}
    </section>
  </div>;
}
