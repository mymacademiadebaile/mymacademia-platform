"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { OPPORTUNITY_STATUSES, type ContactDetailResponse, type OpportunityStatus, type TrialBookingView } from "@mym/shared";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import { todayInArgentina } from "@/lib/dates";
import styles from "./contacts.module.css";
import { QrCard } from "./qr-card";

const opportunityLabel: Record<OpportunityStatus, string> = { OPEN: "Interés abierto", FOLLOW_UP: "En seguimiento", TRIAL_BOOKED: "Prueba reservada", CONVERTED: "Inscripto", LOST: "Sin continuidad" };
const trialLabel = { SCHEDULED: "Reservada", COMPLETED: "Asistió", CANCELLED: "Cancelada / ausente", CONVERTED: "Convertida a inscripción" };
type SessionOption = { id: string; startTime: string; endTime: string; status: string; class: { id: string; name: string } };

export function ContactDetail({ id }: { id: string }) {
  const [data, setData] = useState<ContactDetailResponse | null>(null);
  const [classes, setClasses] = useState<Array<{ _id: string; name: string }>>([]), [sessions, setSessions] = useState<SessionOption[]>([]);
  const [date, setDate] = useState(todayInArgentina), [kind, setKind] = useState("TRIAL");
  const [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [edit, setEdit] = useState(false);
  const [convert, setConvert] = useState<TrialBookingView | null>(null);
  const load = useCallback(async () => {
    const [detail, catalog] = await Promise.all([
      apiFetch<ContactDetailResponse>(`/admin/contacts/${id}`),
      apiFetch<Array<{ _id: string; name: string }>>("/admin/classes")
    ]);
    setData(detail); setClasses(catalog);
  }, [id]);
  useEffect(() => { void load().catch((error) => setError(apiMessage(error))); }, [load]);
  useEffect(() => {
    const controller = new AbortController(); setSessions([]);
    void apiFetch<{ items: SessionOption[] }>(`/admin/sessions?date=${date}`, { signal: controller.signal })
      .then((result) => setSessions(result.items.filter((session) => ["SCHEDULED", "IN_PROGRESS"].includes(session.status))))
      .catch((error) => { if (!controller.signal.aborted) setError(apiMessage(error)); });
    return () => controller.abort();
  }, [date]);
  async function perform(work: () => Promise<unknown>, success: string) {
    setBusy(true); setError(""); setMessage("");
    try { await work(); await load(); setMessage(success); return true; }
    catch (error) { setError(apiMessage(error)); return false; }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    if (await perform(() => apiFetch(`/admin/contacts/${id}`, { method: "PATCH", body: JSON.stringify({
      firstName: form.get("firstName"), lastName: form.get("lastName"), email: form.get("email"), phone: form.get("phone"), notes: form.get("notes"),
      preferences: { emailReminders: form.has("emailReminders"), marketing: form.has("marketing") }
    }) }), "Datos actualizados")) setEdit(false);
  }
  async function opportunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await perform(() => apiFetch(`/admin/contacts/${id}/opportunities`, { method: "POST", body: JSON.stringify({ classId: form.get("classId"),
      status: form.get("status"), notes: form.get("notes"), followUpOn: form.get("followUpOn") || undefined }) }), "Seguimiento guardado");
  }
  async function reserve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await perform(() => apiFetch("/admin/trials", { method: "POST", body: JSON.stringify({ contactId: id,
      sessionId: form.get("sessionId"), kind, notes: form.get("notes") || undefined }) }), kind === "TRIAL" ? "Prueba reservada. El beneficio se consume al confirmar el presente." : "Cortesía autorizada");
  }
  async function convertTrial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!convert) return; const form = new FormData(event.currentTarget);
    if (await perform(() => apiFetch(`/admin/trials/${convert._id}/convert`, { method: "POST", body: JSON.stringify({ billingPreference: form.get("billingPreference") || undefined }) }),
      "Inscripción creada. La identidad y el historial se conservaron.")) setConvert(null);
  }
  async function enroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await perform(() => apiFetch(`/admin/contacts/${id}/convert`, { method: "POST", body: JSON.stringify({ classId: form.get("classId"),
      billingPreference: form.get("billingPreference") || undefined }) }), "Inscripción creada con la identidad existente");
  }
  return <>
    <Link className={styles.secondary} href="/admin/contacts">Volver a contactos</Link>
    {error && <div className={styles.error} role="alert">{error}</div>}
    {message && <div className={styles.message} role="status">{message}</div>}
    {!data ? <p role="status">Cargando contacto…</p> : <>
      <PageHeader title={`${data.contact.firstName} ${data.contact.lastName}`} description={`${data.student ? "Alumno de la academia" : "Contacto interesado"} · ${data.contact.source?.platform ?? "Recepción"}`} />
      <div className={styles.actions}>
        <button className={styles.secondary} onClick={() => setEdit(!edit)}>{edit ? "Cerrar edición" : "Editar contacto y preferencias"}</button>
        {data.student && <Link className={styles.secondary} href={`/admin/students/${id}`}>Ficha académica y cuenta corriente</Link>}
      </div>
      {edit && <section className={styles.surface}><h2>Datos y preferencias</h2><form className={styles.form} onSubmit={save}>
        <label>Nombre<input name="firstName" defaultValue={data.contact.firstName} minLength={2} maxLength={80} required /></label>
        <label>Apellido<input name="lastName" defaultValue={data.contact.lastName} minLength={2} maxLength={80} required /></label>
        <label>Email<input name="email" type="email" defaultValue={data.contact.email} /></label>
        <label>Teléfono<input name="phone" type="tel" defaultValue={data.contact.phone} maxLength={40} /></label>
        <label className={styles.wide}>Notas<textarea name="notes" defaultValue={data.contact.notes} maxLength={1000} /></label>
        <label className={styles.check}><input name="emailReminders" type="checkbox" defaultChecked={data.contact.preferences?.emailReminders ?? true} />Aceptar recordatorios de pagos por email</label>
        <label className={styles.check}><input name="marketing" type="checkbox" defaultChecked={data.contact.preferences?.marketing ?? false} />Aceptar novedades y promociones</label>
        <div><button className={styles.button} disabled={busy}>Guardar datos</button></div>
      </form></section>}
      <div className={styles.detail}>
        <div>
          <section className={styles.surface}><h2>Reservar una clase sin cargo</h2><p>Cada persona tiene una prueba por grupo. Una cortesía necesita autorización y un motivo, y es independiente de ese beneficio.</p>
            <form className={styles.form} onSubmit={reserve}>
              <label>Tipo<select value={kind} onChange={(event) => setKind(event.target.value)}><option value="TRIAL">Primera prueba gratuita</option><option value="COURTESY">Cortesía administrativa</option></select></label>
              <label>Fecha<input type="date" value={date} min={todayInArgentina()} onChange={(event) => setDate(event.target.value)} required /></label>
              <label className={styles.wide}>Clase y horario<select name="sessionId" required key={date}><option value="">Seleccioná una sesión</option>{sessions.map((session) => <option key={session.id} value={session.id}>{session.class.name} · {session.startTime} a {session.endTime}</option>)}</select></label>
              {!sessions.length && <p className={styles.wide}>No hay sesiones disponibles para esta fecha.</p>}
              <label className={styles.wide}>{kind === "COURTESY" ? "Motivo de la cortesía" : "Notas (opcional)"}<textarea name="notes" required={kind === "COURTESY"} maxLength={500} /></label>
              <div><button className={styles.button} disabled={busy || !sessions.length}>{busy ? "Guardando…" : "Confirmar reserva"}</button></div>
            </form>
          </section>
          <section className={styles.surface}><h2>Historial de pruebas y cortesías</h2>
            {!data.trials.length ? <p>Todavía no hay reservas.</p> : <ul className={styles.list}>{data.trials.map((trial) => <li key={trial._id}>
              <div className={styles.row}><span><strong>{trial.classId?.name ?? "Clase histórica"}</strong><small>{new Date(trial.scheduledFor).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" })} · {trial.kind === "COURTESY" ? "Cortesía" : "Prueba"}</small><small>{trialLabel[trial.status]}{trial.consumedAt ? " · Asistencia confirmada" : ""}</small></span></div>
              <div className={styles.actions}>
                {trial.status === "SCHEDULED" && <>
                  <button className={styles.secondary} disabled={busy} onClick={() => void perform(() => apiFetch(`/admin/trials/${trial._id}`, { method: "PATCH", body: JSON.stringify({ status: "COMPLETED" }) }), "Presente registrado")}>Registrar presente</button>
                  <button className={styles.secondary} disabled={busy} onClick={() => void perform(() => apiFetch(`/admin/trials/${trial._id}`, { method: "PATCH", body: JSON.stringify({ status: "CANCELLED" }) }), "Reserva cancelada")}>Cancelar reserva</button>
                </>}
                {["SCHEDULED", "COMPLETED"].includes(trial.status) && <button className={styles.secondary} disabled={busy} onClick={() => setConvert(trial)}>Convertir a inscripción</button>}
              </div>
            </li>)}</ul>}
          </section>
          {convert && <section className={styles.surface}><h2>Inscribir en {convert.classId.name}</h2><p>Se crea o reactiva el perfil académico con la misma identidad. Se seleccionan todos los turnos habituales del grupo; luego podés ajustarlos desde la inscripción.</p>
            <form className={styles.form} onSubmit={convertTrial}><label>Modalidad<select name="billingPreference"><option value="">Usar la modalidad de la clase</option><option value="PER_CLASS">Por clase</option><option value="MONTHLY">Mensual</option></select></label>
              <div className={styles.actions}><button className={styles.button} disabled={busy}>Confirmar inscripción</button><button type="button" className={styles.secondary} onClick={() => setConvert(null)}>Cancelar</button></div></form>
          </section>}
        </div>
        <div>
          <QrCard id={id} name={`${data.contact.firstName} ${data.contact.lastName}`} />
          <section className={styles.surface}><h2>Seguimiento comercial</h2>
            <ul className={styles.list}>{data.opportunities.map((item) => <li key={item._id}><div className={styles.row}><span><strong>{item.classId?.name}</strong><small>{opportunityLabel[item.status]}{item.followUpOn ? ` · Próximo contacto: ${item.followUpOn.split("-").reverse().join("/")}` : ""}</small><small>{item.notes}</small></span></div></li>)}</ul>
            <form className={styles.form} onSubmit={opportunity}>
              <label className={styles.wide}>Clase de interés<select name="classId" required><option value="">Seleccioná una clase</option>{classes.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
              <label>Seguimiento<select name="status">{OPPORTUNITY_STATUSES.filter((status) => status !== "CONVERTED" && status !== "TRIAL_BOOKED").map((status) => <option key={status} value={status}>{opportunityLabel[status]}</option>)}</select></label>
              <label>Próximo contacto<input name="followUpOn" type="date" /></label>
              <label className={styles.wide}>Notas<textarea name="notes" maxLength={1000} /></label>
              <div className={styles.wide}><button className={styles.secondary} disabled={busy}>Guardar seguimiento</button></div>
            </form>
          </section>
          <section className={styles.surface}><h2>Inscripciones</h2>{!data.enrollments.length ? <p>Sin inscripciones académicas.</p> : <ul className={styles.list}>{data.enrollments.map((item) => <li key={item._id}><Link className={styles.row} href={`/admin/classes/${item.classId._id}`}><span><strong>{item.classId.name}</strong><small>{item.status === "ACTIVE" ? "Vigente" : "Histórica"}</small></span></Link></li>)}</ul>}</section>
          <section className={styles.surface}><h2>Inscripción directa</h2><p>Para quien se incorpora sin tomar una prueba. La inscripción usa los turnos habituales del grupo y conserva este contacto.</p>
            <form className={styles.form} onSubmit={enroll}>
              <label className={styles.wide}>Clase<select name="classId" required><option value="">Seleccioná una clase</option>{classes.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
              <label className={styles.wide}>Modalidad<select name="billingPreference"><option value="">Usar la modalidad de la clase</option><option value="PER_CLASS">Por clase</option><option value="MONTHLY">Mensual</option></select></label>
              <div className={styles.wide}><button className={styles.button} disabled={busy}>Crear inscripción</button></div>
            </form>
          </section>
        </div>
      </div>
    </>}
  </>;
}
