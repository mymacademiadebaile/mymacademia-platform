"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleDollarSign,
  CalendarDays,
  Clock3,
  Download,
  Filter,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  UsersRound
} from "lucide-react";
import { useState } from "react";
import styles from "./admin-ui.module.css";

export function PageHeader({
  eyebrow,
  title,
  description,
  actionLabel,
  onAction
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className={styles.pageHeader}>
      <div>
        {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actionLabel && (
        <button className={styles.primaryButton} onClick={onAction}>
          <Plus size={18} />
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function StatCard({
  label,
  value,
  detail,
  trend,
  tone = "purple"
}: {
  label: string;
  value: string;
  detail: string;
  trend?: "up" | "down";
  tone?: "purple" | "green" | "orange" | "blue";
}) {
  return (
    <article className={styles.statCard} data-tone={tone}>
      <span>{label}</span>
      <strong>{value}</strong>
      <div>
        {trend === "up" && <ArrowUpRight size={15} />}
        {trend === "down" && <ArrowDownRight size={15} />}
        <small>{detail}</small>
      </div>
    </article>
  );
}

export function SearchBar({
  value,
  onChange,
  placeholder = "Buscar..."
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className={styles.searchWrap}>
      <Search size={17} />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}

export function Toolbar({
  search,
  onSearch,
  placeholder,
  children
}: {
  search: string;
  onSearch: (value: string) => void;
  placeholder?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={styles.toolbar}>
      <SearchBar value={search} onChange={onSearch} placeholder={placeholder} />
      <div className={styles.toolbarActions}>
        {children}
        <button className={styles.secondaryButton}><Filter size={17} /> Filtrar</button>
      </div>
    </div>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <div className={styles.emptyState}>
      <Search size={26} />
      <strong>No encontramos resultados</strong>
      <span>Probá buscando otro {label}.</span>
    </div>
  );
}

export function DemoModal({
  open,
  title,
  description,
  fields,
  onClose
}: {
  open: boolean;
  title: string;
  description: string;
  fields: string[];
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className={styles.modalBackdrop} onMouseDown={onClose}>
      <div className={styles.modal} onMouseDown={(event) => event.stopPropagation()}>
        <div className={styles.modalTop}>
          <span className={styles.eyebrow}>NUEVO REGISTRO</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <div className={styles.formGrid}>
          {fields.map((field, index) => (
            <label key={field}>
              <span>{field}</span>
              <input placeholder={index === 0 ? "Completá este campo" : ""} />
            </label>
          ))}
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.secondaryButton} onClick={onClose}>Cancelar</button>
          <button className={styles.primaryButton} onClick={onClose}><Check size={17} /> Guardar</button>
        </div>
      </div>
    </div>
  );
}

export function DashboardView() {
  const upcoming = [
    { time: "17:30", name: "Urbano Kids", detail: "Infantil · Inicial", students: 12 },
    { time: "19:00", name: "Reggaetón", detail: "Adultos · Inicial", students: 14 },
    { time: "20:15", name: "Bachata", detail: "Adultos · Intermedio", students: 18 }
  ];

  return (
    <>
      <PageHeader
        eyebrow="RESUMEN GENERAL"
        title="Así viene la academia hoy"
        description="Una lectura rápida de alumnos, clases, cobros y actividad del equipo."
      />

      <div className={styles.statGrid}>
        <StatCard label="Alumnos activos" value="186" detail="+12 este mes" trend="up" />
        <StatCard label="Profesores" value="11" detail="10 activos hoy" tone="blue" />
        <StatCard label="Clases activas" value="24" detail="82% ocupación" tone="green" />
        <StatCard label="Deuda pendiente" value="$ 428.000" detail="17 cuotas vencidas" tone="orange" />
      </div>

      <div className={styles.dashboardGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>AGENDA</span>
              <h2>Clases de hoy</h2>
            </div>
            <button className={styles.ghostButton}>Ver calendario <ChevronRight size={16} /></button>
          </div>
          <div className={styles.scheduleList}>
            {upcoming.map((item) => (
              <div className={styles.scheduleRow} key={item.time}>
                <span className={styles.timeBadge}>{item.time}</span>
                <span className={styles.rowText}>
                  <strong>{item.name}</strong>
                  <small>{item.detail}</small>
                </span>
                <span className={styles.studentsBadge}><UsersRound size={15} /> {item.students}</span>
                <MoreHorizontal size={18} />
              </div>
            ))}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>COBRANZAS</span>
              <h2>Estado del mes</h2>
            </div>
          </div>
          <div className={styles.moneyHero}>
            <span>Cobrado en septiembre</span>
            <strong>$ 4.860.000</strong>
            <small>89% del esperado</small>
          </div>
          <div className={styles.progress}><span style={{ width: "89%" }} /></div>
          <div className={styles.moneySplit}>
            <div><span><CircleDollarSign size={16} /> Al día</span><strong>169</strong></div>
            <div><span><Clock3 size={16} /> Pendientes</span><strong>17</strong></div>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>ACCIONES RÁPIDAS</span>
              <h2>Resolver sin perder tiempo</h2>
            </div>
          </div>
          <div className={styles.quickGrid}>
            <button><UsersRound size={19} /><span>Nuevo alumno</span></button>
            <button><Mail size={19} /><span>Recordar deuda</span></button>
            <button><MessageCircle size={19} /><span>Enviar aviso</span></button>
            <button><Download size={19} /><span>Exportar mes</span></button>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>ACTIVIDAD</span>
              <h2>Últimos movimientos</h2>
            </div>
          </div>
          <div className={styles.activityList}>
            <div><i data-tone="green" /><span><strong>Pago registrado</strong><small>Camila G. · $32.000</small></span><time>10:42</time></div>
            <div><i data-tone="purple" /><span><strong>Alumno inscripto</strong><small>Mateo S. · Urbano Kids</small></span><time>09:18</time></div>
            <div><i data-tone="orange" /><span><strong>Recordatorio enviado</strong><small>8 cuotas pendientes</small></span><time>08:55</time></div>
          </div>
        </section>
      </div>
    </>
  );
}

const professorSeed = [
  { id: 1, name: "Sofía Martínez", styles: "Reggaetón · Urbano", classes: 4, students: 46, status: "Activo" },
  { id: 2, name: "Lucas Ferreira", styles: "Bachata · Salsa", classes: 3, students: 39, status: "Activo" },
  { id: 3, name: "Martina López", styles: "Jazz · Contemporáneo", classes: 5, students: 52, status: "Activo" },
  { id: 4, name: "Diego Suárez", styles: "Hip Hop", classes: 2, students: 21, status: "Pausado" }
];

export function ProfessorsView() {
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const items = professorSeed.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <PageHeader eyebrow="EQUIPO" title="Profesores" description="Gestioná el equipo, sus disciplinas, clases y acceso al sistema." actionLabel="Nuevo profesor" onAction={() => setModal(true)} />
      <Toolbar search={search} onSearch={setSearch} placeholder="Buscar profesor..." />
      <div className={styles.peopleGrid}>
        {items.map((item) => (
          <article className={styles.personCard} key={item.id}>
            <div className={styles.personTop}>
              <span className={styles.personAvatar}>{item.name.split(" ").map((v) => v[0]).slice(0,2).join("")}</span>
              <span className={item.status === "Activo" ? styles.greenPill : styles.grayPill}>{item.status}</span>
            </div>
            <h3>{item.name}</h3>
            <p>{item.styles}</p>
            <div className={styles.personStats}>
              <span><strong>{item.classes}</strong><small>clases</small></span>
              <span><strong>{item.students}</strong><small>alumnos</small></span>
            </div>
            <button className={styles.cardAction}>Ver perfil <ChevronRight size={16} /></button>
          </article>
        ))}
      </div>
      {items.length === 0 && <EmptyState label="profesor" />}
      <DemoModal open={modal} title="Agregar profesor" description="Creá su acceso y perfil en un solo paso." fields={["Nombre", "Apellido", "Email", "Teléfono", "Disciplina principal"]} onClose={() => setModal(false)} />
    </>
  );
}

const studentSeed = [
  { id: 1, name: "Micaela Rodríguez", group: "Reggaetón · Inicial", phone: "221 555-0121", payment: "Al día", age: 19 },
  { id: 2, name: "Camila Gómez", group: "Urbano · Intermedio", phone: "221 555-0188", payment: "Pendiente", age: 17 },
  { id: 3, name: "Sofía Méndez", group: "Bachata · Inicial", phone: "221 555-0193", payment: "Al día", age: 28 },
  { id: 4, name: "Mateo Suárez", group: "Urbano Kids · Inicial", phone: "221 555-0108", payment: "Al día", age: 10 },
  { id: 5, name: "Valentina Paz", group: "Jazz · Intermedio", phone: "221 555-0110", payment: "Pendiente", age: 15 }
];

export function StudentsView() {
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const items = studentSeed.filter((item) => (item.name + item.group).toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <PageHeader eyebrow="COMUNIDAD" title="Alumnos" description="Ficha rápida, clases, contacto y estado de cuenta en un solo lugar." actionLabel="Nuevo alumno" onAction={() => setModal(true)} />
      <div className={styles.statGridSmall}>
        <StatCard label="Activos" value="186" detail="+12 este mes" trend="up" />
        <StatCard label="Menores" value="54" detail="29% del total" tone="blue" />
        <StatCard label="Con deuda" value="17" detail="$ 428.000" tone="orange" />
      </div>
      <Toolbar search={search} onSearch={setSearch} placeholder="Nombre, teléfono o clase..." />
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <span>Alumno</span><span>Clase</span><span>Edad</span><span>Estado</span><span />
        </div>
        {items.map((item) => (
          <div className={styles.tableRow} key={item.id}>
            <span className={styles.personCell}><i>{item.name[0]}</i><span><strong>{item.name}</strong><small>{item.phone}</small></span></span>
            <span>{item.group}</span>
            <span>{item.age} años</span>
            <span><b className={item.payment === "Al día" ? styles.greenPill : styles.orangePill}>{item.payment}</b></span>
            <button className={styles.iconOnly}><ChevronRight size={18} /></button>
          </div>
        ))}
      </div>
      {items.length === 0 && <EmptyState label="alumno" />}
      <DemoModal open={modal} title="Agregar alumno" description="Datos esenciales primero; el resto puede completarse después." fields={["Nombre", "Apellido", "Teléfono", "Email", "Fecha de nacimiento"]} onClose={() => setModal(false)} />
    </>
  );
}

const classSeed = [
  { id: 1, name: "Reggaetón Inicial", teacher: "Sofía Martínez", when: "Mar/Jue · 19:00", capacity: 20, students: 14, level: "Inicial" },
  { id: 2, name: "Urbano Kids", teacher: "Sofía Martínez", when: "Lun/Mié · 17:30", capacity: 16, students: 12, level: "Inicial" },
  { id: 3, name: "Bachata", teacher: "Lucas Ferreira", when: "Mar/Vie · 20:15", capacity: 22, students: 18, level: "Intermedio" },
  { id: 4, name: "Jazz Teens", teacher: "Martina López", when: "Sáb · 11:00", capacity: 18, students: 15, level: "Intermedio" }
];

export function ClassesView() {
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const items = classSeed.filter((item) => (item.name + item.teacher).toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <PageHeader eyebrow="PLANIFICACIÓN" title="Clases y horarios" description="Controlá profesores, cupos, categorías y agenda semanal." actionLabel="Nueva clase" onAction={() => setModal(true)} />
      <Toolbar search={search} onSearch={setSearch} placeholder="Buscar clase o profesor..." />
      <div className={styles.classGrid}>
        {items.map((item) => {
          const occupancy = Math.round((item.students / item.capacity) * 100);
          return (
            <article className={styles.classAdminCard} key={item.id}>
              <div className={styles.classAdminTop}>
                <span className={styles.purplePill}>{item.level}</span>
                <button className={styles.iconOnly}><MoreHorizontal size={18} /></button>
              </div>
              <h3>{item.name}</h3>
              <p>{item.teacher}</p>
              <div className={styles.scheduleTag}><Clock3 size={15} /> {item.when}</div>
              <div className={styles.occupancyLine}>
                <span><strong>{item.students}</strong> / {item.capacity} alumnos</span>
                <b>{occupancy}%</b>
              </div>
              <div className={styles.progress}><span style={{ width: occupancy + "%" }} /></div>
              <button className={styles.cardAction}>Gestionar clase <ChevronRight size={16} /></button>
            </article>
          );
        })}
      </div>
      <DemoModal open={modal} title="Crear clase" description="Usá catálogos predefinidos para mantener los datos ordenados." fields={["Nombre de clase", "Profesor", "Disciplina", "Público", "Nivel", "Cupo"]} onClose={() => setModal(false)} />
    </>
  );
}

const paymentSeed = [
  { id: 1, student: "Micaela Rodríguez", concept: "Cuota septiembre", amount: 32000, due: "10/09", status: "Pagado" },
  { id: 2, student: "Camila Gómez", concept: "Cuota septiembre", amount: 32000, due: "10/09", status: "Vencido" },
  { id: 3, student: "Sofía Méndez", concept: "Cuota septiembre", amount: 36000, due: "10/09", status: "Pagado" },
  { id: 4, student: "Valentina Paz", concept: "Cuota septiembre", amount: 32000, due: "10/09", status: "Pendiente" }
];

export function PaymentsView() {
  const [search, setSearch] = useState("");
  const [items, setItems] = useState(paymentSeed);
  const [modal, setModal] = useState(false);
  const visible = items.filter((item) => item.student.toLowerCase().includes(search.toLowerCase()));

  const markPaid = (id: number) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, status: "Pagado" } : item));
  };

  return (
    <>
      <PageHeader eyebrow="FINANZAS" title="Pagos y cuotas" description="Registrá cobros, detectá deuda y enviá recordatorios desde la misma pantalla." actionLabel="Registrar cuota" onAction={() => setModal(true)} />
      <div className={styles.statGridSmall}>
        <StatCard label="Cobrado" value="$ 4,86 M" detail="89% esperado" trend="up" tone="green" />
        <StatCard label="Pendiente" value="$ 428 K" detail="17 cuotas" tone="orange" />
        <StatCard label="Comprobantes" value="142" detail="Este mes" tone="blue" />
      </div>
      <Toolbar search={search} onSearch={setSearch} placeholder="Buscar alumno...">
        <button className={styles.secondaryButton}><Download size={17} /> Exportar</button>
      </Toolbar>
      <div className={styles.tableCard}>
        <div className={styles.tableHeaderPayments}>
          <span>Alumno</span><span>Concepto</span><span>Vencimiento</span><span>Importe</span><span>Estado</span><span />
        </div>
        {visible.map((item) => (
          <div className={styles.tableRowPayments} key={item.id}>
            <span className={styles.personCell}><i>{item.student[0]}</i><strong>{item.student}</strong></span>
            <span>{item.concept}</span>
            <span>{item.due}</span>
            <strong>$ {item.amount.toLocaleString("es-AR")}</strong>
            <span><b className={item.status === "Pagado" ? styles.greenPill : item.status === "Vencido" ? styles.redPill : styles.orangePill}>{item.status}</b></span>
            <span className={styles.rowActions}>
              {item.status !== "Pagado" && <button onClick={() => markPaid(item.id)} title="Marcar pagado"><Check size={16} /></button>}
              {item.status !== "Pagado" && <button title="Enviar recordatorio"><Send size={16} /></button>}
              <button><MoreHorizontal size={16} /></button>
            </span>
          </div>
        ))}
      </div>
      <DemoModal open={modal} title="Registrar cuota" description="Creá un concepto de pago para un alumno." fields={["Alumno", "Concepto", "Período", "Importe", "Vencimiento"]} onClose={() => setModal(false)} />
    </>
  );
}

