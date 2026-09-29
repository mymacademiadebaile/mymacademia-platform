"use client";

import { FormEvent, useEffect, useState } from "react";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, apiMessage } from "@/lib/api";
import styles from "../login/login.module.css";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") ?? "");
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!token) {
      setError("El enlace no contiene un token válido.");
      return;
    }

    if (password !== confirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setSubmitting(true);

    try {
      await apiFetch<void>("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password })
      });
      router.replace("/login?passwordChanged=1");
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.visual}>
        <Image
          src="/mym-academia-logo.png"
          alt="M&M Academia de Baile"
          width={118}
          height={118}
          priority
          className={styles.brandLogo}
        />
        <span className={styles.kicker}>SEGURIDAD</span>
        <h1>Definí una nueva contraseña.</h1>
        <p>El enlace es de un solo uso y deja de ser válido después de cambiar la contraseña.</p>
      </section>

      <section className={styles.loginPanel}>
        <form className={styles.form} onSubmit={submit}>
          <span className={styles.kicker}>NUEVA CONTRASEÑA</span>
          <h2>Restablecer acceso</h2>
          <p>Usá al menos 10 caracteres, incluyendo una letra y un número.</p>

          <label>
            <span>Nueva contraseña</span>
            <div className={styles.field}>
              <LockKeyhole size={18} />
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={10}
                required
              />
              <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label="Mostrar contraseña">
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          <label>
            <span>Repetir contraseña</span>
            <div className={styles.field}>
              <LockKeyhole size={18} />
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                minLength={10}
                required
              />
            </div>
          </label>

          {error && <div className={styles.error}>{error}</div>}

          <button className={styles.submit} disabled={submitting || !token}>
            {submitting ? "Actualizando..." : "Guardar nueva contraseña"}
          </button>

          <Link className={styles.authBackLink} href="/login">
            Volver al ingreso
          </Link>
        </form>
      </section>
    </main>
  );
}
