"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import type { Branch, Paginated, Student } from "./live-types";
import { ErrorBlock, Field, LiveModal, LoadingBlock } from "./live-common";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import styles from "./live.module.css";

export function StudentsLive() {
  const router = useRouter();
  const { toast } = useAdminFeedback();
  const [items, setItems] = useState<Student[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [search, setSearch] = useState("");
  const [branchId, setBranchId] = useState("");
  const [status, setStatus] = useState("active");
  const [debtOnly, setDebtOnly] = useState(false);
  const [modal, setModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        limit: "100",
        q: search,
        isActive: status === "all" ? "" : String(status === "active"),
        debt: debtOnly ? "true" : "false"
      });

      if (!params.get("isActive")) params.delete("isActive");
      if (branchId) params.set("branchId", branchId);

      const [students, branchList] = await Promise.all([
        apiFetch<Paginated<Student>>(`/admin/students?${params.toString()}`),
        apiFetch<Branch[]>("/admin/branches")
      ]);

      setItems(students.items);
      setBranches(branchList.filter((branch) => branch.isActive));
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [search, branchId, status, debtOnly]);

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
      const student = await apiFetch<Student>("/admin/students", {
        method: "POST",
        body: JSON.stringify({
          branchId: form.get("branchId"),
          firstName: form.get("firstName"),
          lastName: form.get("lastName"),
          phone: form.get("phone") || undefined,
          email: form.get("email") || undefined,
          birthDate: form.get("birthDate") || undefined,
          guardianName: form.get("guardianName") || undefined,
          guardianPhone: form.get("guardianPhone") || undefined,
          notes: form.get("notes") || undefined
        })
      });

      setModal(false);
      toast("Alumno creado correctamente");
      router.push("/admin/students/" + student._id);
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
        description="Alta, búsqueda, filtros y ficha completa de cada alumno."
        actionLabel="Nuevo alumno"
        onAction={() => setModal(true)}
      />

      <div className={styles.filterBar}>
        <div className={styles.searchInline}>
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nombre, email o teléfono..."
          />
        </div>
        <select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
          <option value="">Todas las sedes</option>
          {branches.map((branch) => <option key={branch._id} value={branch._id}>{branch.name}</option>)}
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
          <option value="all">Todos</option>
        </select>
        <label className={styles.checkboxFilter}>
          <input
            type="checkbox"
            checked={debtOnly}
            onChange={(event) => setDebtOnly(event.target.checked)}
          />
          Con deuda vencida
        </label>
      </div>

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}
      {loading && !items.length && <LoadingBlock />}

      {(items.length > 0 || !loading) && (
        <div className={styles.listCard}>
          {items.length === 0 && (
            <div className={styles.stateBlock}>
              <span>No hay alumnos para estos filtros.</span>
            </div>
          )}
          {items.map((student) => (
            <Link className={styles.listRowLink} href={`/admin/students/${student._id}`} key={student._id}>
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
              <ChevronRight size={17} />
            </Link>
          ))}
        </div>
      )}

      <LiveModal
        open={modal}
        title="Agregar alumno"
        description="Cargá la información principal. Después podés administrar clases, cuenta y contacto desde su ficha."
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
        <Field label="Notas" wide><textarea name="notes" rows={4} /></Field>
      </LiveModal>
    </>
  );
}
