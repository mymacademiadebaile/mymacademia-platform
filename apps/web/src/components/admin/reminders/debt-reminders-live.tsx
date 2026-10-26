"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { apiFetch, apiMessage } from "@/lib/api";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import { PageHeader } from "../admin-ui";
import styles from "../contacts/contacts.module.css";

type Policy = { enabled: boolean; automaticEnabled: boolean; minimumDaysBetween: number; daysOverdue: number; includeBreakdown: boolean };
type Preview = { personName: string; destination?: string; subject: string; message: string; eligible: boolean; reason?: string;
  balance: { pendingCents: number; overdueCents: number; creditCents: number } };
type History = { _id: string; status: "PENDING" | "SENT" | "FAILED" | "SKIPPED" | "OPENED"; destination: string; sentAt?: string; createdAt: string; errorMessage?: string };
const reasons: Record<string, string> = { REMINDERS_DISABLED: "Los recordatorios están deshabilitados. Administración puede habilitarlos en la configuración.", CONTACT_OPTED_OUT: "La persona no acepta recordatorios de deuda por email. Podés revisar sus preferencias en Contactos.", STUDENT_WITHOUT_EMAIL: "Falta cargar un email en el contacto.", NO_DEBT: "La cuenta está regularizada. No se enviará un recordatorio." };
const statuses = { PENDING: "Pendiente de verificación", SENT: "Enviado", FAILED: "Envío no confirmado", SKIPPED: "No enviado", OPENED: "Abierto" };
const money = (cents: number) => (cents / 100).toLocaleString("es-AR", { style: "currency", currency: "ARS" });

