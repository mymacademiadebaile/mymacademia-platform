"use client";
import Image from "next/image";
import Link from "next/link";
import { Camera, CheckCircle2, CircleAlert, HandHelping, Volume2, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { CheckInDeviceView, CheckInResult, CheckInScanResponse, CheckInSession } from "@mym/shared";
import { apiFetch, apiMessage, ApiError } from "@/lib/api";
import { KioskAudio } from "./kiosk-audio";
import styles from "./check-in.module.css";

type Phase = "BOOT" | "LOGIN" | "BRANCH" | "READY" | "SCANNING" | "SELECT" | "RESULT" | "HELP";
type Result = CheckInResult | { kind: "ERROR"; message: string };
export function CheckInKiosk() {
  const [phase, setPhase] = useState<Phase>("BOOT"), [device, setDevice] = useState<CheckInDeviceView | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [result, setResult] = useState<Result | null>(null);
  const [sessions, setSessions] = useState<CheckInSession[]>([]), [stream, setStream] = useState<MediaStream | null>(null);
  const video = useRef<HTMLVideoElement>(null), pendingQr = useRef(""), processing = useRef(false);
  const audio = useRef<KioskAudio | null>(null), request = useRef<AbortController | null>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const authorize = useCallback(async (branchId?: string) => {
    try {
      setDevice(await apiFetch<CheckInDeviceView>("/check-in/authorize", { method: "POST", body: JSON.stringify(branchId ? { branchId } : {}) }));
      setBranches([]); setError(""); return true;
    } catch (error) {
      setDevice(null);
      const payload = error instanceof ApiError ? error.payload as { error?: string; details?: { branches?: Array<{ id: string; name: string }> } } : undefined;
      if (payload?.error === "KIOSK_BRANCH_REQUIRED" && payload.details?.branches) { setBranches(payload.details.branches); setPhase("BRANCH"); }
      else { setPhase("LOGIN"); if (!(error instanceof ApiError && error.status === 401)) setError(apiMessage(error)); }
      return false;
    }
  }, []);
  const refreshDevice = useCallback(async () => {
    try { setDevice(await apiFetch<CheckInDeviceView>("/check-in/device")); return true; }
    catch { return authorize(); }
  }, [authorize]);
  useEffect(() => { void refreshDevice().then((ready) => { if (ready) setPhase("READY"); }); return () => { request.current?.abort(); audio.current?.dispose(); }; }, [refreshDevice]);
  useEffect(() => () => { stream?.getTracks().forEach((track) => track.stop()); }, [stream]);
  useEffect(() => {
    const hide = () => { if (document.hidden) { stream?.getTracks().forEach((track) => track.stop()); setStream(null); setResult(null); setSessions([]); pendingQr.current = ""; setPhase(device ? "READY" : "LOGIN"); request.current?.abort("KIOSK_HIDDEN"); audio.current?.stop(); } };
    document.addEventListener("visibilitychange", hide); return () => document.removeEventListener("visibilitychange", hide);
  }, [stream, device]);
  const reset = useCallback(() => { pendingQr.current = ""; setResult(null); setSessions([]); setError(""); processing.current = false;
    setPhase(stream?.active ? "SCANNING" : "READY"); void refreshDevice(); }, [stream, refreshDevice]);
  useEffect(() => { if (phase !== "RESULT" && phase !== "SELECT") return; const timer = setTimeout(reset, phase === "RESULT" ? 7000 : 20000); return () => clearTimeout(timer); }, [phase, reset]);
  useEffect(() => { if (phase === "RESULT") resultHeading.current?.focus(); }, [phase]);
  const submit = useCallback(async (qr: string, sessionId?: string) => {
    if (processing.current) return; processing.current = true; setBusy(true); setError("");
    const controller = new AbortController(); request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await apiFetch<CheckInScanResponse>(sessionId ? "/check-in/present" : "/check-in/scan", { method: "POST", signal: controller.signal, body: JSON.stringify({ qr, ...(sessionId ? { sessionId } : {}) }) });
      if (document.hidden || controller.signal.aborted) return;
      if (response.kind === "SELECT") { pendingQr.current = qr; setSessions(response.sessions); setPhase("SELECT"); }
      else { pendingQr.current = ""; setResult(response); setSessions([]); setPhase("RESULT"); audio.current?.play(response.kind, device?.soundEnabled ?? false, device?.volume ?? 0); }
    } catch (error) {
      if (document.hidden || controller.signal.reason === "KIOSK_HIDDEN") return;
      pendingQr.current = ""; setSessions([]);
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
      if (code) void submit(code.data);
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
  const Icon = result?.kind === "SUCCESS" ? CheckCircle2 : result?.kind === "WARNING" ? CircleAlert : XCircle;
  return <main className={styles.kiosk}>
    <header className={styles.header}><div className={styles.brand}><Image src="/mym-academia-logo.png" width={54} height={54} alt="M&M Academia" priority /><span>Nos vemos en la pista</span></div><span className={styles.device}>{device?.name ?? "Recepción"}</span></header>
    <div className={styles.main}>
      {phase === "BOOT" && <p role="status">Preparando recepción…</p>}
      {phase === "LOGIN" && <><h1>Ingresá para abrir el kiosco</h1><p>Iniciá sesión con una cuenta de administrador en este navegador. Con eso alcanza para registrar asistencias.</p><Link className={styles.button} href="/login?next=/check-in">Iniciar sesión como administrador</Link><button className={styles.secondary} onClick={() => void refreshDevice().then((ready) => { if (ready) setPhase("READY"); })}>Volver a intentar</button></>}
      {phase === "BRANCH" && <><h1>¿En qué sede estás?</h1><p>Elegí la sede donde vas a registrar asistencias.</p><form className={styles.activation} onSubmit={chooseBranch}><label>Sede<select name="branchId" required>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><button className={styles.button} disabled={busy}>Abrir kiosco</button></form></>}
      {phase === "READY" && <><Camera size={64} aria-hidden /><h1>Tu clase empieza acá</h1><p>Acercá tu QR personal para registrar la asistencia a tu clase.</p><button className={styles.button} onClick={() => void start()} disabled={busy}><Camera size={24} /><Volume2 size={24} />{busy ? "Habilitando…" : "Habilitar cámara y sonido"}</button><p className={styles.reset}>La cámara sólo se usa para leer tu QR. No guardamos imágenes.</p></>}
      {phase === "SCANNING" && <><h1>Acercá tu QR</h1><p>Ubicalo dentro del recuadro. Vamos a buscar tu clase.</p><div className={styles.camera}><video ref={video} muted playsInline aria-label="Cámara para leer el QR" /></div><p role="status">{busy ? "Confirmando tu asistencia…" : "Listo para leer tu QR"}</p></>}
      {phase === "SELECT" && <><h1>¿A qué clase venís?</h1><p>Elegí una sesión. Vamos a registrar sólo esa asistencia.</p><div className={styles.options}>{sessions.map((session) => <button className={`${styles.secondary} ${styles.option}`} key={session.id} disabled={busy} onClick={() => void submit(pendingQr.current, session.id)}><strong>{session.name}</strong><span>{session.startTime} a {session.endTime}</span></button>)}</div><button className={styles.secondary} onClick={reset} disabled={busy}>Cancelar</button></>}
      {phase === "RESULT" && result && <section className={styles.result} data-kind={result.kind} role={result.kind === "ERROR" ? "alert" : "status"}>
        <Icon aria-hidden /><h1 tabIndex={-1} ref={resultHeading}>{result.kind === "ERROR" ? "Te ayudamos en recepción" : result.kind === "WARNING" ? "Ya te registramos" : `¡Bienvenida/o, ${result.firstName}!`}</h1><p>{result.message}</p>
        {result.kind !== "ERROR" && <><p><strong>{result.session.name}</strong><br />{result.session.startTime} a {result.session.endTime}</p>{result.financialNotice && <p className={styles.notice}>{result.financialNotice}</p>}</>}
        <button className={styles.secondary} onClick={reset}>Volver al inicio</button><p className={styles.reset}>La pantalla se limpia automáticamente en unos segundos.</p>
      </section>}
      {phase === "HELP" && <><HandHelping size={64} aria-hidden /><h1>Recepción te ayuda</h1><p>Si no tenés tu QR, no funciona o no encontrás tu clase, acercate a recepción. Te van a identificar y registrar la asistencia de forma segura.</p><div className={styles.actions}><button className={styles.button} onClick={() => void start()} disabled={busy}>Volver a intentar con la cámara</button><button className={styles.secondary} onClick={reset}>Volver al inicio</button></div></>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {["READY", "SCANNING"].includes(phase) && <div className={styles.actions}><button className={styles.secondary} onClick={() => { setResult(null); pendingQr.current = ""; setPhase("HELP"); }}><HandHelping size={22} />Necesito ayuda de recepción</button></div>}
    </div>
    <footer className={styles.footer}>Una asistencia por clase · M&M Academia de Baile{device ? ` · ${device.soundEnabled ? "Sonido activo" : "Sonido desactivado"}` : ""}</footer>
  </main>;
}
