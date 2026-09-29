"use client";

import {
  ArrowLeft,
  CalendarDays,
  Camera,
  Check,
  KeyRound,
  Mail,
  MapPin,
  Trash2,
  Video,
  Power,
  UsersRound
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import type { Branch, CatalogItem, DanceClass, Professor } from "./live-types";
import { ErrorBlock, Field, LiveModal, LoadingBlock } from "./live-common";
import styles from "./professor-detail.module.css";

type ProfessorDetail = {
  professor: Professor;
  branches: Branch[];
  classes: DanceClass[];
  stats: {
    classes: number;
    students: number;
    disciplines: number;
    branches: number;
  };
};

function disciplineName(value: CatalogItem | string) {
  return typeof value === "string" ? value : value.name;
}

export function ProfessorDetailLive({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<ProfessorDetail | null>(null);
  const [allBranches, setAllBranches] = useState<Branch[]>([]);
  const [catalogs, setCatalogs] = useState<CatalogItem[]>([]);
  const [editing, setEditing] = useState(false);
  const [passwordModal, setPasswordModal] = useState(false);
  const [mediaBusy, setMediaBusy] = useState<"avatar" | "video" | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setError("");

    try {
      const [detail, branches, catalogItems] = await Promise.all([
        apiFetch<ProfessorDetail>(`/admin/professors/${id}`),
        apiFetch<Branch[]>("/admin/branches"),
        apiFetch<CatalogItem[]>("/admin/catalogs")
      ]);

      setData(detail);
      setAllBranches(branches.filter((branch) => branch.isActive));
      setCatalogs(catalogItems.filter((item) => item.type === "DISCIPLINE" && item.isActive));
    } catch (requestError) {
      setError(apiMessage(requestError));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeClasses = useMemo(
    () => data?.classes.filter((danceClass) => danceClass.status === "ACTIVE") ?? [],
    [data]
  );

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setNotice("");

    try {
      await apiFetch(`/admin/professors/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          firstName: form.get("firstName"),
          lastName: form.get("lastName"),
          displayName: form.get("displayName"),
          email: form.get("email"),
          phone: form.get("phone"),
          instagram: form.get("instagram"),
          bio: form.get("bio"),
          branchIds: form.getAll("branchIds"),
          disciplineIds: form.getAll("disciplineIds")
        })
      });
      setEditing(false);
      setNotice("Perfil del profesor actualizado.");
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    if (!data) return;
    setBusy(true);
    setError("");

    try {
      await apiFetch(`/admin/professors/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !data.professor.isActive })
      });
      setNotice(data.professor.isActive ? "Profesor inactivado." : "Profesor reactivado.");
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function uploadMedia(kind: "avatar" | "intro-video", file?: File) {
    if (!file) return;

    const form = new FormData();
    form.append("file", file);
    setMediaBusy(kind === "avatar" ? "avatar" : "video");
    setError("");
    setNotice("");

    try {
      await apiFetch(`/admin/professors/${id}/${kind}`, {
        method: "POST",
        body: form
      });
      setNotice(kind === "avatar" ? "Foto actualizada." : "Video de presentación actualizado.");
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setMediaBusy("");
    }
  }

  async function removeMedia(kind: "avatar" | "intro-video") {
    const confirmed = window.confirm(
      kind === "avatar"
        ? "¿Querés quitar la foto del profesor?"
        : "¿Querés quitar el video de presentación?"
    );
    if (!confirmed) return;

    setMediaBusy(kind === "avatar" ? "avatar" : "video");
    setError("");
    setNotice("");

    try {
      await apiFetch<void>(`/admin/professors/${id}/${kind}`, {
        method: "DELETE"
      });
      setNotice(kind === "avatar" ? "Foto eliminada." : "Video eliminado.");
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setMediaBusy("");
    }
  }

  async function deleteProfessor() {
    if (!data) return;

    const confirmed = window.confirm(
      `¿Eliminar definitivamente a ${data.professor.displayName}? Esta acción sólo se permitirá si no tiene clases vinculadas.`
    );
    if (!confirmed) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await apiFetch<void>(`/admin/professors/${id}`, { method: "DELETE" });
      router.replace("/admin/professors");
      router.refresh();
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");

    if (newPassword !== confirmPassword) {
      setError("La confirmación de la contraseña no coincide.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      await apiFetch<void>(`/admin/professors/${id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ newPassword })
      });
      setPasswordModal(false);
      setNotice("Contraseña del profesor actualizada.");
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return error ? <ErrorBlock message={error} onRetry={() => void load()} /> : <LoadingBlock />;
  }

  const { professor, stats } = data;
  const user = professor.userId;
  const selectedBranchIds = new Set(user?.branchIds ?? []);
  const selectedDisciplineIds = new Set(
    professor.disciplineIds.map((value) => typeof value === "string" ? value : value._id)
  );

  return (
    <>
      <Link href="/admin/professors" className={styles.back}>
        <ArrowLeft size={15} /> Volver a profesores
      </Link>

      <PageHeader
        eyebrow="PERFIL DE PROFESOR"
        title={professor.displayName}
        description="Acceso, disciplinas, sedes, clases y alcance real dentro de la academia."
      />

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}
      {notice && <div className={styles.notice}><Check size={16} /> {notice}</div>}

      <section className={styles.hero}>
        {professor.avatarUrl ? (
          <img className={styles.avatarImage} src={professor.avatarUrl} alt={professor.displayName} />
        ) : (
          <span className={styles.avatar}>{professor.displayName.slice(0, 2).toUpperCase()}</span>
        )}
        <div>
          <span className={professor.isActive ? styles.active : styles.inactive}>
            {professor.isActive ? "Profesor activo" : "Profesor inactivo"}
          </span>
          <h2>{professor.displayName}</h2>
          <p>{user?.email || professor.phone || "Sin contacto"}</p>
        </div>
        <div className={styles.actions}>
          {user?.email && <a href={`mailto:${user.email}`}><Mail size={15} /> Email</a>}
          <button onClick={() => setEditing(true)}>Editar</button>
          <button onClick={() => setPasswordModal(true)}><KeyRound size={15} /> Acceso</button>
          <button className={styles.danger} disabled={busy} onClick={() => void toggleActive()}>
            <Power size={15} /> {professor.isActive ? "Inactivar" : "Reactivar"}
          </button>
          <button className={styles.deleteAction} disabled={busy} onClick={() => void deleteProfessor()}>
            <Trash2 size={15} /> Eliminar
          </button>
        </div>
      </section>

      <div className={styles.stats}>
        <article><CalendarDays size={17} /><span>Clases activas</span><strong>{stats.classes}</strong></article>
        <article><UsersRound size={17} /><span>Alumnos actuales</span><strong>{stats.students}</strong></article>
        <article><span className={styles.metricIcon}>D</span><span>Disciplinas</span><strong>{stats.disciplines}</strong></article>
        <article><MapPin size={17} /><span>Sedes</span><strong>{stats.branches}</strong></article>
      </div>

      <div className={styles.grid}>
        <section className={styles.card}>
          <div className={styles.cardHeader}><span>DATOS</span><h3>Perfil y acceso</h3></div>
          <dl>
            <div><dt>Nombre</dt><dd>{user ? `${user.firstName} ${user.lastName}` : "—"}</dd></div>
            <div><dt>Email</dt><dd>{user?.email || "—"}</dd></div>
            <div><dt>Teléfono</dt><dd>{professor.phone || user?.phone || "—"}</dd></div>
            <div><dt>Instagram</dt><dd>{professor.instagram || "—"}</dd></div>
            <div className={styles.full}><dt>Bio</dt><dd>{professor.bio || "Sin biografía"}</dd></div>
          </dl>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}><span>ALCANCE</span><h3>Sedes y disciplinas</h3></div>
          <div className={styles.subsection}>
            <strong>Sedes</strong>
            <div className={styles.tags}>
              {data.branches.map((branch) => <span key={branch._id}>{branch.name}</span>)}
            </div>
          </div>
          <div className={styles.subsection}>
            <strong>Disciplinas</strong>
            <div className={styles.tags}>
              {professor.disciplineIds.length === 0 && <small>Sin disciplinas asignadas</small>}
              {professor.disciplineIds.map((discipline) => (
                <span key={typeof discipline === "string" ? discipline : discipline._id}>
                  {disciplineName(discipline)}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.card + " " + styles.mediaCard}>
          <div className={styles.cardHeader}><span>CONTENIDO</span><h3>Material comercial</h3></div>
          <div className={styles.mediaGrid}>
            <div className={styles.mediaPanel}>
              <strong>Foto de perfil</strong>
              <div className={styles.mediaPreview}>
                {professor.avatarUrl ? (
                  <img src={professor.avatarUrl} alt={professor.displayName} />
                ) : (
                  <span><Camera size={23} /> Sin foto</span>
                )}
              </div>
              <div className={styles.mediaActions}>
                <label>
                  <Camera size={14} />
                  {mediaBusy === "avatar" ? "Subiendo..." : "Cargar foto"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={Boolean(mediaBusy)}
                    onChange={(event) => {
                      void uploadMedia("avatar", event.target.files?.[0]);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                {professor.avatarUrl && (
                  <button disabled={Boolean(mediaBusy)} onClick={() => void removeMedia("avatar")}>
                    <Trash2 size={14} /> Quitar
                  </button>
                )}
              </div>
            </div>

            <div className={styles.mediaPanel}>
              <strong>Video corto de presentación</strong>
              <div className={styles.videoPreview}>
                {professor.introVideoUrl ? (
                  <video src={professor.introVideoUrl} controls preload="metadata" />
                ) : (
                  <span><Video size={23} /> Sin video</span>
                )}
              </div>
              <div className={styles.mediaActions}>
                <label>
                  <Video size={14} />
                  {mediaBusy === "video" ? "Subiendo..." : "Cargar video"}
                  <input
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime"
                    disabled={Boolean(mediaBusy)}
                    onChange={(event) => {
                      void uploadMedia("intro-video", event.target.files?.[0]);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                {professor.introVideoUrl && (
                  <button disabled={Boolean(mediaBusy)} onClick={() => void removeMedia("intro-video")}>
                    <Trash2 size={14} /> Quitar
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className={styles.card + " " + styles.classesCard}>
          <div className={styles.cardHeader}><span>AGENDA</span><h3>Clases asignadas</h3></div>
          <div className={styles.classList}>
            {activeClasses.length === 0 && <p>Este profesor no tiene clases activas asignadas.</p>}
            {activeClasses.map((danceClass) => (
              <Link href={`/admin/classes/${danceClass._id}`} key={danceClass._id}>
                <span className={styles.classIcon}><CalendarDays size={17} /></span>
                <span>
                  <strong>{danceClass.name}</strong>
                  <small>
                    {danceClass.schedules?.map((schedule) => `${schedule.day} ${schedule.startTime}`).join(" · ") || "Sin horario"}
                  </small>
                </span>
                <b>Cupo {danceClass.capacity}</b>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <LiveModal
        open={editing}
        title="Editar profesor"
        description="Actualizá perfil, acceso, sedes y disciplinas."
        submitting={busy}
        onClose={() => setEditing(false)}
        onSubmit={save}
      >
        <Field label="Nombre"><input name="firstName" defaultValue={user?.firstName ?? ""} required /></Field>
        <Field label="Apellido"><input name="lastName" defaultValue={user?.lastName ?? ""} required /></Field>
        <Field label="Nombre visible"><input name="displayName" defaultValue={professor.displayName} required /></Field>
        <Field label="Email"><input name="email" type="email" defaultValue={user?.email ?? ""} required /></Field>
        <Field label="Teléfono"><input name="phone" defaultValue={professor.phone ?? user?.phone ?? ""} /></Field>
        <Field label="Instagram"><input name="instagram" defaultValue={professor.instagram ?? ""} /></Field>
        <Field label="Sedes" wide>
          <select name="branchIds" multiple size={Math.min(4, Math.max(2, allBranches.length))} defaultValue={[...selectedBranchIds]} required>
            {allBranches.map((branch) => <option value={branch._id} key={branch._id}>{branch.name}</option>)}
          </select>
        </Field>
        <Field label="Disciplinas" wide>
          <select name="disciplineIds" multiple size={Math.min(6, Math.max(3, catalogs.length))} defaultValue={[...selectedDisciplineIds]}>
            {catalogs.map((item) => <option value={item._id} key={item._id}>{item.name}</option>)}
          </select>
        </Field>
        <Field label="Bio" wide><textarea name="bio" rows={4} defaultValue={professor.bio ?? ""} /></Field>
      </LiveModal>

      <LiveModal
        open={passwordModal}
        title="Restablecer acceso"
        description="Definí una nueva contraseña para el profesor y compartila por un canal seguro."
        submitting={busy}
        onClose={() => setPasswordModal(false)}
        onSubmit={resetPassword}
      >
        <Field label="Nueva contraseña" wide>
          <input name="newPassword" type="password" minLength={10} required autoComplete="new-password" />
        </Field>
        <Field label="Repetir contraseña" wide>
          <input name="confirmPassword" type="password" minLength={10} required autoComplete="new-password" />
        </Field>
      </LiveModal>
    </>
  );
}
