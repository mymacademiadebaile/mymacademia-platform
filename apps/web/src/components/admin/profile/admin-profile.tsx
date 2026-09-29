"use client";

import {
  Building2,
  Check,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  UserRound
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/admin/admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import styles from "./admin-profile.module.css";

type ProfileData = {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
    role: "ADMIN";
    branchIds: string[];
  };
  organization: {
    _id: string;
    name: string;
    email?: string;
    phone?: string;
    timezone?: string;
    isActive: boolean;
  } | null;
  branches: Array<{
    _id: string;
    name: string;
    address?: string;
    isActive: boolean;
  }>;
};

export function AdminProfile() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      setProfile(await apiFetch<ProfileData>("/admin/profile"));
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    setNotice("");

    try {
      await apiFetch("/admin/profile", {
        method: "PATCH",
        body: JSON.stringify({
          firstName: form.get("firstName"),
          lastName: form.get("lastName"),
          email: form.get("email"),
          phone: form.get("phone")
        })
      });

      setNotice("Tus datos se guardaron correctamente.");
      await load();
      router.refresh();
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");

    setChangingPassword(true);
    setError("");
    setNotice("");

    if (newPassword !== confirmPassword) {
      setError("La confirmación de la contraseña no coincide.");
      setChangingPassword(false);
      return;
    }

    try {
      await apiFetch<void>("/admin/profile/password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: form.get("currentPassword"),
          newPassword
        })
      });

      await apiFetch<void>("/auth/logout", { method: "POST" }).catch(() => undefined);
      router.replace("/login?passwordChanged=1");
      router.refresh();
    } catch (requestError) {
      setError(apiMessage(requestError));
      setChangingPassword(false);
    }
  }

  if (loading && !profile) {
    return (
      <div className={styles.loading}>
        <LoaderCircle size={26} />
        <span>Cargando perfil...</span>
      </div>
    );
  }

  if (!profile) {
    return (
      <>
        <PageHeader
          eyebrow="CUENTA"
          title="Mi perfil"
          description="Administrá tus datos personales y seguridad."
        />
        <div className={styles.errorBox}>
          <strong>No pudimos cargar tu perfil</strong>
          <span>{error || "Intentá nuevamente."}</span>
          <button onClick={() => void load()}>Reintentar</button>
        </div>
      </>
    );
  }

  const initials = `${profile.user.firstName[0] ?? "A"}${profile.user.lastName[0] ?? ""}`.toUpperCase();

  return (
    <>
      <PageHeader
        eyebrow="CUENTA ADMIN"
        title="Mi perfil"
        description="Datos personales, acceso y seguridad de tu cuenta de administración."
      />

      {error && <div className={styles.errorBox}><strong>Revisá esta operación</strong><span>{error}</span></div>}
      {notice && <div className={styles.notice}><Check size={17} /> {notice}</div>}

      <section className={styles.hero}>
        <span className={styles.avatar}>{initials}</span>
        <div>
          <span className={styles.role}><ShieldCheck size={14} /> Administrador</span>
          <h2>{profile.user.firstName} {profile.user.lastName}</h2>
          <p>{profile.user.email}</p>
        </div>
        <span className={styles.activePill}>Cuenta activa</span>
      </section>

      <div className={styles.grid}>
        <form className={styles.card} onSubmit={saveProfile}>
          <div className={styles.cardHeader}>
            <span className={styles.icon}><UserRound size={20} /></span>
            <div>
              <h3>Datos personales</h3>
              <p>Esta información identifica tu cuenta dentro del sistema.</p>
            </div>
          </div>

          <div className={styles.formGrid}>
            <label>
              <span>Nombre</span>
              <input name="firstName" defaultValue={profile.user.firstName} minLength={2} required />
            </label>
            <label>
              <span>Apellido</span>
              <input name="lastName" defaultValue={profile.user.lastName} minLength={2} required />
            </label>
            <label className={styles.wide}>
              <span>Email de acceso</span>
              <div className={styles.inputWithIcon}>
                <Mail size={17} />
                <input name="email" type="email" defaultValue={profile.user.email} required />
              </div>
            </label>
            <label className={styles.wide}>
              <span>Teléfono</span>
              <div className={styles.inputWithIcon}>
                <Phone size={17} />
                <input name="phone" defaultValue={profile.user.phone ?? ""} placeholder="+54 9 221..." />
              </div>
            </label>
          </div>

          <button className={styles.primary} disabled={saving}>
            {saving ? <LoaderCircle className={styles.spin} size={17} /> : <Check size={17} />}
            {saving ? "Guardando..." : "Guardar datos"}
          </button>
        </form>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.icon}><Building2 size={20} /></span>
            <div>
              <h3>Acceso y alcance</h3>
              <p>Información de la organización asociada a tu cuenta.</p>
            </div>
          </div>

          <div className={styles.readOnlyList}>
            <div>
              <span>Rol</span>
              <strong>Administrador</strong>
            </div>
            <div>
              <span>Academia</span>
              <strong>{profile.organization?.name ?? "M&M Academia de Baile"}</strong>
            </div>
            <div>
              <span>Zona horaria</span>
              <strong>{profile.organization?.timezone ?? "America/Argentina/Buenos_Aires"}</strong>
            </div>
          </div>

          <div className={styles.branchList}>
            <span className={styles.sectionLabel}>SEDES HABILITADAS</span>
            {profile.branches.length === 0 && <p>No hay sedes asignadas.</p>}
            {profile.branches.map((branch) => (
              <div key={branch._id}>
                <span className={styles.branchIcon}><MapPin size={16} /></span>
                <span>
                  <strong>{branch.name}</strong>
                  <small>{branch.address || "Sin dirección cargada"}</small>
                </span>
                <b>{branch.isActive ? "Activa" : "Inactiva"}</b>
              </div>
            ))}
          </div>
        </section>

        <form className={styles.card + " " + styles.securityCard} onSubmit={changePassword}>
          <div className={styles.cardHeader}>
            <span className={styles.icon}><KeyRound size={20} /></span>
            <div>
              <h3>Seguridad</h3>
              <p>Cambiá tu contraseña. Al guardarla, la sesión se cerrará para que vuelvas a ingresar.</p>
            </div>
          </div>

          <div className={styles.formGrid}>
            <label className={styles.wide}>
              <span>Contraseña actual</span>
              <div className={styles.inputWithIcon}>
                <LockKeyhole size={17} />
                <input name="currentPassword" type="password" autoComplete="current-password" minLength={8} required />
              </div>
            </label>
            <label>
              <span>Nueva contraseña</span>
              <input name="newPassword" type="password" autoComplete="new-password" minLength={10} required />
            </label>
            <label>
              <span>Repetir nueva contraseña</span>
              <input name="confirmPassword" type="password" autoComplete="new-password" minLength={10} required />
            </label>
          </div>

          <div className={styles.passwordHint}>
            Mínimo 10 caracteres, incluyendo al menos una letra y un número.
          </div>

          <button className={styles.primary} disabled={changingPassword}>
            {changingPassword ? <LoaderCircle className={styles.spin} size={17} /> : <KeyRound size={17} />}
            {changingPassword ? "Actualizando..." : "Cambiar contraseña"}
          </button>
        </form>
      </div>
    </>
  );
}
