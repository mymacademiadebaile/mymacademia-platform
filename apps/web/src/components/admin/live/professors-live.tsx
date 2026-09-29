"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import type { Professor } from "./live-types";
import { ErrorBlock, Field, LiveModal, LoadingBlock } from "./live-common";
import styles from "./live.module.css";

export function ProfessorsLive() {
  const [items, setItems] = useState<Professor[]>([]);
  const [modal, setModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      setItems(await apiFetch<Professor[]>("/admin/professors"));
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError("");

    try {
      await apiFetch<Professor>("/admin/professors", {
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
          branchIds: []
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
        eyebrow="EQUIPO"
        title="Profesores"
        description="Creá accesos reales y administrá el equipo desde el mismo lugar."
        actionLabel="Nuevo profesor"
        onAction={() => setModal(true)}
      />

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}
      {loading && !items.length && <LoadingBlock />}

      {!loading && (
        <div className={styles.liveGrid3}>
          {items.map((professor) => (
            <article className={styles.card} key={professor._id}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className={styles.avatar}>{professor.displayName.slice(0, 2).toUpperCase()}</span>
                <span className={professor.isActive ? styles.pill : styles.pillOff}>
                  {professor.isActive ? "Activo" : "Inactivo"}
                </span>
              </div>
              <strong style={{ display: "block", marginTop: 14, fontSize: 14 }}>
                {professor.displayName}
              </strong>
              <span style={{ display: "block", marginTop: 4, color: "#817887", fontSize: 9 }}>
                {professor.userId?.email || professor.phone || "Sin contacto"}
              </span>
              {professor.bio && (
                <p style={{ color: "#756b7c", fontSize: 9, lineHeight: 1.5 }}>
                  {professor.bio}
                </p>
              )}
            </article>
          ))}
        </div>
      )}

      <LiveModal
        open={modal}
        title="Agregar profesor"
        description="Se crea el perfil y su usuario de acceso al mismo tiempo."
        submitting={submitting}
        onClose={() => setModal(false)}
        onSubmit={create}
      >
        <Field label="Nombre"><input name="firstName" required /></Field>
        <Field label="Apellido"><input name="lastName" required /></Field>
        <Field label="Nombre visible"><input name="displayName" required /></Field>
        <Field label="Teléfono"><input name="phone" /></Field>
        <Field label="Email de acceso"><input name="email" type="email" required /></Field>
        <Field label="Contraseña inicial"><input name="password" type="password" minLength={8} required /></Field>
        <Field label="Instagram"><input name="instagram" /></Field>
        <Field label="Bio" wide><textarea name="bio" rows={4} /></Field>
      </LiveModal>
    </>
  );
}
