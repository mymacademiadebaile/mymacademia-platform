"use client";

import { FormEvent, useState } from "react";
import { Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiFetch, apiMessage } from "@/lib/api";
import styles from "./login.module.css";

type LoginResponse = {
  user: {
    role: "ADMIN" | "PROFESSOR";
  };
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("mymacademiadebaile@gmail.com");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const { user } = await apiFetch<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });

      const requested =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("next")
          : null;
      const fallback = user.role === "ADMIN" ? "/admin" : "/professor";

      router.replace(requested && requested.startsWith("/") ? requested : fallback);
      router.refresh();
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.visual}>
        <div className={styles.brandMark}>M&M</div>
        <span className={styles.kicker}>ACADEMIA DE BAILE</span>
        <h1>Todo lo que pasa en la academia, en un solo lugar.</h1>
        <p>
          Clases, alumnos, profesores y cobranzas con una experiencia simple para el equipo.
        </p>
        <div className={styles.visualCard}>
          <strong>Administración clara</strong>
          <span>Menos planillas. Más tiempo para la academia.</span>
        </div>
      </section>

      <section className={styles.loginPanel}>
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.mobileBrand}>
            <span className={styles.brandMark}>M&M</span>
            <strong>Academia de Baile</strong>
          </div>
          <span className={styles.kicker}>BIENVENIDO</span>
          <h2>Ingresá a tu cuenta</h2>
          <p>Usá el acceso asignado por M&M Academia.</p>

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

          <label>
            <span>Contraseña</span>
            <div className={styles.field}>
              <LockKeyhole size={18} />
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
              />
              <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label="Mostrar contraseña">
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          {error && <div className={styles.error}>{error}</div>}

          <button className={styles.submit} disabled={submitting}>
            {submitting ? "Ingresando..." : "Ingresar"}
          </button>

          <small className={styles.footerText}>
            Si no recordás tu acceso, contactá a la administración.
          </small>
        </form>
      </section>
    </main>
  );
}