const defaultCatalogs = {
  "Disciplinas": ["Reggaetón", "Bachata", "Salsa", "Urbano", "Jazz", "Contemporáneo"],
  "Público": ["Infantil", "Adolescentes", "Adultos"],
  "Niveles": ["Inicial", "Intermedio", "Avanzado"]
};

export function CatalogsView() {
  const [catalogs, setCatalogs] = useState(defaultCatalogs);
  const [newValue, setNewValue] = useState("");
  const [active, setActive] = useState<keyof typeof catalogs>("Disciplinas");

  const addItem = () => {
    const value = newValue.trim();
    if (!value) return;
    setCatalogs((current) => ({ ...current, [active]: [...current[active], value] }));
    setNewValue("");
  };

  return (
    <>
      <PageHeader eyebrow="DATOS MAESTROS" title="Catálogos" description="La administración define las opciones; los profesores seleccionan, no escriben categorías libres." />
      <div className={styles.catalogLayout}>
        <aside className={styles.catalogTabs}>
          {(Object.keys(catalogs) as Array<keyof typeof catalogs>).map((key) => (
            <button key={key} className={active === key ? styles.catalogTabActive : styles.catalogTab} onClick={() => setActive(key)}>
              <span>{key}</span>
              <b>{catalogs[key].length}</b>
            </button>
          ))}
        </aside>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div><span className={styles.eyebrow}>EDITANDO</span><h2>{active}</h2></div>
          </div>
          <div className={styles.addCatalog}>
            <input value={newValue} onChange={(event) => setNewValue(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addItem()} placeholder={"Agregar " + active.toLowerCase()} />
            <button className={styles.primaryButton} onClick={addItem}><Plus size={17} /> Agregar</button>
          </div>
          <div className={styles.catalogList}>
            {catalogs[active].map((item, index) => (
              <div key={item}>
                <span className={styles.order}>{String(index + 1).padStart(2, "0")}</span>
                <strong>{item}</strong>
                <span className={styles.greenPill}>Activo</span>
                <button className={styles.iconOnly}><MoreHorizontal size={18} /></button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

export function CommunicationsView() {
  const [channel, setChannel] = useState<"email" | "whatsapp">("email");

  return (
    <>
      <PageHeader eyebrow="COMUNICACIÓN" title="Mensajes y recordatorios" description="Centralizá avisos de clase, deuda y comunicaciones generales." />
      <div className={styles.communicationGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><span className={styles.eyebrow}>NUEVO ENVÍO</span><h2>Crear mensaje</h2></div></div>
          <div className={styles.channelTabs}>
            <button className={channel === "email" ? styles.channelActive : ""} onClick={() => setChannel("email")}><Mail size={17} /> Email</button>
            <button className={channel === "whatsapp" ? styles.channelActive : ""} onClick={() => setChannel("whatsapp")}><MessageCircle size={17} /> WhatsApp</button>
          </div>
          <div className={styles.composeForm}>
            <label><span>Destinatarios</span><select><option>Todos los alumnos</option><option>Por clase</option><option>Con deuda</option></select></label>
            <label><span>Asunto / título</span><input placeholder="Ej. Recordatorio de clase" /></label>
            <label><span>Mensaje</span><textarea rows={7} placeholder="Escribí un mensaje breve y claro..." /></label>
            <button className={styles.primaryButton}><Send size={17} /> {channel === "email" ? "Enviar email" : "Abrir WhatsApp"}</button>
          </div>
        </section>
        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><span className={styles.eyebrow}>AUTOMATIZACIONES</span><h2>Recordatorios</h2></div></div>
          <div className={styles.automationList}>
            <div><span className={styles.actionCircle}><CircleDollarSign size={18} /></span><span><strong>Deuda vencida</strong><small>Email manual desde cada cuota</small></span><b className={styles.greenPill}>Activo</b></div>
            <div><span className={styles.actionCircle}><CalendarDays size={18} /></span><span><strong>Próxima clase</strong><small>Plantilla preparada para enviar</small></span><b className={styles.greenPill}>Activo</b></div>
            <div><span className={styles.actionCircle}><MessageCircle size={18} /></span><span><strong>WhatsApp</strong><small>Mensaje precargado, sin API paga</small></span><b className={styles.purplePill}>Manual</b></div>
          </div>
        </section>
      </div>
    </>
  );
}

export function ReportsView() {
  return (
    <>
      <PageHeader eyebrow="ANÁLISIS" title="Reportes" description="Datos útiles para decidir: crecimiento, ocupación, ingresos y deuda." />
      <div className={styles.reportGrid}>
        <article className={styles.reportHero}>
          <span className={styles.eyebrow}>ALUMNOS ACTIVOS</span>
          <strong>186</strong>
          <p>La academia sumó 31 alumnos netos durante los últimos 90 días.</p>
          <div className={styles.fakeChart}>
            {[42,55,49,62,67,73,84,79,91,96,101,112].map((height, index) => <i key={index} style={{ height: height + "px" }} />)}
          </div>
        </article>
        <article className={styles.reportCard}><span>Ocupación promedio</span><strong>82%</strong><small>+6 puntos vs. agosto</small></article>
        <article className={styles.reportCard}><span>Ingreso mensual</span><strong>$ 4,86 M</strong><small>89% cobrado</small></article>
        <article className={styles.reportCard}><span>Deuda / facturación</span><strong>8,1%</strong><small>17 alumnos pendientes</small></article>
        <section className={styles.panel + " " + styles.reportWide}>
          <div className={styles.panelHeader}><div><span className={styles.eyebrow}>EXPORTACIONES</span><h2>Descargar información</h2></div></div>
          <div className={styles.exportGrid}>
            <button><Download size={20} /><span><strong>Alumnos</strong><small>Excel completo</small></span></button>
            <button><Download size={20} /><span><strong>Pagos</strong><small>Excel por período</small></span></button>
            <button><Download size={20} /><span><strong>Resumen mensual</strong><small>PDF ejecutivo</small></span></button>
          </div>
        </section>
      </div>
    </>
  );
}

export function SettingsView() {
  return (
    <>
      <PageHeader eyebrow="SISTEMA" title="Configuración" description="Datos de la academia, sede, comunicación y preferencias operativas." />
      <div className={styles.settingsGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><span className={styles.eyebrow}>ACADEMIA</span><h2>Datos generales</h2></div></div>
          <div className={styles.formGridTwo}>
            <label><span>Nombre</span><input defaultValue="M&M Academia de Baile" /></label>
            <label><span>Teléfono</span><input placeholder="+54 9 221 ..." /></label>
            <label className={styles.spanTwo}><span>Dirección</span><input defaultValue="Calle 35 entre 3 y 4, La Plata" /></label>
            <label><span>Email</span><input defaultValue="mymacademiadebaile@gmail.com" /></label>
            <label><span>Zona horaria</span><select defaultValue="America/Argentina/Buenos_Aires"><option>America/Argentina/Buenos_Aires</option></select></label>
          </div>
          <button className={styles.primaryButton}><Check size={17} /> Guardar cambios</button>
        </section>
        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><span className={styles.eyebrow}>EMAIL</span><h2>Gmail + Nodemailer</h2></div></div>
          <div className={styles.integrationBox}>
            <span className={styles.actionCircle}><Mail size={20} /></span>
            <span><strong>mymacademiadebaile@gmail.com</strong><small>Configuración mediante variables de entorno</small></span>
            <b className={styles.orangePill}>Pendiente clave</b>
          </div>
          <p className={styles.helperText}>Se usa contraseña de aplicación de Google. La clave nunca se guarda en GitHub ni en la base de datos.</p>
        </section>
      </div>
    </>
  );
}
