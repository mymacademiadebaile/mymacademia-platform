"use client";

import { FormEvent } from "react";
import { AlertCircle, Check, LoaderCircle, X } from "lucide-react";
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
  onSubmit
}: {
  open: boolean;
  title: string;
  description: string;
  children: React.ReactNode;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
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
            <span>NUEVO REGISTRO</span>
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
            {submitting ? "Guardando..." : "Guardar"}
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
