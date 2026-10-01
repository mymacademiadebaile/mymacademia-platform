"use client";

import { Camera, LoaderCircle, MapPin, Pencil, Trash2, Upload, Video } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { apiFetch, apiMessage, uploadProfessorIntroVideo } from "@/lib/api";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import type { ProfileData } from "../professor-types";
import {
  Avatar,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  PageSkeleton,
  ProfessorPageHeader,
  uiStyles
} from "../professor-ui";
import { useProfessorData } from "../use-professor-data";
import styles from "./professor-profile.module.css";

const BIO_MAX = 600;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const IMAGE_MAX = 5 * 1024 * 1024;
const VIDEO_MAX = 60 * 1024 * 1024;

type Busy = "" | "save" | "photo-up" | "photo-del" | "video-up" | "video-del";
type Form = { displayName: string; phone: string; instagram: string; bio: string };

function toForm(profile: ProfileData["professor"]): Form {
  return {
    displayName: profile.displayName,
    phone: profile.phone,
    instagram: profile.instagram,
    bio: profile.bio
  };
}

function Spinner({ label }: { label: string }) {
  return (
    <>
      <LoaderCircle size={16} className={uiStyles.spin} aria-hidden />
      {label}
    </>
  );
}

export function ProfessorProfile() {
  const { data, error, loading, refreshing, reload } = useProfessorData<ProfileData>("/profile");
  const { toast, confirm } = useAdminFeedback();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Form>({ displayName: "", phone: "", instagram: "", bio: "" });
  const [busy, setBusy] = useState<Busy>("");
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) firstFieldRef.current?.focus();
  }, [editing]);

  if (loading) return <PageSkeleton blocks={2} />;
  if (!data) return <ErrorState message={error || "Sin datos"} onRetry={() => void reload()} />;

  const { professor, user, branches } = data;
  const specialtyLine = professor.specialties.map((item) => item.name).join(" · ");
  const branchLine = branches.map((item) => item.name).join(" · ");
  const anyBusy = busy !== "";

  function startEdit() {
    setForm(toForm(professor));
    setEditing(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form.displayName.trim()) {
      toast({ title: "Ingresá el nombre visible", tone: "warning" });
      return;
    }
    setBusy("save");
    try {
      await apiFetch("/professor/profile", {
        method: "PATCH",
        body: JSON.stringify({
          displayName: form.displayName.trim(),
          phone: form.phone.trim(),
          instagram: form.instagram.trim(),
          bio: form.bio.trim()
        })
      });
      toast({ title: "Perfil actualizado", tone: "success" });
      setEditing(false);
      await reload();
    } catch (requestError) {
      toast({ title: apiMessage(requestError), tone: "error" });
    } finally {
      setBusy("");
    }
  }

  async function upload(kind: "photo" | "video", file: File | undefined) {
    if (!file) return;
    const isPhoto = kind === "photo";
    if (!(isPhoto ? IMAGE_TYPES : VIDEO_TYPES).includes(file.type)) {
      toast({
        title: isPhoto ? "La foto debe ser JPG, PNG o WEBP" : "El video debe ser MP4, WEBM o MOV",
        tone: "error"
      });
      return;
    }
    if (file.size > (isPhoto ? IMAGE_MAX : VIDEO_MAX)) {
      toast({
        title: isPhoto ? "La foto supera el máximo de 5 MB" : "El video supera el máximo de 60 MB",
        tone: "error"
      });
      return;
    }
    setBusy(isPhoto ? "photo-up" : "video-up");
    try {
      if (isPhoto) {
        const body = new FormData();
        body.append("file", file);
        await apiFetch("/professor/profile/avatar", { method: "POST", body });
      } else {
        await uploadProfessorIntroVideo(
          "/professor/profile/intro-video/signature",
          "/professor/profile/intro-video/complete",
          file
        );
      }
      toast({ title: isPhoto ? "Foto actualizada" : "Video actualizado", tone: "success" });
      await reload();
    } catch (requestError) {
      toast({ title: apiMessage(requestError), tone: "error" });
    } finally {
      setBusy("");
    }
  }

  async function remove(kind: "photo" | "video") {
    const isPhoto = kind === "photo";
    const ok = await confirm({
      title: isPhoto ? "Eliminar foto" : "Eliminar video",
      description: isPhoto
        ? "Se quitará tu foto de perfil. Podés subir otra cuando quieras."
        : "Se quitará tu video de presentación. Podés subir otro cuando quieras.",
      confirmLabel: "Eliminar",
      tone: "danger"
    });
    if (!ok) return;
    setBusy(isPhoto ? "photo-del" : "video-del");
    try {
      await apiFetch(`/professor/profile/${isPhoto ? "avatar" : "intro-video"}`, {
        method: "DELETE"
      });
      toast({ title: isPhoto ? "Foto eliminada" : "Video eliminado", tone: "success" });
      await reload();
    } catch (requestError) {
      toast({ title: apiMessage(requestError), tone: "error" });
    } finally {
      setBusy("");
    }
  }

  const readOnlyRows: Array<[string, string]> = [
    ["Nombre visible", professor.displayName],
    ["Teléfono", professor.phone],
    ["Instagram", professor.instagram]
  ];

  return (
    <>
      <ProfessorPageHeader title="Mi perfil" refreshing={refreshing} />

      <section className={styles.hero}>
        <Avatar name={professor.displayName} url={professor.avatarUrl} size={96} />
        <div className={styles.heroText}>
          <h2>{professor.displayName}</h2>
          <span className={styles.role}>Profesor</span>
          {specialtyLine && <p>{specialtyLine}</p>}
          {branchLine && (
            <p className={styles.heroBranch}>
              <MapPin size={15} aria-hidden /> {branchLine}
            </p>
          )}
        </div>
        {!editing && (
          <button type="button" className={uiStyles.secondaryButton} onClick={startEdit}>
            <Pencil size={16} aria-hidden /> Editar perfil
          </button>
        )}
      </section>

      <div className={styles.grid}>
        <div className={styles.column}>
          <Card title="Información profesional">
            {editing ? (
              <form className={styles.form} onSubmit={save}>
                <label>
                  Nombre visible
                  <input
                    ref={firstFieldRef}
                    value={form.displayName}
                    maxLength={120}
                    onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                    required
                  />
                </label>
                <div className={styles.twoCols}>
                  <label>
                    Teléfono
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    />
                  </label>
                  <label>
                    Instagram
                    <input
                      value={form.instagram}
                      placeholder="@usuario"
                      onChange={(e) => setForm({ ...form, instagram: e.target.value })}
                    />
                  </label>
                </div>
                <label>
                  Bio
                  <textarea
                    rows={5}
                    maxLength={BIO_MAX}
                    value={form.bio}
                    onChange={(e) => setForm({ ...form, bio: e.target.value })}
                  />
                  <small className={styles.counter}>
                    {form.bio.length}/{BIO_MAX}
                  </small>
                </label>
                <div className={styles.formActions}>
                  <button type="submit" className={uiStyles.primaryButton} disabled={anyBusy}>
                    {busy === "save" ? <Spinner label="Guardando..." /> : "Guardar"}
                  </button>
                  <button
                    type="button"
                    className={uiStyles.secondaryButton}
                    disabled={anyBusy}
                    onClick={() => setEditing(false)}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              <dl className={styles.dl}>
                {readOnlyRows.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value || "—"}</dd>
                  </div>
                ))}
                <div>
                  <dt>Bio</dt>
                  <dd className={styles.bio}>{professor.bio || "—"}</dd>
                </div>
              </dl>
            )}
            <div className={styles.emailRow}>
              <span>Email</span>
              <strong>{user.email || "—"}</strong>
              <small>El email lo gestiona administración.</small>
            </div>
          </Card>

          <Card title="Especialidades">
            {professor.specialties.length ? (
              <div className={styles.chips}>
                {professor.specialties.map((item) => (
                  <Chip key={item.id}>{item.name}</Chip>
                ))}
              </div>
            ) : (
              <p className={styles.muted}>
                Todavía no tenés especialidades asignadas. Se completan con las disciplinas de tus
                clases.
              </p>
            )}
          </Card>

          <Card title="Sedes">
            {branches.length ? (
              <ul className={styles.branches}>
                {branches.map((branch) => (
                  <li key={branch.id}>
                    <MapPin size={16} aria-hidden />
                    <div>
                      <strong>{branch.name}</strong>
                      <span>{branch.address || "Sin dirección"}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.muted}>Todavía no tenés sedes asignadas.</p>
            )}
          </Card>
        </div>

        <div className={styles.column}>
          <Card title="Foto y video">
            <div className={styles.media}>
              <h3>Foto de perfil</h3>
              <div className={styles.photoRow}>
                <Avatar name={professor.displayName} url={professor.avatarUrl} size={120} />
                <div className={styles.mediaActions}>
                  <button
                    type="button"
                    className={uiStyles.secondaryButton}
                    disabled={anyBusy}
                    onClick={() => photoInput.current?.click()}
                  >
                    {busy === "photo-up" ? (
                      <Spinner label="Subiendo..." />
                    ) : (
                      <>
                        <Camera size={16} aria-hidden /> Cambiar foto
                      </>
                    )}
                  </button>
                  {professor.avatarUrl && (
                    <button
                      type="button"
                      className={styles.dangerButton}
                      disabled={anyBusy}
                      onClick={() => void remove("photo")}
                    >
                      {busy === "photo-del" ? (
                        <Spinner label="Eliminando..." />
                      ) : (
                        <>
                          <Trash2 size={16} aria-hidden /> Eliminar
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
              <p className={styles.hint}>JPG, PNG o WEBP. Máximo 5 MB.</p>
              <input
                ref={photoInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className={styles.fileInput}
                aria-label="Seleccionar foto de perfil"
                onChange={(e) => {
                  void upload("photo", e.target.files?.[0]);
                  e.target.value = "";
                }}
              />

              <h3>Video de presentación</h3>
              {professor.introVideoUrl ? (
                <>
                  <video
                    className={styles.video}
                    src={professor.introVideoUrl}
                    controls
                    preload="metadata"
                  />
                  <div className={styles.mediaActions}>
                    <button
                      type="button"
                      className={uiStyles.secondaryButton}
                      disabled={anyBusy}
                      onClick={() => videoInput.current?.click()}
                    >
                      {busy === "video-up" ? (
                        <Spinner label="Subiendo..." />
                      ) : (
                        <>
                          <Upload size={16} aria-hidden /> Cambiar video
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      className={styles.dangerButton}
                      disabled={anyBusy}
                      onClick={() => void remove("video")}
                    >
                      {busy === "video-del" ? (
                        <Spinner label="Eliminando..." />
                      ) : (
                        <>
                          <Trash2 size={16} aria-hidden /> Eliminar
                        </>
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <div className={styles.videoEmpty}>
                  <EmptyState
                    icon={<Video size={22} aria-hidden />}
                    title="Todavía no cargaste un video de presentación."
                    action={
                      <button
                        type="button"
                        className={uiStyles.primaryButton}
                        disabled={anyBusy}
                        onClick={() => videoInput.current?.click()}
                      >
                        {busy === "video-up" ? <Spinner label="Subiendo..." /> : "Agregar video"}
                      </button>
                    }
                  />
                </div>
              )}
              <p className={styles.hint}>MP4, WEBM o MOV. Máximo 60 MB.</p>
              <input
                ref={videoInput}
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                className={styles.fileInput}
                aria-label="Seleccionar video de presentación"
                onChange={(e) => {
                  void upload("video", e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
