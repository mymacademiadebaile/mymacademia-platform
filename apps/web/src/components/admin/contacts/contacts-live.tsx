"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { ContactSummary } from "@mym/shared";
import { PageHeader } from "../admin-ui";
import { Field, LiveModal } from "../live/live-common";
import { apiFetch, apiMessage } from "@/lib/api";
import styles from "./contacts.module.css";

export function ContactsLive() {
  const router = useRouter();
  const [items, setItems] = useState<ContactSummary[]>([]);
  const [branches, setBranches] = useState<Array<{ _id: string; name: string; isActive: boolean }>>([]);
  const [search, setSearch] = useState(""), [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [formError, setFormError] = useState(""), [loading, setLoading] = useState(true);
  const creationKey = useRef("");
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const [result, branchList] = await Promise.all([
        apiFetch<{ items: ContactSummary[] }>(`/admin/contacts?q=${encodeURIComponent(search)}&limit=100`, { signal }),
        apiFetch<Array<{ _id: string; name: string; isActive: boolean }>>("/admin/branches", { signal })
      ]);
      if (!signal?.aborted) { setItems(result.items); setBranches(branchList.filter((item) => item.isActive)); setError(""); }
    } catch (cause) { if (!signal?.aborted) setError(apiMessage(cause)); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [search]);
  useEffect(() => { const controller = new AbortController(); const timer = setTimeout(() => void load(controller.signal), 200);
    return () => { controller.abort(); clearTimeout(timer); }; }, [load]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!branches.length) { setFormError("Primero necesitás una sede activa para agregar contactos."); return; }
    const form = new FormData(event.currentTarget); setBusy(true); setFormError("");
    try {
      const contact = await apiFetch<ContactSummary>("/admin/contacts", { method: "POST", body: JSON.stringify({
        creationKey: creationKey.current, branchId: form.get("branchId") || branches[0]?._id,
        firstName: form.get("firstName"), lastName: form.get("lastName"),
        phone: form.get("phone"), dni: form.get("dni"), source: { platform: "RECEPTION" }
      }) });
      setOpen(false); router.push(`/admin/contacts/${contact._id}`);
    } catch (cause) { setFormError(apiMessage(cause)); } finally { setBusy(false); }
  }
  return <>
    <PageHeader title="Contactos" description="Personas interesadas en comenzar en la academia." />
    <div className={styles.toolbar}>
      <input className={styles.search} value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Buscar contacto por nombre, DNI o teléfono" placeholder="Buscar por nombre, DNI o teléfono" />
      <button className={styles.button} disabled={loading || !branches.length} onClick={() => { creationKey.current = crypto.randomUUID(); setFormError(""); setOpen(true); }}>Agregar contacto</button>
    </div>
    {error && <div className={styles.error} role="alert">{error} <button className={styles.secondary} onClick={() => void load()}>Reintentar carga</button></div>}
    <LiveModal open={open} title="Nuevo contacto" description="Registrá los datos básicos. Podés completar el resto más adelante."
      eyebrow="CONTACTOS" submitLabel="Guardar contacto" submitting={busy} error={formError} onClose={() => { if (!busy) setOpen(false); }} onSubmit={create}>
      <Field label="Nombre"><input name="firstName" minLength={2} maxLength={80} autoComplete="given-name" required /></Field>
      <Field label="Apellido"><input name="lastName" minLength={2} maxLength={80} autoComplete="family-name" required /></Field>
      <Field label="Teléfono"><input name="phone" type="tel" minLength={6} maxLength={40} autoComplete="tel" required /></Field>
      <Field label="DNI"><input name="dni" inputMode="numeric" minLength={6} maxLength={14} autoComplete="off" required /></Field>
      {branches.length > 1 && <Field label="Sede"><select name="branchId" defaultValue={branches[0]._id}>{branches.map((branch) => <option key={branch._id} value={branch._id}>{branch.name}</option>)}</select></Field>}
      {!branches.length && <p className={styles.wide} role="alert">Primero necesitás una sede activa para agregar contactos.</p>}
    </LiveModal>
    <section className={styles.surface} aria-busy={loading}>
      <h2>Posibles alumnos</h2>
      {loading ? <p role="status">Cargando contactos…</p> : !items.length ? <p className={styles.empty}>Todavía no hay contactos para esta búsqueda.</p> : <ul className={styles.list}>
        {items.map((item) => <li key={item._id}><Link className={styles.row} href={`/admin/contacts/${item._id}`}><span><strong>{item.firstName} {item.lastName}</strong><small>{item.phone || "Sin teléfono"}{item.dni ? ` · DNI ${item.dni}` : ""}</small></span><span className={styles.badge}>Ver historial</span></Link></li>)}
      </ul>}
      {items.length === 100 && <p>Mostrando hasta 100 contactos. Usá la búsqueda para encontrar a una persona específica.</p>}
    </section>
  </>;
}
