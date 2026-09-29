"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import type { Branch, CatalogItem, Professor } from "./live-types";
import { ErrorBlock, Field, LiveModal, LoadingBlock } from "./live-common";
import styles from "./live.module.css";

function disciplineName(value: CatalogItem | string) {
  return typeof value === "string" ? value : value.name;
}

export function ProfessorsLive() {
  const [items, setItems] = useState<Professor[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [catalogs, setCatalogs] = useState<CatalogItem[]>([]);
  const [search, setSearch] = useState("");
  const [branchId, setBranchId] = useState("");
  const [disciplineId, setDisciplineId] = useState("");
  const [status, setStatus] = useState("active");
  const [modal, setModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (branchId) params.set("branchId", branchId);
      if (disciplineId) params.set("disciplineId", disciplineId);
      if (status !== "all") params.set("isActive", String(status === "active"));

      const [professorList, branchList, catalogList] = await Promise.all([
        apiFetch<Professor[]>(`/admin/professors?${params.toString()}`),
        apiFetch<Branch[]>("/admin/branches"),
        apiFetch<CatalogItem[]>("/admin/catalogs")
      ]);
      setItems(professorList);
      setBranches(branchList.filter((branch) => branch.isActive));
      setCatalogs(catalogList.filter((item) => item.isActive && item.type === "DISCIPLINE"));
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [search, branchId, disciplineId, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selectedDisciplines = useMemo(
    () => new Set(catalogs.map((item) => item._id)),
    [catalogs]
  );

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError("");

    try {
      const professor = await apiFetch<Professor>("/admin/professors", {
        method: "POST",
        body: JSON.stringify({
          firstName: form.get("firstName"),
          lastName: form.get("lastName"),
          displayName: form.get("displayName"),
          email: form.get("email"),
          password: form.get("password"),
          phone: form.get("phone") || undefined,
          bio: form.get("bio") || undefined,
          instagram: form.get("instagram") || undefined,
          branchIds: form.getAll("branchIds"),
          disciplineIds: form.getAll("disciplineIds").filter((id) => selectedDisciplines.has(String(id)))
        })
      });

      setModal(false);
      window.location.assign(`/admin/professors/${professor._id}`);
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="EQUIPO"
        title="Profesores"
        description="Accesos, disciplinas, sedes, clases y alumnos del equipo."
        actionLabel="Nuevo profesor"
        onAction={() => setModal(true)}
      />

      <div className={styles.filterBar}>
        <div className={styles.searchInline}>
          <Search size={17} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre o email..." />
        </div>
        <select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
          <option value="">Todas las sedes</option>
          {branches.map((branch) => <option key={branch._id} value={branch._id}>{branch.name}</option>)}
        </select>
        <select value={disciplineId} onChange={(event) => setDisciplineId(event.target.value)}>
          <option value="">Todas las disciplinas</option>
          {catalogs.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
          <option value="all">Todos</option>
        </select>
      </div>

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}
      {loading && !items.length && <LoadingBlock />}

      {!loading && (
        <div className={styles.liveGrid3}>
          {items.length === 0 && <div className={styles.stateBlock}>No hay profesores para estos filtros.</div>}
          {items.map((professor) => (
            <Link className={styles.cardLink} href={`/admin/professors/${professor._id}`} key={professor._id}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className={styles.avatar}>{professor.displayName.slice(0, 2).toUpperCase()}</span>
                <span className={professor.isActive ? styles.pill : styles.pillOff}>
                  {professor.isActive ? "Activo" : "Inactivo"}
                </span>
              </div>
              <strong className={styles.cardTitle}>{professor.displayName}</strong>
              <span className={styles.cardDetail}>
                {professor.userId?.email || professor.phone || "Sin contacto"}
              </span>
              <div className={styles.tagRow}>
                {professor.disciplineIds?.slice(0, 4).map((discipline) => (
                  <span key={typeof discipline === "string" ? discipline : discipline._id}>
                    {disciplineName(discipline)}
                  </span>
                ))}
              </div>
              <div className={styles.cardFooterLink}>Ver perfil <ChevronRight size={15} /></div>
            </Link>
          ))}
        </div>
      )}

      <LiveModal
        open={modal}
        title="Agregar profesor"
        description="Se crea su perfil, acceso, sedes y disciplinas en un solo paso."
        submitting={submitting}
        onClose={() => setModal(false)}
        onSubmit={create}
      >
        <Field label="Nombre"><input name="firstName" required /></Field>
        <Field label="Apellido"><input name="lastName" required /></Field>
        <Field label="Nombre visible"><input name="displayName" required /></Field>
        <Field label="Teléfono"><input name="phone" /></Field>
        <Field label="Email de acceso"><input name="email" type="email" required /></Field>
        <Field label="Contraseña inicial"><input name="password" type="password" minLength={10} required /></Field>
        <Field label="Sedes" wide>
          <select name="branchIds" multiple size={Math.min(4, Math.max(2, branches.length))} required>
            {branches.map((branch) => <option value={branch._id} key={branch._id}>{branch.name}</option>)}
          </select>
        </Field>
        <Field label="Disciplinas" wide>
          <select name="disciplineIds" multiple size={Math.min(6, Math.max(3, catalogs.length))}>
            {catalogs.map((item) => <option value={item._id} key={item._id}>{item.name}</option>)}
          </select>
        </Field>
        <Field label="Instagram"><input name="instagram" /></Field>
        <Field label="Bio" wide><textarea name="bio" rows={4} /></Field>
      </LiveModal>
    </>
  );
}
