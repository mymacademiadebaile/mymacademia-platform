"use client";

import {
  AlertCircle,
  Check,
  CircleDashed,
  Clock3,
  LoaderCircle,
  Search,
  X
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { PHASE_LABEL, initials } from "./format";
import type { AttendanceStatus, PaymentStatus, SessionPhase } from "./professor-types";
import styles from "./professor-ui.module.css";

/* ---------- Layout ---------- */

export function ProfessorPageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  refreshing,
  back
}: {
  title: string;
  subtitle?: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
  refreshing?: boolean;
  back?: { href: string; label: string };
}) {
  return (
    <header className={styles.pageHeader}>
      <div className={styles.pageHeaderText}>
        {back && (
          <Link href={back.href} className={styles.backLink}>
            ← {back.label}
          </Link>
        )}
        {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className={styles.pageHeaderActions}>
        {refreshing && (
          <span className={styles.refreshing} role="status" aria-label="Actualizando datos">
            <LoaderCircle size={16} className={styles.spin} aria-hidden />
            Actualizando
          </span>
        )}
        {actions}
      </div>
    </header>
  );
}

export function ProfessorStatCard({
  value,
  label,
  hint,
  icon,
  tone = "default",
  href
}: {
  value: ReactNode;
  label: string;
  hint?: string;
  icon?: ReactNode;
  tone?: "default" | "warn" | "success";
  href?: string;
}) {
  const content = (
    <>
      {icon && <span className={styles.statIcon}>{icon}</span>}
      <strong className={styles.statValue}>{value}</strong>
      <span className={styles.statLabel}>{label}</span>
      {hint && <small className={styles.statHint}>{hint}</small>}
    </>
  );

  return href ? (
    <Link href={href} className={styles.statCard} data-tone={tone}>
      {content}
    </Link>
  ) : (
    <div className={styles.statCard} data-tone={tone}>
      {content}
    </div>
  );
}

export function Card({
  title,
  action,
  children,
  className
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${styles.card} ${className ?? ""}`}>
      {(title || action) && (
        <div className={styles.cardHeader}>
          {title && <h2>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/* ---------- Badges (always icon + text, never color only) ---------- */

const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  PAID: "Pagado",
  PENDING: "Pendiente",
  OVERDUE: "Vencido",
  FREE: "Gratis"
};

export function StudentPaymentBadge({ status }: { status: PaymentStatus }) {
  const Icon = status === "PAID" ? Check : status === "OVERDUE" ? AlertCircle : status === "PENDING" ? Clock3 : CircleDashed;
  return (
    <span className={styles.badge} data-kind={`payment-${status}`}>
      <Icon size={13} aria-hidden />
      {PAYMENT_LABEL[status]}
    </span>
  );
}

const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  EXPECTED: "Esperado",
  PRESENT: "Presente",
  ABSENT: "Ausente"
};

export function AttendanceBadge({ status }: { status: AttendanceStatus }) {
  const Icon = status === "PRESENT" ? Check : status === "ABSENT" ? X : CircleDashed;
  return (
    <span className={styles.badge} data-kind={`attendance-${status}`}>
      <Icon size={13} aria-hidden />
      {ATTENDANCE_LABEL[status]}
    </span>
  );
}

const PHASE_BADGE_LABEL: Record<SessionPhase, string> = {
  ...PHASE_LABEL,
  SCHEDULED: "Próxima"
};

export function SessionPhaseBadge({ phase, longLabel }: { phase: SessionPhase; longLabel?: boolean }) {
  return (
    <span className={styles.badge} data-kind={`phase-${phase}`}>
      {longLabel ? PHASE_LABEL[phase] : PHASE_BADGE_LABEL[phase]}
    </span>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return <span className={styles.chip}>{children}</span>;
}

/* ---------- Avatar ---------- */

export function Avatar({ name, url, size = 40 }: { name: string; url?: string; size?: number }) {
  return (
    <span
      className={styles.avatar}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" />
      ) : (
        initials(name) || "?"
      )}
    </span>
  );
}

/* ---------- States ---------- */

export function EmptyState({
  icon,
  title,
  description,
  action
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className={styles.empty}>
      {icon && <span className={styles.emptyIcon}>{icon}</span>}
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className={styles.errorState} role="alert">
      <AlertCircle size={22} aria-hidden />
      <div>
        <strong>No pudimos cargar esta sección</strong>
        <p>{message}</p>
      </div>
      {onRetry && (
        <button className={styles.secondaryButton} onClick={onRetry}>
          Reintentar
        </button>
      )}
    </div>
  );
}

export function Skeleton({ height = 20, width = "100%", radius = 10 }: { height?: number; width?: number | string; radius?: number }) {
  return <span className={styles.skeleton} style={{ height, width, borderRadius: radius }} aria-hidden />;
}

/** First-load placeholder: a grid of skeleton cards. Never shown during a background refresh. */
export function PageSkeleton({ blocks = 4 }: { blocks?: number }) {
  return (
    <div className={styles.pageSkeleton} role="status" aria-label="Cargando">
      <Skeleton height={44} width="40%" />
      <Skeleton height={18} width="25%" />
      <div className={styles.skeletonGrid}>
        {Array.from({ length: blocks }, (_, index) => (
          <Skeleton key={index} height={110} radius={16} />
        ))}
      </div>
      <Skeleton height={280} radius={16} />
    </div>
  );
}

/* ---------- Filters ---------- */

export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className={styles.filterBar} role="search">
      {children}
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  label
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <label className={styles.searchField}>
      <Search size={18} aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
      />
    </label>
  );
}

export function SelectFilter({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className={styles.selectFilter}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SegmentedControl<T extends string>({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; icon?: ReactNode }>;
}) {
  return (
    <div className={styles.segmented} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          data-active={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

export const uiStyles = styles;
