"use client";

import { FormEvent } from "react";
import { AlertCircle, Check, ChevronLeft, ChevronRight, LoaderCircle, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { Paginated } from "./live-types";
import styles from "./live.module.css";

export function LoadingBlock({ label = "Cargando..." }: { label?: string }) {
  return (
    <div className={styles.stateBlock}>
      <LoaderCircle className={styles.spin} size={24} />
      <span>{label}</span>
    </div>
  );
}

export function ErrorBlock({
  message,
  onRetry
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className={styles.errorBlock}>
      <AlertCircle size={22} />
      <div>
        <strong>No pudimos cargar esta sección</strong>
        <span>{message}</span>
      </div>
      {onRetry && <button onClick={onRetry}>Reintentar</button>}
    </div>
  );
}

export function LiveModal({
  open,
  title,
  description,
  children,
  submitting,
  onClose,
  onSubmit,
  eyebrow = "GESTIÓN",
  submitLabel = "Guardar"
}: {
  open: boolean;
  title: string;
  description: string;
  children: React.ReactNode;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  eyebrow?: string;
  submitLabel?: string;
}) {
  if (!open) return null;

  return (
    <div className={styles.modalBackdrop} onMouseDown={onClose}>
      <form
        className={styles.modal}
        onSubmit={onSubmit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <div>
            <span>{eyebrow}</span>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className={styles.formGrid}>{children}</div>
        <div className={styles.modalFooter}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            Cancelar
          </button>
          <button className={styles.primary} disabled={submitting}>
            {submitting ? <LoaderCircle className={styles.spin} size={17} /> : <Check size={17} />}
            {submitting ? "Guardando..." : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

export function Field({
  label,
  children,
  wide = false
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={wide ? styles.fieldWide : styles.field}>
      <span>{label}</span>
      {children}
    </label>
  );
}

const pageSizeOptions = [10, 50, 100] as const;

/**
 * Select inputs need the complete reference list, while the management views
 * intentionally request one page at a time. Keep the latter paginated without
 * silently dropping references once an organization has more than 100 items.
 */
export async function fetchAllPaginated<T>(path: string): Promise<T[]> {
  const separator = path.includes("?") ? "&" : "?";
  const firstPage = await apiFetch<Paginated<T>>(`${path}${separator}page=1&limit=100`);
  const totalPages = Math.ceil(firstPage.total / firstPage.limit);

  if (totalPages <= 1) return firstPage.items;

  const remainingPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      apiFetch<Paginated<T>>(`${path}${separator}page=${index + 2}&limit=${firstPage.limit}`)
    )
  );

  return [firstPage, ...remainingPages].flatMap((page) => page.items);
}

export function PaginationControls({
  page,
  limit,
  total,
  loading = false,
  onPageChange,
  onLimitChange
}: {
  page: number;
  limit: number;
  total: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const firstItem = total === 0 ? 0 : (page - 1) * limit + 1;
  const lastItem = Math.min(total, page * limit);

  return (
    <nav className={styles.paginationBar} aria-label="Paginación de resultados">
      <span className={styles.paginationSummary} aria-live="polite">
        {total === 0
          ? "No hay registros para mostrar"
          : <>Mostrando <strong>{firstItem}–{lastItem}</strong> de <strong>{total}</strong></>}
      </span>

      <label className={styles.pageSizeControl}>
        <span>Mostrar</span>
        <select
          aria-label="Registros por página"
          value={limit}
          disabled={loading}
          onChange={(event) => onLimitChange(Number(event.target.value))}
        >
          {pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
        <span>por página</span>
      </label>

      <div className={styles.paginationActions}>
        <button
          type="button"
          aria-label="Página anterior"
          disabled={loading || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft size={16} aria-hidden="true" />
          <span>Anterior</span>
        </button>
        <span className={styles.pageIndicator}>Página {page} de {totalPages}</span>
        <button
          type="button"
          aria-label="Página siguiente"
          disabled={loading || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <span>Siguiente</span>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}

export function WebChecklist({
  items
}: {
  items: Array<{ label: string; ok: boolean }>;
}) {
  return (
    <ul className={styles.webChecklist}>
      {items.map((item) => (
        <li key={item.label} className={item.ok ? styles.webCheckOk : styles.webCheckMissing}>
          {item.ok ? <Check size={13} aria-hidden="true" /> : <X size={13} aria-hidden="true" />}
          <span>{item.label}</span>
          <span className={styles.srOnly}>{item.ok ? "(cumple)" : "(falta)"}</span>
        </li>
      ))}
    </ul>
  );
}

export function WebSwitch({
  label,
  checked,
  disabled,
  busy,
  onChange,
  describedBy
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  busy?: boolean;
  onChange: (next: boolean) => void;
  describedBy?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={describedBy}
      className={styles.webSwitch}
      disabled={disabled || busy}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.webSwitchTrack} aria-hidden="true">
        <span className={styles.webSwitchThumb} />
      </span>
      <span>{label}</span>
    </button>
  );
}
