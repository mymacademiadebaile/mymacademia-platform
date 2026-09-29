"use client";

import {
  BarChart3,
  Bell,
  CalendarDays,
  ClipboardList,
  CircleUserRound,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircleMore,
  Settings,
  SlidersHorizontal,
  Sparkles,
  UsersRound,
  X
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
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
  { href: "/admin/audit", label: "Auditoría", icon: ClipboardList },
  { href: "/admin/settings", label: "Configuración", icon: Settings },
  { href: "/admin/profile", label: "Mi perfil", icon: CircleUserRound }
];

type CurrentUser = {
  firstName: string;
  lastName: string;
  email: string;
};

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    apiFetch<{ user: CurrentUser }>("/auth/me")
      .then((result) => setUser(result.user))
      .catch(() => undefined);
  }, [pathname]);

  async function logout() {
    await apiFetch<void>("/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className={styles.adminRoot}>
      <aside className={styles.sidebar} data-open={open}>
        <div className={styles.sidebarTop}>
          <Link href="/admin" className={styles.brand}>
            <Image
              src="/mym-academia-logo.png"
              alt="M&M Academia de Baile"
              width={52}
              height={52}
              priority
              className={styles.brandLogo}
            />
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
          <Link href="/admin/profile" className={styles.adminIdentity}>
            <span className={styles.adminAvatar}>
              {(user?.firstName?.[0] ?? "A").toUpperCase()}
            </span>
            <span>
              <strong>{user ? `${user.firstName} ${user.lastName}` : "Administración"}</strong>
              <small>{user?.email ?? "M&M Academia"}</small>
            </span>
          </Link>

          <button
            className={styles.logoutButton}
            onClick={() => void logout()}
          >
            <LogOut size={18} />
            <span>
              <strong>Cerrar sesión</strong>
              <small>Salir del sistema</small>
            </span>
          </button>
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
            <Link href="/admin/profile" className={styles.profileShortcut} aria-label="Abrir mi perfil">
              <CircleUserRound size={18} />
              <span>{user?.firstName ?? "Perfil"}</span>
            </Link>
          </div>
        </header>
        <div className={styles.content}>{children}</div>
      </main>
    </div>
  );
}
