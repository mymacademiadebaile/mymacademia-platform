"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiFetch, apiMessage } from "@/lib/api";
import { todayInArgentina } from "@/lib/dates";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import { PageHeader } from "../admin-ui";
import styles from "../contacts/contacts.module.css";
import table from "./reception.module.css";

type Arrival = { _id: string; studentId: string; participantType: string; origin?: string; checkInMethod?: "QR" | "DNI"; recordedAt?: string; personName: string; session?: { _id: string; startTime: string; classId: { _id: string; name: string } } };
type ClassSummary = { id: string; name: string; capacity: number; enrolled: number; attendance: number };
type Reception = { date: string; classes: ClassSummary[]; arrivals: Arrival[] };
type Branch = { _id: string; name: string; isActive: boolean };
type AccessCode = { branchId: string; deviceId: string; code: string };
type AccessDevice = { id: string; name: string; branchId: string; accessState: "ACTIVE" | "PENDING" | "REVOKED" | "INACTIVE"; activatedAt?: string; lastSeenAt?: string };

const arrivalTime = (value?: string) => value ? new Date(value).toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit" }) : "—";
const personType = (type: string) => type === "TRIAL" ? "Prueba" : type === "COURTESY" ? "Cortesía" : "Alumno";
const arrivalMethod = (item: Arrival) => item.origin === "KIOSK" ? (item.checkInMethod ?? "QR") : item.origin === "PROFESSOR" ? "Profesor" : "Administración";
const displayCode = (code: string) => `${code.slice(0, 5)}-${code.slice(5)}`;

