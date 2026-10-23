"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { ContactSummary } from "@mym/shared";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import styles from "./contacts.module.css";

export function ContactsLive() {
  const router = useRouter();
  const [items, setItems] = useState<ContactSummary[]>([]);
  const [branches, setBranches] = useState<Array<{ _id: string; name: string; isActive: boolean }>>([]);
  const [search, setSearch] = useState(""), [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const creationKey = useRef("");
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const [result, branches] = await Promise.all([
        apiFetch<{ items: ContactSummary[] }>(`/admin/contacts?q=${encodeURIComponent(search)}&limit=100`, { signal }),
        apiFetch<Array<{ _id: string; name: string; isActive: boolean }>>("/admin/branches", { signal })
      ]);
      setItems(result.items); setBranches(branches.filter((item) => item.isActive)); setError("");
    } catch (error) { if (!signal?.aborted) setError(apiMessage(error)); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [search]);
  useEffect(() => { const controller = new AbortController(); const timer = setTimeout(() => void load(controller.signal), 200);
    return () => { controller.abort(); clearTimeout(timer); }; }, [load]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError("");
    try {
      const contact = await apiFetch<ContactSummary>("/admin/contacts", { method: "POST", body: JSON.stringify({
        creationKey: creationKey.current, branchId: form.get("branchId"), firstName: form.get("firstName"), lastName: form.get("lastName"),
        email: form.get("email") || undefined, phone: form.get("phone") || undefined,
        source: { platform: form.get("platform"), campaign: form.get("campaign") || undefined }, notes: form.get("notes") || undefined
      }) });
      router.push(`/admin/contacts/${contact._id}`);
    } catch (error) { setError(apiMessage(error)); } finally { setBusy(false); }
  }
  return <>
    <PageHeader title="Contactos e interesados" description="Una misma persona, desde la primera consulta hasta su recorrido en la academia." />
    <div className={styles.toolbar}>
      <input className={styles.search} value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Buscar por nombre, email o teléfono" placeholder="Buscá por nombre, email o teléfono" />
      <button className={styles.button} onClick={() => { if (!open) creationKey.current = crypto.randomUUID(); setOpen(!open); }}>{open ? "Cerrar formulario" : "Crear contacto"}</button>
    </div>
    {error && <div className={styles.error} role="alert">{error} <button className={styles.secondary} onClick={() => void load()}>Reintentar carga</button></div>}
    {open && <section className={styles.surface}><h2>Nuevo contacto</h2><form className={styles.form} onSubmit={create}>
      <label>Nombre<input name="firstName" minLength={2} maxLength={80} autoComplete="given-name" required /></label>
      <label>Apellido<input name="lastName" minLength={2} maxLength={80} autoComplete="family-name" required /></label>
      <label>Email (opcional)<input name="email" type="email" autoComplete="email" /></label>
      <label>Teléfono (opcional)<input name="phone" type="tel" maxLength={40} autoComplete="tel" /></label>
      <label>Sede<select name="branchId" required><option value="">Seleccioná una sede</option>{branches.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
      <label>Procedencia<select name="platform"><option value="RECEPTION">Recepción</option><option value="INSTAGRAM">Instagram</option><option value="WHATSAPP">WhatsApp</option><option value="REFERRAL">Recomendación</option></select></label>
      <label>Campaña (opcional)<input name="campaign" maxLength={160} /></label>
      <label>Notas<textarea name="notes" maxLength={1000} /></label>
      <div className={styles.wide}><button className={styles.button} disabled={busy}>{busy ? "Guardando…" : "Guardar contacto"}</button></div>
    </form></section>}
    <section className={styles.surface} aria-busy={loading}>
      <h2>Personas de la academia</h2>
      {loading ? <p role="status">Cargando contactos…</p> : !items.length ? <p className={styles.empty}>No encontramos contactos. Revisá la búsqueda o creá uno nuevo.</p> : <ul className={styles.list}>
        {items.map((item) => <li key={item._id}><Link className={styles.row} href={`/admin/contacts/${item._id}`}><span><strong>{item.firstName} {item.lastName}</strong><small>{item.email || item.phone || "Sin datos de contacto"}</small></span><span className={styles.badge}>{item.academic ? "Alumno" : "Contacto"}</span></Link></li>)}
      </ul>}
      {items.length === 100 && <p>Mostrando hasta 100 personas. Usá la búsqueda para encontrar un contacto específico.</p>}
    </section>
  </>;
}