export function DebtRemindersLive({ initialStudentId, embedded = false, onShowContact }: { initialStudentId: string; embedded?: boolean; onShowContact?: () => void }) {
  const { confirm } = useAdminFeedback();
  const [policy, setPolicy] = useState<Policy | null>(null), [persistedAuto, setPersistedAuto] = useState(false);
  const [students, setStudents] = useState<Array<{ _id: string; firstName: string; lastName: string }>>([]), [search, setSearch] = useState("");
  const [studentId, setStudentId] = useState(initialStudentId), [preview, setPreview] = useState<Preview | null>(null), [history, setHistory] = useState<History[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const deliveryKey = useRef("");
  const loadPolicy = useCallback(async () => { const value = await apiFetch<Policy>("/admin/debt-reminders/settings"); setPolicy(value); setPersistedAuto(value.automaticEnabled); }, []);
  const loadPreview = useCallback(async (signal?: AbortSignal) => {
    if (!studentId) { setPreview(null); setHistory([]); return; }
    const [value, logs] = await Promise.all([apiFetch<Preview>(`/admin/debt-reminders/students/${studentId}/preview`, { signal }), apiFetch<{ items: History[] }>(`/admin/debt-reminders/students/${studentId}/history`, { signal })]);
    if (signal?.aborted) return;
    setPreview(value); setHistory(logs.items);
  }, [studentId]);
  useEffect(() => { if (!embedded) void loadPolicy().catch((error) => setError(apiMessage(error))); }, [embedded, loadPolicy]);
  useEffect(() => { const controller = new AbortController(); deliveryKey.current = crypto.randomUUID(); setPreview(null); setMessage(""); setError(""); void loadPreview(controller.signal).catch((error) => { if (!controller.signal.aborted) setError(apiMessage(error)); }); return () => controller.abort(); }, [loadPreview]);
  useEffect(() => {
    if (embedded) return;
    const controller = new AbortController(); const timer = setTimeout(() => void apiFetch<{ items: typeof students }>(`/admin/students?limit=100&q=${encodeURIComponent(search)}`, { signal: controller.signal }).then((list) => setStudents(list.items)).catch((error) => { if (!controller.signal.aborted) setError(apiMessage(error)); }), 200);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [embedded, search]);
  async function savePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!policy) return;
    if (policy.automaticEnabled && !persistedAuto && !await confirm({ title: "Habilitar envíos programados", description: `La tarea diaria podrá enviar emails reales después de ${policy.daysOverdue} días de vencimiento, respetando preferencias y frecuencia.`, confirmLabel: "Habilitar programación" })) return;
    setBusy(true); setError("");
    try { await apiFetch("/admin/debt-reminders/settings", { method: "PATCH", body: JSON.stringify(policy) }); await loadPolicy(); await loadPreview(); setMessage("Configuración guardada"); }
    catch (error) { setError(apiMessage(error)); } finally { setBusy(false); }
  }
  async function send() {
    if (!preview?.eligible || !await confirm({ title: "Enviar recordatorio de deuda", description: `Se enviará un email a ${preview.destination}. El saldo se vuelve a verificar antes del envío.`, confirmLabel: "Enviar email" })) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await apiFetch<{ status: keyof typeof statuses; replay: boolean }>(`/admin/debt-reminders/students/${studentId}/send`, { method: "POST", body: JSON.stringify({ idempotencyKey: deliveryKey.current }) });
      setMessage(result.status === "SENT" ? result.replay ? "Este recordatorio ya fue enviado; no se volvió a enviar." : "Recordatorio enviado." : `${statuses[result.status]}. Revisá el historial antes de volver a contactar.`);
      await loadPreview();
    } catch (error) { setError(apiMessage(error)); await loadPreview().catch(() => undefined); }
    finally { setBusy(false); }
  }
  return <>{!embedded && <PageHeader title="Recordatorios de deuda" description="Mensajes cordiales con saldo vigente, preferencias de contacto e historial de envíos." />}
    {error && <p className={styles.error} role="alert">{error}</p>}{message && <p className={styles.message} role="status">{message}</p>}
    {!embedded && (!policy ? <p role="status">Cargando configuración…</p> : <section className={styles.surface}><h2>Configuración administrativa</h2>
      <form className={styles.form} onSubmit={savePolicy}>
        <label className={styles.check}><input type="checkbox" checked={policy.enabled} onChange={(event) => setPolicy({ ...policy, enabled: event.target.checked, ...(!event.target.checked ? { automaticEnabled: false } : {}) })} />Habilitar recordatorios por email</label>
        <label className={styles.check}><input type="checkbox" disabled={!policy.enabled} checked={policy.automaticEnabled} onChange={(event) => setPolicy({ ...policy, automaticEnabled: event.target.checked })} />Habilitar envío programado</label>
        <label>Días mínimos entre recordatorios<input type="number" min={1} max={60} required value={policy.minimumDaysBetween} onChange={(event) => setPolicy({ ...policy, minimumDaysBetween: Number(event.target.value) })} /></label>
        <label>Enviar después de cuántos días de vencimiento<input type="number" min={1} max={90} required value={policy.daysOverdue} onChange={(event) => setPolicy({ ...policy, daysOverdue: Number(event.target.value) })} /></label>
        <label className={styles.check}><input type="checkbox" checked={policy.includeBreakdown} onChange={(event) => setPolicy({ ...policy, includeBreakdown: event.target.checked })} />Incluir conceptos y vencimientos</label>
        <div className={styles.wide}><button className={styles.button} disabled={busy}>Guardar configuración</button></div>
      </form>
    </section>)}
    <section className={styles.surface}><h2>{embedded ? "Recordatorio para este alumno" : "Preparar un recordatorio"}</h2>{embedded ? <p>Consultá el saldo vigente y revisá el mensaje antes de enviarlo.</p> : <div className={styles.form}>
      <label>Buscar alumno<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre, apellido o email" /></label>
      <label>Destinatario<select disabled={busy} value={studentId} onChange={(event) => setStudentId(event.target.value)}><option value="">Seleccioná una persona</option>{students.map((student) => <option key={student._id} value={student._id}>{student.firstName} {student.lastName}</option>)}{studentId && !students.some((item) => item._id === studentId) && <option value={studentId}>{preview?.personName ?? "Persona seleccionada"}</option>}</select></label>
    </div>}
    {preview && <><h3>Cuenta de {preview.personName}</h3><p>Pendiente: {money(preview.balance.pendingCents)} · Vencido: {money(preview.balance.overdueCents)} · A favor: {money(preview.balance.creditCents)}</p>
      {!preview.eligible && <p className={styles.message}>{reasons[preview.reason ?? ""] ?? "Revisá los datos de esta persona antes de enviar."}</p>}
      <p><strong>Para:</strong> {preview.destination ?? "Sin email"}<br /><strong>Asunto:</strong> {preview.subject}</p>
      <div className={styles.form}><label className={styles.wide}>Vista previa del mensaje<textarea readOnly value={preview.message} rows={12} /></label></div>
      <div className={styles.actions}><button className={styles.button} disabled={busy || !preview.eligible} onClick={() => void send()}>Enviar recordatorio</button><button className={styles.secondary} disabled={busy} onClick={() => void loadPreview().catch((error) => setError(apiMessage(error)))}>Actualizar saldo y vista previa</button>{embedded ? onShowContact && <button className={styles.secondary} onClick={onShowContact}>Ver contacto y preferencias</button> : <Link className={styles.secondary} href={`/admin/contacts/${studentId}`}>Contacto y preferencias</Link>}</div>
    </>}
    </section>
    {studentId && <section className={styles.surface}><h2>Historial de comunicaciones</h2><p>Un intento pendiente de verificación no se reenvía automáticamente. Revisá el resultado antes de volver a contactar.</p>{!history.length ? <p>Todavía no hay recordatorios para esta persona.</p> : <ul className={styles.list}>{history.map((log) => <li key={log._id}><div className={styles.row}><span><strong>{statuses[log.status]}</strong><small>{log.destination} · {new Date(log.sentAt ?? log.createdAt).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}</small>{log.errorMessage && <small>{log.errorMessage}</small>}</span></div></li>)}</ul>}</section>}
  </>;
}
