"use client";

import {
  AlertCircle,
  BarChart3,
  Bell,
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  CircleUserRound,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  MessageCircleMore,
  Settings,
  Sparkles,
  ShieldCheck,
  UsersRound,
  X
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuthUser } from "@/components/auth/auth-gate";
import { apiFetch } from "@/lib/api";
import styles from "./admin.module.css";

const navigation = [
  { href: "/admin", label: "Inicio", icon: LayoutDashboard },
  { href: "/admin/calendar", label: "Calendario", icon: CalendarRange },
  { href: "/admin/professors", label: "Profesores", icon: Sparkles },
  { href: "/admin/students", label: "Alumnos", icon: UsersRound },
  { href: "/admin/payments", label: "Pagos", icon: CreditCard },
  { href: "/admin/communications", label: "Comunicaciones", icon: MessageCircleMore },
  { href: "/admin/reports", label: "Reportes", icon: BarChart3 },
  { href: "/admin/audit", label: "Auditoría", icon: ClipboardList },
  { href: "/admin/settings", label: "Configuración", icon: Settings },
  { href: "/admin/profile", label: "Mi perfil", icon: CircleUserRound }
];

type NotificationItem = {
  id: string;
  channel: "EMAIL" | "WHATSAPP";
  type: string;
  status: "PENDING" | "SENT" | "FAILED" | "OPENED";
  subject?: string;
  message: string;
  studentName?: string;
  destination: string;
  sentAt?: string;
  createdAt: string;
};

type NotificationResponse = {
  attention: {
    overdueCount: number;
    overdueAmount: number;
    failedCommunications: number;
  };
  items: NotificationItem[];
};

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthUser();
  const [open, setOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationResponse | null>(null);
  const [notificationsLoading, setNotificationsLoading] = useState(false);

  const loadNotifications = useCallback(async () => {
    setNotificationsLoading(true);
    try {
      setNotifications(
        await apiFetch<NotificationResponse>("/admin/notifications?limit=6")
      );
    } catch {
      // El centro de notificaciones no debe bloquear la navegación principal.
    } finally {
      setNotificationsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    setNotificationOpen(false);
  }, [pathname]);

  async function logout() {
    await apiFetch<void>("/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
  }

  function toggleNotifications() {
    setNotificationOpen((current) => {
      const next = !current;
      if (next) void loadNotifications();
      return next;
    });
  }

  const attentionCount =
    (notifications?.attention.overdueCount ?? 0) +
    (notifications?.attention.failedCommunications ?? 0);

  const visibleNavigation = user?.role === "SUPER_ADMIN"
    ? [...navigation.slice(0, -1), { href: "/admin/users", label: "Usuarios", icon: ShieldCheck }, navigation.at(-1)!]
    : navigation;

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
          {visibleNavigation.map((item) => {
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

          <button className={styles.logoutButton} onClick={() => void logout()}>
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
            <div className={styles.notificationAnchor}>
              <button
                aria-label="Notificaciones"
                aria-expanded={notificationOpen}
                className={styles.roundButton}
                onClick={toggleNotifications}
              >
                <Bell size={20} />
                {attentionCount > 0 && (
                  <b className={styles.notificationBadge}>
                    {attentionCount > 99 ? "99+" : attentionCount}
                  </b>
                )}
              </button>

              {notificationOpen && (
                <div className={styles.notificationPanel}>
                  <div className={styles.notificationPanelHeader}>
                    <div>
                      <span>ACTIVIDAD</span>
                      <strong>Notificaciones</strong>
                    </div>
                    <button onClick={() => setNotificationOpen(false)} aria-label="Cerrar">
                      <X size={16} />
                    </button>
                  </div>

                  <div className={styles.notificationAttention}>
                    <Link href="/admin/payments">
                      <AlertCircle size={16} />
                      <span>
                        <strong>{notifications?.attention.overdueCount ?? 0} pagos vencidos</strong>
                        <small>$ {(notifications?.attention.overdueAmount ?? 0).toLocaleString("es-AR")}</small>
                      </span>
                    </Link>
                    {(notifications?.attention.failedCommunications ?? 0) > 0 && (
                      <Link href="/admin/communications">
                        <AlertCircle size={16} />
                        <span>
                          <strong>{notifications?.attention.failedCommunications} envíos con error</strong>
                          <small>Revisar comunicaciones</small>
                        </span>
                      </Link>
                    )}
                  </div>

                  <div className={styles.notificationList}>
                    {notificationsLoading && !notifications && (
                      <span className={styles.notificationEmpty}>Actualizando actividad...</span>
                    )}
                    {!notificationsLoading && notifications?.items.length === 0 && (
                      <span className={styles.notificationEmpty}>Sin actividad reciente.</span>
                    )}
                    {notifications?.items.map((item) => (
                      <div className={styles.notificationItem} key={item.id}>
                        <span className={styles.notificationItemIcon} data-status={item.status}>
                          {item.status === "FAILED"
                            ? <AlertCircle size={15} />
                            : item.channel === "EMAIL"
                              ? <Mail size={15} />
                              : <MessageCircle size={15} />}
                        </span>
                        <span>
                          <strong>{item.studentName || item.destination}</strong>
                          <small>{item.subject || item.message}</small>
                          <time>
                            {new Date(item.sentAt || item.createdAt).toLocaleString("es-AR", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit"
                            })}
                          </time>
                        </span>
                        {item.status === "SENT" && <CheckCircle2 size={14} className={styles.notificationOk} />}
                      </div>
                    ))}
                  </div>

                  <Link href="/admin/notifications" className={styles.notificationAll}>
                    Ver centro de notificaciones
                  </Link>
                </div>
              )}
            </div>

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
