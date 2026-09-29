"use client";

import {
  BarChart3,
  Bell,
  BookOpenCheck,
  CalendarDays,
  ChevronLeft,
  CreditCard,
  LayoutDashboard,
  Menu,
  MessageCircleMore,
  Settings,
  SlidersHorizontal,
  Sparkles,
  UsersRound,
  X
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import styles from "./admin.module.css";

const navigation = [
  { href: "/admin", label: "Inicio", icon: LayoutDashboard },
  { href: "/admin/professors", label: "Profesores", icon: Sparkles },
  { href: "/admin/students", label: "Alumnos", icon: UsersRound },
  { href: "/admin/classes", label: "Clases", icon: CalendarDays },
  { href: "/admin/payments", label: "Pagos", icon: CreditCard },
  { href: "/admin/catalogs", label: "Catálogos", icon: SlidersHorizontal },
  { href: "/admin/communications", label: "Comunicaciones", icon: MessageCircleMore },
  { href: "/admin/reports", label: "Reportes", icon: BarChart3 },
  { href: "/admin/settings", label: "Configuración", icon: Settings }
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.adminRoot}>
      <aside className={styles.sidebar} data-open={open}>
        <div className={styles.sidebarTop}>
          <Link href="/admin" className={styles.brand}>
            <span className={styles.brandMark}>M&M</span>
            <span>
              <strong>Academia</strong>
              <small>Administración</small>
            </span>
          </Link>
          <button className={styles.mobileClose} onClick={() => setOpen(false)} aria-label="Cerrar menú">
            <X size={20} />
          </button>
        </div>

        <nav className={styles.nav}>
          {navigation.map((item) => {
            const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? styles.navItemActive : styles.navItem}
                onClick={() => setOpen(false)}
              >
                <Icon size={19} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className={styles.sidebarBottom}>
          <Link href="/professor" className={styles.professorPreview}>
            <BookOpenCheck size={18} />
            <span>
              <strong>Vista profesor</strong>
              <small>Ver experiencia móvil</small>
            </span>
            <ChevronLeft size={16} />
          </Link>
          <div className={styles.adminIdentity}>
            <span className={styles.adminAvatar}>A</span>
            <span>
              <strong>Administración</strong>
              <small>M&M Academia</small>
            </span>
          </div>
        </div>
      </aside>

      {open && <button className={styles.overlay} onClick={() => setOpen(false)} aria-label="Cerrar menú" />}

      <main className={styles.main}>
        <header className={styles.topbar}>
          <button className={styles.menuButton} onClick={() => setOpen(true)} aria-label="Abrir menú">
            <Menu size={22} />
          </button>
          <div className={styles.topbarText}>
            <span>Panel general</span>
            <strong>M&M Academia de Baile</strong>
          </div>
          <div className={styles.topbarActions}>
            <button aria-label="Notificaciones" className={styles.roundButton}>
              <Bell size={20} />
              <i />
            </button>
            <span className={styles.statusPill}>Sistema activo</span>
          </div>
        </header>
        <div className={styles.content}>{children}</div>
      </main>
    </div>
  );
}
