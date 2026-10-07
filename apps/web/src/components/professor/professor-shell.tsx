"use client";

import {
  CalendarDays,
  GraduationCap,
  Home,
  LogOut,
  UsersRound
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  }
];

export function ProfessorShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthUser();

  async function logout() {
    await apiFetch<void>("/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
  }

  const fullName = user ? `${user.firstName} ${user.lastName}` : "Profesor";

  return (
    <div className={styles.root}>
      <header className={styles.appHeader}>
        <div className={styles.headerInner}>
          <Link href="/professor" className={styles.brand}>
            <Image
              src="/mym-academia-logo.png"
              alt="M&M Academia de Baile"
              width={44}
              height={44}
              priority
              className={styles.brandLogo}
            />
            <span className={styles.brandText}>
              <strong>M&M Academia</strong>
              <small>Espacio docente</small>
            </span>
          </Link>

          <nav className={styles.desktopNav} aria-label="Secciones del profesor">
            {navigation.map((item) => {
              const active = item.match(pathname);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={styles.desktopNavItem}
                  data-active={active}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={18} aria-hidden />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <Link
            href="/professor/profile"
            className={styles.identity}
            aria-label={`Abrir perfil de ${fullName}`}
          >
            <Avatar name={fullName} size={34} />
            <span className={styles.identityText}>
              <strong>{fullName}</strong>
              <small>Mi perfil</small>
            </span>
          </Link>
          <button
            className={styles.logoutButton}
            onClick={() => void logout()}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
          >
            <LogOut size={18} aria-hidden />
          </button>
        </div>
      </header>

      <main className={styles.main}>{children}</main>

      <nav className={styles.mobileNav} aria-label="Secciones del profesor">
        {navigation.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={styles.mobileNavItem}
              data-active={active}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={21} aria-hidden />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
