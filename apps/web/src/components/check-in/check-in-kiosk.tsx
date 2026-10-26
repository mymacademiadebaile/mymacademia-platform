"use client";
import Image from "next/image";
import Link from "next/link";
import { CheckCircle2, CircleAlert, HandHelping, IdCard, MapPin, QrCode, ShieldCheck, Volume2, VolumeX, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { CheckInDeviceView, CheckInResult, CheckInScanResponse, CheckInSession } from "@mym/shared";
import { apiFetch, apiMessage, ApiError } from "@/lib/api";
import { KioskAudio } from "./kiosk-audio";
import styles from "./check-in.module.css";

type Phase = "BOOT" | "LOGIN" | "UNAVAILABLE" | "BRANCH" | "READY" | "SCANNING" | "DNI" | "SELECT" | "RESULT" | "HELP";
type Identity = { qr: string } | { dni: string };
type Result = CheckInResult | { kind: "ERROR"; message: string };
async function accessFetch<T>(path: string, init: RequestInit = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
  try { return await apiFetch<T>(path, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}
export function AttendanceRegistration() {
  const [phase, setPhase] = useState<Phase>("BOOT"), [device, setDevice] = useState<CheckInDeviceView | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [result, setResult] = useState<Result | null>(null);
  const [sessions, setSessions] = useState<CheckInSession[]>([]), [stream, setStream] = useState<MediaStream | null>(null);
  const video = useRef<HTMLVideoElement>(null), pendingIdentity = useRef<Identity | null>(null), processing = useRef(false);
  const [dni, setDni] = useState("");
  const audio = useRef<KioskAudio | null>(null), request = useRef<AbortController | null>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const authorize = useCallback(async (branchId?: string) => {
    try {
      setDevice(await accessFetch<CheckInDeviceView>("/check-in/authorize", { method: "POST", body: JSON.stringify(branchId ? { branchId } : {}) }));
      setBranches([]); setError(""); return true;
    } catch (error) {
      setDevice(null);
      const payload = error instanceof ApiError ? error.payload as { error?: string; details?: { branches?: Array<{ id: string; name: string }> } } : undefined;
      if (payload?.error === "KIOSK_BRANCH_REQUIRED" && payload.details?.branches) { setBranches(payload.details.branches); setPhase("BRANCH"); }
      else if (error instanceof ApiError && (error.status === 401 || (error.status === 403 && payload?.error === "FORBIDDEN"))) { setPhase("LOGIN"); setError(error.status === 403 ? "Esta cuenta no es de administrador. Ingresá con una cuenta administrativa." : ""); }
      else { setPhase("UNAVAILABLE"); setError(apiMessage(error)); }
      return false;
    }
  }, []);
  const refreshDevice = useCallback(async () => {
    try { setDevice(await accessFetch<CheckInDeviceView>("/check-in/device")); setError(""); return true; }
    catch (error) {
      if (error instanceof ApiError && error.status === 401) return authorize();
      setPhase("UNAVAILABLE"); setError(apiMessage(error)); return false;
    }
  }, [authorize]);
  useEffect(() => { void refreshDevice().then((ready) => { if (ready) setPhase("READY"); }); return () => { request.current?.abort(); audio.current?.dispose(); }; }, [refreshDevice]);
  useEffect(() => () => { stream?.getTracks().forEach((track) => track.stop()); }, [stream]);
  useEffect(() => { if (["LOGIN", "UNAVAILABLE", "BRANCH"].includes(phase) && stream) { stream.getTracks().forEach((track) => track.stop()); setStream(null); } }, [phase, stream]);
  useEffect(() => {
    const hide = () => { if (document.hidden) { stream?.getTracks().forEach((track) => track.stop()); setStream(null); setResult(null); setSessions([]); setDni(""); pendingIdentity.current = null; setPhase(device ? "READY" : "LOGIN"); request.current?.abort("KIOSK_HIDDEN"); audio.current?.stop(); } };
    document.addEventListener("visibilitychange", hide); return () => document.removeEventListener("visibilitychange", hide);
  }, [stream, device]);
  const reset = useCallback(() => { pendingIdentity.current = null; setDni(""); setResult(null); setSessions([]); setError(""); processing.current = false;
    setPhase(stream?.active ? "SCANNING" : "READY"); void refreshDevice(); }, [stream, refreshDevice]);
  useEffect(() => { if (!["RESULT", "SELECT", "DNI"].includes(phase)) return; const timer = setTimeout(reset, phase === "RESULT" ? 7000 : phase === "SELECT" ? 20000 : 45000); return () => clearTimeout(timer); }, [phase, dni, reset]);
  useEffect(() => { if (phase === "RESULT") resultHeading.current?.focus(); }, [phase]);
  const submit = useCallback(async (identity: Identity, sessionId?: string) => {
    if (processing.current) return; processing.current = true; setBusy(true); setError("");
    const controller = new AbortController(); request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await apiFetch<CheckInScanResponse>(sessionId ? "/check-in/present" : "/check-in/scan", { method: "POST", signal: controller.signal, body: JSON.stringify({ ...identity, ...(sessionId ? { sessionId } : {}) }) });
      if (document.hidden || controller.signal.aborted) return;
      if (response.kind === "SELECT") { pendingIdentity.current = identity; setSessions(response.sessions); setPhase("SELECT"); }
      else { pendingIdentity.current = null; setResult(response); setSessions([]); setPhase("RESULT"); audio.current?.play(response.kind, device?.soundEnabled ?? false, device?.volume ?? 0); }
    } catch (error) {
      if (document.hidden || controller.signal.reason === "KIOSK_HIDDEN") return;
      pendingIdentity.current = null; setSessions([]);
      setResult({ kind: "ERROR", message: error instanceof Error && error.name === "AbortError" ? "No pudimos confirmar la conexión. Pedí ayuda en recepción antes de volver a intentar." : apiMessage(error) });
      setPhase("RESULT"); audio.current?.play("ERROR", device?.soundEnabled ?? false, device?.volume ?? 0);
      if (error instanceof ApiError && error.status === 401) void refreshDevice();
    } finally { clearTimeout(timeout); processing.current = false; setBusy(false); request.current = null; }
  }, [device, refreshDevice]);
  useEffect(() => {
    if (phase !== "SCANNING" || !stream || !video.current) return;
    const element = video.current; element.srcObject = stream;
    void element.play().catch(() => { setError("No pudimos iniciar la cámara. Pedí ayuda en recepción."); setPhase("HELP"); });
    let cancelled = false; const canvas = document.createElement("canvas"), context = canvas.getContext("2d", { willReadFrequently: true });
    let decode: typeof import("jsqr").default | undefined;
    void import("jsqr").then((module) => { if (!cancelled) decode = module.default; });
    const timer = setInterval(() => {
      if (processing.current || !decode || !context || element.readyState < 2) return;
      const size = Math.min(element.videoWidth, element.videoHeight); if (!size) return;
      canvas.width = 480; canvas.height = 480;
      context.drawImage(element, (element.videoWidth - size) / 2, (element.videoHeight - size) / 2, size, size, 0, 0, 480, 480);
      const pixels = context.getImageData(0, 0, 480, 480), code = decode(pixels.data, pixels.width, pixels.height, { inversionAttempts: "dontInvert" });
      if (code) void submit({ qr: code.data });
    }, 250);
    return () => { cancelled = true; clearInterval(timer); element.srcObject = null; };
  }, [phase, stream, submit]);
  async function start() {
    setBusy(true); setError("");
    audio.current ??= new KioskAudio(); await audio.current.unlock().catch(() => undefined);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("La cámara requiere HTTPS o un navegador compatible. Pedí ayuda en recepción.");
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 720 } }, audio: false });
      if (document.hidden) { media.getTracks().forEach((track) => track.stop()); return; }
      setStream(media); setPhase("SCANNING");
    } catch { setError("No pudimos habilitar la cámara. Revisá el permiso del navegador o pedí ayuda en recepción."); setPhase("HELP"); }
    finally { setBusy(false); }
  }
  async function chooseBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError("");
    try { if (await authorize(String(form.get("branchId")))) setPhase("READY"); }
    finally { setBusy(false); }
  }
  async function useDni() {
    stream?.getTracks().forEach((track) => track.stop()); setStream(null); setError(""); setDni("");
    audio.current ??= new KioskAudio(); await audio.current.unlock().catch(() => undefined);
    setPhase("DNI");
  }
  const Icon = result?.kind === "SUCCESS" ? CheckCircle2 : result?.kind === "WARNING" ? CircleAlert : XCircle;
  return <main className={styles.attendance} data-phase={phase}>
    <header className={styles.header}><div className={styles.brand}><Image src="/mym-academia-logo.png" width={54} height={54} alt="M&M Academia" priority /><span>Registro de asistencia</span></div><span className={styles.device}><MapPin size={16} aria-hidden />{device?.name ?? "Recepción"}</span></header>
    <div className={styles.layout}>
    <div className={styles.main}>
      {phase === "BOOT" && <p role="status">Preparando recepción…</p>}
      {phase === "LOGIN" && <><h1>Ingresá para registrar asistencias</h1><p>Iniciá sesión con una cuenta de administrador en este navegador. Con eso alcanza para registrar asistencias.</p><Link className={styles.button} href="/login?next=/asistencia">Iniciar sesión como administrador</Link><button className={styles.secondary} onClick={() => void refreshDevice().then((ready) => { if (ready) setPhase("READY"); })}>Volver a intentar</button></>}
      {phase === "UNAVAILABLE" && <><h1>No pudimos abrir el registro de asistencia</h1><p>Intentá nuevamente. Si el problema continúa, pedí ayuda en recepción.</p><button className={styles.button} onClick={() => { setPhase("BOOT"); setError(""); void refreshDevice().then((ready) => { if (ready) setPhase("READY"); }); }}>Volver a intentar</button><div className={styles.actions}><Link className={styles.secondary} href="/admin/reception">Ir a recepción</Link></div></>}
      {phase === "BRANCH" && <><h1>¿En qué sede estás?</h1><p>Elegí la sede donde vas a registrar asistencias.</p><form className={styles.activation} onSubmit={chooseBranch}><label>Sede<select name="branchId" required>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><button className={styles.button} disabled={busy}>Abrir registro de asistencia</button></form></>}
      {phase === "READY" && <><h1 className={styles.welcomeTitle}>Registrá tu <span>asistencia</span></h1><p>Elegí cómo acreditar tu presentismo en la clase.</p><div className={styles.methods}><button className={`${styles.button} ${styles.method}`} aria-label="Escanear QR" onClick={() => void start()} disabled={busy}><QrCode className={styles.methodIcon} aria-hidden /><span><strong>{busy ? "Habilitando…" : "Escanear QR"}</strong><small>Acercá tu credencial a la cámara</small></span></button><button className={`${styles.secondary} ${styles.method}`} aria-label="Usar DNI" onClick={() => void useDni()} disabled={busy}><IdCard className={styles.methodIcon} aria-hidden /><span><strong>Usar DNI</strong><small>Ingresá tu número de documento</small></span></button></div><p className={`${styles.reset} ${styles.privacy}`}><ShieldCheck size={18} aria-hidden /><span>La cámara sólo lee tu QR. No guardamos imágenes.</span></p></>}
      {phase === "DNI" && <><h1>Acreditá tu asistencia con DNI</h1><p>Ingresá el DNI que tenés cargado en la academia.</p><form className={styles.activation} onSubmit={(event) => { event.preventDefault(); const value = dni; setDni(""); void submit({ dni: value }); }}><label>DNI<input name="dni" inputMode="numeric" autoComplete="off" autoFocus value={dni} onChange={(event) => setDni(event.target.value)} minLength={6} maxLength={14} required disabled={busy} /></label><button className={styles.button} disabled={busy}>{busy ? "Registrando…" : "Registrar asistencia"}</button><button className={styles.secondary} type="button" onClick={reset} disabled={busy}>Cancelar</button></form></>}
      {phase === "SCANNING" && <><h1>Acercá tu QR</h1><p>Ubicalo dentro del recuadro. Vamos a buscar tu clase.</p><div className={styles.camera}><video ref={video} muted playsInline aria-label="Cámara para leer el QR" /></div><p role="status">{busy ? "Confirmando tu asistencia…" : "Listo para leer tu QR"}</p></>}
      {phase === "SELECT" && <><h1>¿A qué clase venís?</h1><p>Elegí una sesión. Vamos a registrar sólo esa asistencia.</p><div className={styles.options}>{sessions.map((session) => <button className={`${styles.secondary} ${styles.option}`} key={session.id} disabled={busy} onClick={() => { if (pendingIdentity.current) void submit(pendingIdentity.current, session.id); }}><strong>{session.name}</strong><span>{session.startTime} a {session.endTime}</span></button>)}</div><button className={styles.secondary} onClick={reset} disabled={busy}>Cancelar</button></>}
      {phase === "RESULT" && result && <section className={styles.result} data-kind={result.kind} role={result.kind === "ERROR" ? "alert" : "status"}>
        <Icon aria-hidden /><h1 tabIndex={-1} ref={resultHeading}>{result.kind === "ERROR" ? "Te ayudamos en recepción" : result.kind === "WARNING" ? "Ya te registramos" : `¡Bienvenida/o, ${result.firstName}!`}</h1><p>{result.message}</p>
        {result.kind !== "ERROR" && <><p><strong>{result.session.name}</strong><br />{result.session.startTime} a {result.session.endTime}</p>{result.financialNotice && <p className={styles.notice}>{result.financialNotice}</p>}</>}
        <button className={styles.secondary} onClick={reset}>Volver al inicio</button><p className={styles.reset}>La pantalla se limpia automáticamente en unos segundos.</p>
      </section>}
      {phase === "HELP" && <><HandHelping size={64} aria-hidden /><h1>Recepción te ayuda</h1><p>Si no podés usar el QR, acreditá tu asistencia con DNI. Si tus datos o tu clase no aparecen, pedí ayuda en recepción.</p><div className={styles.actions}><button className={styles.button} onClick={() => void useDni()} disabled={busy}>Usar DNI</button><button className={styles.secondary} onClick={() => void start()} disabled={busy}>Volver a intentar con la cámara</button><button className={styles.secondary} onClick={reset}>Volver al inicio</button></div></>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {["READY", "SCANNING"].includes(phase) && <div className={styles.actions}>{phase === "SCANNING" && <button className={styles.secondary} disabled={busy} onClick={() => void useDni()}>Usar DNI</button>}<button className={styles.helpButton} disabled={busy} onClick={() => { setResult(null); pendingIdentity.current = null; setPhase("HELP"); }}><HandHelping size={20} aria-hidden />Necesito ayuda de recepción</button></div>}
    </div>
    </div>
    <footer className={styles.footer}><span>Una asistencia por clase · M&M Academia de Baile</span>{device && <span className={styles.sound}>{device.soundEnabled ? <Volume2 size={16} aria-hidden /> : <VolumeX size={16} aria-hidden />}{device.soundEnabled ? "Sonido activo" : "Sonido desactivado"}</span>}</footer>
  </main>;
}
