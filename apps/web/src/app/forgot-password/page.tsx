"use client";

import { FormEvent, useState } from "react";
import { Mail } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { apiFetch, apiMessage } from "@/lib/api";
import styles from "../login/login.module.css";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await apiFetch<void>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email })
      });
      setSent(true);
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
        <h1>Recuperá tu acceso de forma segura.</h1>
        <p>Te enviaremos un enlace de un solo uso al email asociado a tu cuenta.</p>
      </section>

      <section className={styles.loginPanel}>
        <form className={styles.form} onSubmit={submit}>
          <span className={styles.kicker}>RECUPERAR ACCESO</span>
          <h2>¿Olvidaste tu contraseña?</h2>
          <p>Ingresá tu email. El enlace tendrá una vigencia de 30 minutos.</p>

          {sent ? (
            <div className={styles.success}>
              Si existe una cuenta activa con ese email, enviamos las instrucciones para restablecer la contraseña.
            </div>
          ) : (
            <label>
              <span>Email</span>
              <div className={styles.field}>
                <Mail size={18} />
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
            </label>
          )}

          {error && <div className={styles.error}>{error}</div>}

          {!sent && (
            <button className={styles.submit} disabled={submitting}>
              {submitting ? "Enviando..." : "Enviar enlace"}
            </button>
          )}

          <Link className={styles.authBackLink} href="/login">
            Volver al ingreso
          </Link>
        </form>
      </section>
    </main>
  );
}
