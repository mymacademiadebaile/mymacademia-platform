"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { CheckInDeviceView } from "@mym/shared";
import { apiFetch, apiMessage } from "@/lib/api";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import { PageHeader } from "../admin-ui";
import styles from "../contacts/contacts.module.css";
import table from "./reception.module.css";

type Arrival = { _id: string; studentId: string; participantType: string; origin?: string; checkInMethod?: "QR" | "DNI"; recordedAt?: string; personName: string;
  session?: { _id: string; startTime: string; classId: { name: string } };
  balance?: { pendingCents: number; overdueCents: number; creditCents: number; partialCount: number }; lastReminderAt?: string };
type Reception = { date: string; arrivals: Arrival[] };
const money = (cents = 0) => (cents / 100).toLocaleString("es-AR", { style: "currency", currency: "ARS" });
const localTime = (value?: string) => value ? new Date(value).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" }) : "—";

function DeviceSettings({ device, busy, onSave, onRevoke }: { device: CheckInDeviceView; busy: boolean;
  onSave: (id: string, body: object) => void; onRevoke: (id: string) => void }) {
  return <div className={table.device}><h3>{device.name}</h3><p>{device.revokedAt ? "Revocado" : device.activatedAt ? "Activado" : "Pendiente de activación"} · Última actividad: {localTime(device.lastSeenAt)} · Autorización hasta: {localTime(device.sessionExpiresAt)}</p>
    <form className={styles.form} onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); onSave(device.id, { name: form.get("name"), soundEnabled: form.has("sound"), volume: Number(form.get("volume")) }); }}>
      <label>Nombre del dispositivo<input name="name" defaultValue={device.name} required minLength={2} maxLength={80} /></label>
      <label>Volumen (0 a 1)<input name="volume" type="number" step={0.1} min={0} max={1} defaultValue={device.volume} required /></label>
      <label className={styles.check}><input type="checkbox" name="sound" defaultChecked={device.soundEnabled} />Habilitar sonidos</label>
      <div className={`${styles.actions} ${styles.wide}`}><button className={styles.secondary} disabled={busy}>Guardar configuración</button>{!device.revokedAt && <button type="button" className={styles.secondary} disabled={busy} onClick={() => onRevoke(device.id)}>Cerrar acceso al registro de asistencia</button>}</div>
    </form>
  </div>;
}

export function ReceptionLive() {
  const { confirm } = useAdminFeedback();
  const [data, setData] = useState<Reception | null>(null), [devices, setDevices] = useState<CheckInDeviceView[]>([]);
  const [view, setView] = useState<"arrivals" | "devices">("arrivals"), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const [reception, list] = await Promise.all([apiFetch<Reception>("/admin/check-in/reception"), apiFetch<{ items: CheckInDeviceView[] }>("/admin/check-in/devices")]);
    setData(reception); setDevices(list.items);
  }, []);
  useEffect(() => { void load().catch((error) => setError(apiMessage(error))); const timer = setInterval(() => { if (!document.hidden) void load().catch(() => undefined); }, 15000); return () => clearInterval(timer); }, [load]);
  async function perform(path: string, method: string, body?: object) {
    setBusy(true); setError(""); setMessage("");
    try { await apiFetch(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
      setMessage("Cambios guardados"); await load(); }
    catch (error) { setError(apiMessage(error)); } finally { setBusy(false); }
  }
  async function revoke(id: string) {
    if (await confirm({ title: "Cerrar acceso al registro de asistencia", description: "Se cerrará este acceso. Para volver a abrirlo alcanza con iniciar sesión como administrador.", confirmLabel: "Cerrar acceso", tone: "danger" })) await perform(`/admin/check-in/devices/${id}/revoke`, "POST");
  }
  return <><PageHeader title="Recepción" description="Presentes del día, avisos financieros y registro de asistencia." />
    <div className={styles.toolbar}><div className={styles.actions}><Link className={styles.button} href="/asistencia">Registrar asistencia</Link><button className={view === "arrivals" ? styles.button : styles.secondary} aria-pressed={view === "arrivals"} onClick={() => setView("arrivals")}>Llegadas del día</button><button className={view === "devices" ? styles.button : styles.secondary} aria-pressed={view === "devices"} onClick={() => setView("devices")}>Configuración de asistencia</button></div><Link className={styles.secondary} href="/admin/contacts">Buscar persona y ayudar con QR</Link><button className={styles.secondary} onClick={() => void load().catch((error) => setError(apiMessage(error)))}>Actualizar</button></div>
    {error && <p className={styles.error} role="alert">{error}</p>}{message && <p className={styles.message} role="status">{message}</p>}
    {view === "arrivals" ? <>
      <section className={styles.surface}><h2>Asistencias de hoy{data ? ` · ${data.date.split("-").reverse().join("/")}` : ""}</h2><p>Las deudas se informan y permiten asistir. Para ver conceptos y vencimientos, abrí la cuenta corriente.</p>
        {!data ? <p role="status">Cargando recepción…</p> : !data.arrivals.length ? <p>Todavía no hay presentes registrados hoy.</p> : <div className={table.tableWrap}><table className={table.table}><thead><tr><th>Persona</th><th>Clase</th><th>Asistencia</th><th>Cuenta corriente</th><th>Último recordatorio</th></tr></thead><tbody>{data.arrivals.map((item) => <tr key={item._id}><td><Link href={`/admin/contacts/${item.studentId}`}>{item.personName}</Link><small>{item.participantType === "TRIAL" ? "Prueba" : item.participantType === "COURTESY" ? "Cortesía" : "Alumno"}</small></td><td>{item.session?.classId?.name}<small>{item.session?.startTime}</small>{item.session && <Link href={`/admin/sessions/${item.session._id}`}>Ver sesión</Link>}</td><td>Presente<small>{localTime(item.recordedAt)} · {item.origin === "KIOSK" ? (item.checkInMethod ?? "QR") : item.origin === "PROFESSOR" ? "Profesor" : "Administración"}</small></td><td>Pendiente: {money(item.balance?.pendingCents)}<small className={item.balance?.overdueCents ? table.amountDue : undefined}>Vencido: {money(item.balance?.overdueCents)}</small><small>A favor: {money(item.balance?.creditCents)} · Pagos parciales: {item.balance?.partialCount ?? 0}</small>{item.participantType !== "TRIAL" && item.participantType !== "COURTESY" && <Link href={`/admin/students/${item.studentId}`}>Cuenta corriente</Link>}</td><td>{localTime(item.lastReminderAt)}</td></tr>)}</tbody></table></div>}
      </section>
    </> : <section className={styles.surface}><h2>Configuración de asistencia</h2><p>Iniciá sesión como administrador y abrí el registro de asistencia en la tablet o el celular. El acceso se habilita automáticamente, sin códigos ni registro de dispositivos. Las personas pueden acreditarse en cualquier momento del día de su clase. Acá podés ajustar los sonidos.</p>
      {!devices.length && <p>Todavía no se abrió el registro de asistencia. Usá el botón «Registrar asistencia» para empezar.</p>}
      {devices.map((device) => <DeviceSettings key={`${device.id}:${device.soundEnabled}:${device.volume}:${device.name}`} device={device} busy={busy} onSave={(id, input) => void perform(`/admin/check-in/devices/${id}`, "PATCH", input)} onRevoke={(id) => void revoke(id)} />)}
    </section>}
  </>;
}
