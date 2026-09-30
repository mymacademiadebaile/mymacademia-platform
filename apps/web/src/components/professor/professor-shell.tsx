"use client";

import {
  CalendarDays,
  CircleUserRound,
  GraduationCap,
  Home,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  UsersRound,
  X
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuthUser } from "@/components/auth/auth-gate";
import { apiFetch } from "@/lib/api";
import { Avatar } from "./professor-ui";
import styles from "./professor-shell.module.css";

const navigation = [
  { href: "/professor", label: "Inicio", icon: Home, match: (path: string) => path === "/professor" },
  {
    href: "/professor/calendar",
    label: "Calendario",
    icon: CalendarDays,
    match: (path: string) => path.startsWith("/professor/calendar") || path.startsWith("/professor/sessions")
  },
  {
    href: "/professor/classes",
    label: "Mis clases",
    icon: GraduationCap,
    match: (path: string) => path.startsWith("/professor/classes")
  },
  {
    href: "/professor/students",
    label: "Mis alumnos",
    icon: UsersRound,
    match: (path: string) => path.startsWith("/professor/students")
  },
  {
    href: "/professor/profile",
    label: "Perfil",
    icon: CircleUserRound,
    match: (path: string) => path.startsWith("/professor/profile")
  }
];

export function ProfessorShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthUser();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem("mym-professor-collapsed") === "1");
    } catch {
      // Preferencia opcional.
    }
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  function toggleCollapsed() {
    setCollapsed((current) => {
      try {
        window.localStorage.setItem("mym-professor-collapsed", current ? "0" : "1");
      } catch {
        // Preferencia opcional.
      }
      return !current;
    });
  }

  async function logout() {
    await apiFetch<void>("/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
  }

  const fullName = user ? `${user.firstName} ${user.lastName}` : "Profesor";

  return (
    <div className={styles.root} data-collapsed={collapsed}>
      <aside className={styles.sidebar} data-open={drawerOpen} aria-label="Navegación del profesor">
        <div className={styles.sidebarTop}>
          <Link href="/professor" className={styles.brand}>
            <Image
              src="/mym-academia-logo.png"
              alt="M&M Academia de Baile"
              width={40}
              height={40}
              priority
              className={styles.brandLogo}
            />
            <span className={styles.brandText}>
              <strong>M&M Academia</strong>
              <small>Portal del profesor</small>
            </span>
          </Link>
          <button
            className={styles.drawerClose}
            onClick={() => setDrawerOpen(false)}
            aria-label="Cerrar menú"
          >
            <X size={20} />
          </button>
        </div>

        <nav className={styles.nav}>
          {navigation.map((item) => {
            const active = item.match(pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={styles.navItem}
                data-active={active}
                data-tooltip={item.label}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={20} aria-hidden />
                <span className={styles.navLabel}>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className={styles.sidebarBottom}>
          <Link
            href="/professor/profile"
            className={styles.identity}
            data-tooltip={fullName}
          >
            <Avatar name={fullName} size={34} />
            <span className={styles.identityText}>
              <strong>{fullName}</strong>
              <small>{user?.email}</small>
            </span>
          </Link>
          <button
            className={styles.navItem}
            onClick={() => void logout()}
            data-tooltip="Cerrar sesión"
            aria-label="Cerrar sesión"
          >
            <LogOut size={20} aria-hidden />
            <span className={styles.navLabel}>Cerrar sesión</span>
          </button>
          <button
            className={styles.collapseButton}
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
            data-tooltip={collapsed ? "Expandir" : "Contraer"}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
      </aside>

      {drawerOpen && (
        <button
          className={styles.overlay}
          onClick={() => setDrawerOpen(false)}
          aria-label="Cerrar menú"
        />
      )}

      <div className={styles.content}>
        <header className={styles.topbar}>
          <button
            className={styles.menuButton}
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menú"
            aria-expanded={drawerOpen}
          >
            <Menu size={22} />
          </button>
          <strong>M&M Academia</strong>
          <Avatar name={fullName} size={32} />
        </header>
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
