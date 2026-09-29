"use client";

import {
  CalendarDays,
  Camera,
  Check,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Home,
  LogOut,
  Save,
  Trash2,
  UsersRound,
  Video
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, apiMessage } from "@/lib/api";
import styles from "./professor.module.css";

type View = "home" | "classes" | "students" | "profile";

type NamedItem = {
  _id: string;
  name: string;
};

type ProfessorClass = {
  _id: string;
  name: string;
  capacity: number;
  activeEnrollmentCount: number;
  schedules: Array<{
    day: string;
    startTime: string;
    endTime: string;
  }>;
  disciplineIds: NamedItem[];
  segmentIds: NamedItem[];
  levelIds: NamedItem[];
};

type ProfessorStudent = {
  _id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
};

type DashboardData = {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
  };
  professor: {
    id: string;
    displayName: string;
    bio?: string;
    instagram?: string;
    avatarUrl?: string;
    introVideoUrl?: string;
    disciplines: NamedItem[];
  };
  branches: Array<{
    _id: string;
    name: string;
    address?: string;
    isActive: boolean;
  }>;
  classes: ProfessorClass[];
  students: ProfessorStudent[];
};

const dayLabel: Record<string, string> = {
  MONDAY: "Lun",
  TUESDAY: "Mar",
  WEDNESDAY: "Mié",
  THURSDAY: "Jue",
  FRIDAY: "Vie",
  SATURDAY: "Sáb",
  SUNDAY: "Dom"
};

function scheduleText(item: ProfessorClass) {
  if (!item.schedules.length) return "Sin horario cargado";
  return item.schedules
    .map((schedule) => `${dayLabel[schedule.day] ?? schedule.day} ${schedule.startTime}–${schedule.endTime}`)
    .join(" · ");
}

function groupText(item: ProfessorClass) {
  const values = [
    ...item.segmentIds.map((value) => value.name),
    ...item.levelIds.map((value) => value.name)
  ];
  return values.join(" · ") || "Grupo sin categorías";
}

