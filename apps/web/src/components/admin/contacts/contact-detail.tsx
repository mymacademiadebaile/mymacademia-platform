"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { ContactDetailResponse } from "@mym/shared";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import { todayInArgentina } from "@/lib/dates";
import styles from "./contacts.module.css";
import { QrCard } from "./qr-card";

type SessionOption = { id: string; startTime: string; endTime: string; status: string; class: { id: string; name: string } };
const trialStatus = { SCHEDULED: "Reservada", COMPLETED: "Presente", CANCELLED: "Cancelada", CONVERTED: "Convertida" };

export function ContactDetail({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<ContactDetailResponse | null>(null);
  const [classes, setClasses] = useState<Array<{ _id: string; name: string }>>([]), [sessions, setSessions] = useState<SessionOption[]>([]);
  const [date, setDate] = useState(todayInArgentina), [kind, setKind] = useState("TRIAL");
  const [booking, setBooking] = useState(false), [conversion, setConversion] = useState(false), [edit, setEdit] = useState(false);
  const [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    const [detail, catalog] = await Promise.all([
      apiFetch<ContactDetailResponse>(`/admin/contacts/${id}`, { signal }),
      apiFetch<Array<{ _id: string; name: string }>>("/admin/classes", { signal })
    ]);
    if (!signal?.aborted) { setData(detail); setClasses(catalog); }
  }, [id]);
  useEffect(() => { const controller = new AbortController(); setData(null); void load(controller.signal).catch((cause) => { if (!controller.signal.aborted) setError(apiMessage(cause)); }); return () => controller.abort(); }, [load]);
  useEffect(() => {
    if (!booking) return;
    const controller = new AbortController(); setSessions([]);
    void apiFetch<{ items: SessionOption[] }>(`/admin/sessions?date=${date}`, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setSessions(result.items.filter((session) => ["SCHEDULED", "IN_PROGRESS"].includes(session.status))); })
      .catch((cause) => { if (!controller.signal.aborted) setError(apiMessage(cause)); });
    return () => controller.abort();
  }, [date, booking]);
  async function perform(work: () => Promise<unknown>, success: string) {
    setBusy(true); setError(""); setMessage("");
    try { await work(); await load(); setMessage(success); return true; }
    catch (cause) { setError(apiMessage(cause)); return false; }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    if (await perform(() => apiFetch(`/admin/contacts/${id}`, { method: "PATCH", body: JSON.stringify({
      firstName: form.get("firstName"), lastName: form.get("lastName"), phone: form.get("phone"), dni: form.get("dni")
    }) }), "Datos actualizados")) setEdit(false);
  }
  async function saveCommunication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await perform(() => apiFetch(`/admin/contacts/${id}`, { method: "PATCH", body: JSON.stringify({
      email: form.get("email"), notes: form.get("notes"),
      preferences: { emailReminders: form.has("emailReminders"), marketing: form.has("marketing") }
    }) }), "Preferencias actualizadas");
  }
  async function reserve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    if (await perform(() => apiFetch("/admin/trials", { method: "POST", body: JSON.stringify({ contactId: id,
      sessionId: form.get("sessionId"), kind, notes: form.get("notes") || undefined }) }), "Reserva guardada")) setBooking(false);
  }
  async function enroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      await apiFetch(`/admin/contacts/${id}/convert`, { method: "POST", body: JSON.stringify({ classId: form.get("classId") }) });
      router.push(`/admin/students/${id}`);
    } catch (cause) { setError(apiMessage(cause)); setBusy(false); }
  }
  const history = data ? [
    ...data.trials.map((trial) => ({ id: `trial-${trial._id}`, date: trial.scheduledFor,
      name: trial.classId?.name ?? "Clase histórica", type: trial.kind === "COURTESY" ? "Cortesía sin cargo" : "Prueba gratuita",
      status: trialStatus[trial.status], trialId: trial._id, scheduled: trial.status === "SCHEDULED" })),
    ...data.attendance.filter((item) => !item.trialId).map((item) => ({ id: `attendance-${item._id}`,
      date: item.sessionId?.sessionDate ?? item.recordedAt ?? "", name: item.sessionId?.classId?.name ?? "Clase histórica",
      type: item.participantType === "COURTESY" || item.participantType === "TRIAL" || item.sessionId?.classId?.billingMode === "FREE"
        ? "Clase sin cargo" : "Clase arancelada", status: "Presente", trialId: undefined, scheduled: false }))
  ].sort((a, b) => b.date.localeCompare(a.date)) : [];
  return <>
    <Link className={styles.secondary} href="/admin/contacts">Volver a contactos</Link>
    {error && <div className={styles.error} role="alert">{error}</div>}
    {message && <div className={styles.message} role="status">{message}</div>}
    {!data ? <p role="status">Cargando contacto…</p> : <>
      <PageHeader title={`${data.contact.firstName} ${data.contact.lastName}`} description={data.student ? "Alumno de la academia · historial del contacto" : "Posible alumno"} />
      {data.student && <p><Link className={styles.button} href={`/admin/students/${id}`}>Abrir ficha del alumno</Link></p>}
      <section className={styles.surface}>
        <div className={styles.sectionTop}><h2>Datos de contacto</h2><button className={styles.secondary} onClick={() => setEdit(!edit)}>{edit ? "Cancelar" : "Editar datos"}</button></div>
        <p>Teléfono: {data.contact.phone || "Sin cargar"} · DNI: {data.contact.dni || "Sin cargar"}</p>
        {edit && <form className={styles.form} onSubmit={save}>
          <label>Nombre<input name="firstName" defaultValue={data.contact.firstName} minLength={2} maxLength={80} required /></label>
          <label>Apellido<input name="lastName" defaultValue={data.contact.lastName} minLength={2} maxLength={80} required /></label>
          <label>Teléfono<input name="phone" type="tel" defaultValue={data.contact.phone} maxLength={40} required /></label>
          <label>DNI<input name="dni" inputMode="numeric" defaultValue={data.contact.dni} maxLength={14} required /></label>
          <button className={styles.button} disabled={busy}>Guardar datos</button>
        </form>}
      </section>
      {!data.student && <div className={styles.actions}>
        <button className={styles.button} onClick={() => { setConversion(!conversion); setBooking(false); }}>Convertir en alumno</button>
        <button className={styles.secondary} onClick={() => { setBooking(!booking); setConversion(false); }}>Reservar clase sin cargo</button>
      </div>}
      {conversion && !data.student && <section className={styles.surface}><h2>Convertir en alumno</h2><p>Elegí la clase para su primera inscripción. El historial y el DNI se conservan.</p>
        <form className={styles.form} onSubmit={enroll}>
          <label className={styles.wide}>Clase<select name="classId" required><option value="">Elegí una clase</option>{classes.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
          <button className={styles.button} disabled={busy}>Confirmar conversión</button>
        </form></section>}
      {booking && !data.student && <section className={styles.surface}><h2>Reservar clase sin cargo</h2>
        <form className={styles.form} onSubmit={reserve}>
          <label>Tipo<select value={kind} onChange={(event) => setKind(event.target.value)}><option value="TRIAL">Primera prueba gratuita</option><option value="COURTESY">Cortesía administrativa</option></select></label>
          <label>Fecha<input type="date" value={date} min={todayInArgentina()} onChange={(event) => setDate(event.target.value)} required /></label>
          <label className={styles.wide}>Clase y horario<select name="sessionId" required key={date}><option value="">Elegí un horario</option>{sessions.map((session) => <option key={session.id} value={session.id}>{session.class.name} · {session.startTime} a {session.endTime}</option>)}</select></label>
          {!sessions.length && <p className={styles.wide}>No hay sesiones disponibles para esta fecha.</p>}
          <label className={styles.wide}>{kind === "COURTESY" ? "Motivo de la cortesía" : "Nota (opcional)"}<textarea name="notes" required={kind === "COURTESY"} maxLength={500} /></label>
          <button className={styles.button} disabled={busy || !sessions.length}>Guardar reserva</button>
        </form></section>}
      <section className={styles.surface}><h2>Historial de clases</h2>
        {!history.length ? <p>Todavía no tiene clases registradas.</p> : <ul className={styles.list}>{history.map((item) => <li key={item.id} className={styles.row}>
          <span><strong>{item.name}</strong><small>{item.type} · {item.date.slice(0, 10).split("-").reverse().join("/")} · {item.status}</small></span>
          {item.scheduled && item.trialId && !data.student && <span className={styles.actions}>
            <button className={styles.secondary} disabled={busy} onClick={() => void perform(() => apiFetch(`/admin/trials/${item.trialId}`, { method: "PATCH", body: JSON.stringify({ status: "COMPLETED" }) }), "Presente registrado")}>Registrar presente</button>
            <button className={styles.secondary} disabled={busy} onClick={() => void perform(() => apiFetch(`/admin/trials/${item.trialId}`, { method: "PATCH", body: JSON.stringify({ status: "CANCELLED" }) }), "Reserva cancelada")}>Cancelar</button>
          </span>}
        </li>)}</ul>}
      </section>
      <details className={styles.surface}><summary>Más opciones</summary><QrCard id={id} name={`${data.contact.firstName} ${data.contact.lastName}`} />
        <section className={styles.surface}><h2>Contacto y preferencias</h2><form className={styles.form} onSubmit={saveCommunication}>
          <label className={styles.wide}>Email<input name="email" type="email" defaultValue={data.contact.email} autoComplete="email" /></label>
          <label className={styles.wide}>Notas<textarea name="notes" defaultValue={data.contact.notes} maxLength={1000} /></label>
          <label className={styles.check}><input name="emailReminders" type="checkbox" defaultChecked={data.contact.preferences?.emailReminders ?? true} />Aceptar recordatorios de pagos por email</label>
          <label className={styles.check}><input name="marketing" type="checkbox" defaultChecked={data.contact.preferences?.marketing ?? false} />Aceptar novedades y promociones</label>
          <div className={styles.wide}><button className={styles.button} disabled={busy}>Guardar preferencias</button></div>
        </form></section>
        {!!data.opportunities.length && <><h3>Seguimientos anteriores</h3><ul className={styles.list}>{data.opportunities.map((item) => <li key={item._id} className={styles.row}><span><strong>{item.classId?.name}</strong><small>{item.notes || item.status}</small></span></li>)}</ul></>}
      </details>
    </>}
  </>;
}
