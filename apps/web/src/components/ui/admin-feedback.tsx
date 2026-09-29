"use client";

import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  Info,
  LoaderCircle,
  X
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from "react";
import styles from "./admin-feedback.module.css";

export type ToastTone = "success" | "error" | "warning" | "info";

type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
  duration?: number;
};

type ToastItem = Required<Pick<ToastInput, "title" | "tone">> &
  Pick<ToastInput, "description"> & {
    id: number;
  };

type ConfirmOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
};

type PendingConfirmation = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

type FeedbackContextValue = {
  toast: (input: ToastInput | string) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

function toastIcon(tone: ToastTone) {
  if (tone === "success") return <CheckCircle2 size={18} />;
  if (tone === "error") return <CircleAlert size={18} />;
  if (tone === "warning") return <AlertTriangle size={18} />;
  return <Info size={18} />;
}

export function AdminFeedbackProvider({ children }: { children: React.ReactNode }) {
  const nextId = useRef(1);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback((input: ToastInput | string) => {
    const normalized: ToastInput =
      typeof input === "string" ? { title: input } : input;
    const id = nextId.current++;

    setToasts((current) => [
      ...current,
      {
        id,
        title: normalized.title,
        description: normalized.description,
        tone: normalized.tone ?? "success"
      }
    ]);

    window.setTimeout(() => {
      dismissToast(id);
    }, normalized.duration ?? 3800);
  }, [dismissToast]);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmation({ ...options, resolve });
    });
  }, []);

  const finishConfirmation = useCallback((result: boolean) => {
    setConfirmation((current) => {
      current?.resolve(result);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!confirmation) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        finishConfirmation(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmation, finishConfirmation]);

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}

      <div className={styles.toastViewport} aria-live="polite" aria-atomic="false">
        {toasts.map((item) => (
          <div className={styles.toast} data-tone={item.tone} key={item.id}>
            <span className={styles.toastIcon}>{toastIcon(item.tone)}</span>
            <span className={styles.toastBody}>
              <strong>{item.title}</strong>
              {item.description && <small>{item.description}</small>}
            </span>
            <button onClick={() => dismissToast(item.id)} aria-label="Cerrar notificación">
              <X size={15} />
            </button>
          </div>
        ))}
      </div>

      {confirmation && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onMouseDown={() => finishConfirmation(false)}
        >
          <div
            className={styles.confirmModal}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="admin-confirm-title"
            aria-describedby="admin-confirm-description"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <span className={styles.confirmIcon} data-tone={confirmation.tone ?? "default"}>
              {confirmation.tone === "danger"
                ? <AlertTriangle size={22} />
                : <Info size={22} />}
            </span>
            <div>
              <h2 id="admin-confirm-title">{confirmation.title}</h2>
              <p id="admin-confirm-description">{confirmation.description}</p>
            </div>
            <div className={styles.confirmActions}>
              <button
                className={styles.cancelButton}
                onClick={() => finishConfirmation(false)}
              >
                {confirmation.cancelLabel ?? "Cancelar"}
              </button>
              <button
                className={confirmation.tone === "danger" ? styles.dangerButton : styles.confirmButton}
                onClick={() => finishConfirmation(true)}
              >
                {confirmation.confirmLabel ?? "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
}

export function useAdminFeedback() {
  const context = useContext(FeedbackContext);

  if (!context) {
    throw new Error("useAdminFeedback must be used inside AdminFeedbackProvider");
  }

  return context;
}

export function PendingActionLabel({ label = "Procesando..." }: { label?: string }) {
  return (
    <>
      <LoaderCircle className={styles.spin} size={16} />
      {label}
    </>
  );
}
