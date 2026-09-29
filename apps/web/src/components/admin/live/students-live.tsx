"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import type { Branch, Paginated, Student } from "./live-types";
import { ErrorBlock, Field, LiveModal, LoadingBlock } from "./live-common";
import styles from "./live.module.css";

export function StudentsLive() {
  const [items, setItems] = useState<Student[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [students, branchList] = await Promise.all([
        apiFetch<Paginated<Student>>(`/admin/students?limit=100&q=${encodeURIComponent(search)}`),
        apiFetch<Branch[]>("/admin/branches")
      ]);
      setItems(students.items);
      setBranches(branchList.filter((branch) => branch.isActive));
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError("");

    try {
      await apiFetch<Student>("/admin/students", {
        method: "POST",
        body: JSON.stringify({
          branchId: form.get("branchId"),
          firstName: form.get("firstName"),
          lastName: form.get("lastName"),
          phone: form.get("phone") || undefined,
          email: form.get("email") || undefined,
          birthDate: form.get("birthDate") || undefined,
          guardianName: form.get("guardianName") || undefined,
          guardianPhone: form.get("guardianPhone") || undefined
        })
      });
      setModal(false);
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="COMUNIDAD"
        title="Alumnos"
        description="Alta, búsqueda y estado de cada alumno usando datos reales."
        actionLabel="Nuevo alumno"
        onAction={() => setModal(true)}
      />

      <div className={styles.notice}>
        {items.length} alumnos visibles en esta búsqueda. La ficha financiera se conecta desde el módulo Pagos.
      </div>

      <div className={styles.card} style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <Search size={17} />
          <input
            style={{ flex: 1, border: 0, outline: 0, background: "transparent" }}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre, email o teléfono..."
          />
        </div>
      </div>

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}
      {loading && !items.length && <LoadingBlock />}

      {!loading && (
        <div className={styles.listCard}>
          {items.map((student) => (
            <div className={styles.listRow} key={student._id}>
              <span className={styles.avatar}>
                {student.firstName.slice(0, 1)}{student.lastName.slice(0, 1)}
              </span>
              <span className={styles.rowBody}>
                <strong>{student.firstName} {student.lastName}</strong>
                <small>{student.phone || student.email || "Sin contacto cargado"}</small>
              </span>
              <span className={student.isActive ? styles.pill : styles.pillOff}>
                {student.isActive ? "Activo" : "Inactivo"}
              </span>
            </div>
          ))}
        </div>
      )}

      <LiveModal
        open={modal}
        title="Agregar alumno"
        description="Cargamos primero lo esencial; podés completar más datos después."
        submitting={submitting}
        onClose={() => setModal(false)}
        onSubmit={create}
      >
        <Field label="Sede">
          <select name="branchId" required defaultValue="">
            <option value="" disabled>Seleccionar sede</option>
            {branches.map((branch) => <option value={branch._id} key={branch._id}>{branch.name}</option>)}
          </select>
        </Field>
        <Field label="Nombre"><input name="firstName" required /></Field>
        <Field label="Apellido"><input name="lastName" required /></Field>
        <Field label="Teléfono"><input name="phone" /></Field>
        <Field label="Email"><input name="email" type="email" /></Field>
        <Field label="Fecha de nacimiento"><input name="birthDate" type="date" /></Field>
        <Field label="Responsable"><input name="guardianName" /></Field>
        <Field label="Teléfono responsable"><input name="guardianPhone" /></Field>
      </LiveModal>
    </>
  );
}