export default function ProfessorPage() {
  const router = useRouter();
  const [activeView, setActiveView] = useState<View>("home");
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [profileBusy, setProfileBusy] = useState<"save" | "avatar" | "video" | "">("");

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await apiFetch<DashboardData>("/professor/dashboard"));
    } catch (requestError) {
      setError(apiMessage(requestError));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const title = useMemo(() => {
    if (activeView === "classes") return "Mis clases";
    if (activeView === "students") return "Mis alumnos";
    if (activeView === "profile") return "Mi perfil";
    return data ? `Hola, ${data.user.firstName}` : "Mi espacio";
  }, [activeView, data]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setProfileBusy("save");
    setError("");
    setNotice("");

    try {
      await apiFetch("/professor/profile", {
        method: "PATCH",
        body: JSON.stringify({
          displayName: form.get("displayName"),
          phone: form.get("phone"),
          instagram: form.get("instagram"),
          bio: form.get("bio")
        })
      });
      setNotice("Perfil actualizado.");
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setProfileBusy("");
    }
  }

  async function uploadProfileMedia(kind: "avatar" | "intro-video", file?: File) {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    setProfileBusy(kind === "avatar" ? "avatar" : "video");
    setError("");
    setNotice("");

    try {
      await apiFetch(`/professor/profile/${kind}`, {
        method: "POST",
        body: form
      });
      setNotice(kind === "avatar" ? "Foto actualizada." : "Video actualizado.");
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setProfileBusy("");
    }
  }

  async function removeProfileMedia(kind: "avatar" | "intro-video") {
    const confirmed = window.confirm(
      kind === "avatar" ? "¿Quitar tu foto?" : "¿Quitar tu video de presentación?"
    );
    if (!confirmed) return;

    setProfileBusy(kind === "avatar" ? "avatar" : "video");
    setError("");
    setNotice("");

    try {
      await apiFetch<void>(`/professor/profile/${kind}`, { method: "DELETE" });
      setNotice(kind === "avatar" ? "Foto eliminada." : "Video eliminado.");
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setProfileBusy("");
    }
  }

  async function logout() {
    await apiFetch<void>("/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  if (!data && !error) {
    return (
      <main className={styles.stage}>
        <div className={styles.loadingState}>Cargando tu espacio...</div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className={styles.stage}>
        <div className={styles.errorState}>
          <strong>No pudimos cargar tu perfil</strong>
          <span>{error}</span>
          <button onClick={() => void load()}>Reintentar</button>
        </div>
      </main>
    );
  }

  const nextClass = data.classes[0] ?? null;

  return (
    <main className={styles.stage}>
      <section className={styles.workspace}>
        <header className={styles.header}>
          <div>
            <span className={styles.kicker}>M&M ACADEMIA</span>
            <h1>{title}</h1>
          </div>
          <button className={styles.iconButton} aria-label="Cerrar sesión" onClick={() => void logout()}>
            <LogOut size={20} />
          </button>
        </header>

        <div className={styles.scrollArea}>
          {notice && <div className={styles.successNotice}><Check size={15} /> {notice}</div>}
          {error && data && <div className={styles.inlineError}>{error}</div>}
          {activeView === "home" && (
            <div className={styles.homeGrid}>
              <section className={styles.heroCard}>
                <div className={styles.heroTop}>
                  <span className={styles.heroLabel}>PRÓXIMA CLASE</span>
                  {nextClass?.schedules[0] && (
                    <span className={styles.timePill}>
                      <Clock3 size={15} />
                      {nextClass.schedules[0].startTime}
                    </span>
                  )}
                </div>
                <h2>{nextClass?.name ?? "Sin clases asignadas"}</h2>
                <p>{nextClass ? groupText(nextClass) : "Cuando te asignen una clase aparecerá acá."}</p>
                {nextClass && (
                  <div className={styles.heroFooter}>
                    <strong>{nextClass.activeEnrollmentCount} alumnos</strong>
                    <button className={styles.roundArrow} aria-label="Ver clases" onClick={() => setActiveView("classes")}>
                      <ChevronRight size={20} />
                    </button>
                  </div>
                )}
              </section>

              <section className={styles.overviewSection}>
                <div className={styles.sectionHeading}>
                  <div>
                    <span className={styles.smallLabel}>RESUMEN</span>
                    <h3>Tu actividad</h3>
                  </div>
                </div>
                <div className={styles.statsGrid}>
                  <article>
                    <CalendarDays size={20} />
                    <strong>{data.classes.length}</strong>
                    <span>clases</span>
                  </article>
                  <article>
                    <UsersRound size={20} />
                    <strong>{data.students.length}</strong>
                    <span>alumnos</span>
                  </article>
                  <article>
                    <CircleUserRound size={20} />
                    <strong>{data.professor.disciplines.length}</strong>
                    <span>disciplinas</span>
                  </article>
                </div>
              </section>

              <section className={styles.actionsSection}>
                <div className={styles.sectionHeading}>
                  <div>
                    <span className={styles.smallLabel}>ACCESOS</span>
                    <h3>Tu información real</h3>
                  </div>
                </div>
                <div className={styles.actionsGrid}>
                  <button onClick={() => setActiveView("students")}>
                    <span className={styles.actionIcon}><UsersRound size={21} /></span>
                    <span>Mis alumnos</span>
                    <ChevronRight size={18} />
                  </button>
                  <button onClick={() => setActiveView("classes")}>
                    <span className={styles.actionIcon}><CalendarDays size={21} /></span>
                    <span>Mis clases</span>
                    <ChevronRight size={18} />
                  </button>
                </div>
              </section>

              <section className={styles.agendaSection}>
                <div className={styles.sectionHeading}>
                  <div>
                    <span className={styles.smallLabel}>AGENDA</span>
                    <h3>Clases asignadas</h3>
                  </div>
                </div>
                <div className={styles.list}>
                  {data.classes.length === 0 && (
                    <div className={styles.emptyState}>No tenés clases activas asignadas.</div>
                  )}
                  {data.classes.map((item) => (
                    <button className={styles.listItem} key={item._id} onClick={() => setActiveView("classes")}>
                      <span className={styles.timeBlock}>{item.schedules[0]?.startTime ?? "—"}</span>
                      <span className={styles.listBody}>
                        <strong>{item.name}</strong>
                        <small>{scheduleText(item)}</small>
                      </span>
                      <span className={styles.count}>{item.activeEnrollmentCount}</span>
                      <ChevronRight size={18} />
                    </button>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activeView === "classes" && (
            <section className={styles.contentPanel}>
              <div className={styles.panelIntro}>
                <span className={styles.smallLabel}>CLASES ACTIVAS</span>
                <h2>Tus clases asignadas</h2>
                <p>Información cargada por administración y limitada a tu usuario.</p>
              </div>
              <div className={styles.classCards}>
                {data.classes.length === 0 && <div className={styles.emptyState}>No hay clases asignadas.</div>}
                {data.classes.map((item) => (
                  <article className={styles.classCard} key={item._id}>
                    <div className={styles.classCardTop}>
                      <span className={styles.largeTime}>{item.schedules[0]?.startTime ?? "—"}</span>
                      <span className={styles.livePill}>ACTIVA</span>
                    </div>
                    <h3>{item.name}</h3>
                    <p>{groupText(item)}</p>
                    <small>{scheduleText(item)}</small>
                    <div className={styles.classMeta}>
                      <UsersRound size={18} />
                      <strong>{item.activeEnrollmentCount} / {item.capacity} alumnos</strong>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeView === "students" && (
            <section className={styles.contentPanel}>
              <div className={styles.panelIntro}>
                <span className={styles.smallLabel}>ALUMNOS</span>
                <h2>Alumnos de tus clases</h2>
                <p>Solo se muestran alumnos con inscripción activa en una clase asignada a tu perfil.</p>
              </div>
              <div className={styles.studentList}>
                {data.students.length === 0 && <div className={styles.emptyState}>Todavía no tenés alumnos asignados.</div>}
                {data.students.map((student) => (
                  <div className={styles.studentRow} key={student._id}>
                    <span className={styles.studentAvatar}>{student.firstName.slice(0, 1)}</span>
                    <span className={styles.listBody}>
                      <strong>{student.firstName} {student.lastName}</strong>
                      <small>{student.email || student.phone || "Sin datos de contacto"}</small>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeView === "profile" && (
            <section className={styles.contentPanel}>
              <div className={styles.profileHero}>
                {data.professor.avatarUrl ? (
                  <img className={styles.profileAvatarImage} src={data.professor.avatarUrl} alt={data.professor.displayName} />
                ) : (
                  <span className={styles.profileAvatar}>
                    {data.user.firstName.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <h2>{data.professor.displayName}</h2>
                <p>
                  Profesor/a · {data.professor.disciplines.map((item) => item.name).join(" · ") || "Sin disciplinas asignadas"}
                </p>
              </div>

              <div className={styles.profileEditGrid}>
                <form className={styles.profileForm} onSubmit={saveProfile}>
                  <span className={styles.smallLabel}>PERFIL COMERCIAL</span>
                  <label>
                    <span>Nombre visible</span>
                    <input name="displayName" defaultValue={data.professor.displayName} required />
                  </label>
                  <label>
                    <span>Teléfono</span>
                    <input name="phone" defaultValue={data.user.phone ?? ""} />
                  </label>
                  <label>
                    <span>Instagram</span>
                    <input name="instagram" defaultValue={data.professor.instagram ?? ""} />
                  </label>
                  <label>
                    <span>Bio</span>
                    <textarea name="bio" rows={5} defaultValue={data.professor.bio ?? ""} />
                  </label>
                  <button className={styles.profileSave} disabled={Boolean(profileBusy)}>
                    <Save size={16} />
                    {profileBusy === "save" ? "Guardando..." : "Guardar perfil"}
                  </button>
                </form>

                <div className={styles.profileMedia}>
                  <span className={styles.smallLabel}>FOTO Y VIDEO</span>
                  <div className={styles.profileMediaBlock}>
                    <strong>Foto de perfil</strong>
                    <div className={styles.profileMediaPreview}>
                      {data.professor.avatarUrl ? (
                        <img src={data.professor.avatarUrl} alt={data.professor.displayName} />
                      ) : (
                        <span><Camera size={22} /> Sin foto</span>
                      )}
                    </div>
                    <div className={styles.profileMediaActions}>
                      <label>
                        <Camera size={14} />
                        {profileBusy === "avatar" ? "Subiendo..." : "Cambiar foto"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          disabled={Boolean(profileBusy)}
                          onChange={(event) => {
                            void uploadProfileMedia("avatar", event.target.files?.[0]);
                            event.currentTarget.value = "";
                          }}
                        />
                      </label>
                      {data.professor.avatarUrl && (
                        <button disabled={Boolean(profileBusy)} onClick={() => void removeProfileMedia("avatar")}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className={styles.profileMediaBlock}>
                    <strong>Video de presentación</strong>
                    <div className={styles.profileVideoPreview}>
                      {data.professor.introVideoUrl ? (
                        <video src={data.professor.introVideoUrl} controls preload="metadata" />
                      ) : (
                        <span><Video size={22} /> Sin video</span>
                      )}
                    </div>
                    <div className={styles.profileMediaActions}>
                      <label>
                        <Video size={14} />
                        {profileBusy === "video" ? "Subiendo..." : "Cambiar video"}
                        <input
                          type="file"
                          accept="video/mp4,video/webm,video/quicktime"
                          disabled={Boolean(profileBusy)}
                          onChange={(event) => {
                            void uploadProfileMedia("intro-video", event.target.files?.[0]);
                            event.currentTarget.value = "";
                          }}
                        />
                      </label>
                      {data.professor.introVideoUrl && (
                        <button disabled={Boolean(profileBusy)} onClick={() => void removeProfileMedia("intro-video")}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.profileOptions}>
                <div className={styles.profileInfoRow}>
                  <CircleUserRound size={20} />
                  <span>
                    <strong>{data.user.firstName} {data.user.lastName}</strong>
                    <small>{data.user.email}</small>
                  </span>
                </div>
                <div className={styles.profileInfoRow}>
                  <CalendarDays size={20} />
                  <span>
                    <strong>{data.branches.map((branch) => branch.name).join(", ") || "Sin sede asignada"}</strong>
                    <small>Sedes habilitadas</small>
                  </span>
                </div>
              </div>
            </section>
          )}
        </div>

        <nav className={styles.bottomNav} aria-label="Navegación profesor">
          <button className={activeView === "home" ? styles.navActive : ""} onClick={() => setActiveView("home")}>
            <Home size={21} />
            <span>Inicio</span>
          </button>
          <button className={activeView === "classes" ? styles.navActive : ""} onClick={() => setActiveView("classes")}>
            <CalendarDays size={21} />
            <span>Clases</span>
          </button>
          <button className={activeView === "students" ? styles.navActive : ""} onClick={() => setActiveView("students")}>
            <UsersRound size={21} />
            <span>Alumnos</span>
          </button>
          <button className={activeView === "profile" ? styles.navActive : ""} onClick={() => setActiveView("profile")}>
            <CircleUserRound size={21} />
            <span>Perfil</span>
          </button>
        </nav>
      </section>
    </main>
  );
}
