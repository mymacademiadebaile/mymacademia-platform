"use client";

import {
  Bell,
  CalendarDays,
  ChevronRight,
  CircleUserRound,
  Clock3,
  GraduationCap,
  Home,
  Megaphone,
  MessageCircle,
  Plus,
  Sparkles,
  UsersRound
} from "lucide-react";
import { useMemo, useState } from "react";
import styles from "./professor.module.css";

type View = "home" | "classes" | "students" | "profile";

const classes = [
  { time: "19:00", name: "Reggaetón", group: "Adultos · Inicial", students: 14 },
  { time: "20:15", name: "Urbano", group: "Adolescentes · Intermedio", students: 11 }
];

const students = [
  { name: "Micaela R.", detail: "Reggaetón · cuota al día", status: "ok" },
  { name: "Camila G.", detail: "Urbano · cuota pendiente", status: "pending" },
  { name: "Sofía M.", detail: "Reggaetón · cuota al día", status: "ok" }
];

export default function ProfessorPage() {
  const [activeView, setActiveView] = useState<View>("home");

  const title = useMemo(() => {
    if (activeView === "classes") return "Mis clases";
    if (activeView === "students") return "Mis alumnos";
    if (activeView === "profile") return "Mi perfil";
    return "Hola, Sofía";
  }, [activeView]);

  return (
    <main className={styles.stage}>
      <section className={styles.workspace}>
        <header className={styles.header}>
          <div>
            <span className={styles.kicker}>M&M ACADEMIA</span>
            <h1>{title}</h1>
          </div>
          <button className={styles.iconButton} aria-label="Notificaciones">
            <Bell size={21} />
            <span className={styles.notificationDot} />
          </button>
        </header>

        <div className={styles.scrollArea}>
          {activeView === "home" && (
            <div className={styles.homeGrid}>
              <section className={styles.heroCard}>
                <div className={styles.heroTop}>
                  <span className={styles.heroLabel}>PRÓXIMA CLASE</span>
                  <span className={styles.timePill}>
                    <Clock3 size={15} />
                    19:00
                  </span>
                </div>
                <h2>Reggaetón</h2>
                <p>Adultos · Nivel inicial</p>
                <div className={styles.heroFooter}>
                  <div className={styles.avatarStack}>
                    <span>MR</span>
                    <span>CG</span>
                    <span>SM</span>
                  </div>
                  <strong>14 alumnos</strong>
                  <button className={styles.roundArrow} aria-label="Ver clase" onClick={() => setActiveView("classes")}>
                    <ChevronRight size={20} />
                  </button>
                </div>
              </section>

              <section className={styles.overviewSection}>
                <div className={styles.sectionHeading}>
                  <div>
                    <span className={styles.smallLabel}>HOY</span>
                    <h3>Tu día en un vistazo</h3>
                  </div>
                  <span className={styles.dateChip}>Martes 29</span>
                </div>
                <div className={styles.statsGrid}>
                  <article>
                    <CalendarDays size={20} />
                    <strong>2</strong>
                    <span>clases</span>
                  </article>
                  <article>
                    <UsersRound size={20} />
                    <strong>25</strong>
                    <span>alumnos</span>
                  </article>
                  <article>
                    <Sparkles size={20} />
                    <strong>1</strong>
                    <span>novedad</span>
                  </article>
                </div>
              </section>

              <section className={styles.actionsSection}>
                <div className={styles.sectionHeading}>
                  <div>
                    <span className={styles.smallLabel}>ACCIONES</span>
                    <h3>¿Qué necesitás hacer?</h3>
                  </div>
                </div>
                <div className={styles.actionsGrid}>
                  <button onClick={() => setActiveView("students")}>
                    <span className={styles.actionIcon}><UsersRound size={21} /></span>
                    <span>Mis alumnos</span>
                    <ChevronRight size={18} />
                  </button>
                  <button>
                    <span className={styles.actionIcon}><MessageCircle size={21} /></span>
                    <span>Enviar mensaje</span>
                    <ChevronRight size={18} />
                  </button>
                  <button onClick={() => setActiveView("classes")}>
                    <span className={styles.actionIcon}><CalendarDays size={21} /></span>
                    <span>Mis clases</span>
                    <ChevronRight size={18} />
                  </button>
                  <button>
                    <span className={styles.actionIcon}><Megaphone size={21} /></span>
                    <span>Crear promoción</span>
                    <ChevronRight size={18} />
                  </button>
                </div>
              </section>

              <section className={styles.agendaSection}>
                <div className={styles.sectionHeading}>
                  <div>
                    <span className={styles.smallLabel}>AGENDA</span>
                    <h3>Clases de hoy</h3>
                  </div>
                </div>
                <div className={styles.list}>
                  {classes.map((item) => (
                    <button className={styles.listItem} key={item.time + item.name} onClick={() => setActiveView("classes")}>
                      <span className={styles.timeBlock}>{item.time}</span>
                      <span className={styles.listBody}>
                        <strong>{item.name}</strong>
                        <small>{item.group}</small>
                      </span>
                      <span className={styles.count}>{item.students}</span>
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
                <span className={styles.smallLabel}>SEMANA ACTUAL</span>
                <h2>Clases simples de consultar</h2>
                <p>Sin tablas: cada clase concentra horario, grupo y alumnos en una tarjeta táctil.</p>
              </div>
              <div className={styles.classCards}>
                {classes.map((item) => (
                  <article className={styles.classCard} key={item.time + item.name}>
                    <div className={styles.classCardTop}>
                      <span className={styles.largeTime}>{item.time}</span>
                      <span className={styles.livePill}>HOY</span>
                    </div>
                    <h3>{item.name}</h3>
                    <p>{item.group}</p>
                    <div className={styles.classMeta}>
                      <UsersRound size={18} />
                      <strong>{item.students} alumnos</strong>
                      <button>Ver grupo <ChevronRight size={16} /></button>
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
                <h2>Tu grupo, a mano</h2>
                <p>Búsqueda, datos esenciales y contacto rápido desde cualquier dispositivo.</p>
              </div>
              <button className={styles.addButton}>
                <Plus size={20} />
                Nuevo alumno
              </button>
              <div className={styles.studentList}>
                {students.map((student) => (
                  <button className={styles.studentRow} key={student.name}>
                    <span className={styles.studentAvatar}>{student.name.slice(0, 1)}</span>
                    <span className={styles.listBody}>
                      <strong>{student.name}</strong>
                      <small>{student.detail}</small>
                    </span>
                    <span className={student.status === "ok" ? styles.statusOk : styles.statusPending}>
                      {student.status === "ok" ? "OK" : "Pend."}
                    </span>
                    <ChevronRight size={18} />
                  </button>
                ))}
              </div>
            </section>
          )}

          {activeView === "profile" && (
            <section className={styles.contentPanel}>
              <div className={styles.profileHero}>
                <span className={styles.profileAvatar}>S</span>
                <h2>Sofía Martínez</h2>
                <p>Profesora · Reggaetón & Urbano</p>
              </div>
              <div className={styles.profileOptions}>
                <button><CircleUserRound size={20} /><span>Datos personales</span><ChevronRight size={18} /></button>
                <button><GraduationCap size={20} /><span>Mis disciplinas</span><ChevronRight size={18} /></button>
                <button><Bell size={20} /><span>Notificaciones</span><ChevronRight size={18} /></button>
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
          <button className={styles.fab} aria-label="Acción rápida">
            <Plus size={26} />
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
