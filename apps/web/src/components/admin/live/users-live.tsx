"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Pencil, Search, Trash2, UserPlus } from "lucide-react";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import type { Branch, Paginated } from "./live-types";
import { ErrorBlock, Field, LiveModal, LoadingBlock, PaginationControls } from "./live-common";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import styles from "./live.module.css";

type ManagedRole = "ADMIN" | "PROFESSOR";

type ManagedUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: ManagedRole;
  isActive: boolean;
  branchIds: string[];
  createdAt?: string;
};

type ModalState = "create" | ManagedUser | null;

const roleLabel: Record<ManagedRole, string> = {
  ADMIN: "Administrador",
  PROFESSOR: "Profesor"
};

export function UsersLive() {
  const { toast } = useAdminFeedback();
  const [items, setItems] = useState<ManagedUser[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<"" | ManagedRole>("");
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [modal, setModal] = useState<ModalState>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (search) params.set("q", search);
      if (role) params.set("role", role);
      if (status !== "all") params.set("isActive", String(status === "active"));
      const [users, branchList] = await Promise.all([
        apiFetch<Paginated<ManagedUser>>(`/admin/users?${params.toString()}`),
        apiFetch<Branch[]>("/admin/branches")
      ]);
      const lastPage = Math.max(1, Math.ceil(users.total / users.limit));
      if (page > lastPage) {
        const correctedParams = new URLSearchParams(params);
        correctedParams.set("page", String(lastPage));
        const correctedUsers = await apiFetch<Paginated<ManagedUser>>(
          `/admin/users?${correctedParams.toString()}`
        );

        setItems(correctedUsers.items);
        setTotal(correctedUsers.total);
        setBranches(branchList.filter((branch) => branch.isActive));
        setPage(lastPage);
        return;
      }

      setItems(users.items);
      setTotal(users.total);
      setBranches(branchList.filter((branch) => branch.isActive));
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [role, search, status, page, limit]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const editing = modal !== null && modal !== "create";
    const password = String(form.get("password") || "");
    const body = {
      firstName: form.get("firstName"),
      lastName: form.get("lastName"),
      email: form.get("email"),
      phone: form.get("phone") || undefined,
      branchIds: form.getAll("branchIds"),
      ...(editing ? {} : { role: form.get("role"), password }),
      ...(editing && password ? { password } : {})
    };

    setSubmitting(true);
    setError("");
    try {
      await apiFetch<ManagedUser>(editing ? `/admin/users/${modal.id}` : "/admin/users", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(body)
      });
      setModal(null);
      toast(editing ? "Usuario actualizado correctamente" : "Usuario creado correctamente");
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleStatus(user: ManagedUser) {
    try {
      await apiFetch<ManagedUser>(`/admin/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !user.isActive })
      });
      toast(user.isActive ? "Usuario desactivado" : "Usuario activado");
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError));
    }
  }

  async function remove(user: ManagedUser) {
    if (!window.confirm(`¿Eliminar definitivamente a ${user.firstName} ${user.lastName}? Esta acción no se puede deshacer.`)) {
      return;
    }
    try {
      await apiFetch<void>(`/admin/users/${user.id}`, { method: "DELETE" });
      toast("Usuario eliminado correctamente");
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError));
    }
  }

  const editing = modal !== null && modal !== "create" ? modal : null;

  return (
    <>
      <PageHeader
        eyebrow="SUPER ADMIN"
        title="Usuarios del sistema"
        description="Creá y administrá los accesos de administradores y profesores. Los super admins no se gestionan desde esta pantalla."
        actionLabel="Nuevo usuario"
        onAction={() => setModal("create")}
      />

      <div className={styles.filterBar}>
        <div className={styles.searchInline}>
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Nombre o email..."
          />
        </div>
        <select value={role} onChange={(event) => {
          setRole(event.target.value as "" | ManagedRole);
          setPage(1);
        }}>
          <option value="">Todos los roles</option>
          <option value="ADMIN">Administradores</option>
          <option value="PROFESSOR">Profesores</option>
        </select>
        <select value={status} onChange={(event) => {
          setStatus(event.target.value);
          setPage(1);
        }}>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
          <option value="all">Todos</option>
        </select>
      </div>

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}
      {loading && !items.length && <LoadingBlock />}

      {(items.length > 0 || !loading) && (
        <>
          <div className={styles.userList}>
            {items.length === 0 && <div className={styles.stateBlock}>No hay usuarios para estos filtros.</div>}
            {items.map((user) => (
              <article className={styles.userRow} key={user.id}>
                <span className={styles.avatar}>{`${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase()}</span>
                <div className={styles.userIdentity}>
                  <strong>{user.firstName} {user.lastName}</strong>
                  <small>{user.email}{user.phone ? ` · ${user.phone}` : ""}</small>
                </div>
                <span className={styles.userRole}>{roleLabel[user.role]}</span>
                <span className={user.isActive ? styles.pill : styles.pillOff}>{user.isActive ? "Activo" : "Inactivo"}</span>
                <div className={styles.userActions}>
                  <button type="button" className={styles.inlineAction} onClick={() => setModal(user)}><Pencil size={14} /> Editar</button>
                  <button type="button" className={styles.inlineAction} onClick={() => void toggleStatus(user)}>
                    {user.isActive ? "Desactivar" : "Activar"}
                  </button>
                  <button type="button" className={styles.dangerAction} onClick={() => void remove(user)} aria-label={`Eliminar a ${user.firstName} ${user.lastName}`}><Trash2 size={15} /></button>
                </div>
              </article>
            ))}
          </div>
          <PaginationControls
            page={page}
            limit={limit}
            total={total}
            loading={loading}
            onPageChange={setPage}
            onLimitChange={(nextLimit) => {
              setLimit(nextLimit);
              setPage(1);
            }}
          />
        </>
      )}

      <LiveModal
        open={modal !== null}
        title={editing ? "Editar usuario" : "Crear usuario"}
        description={editing ? "Actualizá sus datos, sedes o contraseña. Dejá la contraseña vacía para conservarla." : "Para profesores se crea también el perfil necesario para ingresar a su portal."}
        submitting={submitting}
        onClose={() => setModal(null)}
        onSubmit={submit}
        eyebrow="USUARIOS"
        submitLabel={editing ? "Guardar cambios" : "Crear usuario"}
      >
        {!editing && <Field label="Rol"><select name="role" defaultValue="ADMIN"><option value="ADMIN">Administrador</option><option value="PROFESSOR">Profesor</option></select></Field>}
        <Field label="Nombre"><input name="firstName" defaultValue={editing?.firstName} required /></Field>
        <Field label="Apellido"><input name="lastName" defaultValue={editing?.lastName} required /></Field>
        <Field label="Email de acceso" wide><input name="email" type="email" defaultValue={editing?.email} required /></Field>
        <Field label="Teléfono"><input name="phone" defaultValue={editing?.phone} /></Field>
        <Field label={editing ? "Nueva contraseña (opcional)" : "Contraseña inicial (10+ caracteres, letra y número)"}>
          <input
            name="password"
            type="password"
            minLength={10}
            maxLength={128}
            pattern="(?=.*[A-Za-z])(?=.*[0-9]).{10,128}"
            title="Usá entre 10 y 128 caracteres, con al menos una letra y un número."
            autoComplete="new-password"
            required={!editing}
          />
        </Field>
        <Field label="Sedes" wide>
          <select name="branchIds" multiple required defaultValue={editing?.branchIds ?? []} size={Math.min(5, Math.max(2, branches.length))}>
            {branches.map((branch) => <option value={branch._id} key={branch._id}>{branch.name}</option>)}
          </select>
        </Field>
      </LiveModal>
    </>
  );
}