export function ReceptionLive() {
  const { confirm, toast } = useAdminFeedback();
  const [data, setData] = useState<Reception | null>(null), [branches, setBranches] = useState<Branch[]>([]), [devices, setDevices] = useState<AccessDevice[]>([]);
  const [view, setView] = useState<"arrivals" | "access">("arrivals"), [busy, setBusy] = useState(false), [accessCode, setAccessCode] = useState<AccessCode | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayInArgentina), [selectedClass, setSelectedClass] = useState(""), [selectedBranch, setSelectedBranch] = useState("");
  const [error, setError] = useState(""), [message, setMessage] = useState(""), [copied, setCopied] = useState(false);
  const load = useCallback(async () => {
    const [reception, branchList, deviceList] = await Promise.all([
      apiFetch<Reception>(`/admin/check-in/reception?date=${selectedDate}`),
      apiFetch<Branch[]>("/admin/branches"),
      apiFetch<{ items: AccessDevice[] }>("/admin/check-in/devices")
    ]);
    const activeBranches = branchList.filter((branch) => branch.isActive);
    setData(reception); setBranches(activeBranches); setDevices(deviceList.items);
    setAccessCode((current) => current && deviceList.items.some((device) => device.id === current.deviceId && device.accessState === "PENDING") ? current : null);
    setSelectedBranch((current) => current && activeBranches.some((branch) => branch._id === current) ? current : (activeBranches[0]?._id ?? ""));
  }, [selectedDate]);
  useEffect(() => { void load().catch((cause) => setError(apiMessage(cause))); const timer = setInterval(() => { if (!document.hidden) void load().catch(() => undefined); }, 15000); return () => clearInterval(timer); }, [load]);
  async function perform<T>(path: string, method: string, body?: object): Promise<{ ok: true; value: T } | { ok: false }> {
    setBusy(true); setError(""); setMessage("");
    try { return { ok: true, value: await apiFetch<T>(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) }) }; }
    catch (cause) { setError(apiMessage(cause)); return { ok: false }; }
    finally { setBusy(false); }
  }
  async function issueCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedBranch) return;
    const result = await perform<{ activationCode: string; branchId: string; deviceId: string }>("/admin/check-in/access-code", "POST", { branchId: selectedBranch });
    if (result.ok) {
      setAccessCode({ branchId: result.value.branchId, deviceId: result.value.deviceId, code: result.value.activationCode });
      setCopied(false); setMessage("Código generado. El anterior dejó de funcionar.");
      await load().catch((cause) => setError(apiMessage(cause)));
    }
  }
  async function revokeCode() {
    if (!selectedBranch || !await confirm({ title: "Revocar acceso de la tablet", description: "Todas las tablets de esta sede dejarán de poder registrar asistencias de inmediato.", confirmLabel: "Revocar acceso", tone: "danger" })) return;
    const result = await perform<void>("/admin/check-in/access-code/revoke", "POST", { branchId: selectedBranch });
    if (result.ok) {
      setAccessCode(null); setCopied(false); toast("Acceso revocado");
      await load().catch((cause) => setError(apiMessage(cause)));
    }
  }
  async function copyCode() { if (!accessCode) return; try { await navigator.clipboard.writeText(accessCode.code); setCopied(true); } catch { setCopied(false); } }
  const currentClass = data?.classes.find((item) => item.id === selectedClass);
  const branchDevices = devices.filter((device) => device.branchId === selectedBranch);
  const authorizedDevices = branchDevices.filter((device) => device.accessState === "ACTIVE" || device.accessState === "PENDING");
  const visibleDevices = [...authorizedDevices, ...branchDevices.filter((device) => device.accessState !== "ACTIVE" && device.accessState !== "PENDING").slice(0, 1)];
  const visibleArrivals = data?.arrivals.filter((item) => !selectedClass || String(item.session?.classId._id) === selectedClass) ?? [];
  const indicators = currentClass ? [["Asistencias", currentClass.attendance], ["Cupo", currentClass.capacity], ["Inscriptos", currentClass.enrolled], ["Lugares libres", Math.max(0, currentClass.capacity - currentClass.enrolled)]] : [["Asistencias", data?.arrivals.length ?? 0], ["Cupo total", data?.classes.reduce((total, item) => total + item.capacity, 0) ?? 0], ["Inscriptos", data?.classes.reduce((total, item) => total + item.enrolled, 0) ?? 0], ["Clases", data?.classes.length ?? 0]];
  return <><PageHeader title="Recepción" description="Presentes del día, avisos financieros y registro de asistencia." /><div className={styles.toolbar}><div className={table.receptionControls}><div className={table.viewTabs} role="tablist" aria-label="Vistas de recepción"><button role="tab" aria-selected={view === "arrivals"} className={view === "arrivals" ? styles.button : styles.secondary} onClick={() => setView("arrivals")}>Llegadas del día</button><button role="tab" aria-selected={view === "access"} className={view === "access" ? styles.button : styles.secondary} onClick={() => setView("access")}>Acceso de tablet</button></div></div><div className={table.quickActions}><Link className={styles.secondary} href="/admin/contacts">Buscar persona y ayudar con QR</Link><Link className={table.registrationAction} href="/asistencia">Registrar asistencia</Link></div><button className={table.refreshButton} aria-label="Actualizar asistencias" title="Actualizar asistencias" onClick={() => void load().catch((cause) => setError(apiMessage(cause)))}><RefreshCw size={18} aria-hidden="true" /></button></div>{error && <p className={styles.error} role="alert">{error}</p>}{message && <p className={styles.message} role="status">{message}</p>}
    {view === "arrivals" ? <section className={styles.surface} aria-busy={!data}><div className={table.arrivalsHeader}><div><h2>Asistencias</h2><p>Consultá quién asistió y la ocupación de cada grupo.</p></div><div className={table.arrivalFilters}><div className={table.dateFilter}><label htmlFor="arrival-date">Fecha</label><input id="arrival-date" type="date" value={selectedDate} max={todayInArgentina()} onChange={(event) => { setSelectedDate(event.target.value); setSelectedClass(""); }} /></div><div className={table.dateFilter}><label htmlFor="arrival-class">Clase</label><select id="arrival-class" value={selectedClass} onChange={(event) => setSelectedClass(event.target.value)}><option value="">Todas las clases</option>{data?.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div></div></div>{!data ? <p role="status">Cargando asistencias…</p> : <><div className={table.metrics} aria-label="Indicadores de asistencia">{indicators.map(([label, value]) => <div key={String(label)}><strong>{value}</strong><span>{label}</span></div>)}</div><div className={table.arrivalsSummary}><strong>{visibleArrivals.length} {visibleArrivals.length === 1 ? "asistencia" : "asistencias"}</strong><span>{currentClass?.name ?? "Todas las clases"} · {data.date.split("-").reverse().join("/")}</span>{selectedDate !== todayInArgentina() && <button className={table.todayButton} onClick={() => setSelectedDate(todayInArgentina())}>Ver hoy</button>}</div>{!visibleArrivals.length ? <p className={table.empty}>No hay asistencias registradas para este filtro.</p> : <div className={table.tableWrap}><table className={`${table.table} ${table.arrivalsTable}`}><thead><tr><th>Persona</th><th>Clase</th><th>Hora</th></tr></thead><tbody>{visibleArrivals.map((item) => <tr key={item._id}><td><Link href={`/admin/contacts/${item.studentId}`}>{item.personName}</Link><small>{personType(item.participantType)}</small></td><td>{item.session ? <Link href={`/admin/sessions/${item.session._id}`}>{item.session.classId.name}</Link> : "Clase no disponible"}<small>{item.session?.startTime ?? "—"}</small></td><td><strong>{arrivalTime(item.recordedAt)}</strong><small>{arrivalMethod(item)}</small></td></tr>)}</tbody></table></div>}</>}</section>  : <section className={styles.surface}>
      <div className={table.accessHeader}>
        <div><h2>Acceso de tablets</h2><p>Autorizá el Registro de asistencia de cada sede sin compartir una cuenta administrativa.</p></div>
        <Link className={styles.secondary} href="/asistencia">Abrir registro</Link>
      </div>
      <form className={table.accessForm} onSubmit={issueCode}>
        <label htmlFor="access-branch">Sede
          <select id="access-branch" value={selectedBranch} onChange={(event) => { setSelectedBranch(event.target.value); setAccessCode(null); }} required disabled={!branches.length}>
            {branches.map((branch) => <option key={branch._id} value={branch._id}>{branch.name}</option>)}
          </select>
        </label>
        <button className={styles.button} disabled={busy || !selectedBranch}>{authorizedDevices.length ? "Renovar código" : "Generar código"}</button>
      </form>
      {!branches.length && <p className={styles.error}>Necesitás una sede activa antes de generar un código.</p>}
      {accessCode?.branchId === selectedBranch && <div className={table.accessCodePanel} role="status">
        <span>Código de acceso de un solo uso</span><output>{displayCode(accessCode.code)}</output>
        <p>Ingresalo en la tablet. El código se muestra sólo ahora; la autorización de la tablet continúa hasta que la revoques o generes otro código para esta sede.</p>
        <button type="button" className={styles.secondary} onClick={() => void copyCode()}>{copied ? "Código copiado" : "Copiar código"}</button>
      </div>}
      {selectedBranch && <div className={table.devicePanel}>
        <div className={table.deviceHeader}>
          <h3>Tablets de esta sede</h3>
          {authorizedDevices.length > 0 && <button type="button" className={table.revokeButton} disabled={busy} onClick={() => void revokeCode()}>Revocar accesos</button>}
        </div>
        {!authorizedDevices.length && <p className={table.accessHint}>No hay tablets autorizadas. Generá un código para habilitar una.</p>}
        {visibleDevices.length > 0 && <ul className={table.deviceList}>{visibleDevices.map((device) => <li key={device.id} data-state={device.accessState}>
            <strong>{device.name}</strong><span>{device.accessState === "ACTIVE" ? "Autorizada" : device.accessState === "PENDING" ? "Código pendiente de activar" : device.accessState === "REVOKED" ? "Revocada" : "Inactiva"}</span>
            {device.lastSeenAt && <small>Último uso: {new Date(device.lastSeenAt).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}</small>}
          </li>)}</ul>}
        {authorizedDevices.some((device) => device.accessState === "PENDING") && !accessCode &&
          <p className={table.accessHint}>Hay un código pendiente que no se puede volver a mostrar. Si se perdió, generá uno nuevo.</p>}
      </div>}
    </section>}
  </>;
}
