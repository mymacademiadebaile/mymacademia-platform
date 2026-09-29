"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Check, Mail } from "lucide-react";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import type { Branch } from "./live-types";
import { ErrorBlock, LoadingBlock } from "./live-common";
import styles from "./live.module.css";

type SettingsData = {
  organization: {
    _id: string;
    name: string;
    email?: string;
    phone?: string;
    timezone?: string;
  };
  primaryBranch: Branch | null;
  branches: Branch[];
};

export function SettingsLive() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      setData(await apiFetch<SettingsData>("/admin/settings"));
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    setNotice("");

    try {
      await apiFetch("/admin/settings", {
        method: "PUT",
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          phone: form.get("phone"),
          timezone: form.get("timezone"),
          primaryBranch: {
            name: form.get("branchName"),
            address: form.get("address")
          }
        })
      });
      setNotice("Configuración guardada.");
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="SISTEMA"
        title="Configuración"
        description="Datos reales de la academia y su sede principal."
      />

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}
      {loading && !data && <LoadingBlock />}

      {data && (
        <form className={styles.card} onSubmit={save}>
          {notice && <div className={styles.notice}>{notice}</div>}
          <div className={styles.liveGrid3}>
            <label className={styles.field}>
              <span>Nombre de la academia</span>
              <input name="name" defaultValue={data.organization.name} required />
            </label>
            <label className={styles.field}>
              <span>Email</span>
              <input name="email" type="email" defaultValue={data.organization.email ?? ""} />
            </label>
            <label className={styles.field}>
              <span>Teléfono</span>
              <input name="phone" defaultValue={data.organization.phone ?? ""} />
            </label>
            <label className={styles.field}>
              <span>Sede principal</span>
              <input name="branchName" defaultValue={data.primaryBranch?.name ?? "La Plata"} required />
            </label>
            <label className={styles.fieldWide}>
              <span>Dirección</span>
              <input name="address" defaultValue={data.primaryBranch?.address ?? "Calle 35 entre 3 y 4, La Plata"} />
            </label>
            <label className={styles.field}>
              <span>Zona horaria</span>
              <input name="timezone" defaultValue={data.organization.timezone ?? "America/Argentina/Buenos_Aires"} required />
            </label>
          </div>

          <div style={{ marginTop: 18, paddingTop: 15, borderTop: "1px solid #eee8f2", display: "flex", alignItems: "center", gap: 9 }}>
            <span className={styles.avatar}><Mail size={17} /></span>
            <span className={styles.rowBody}>
              <strong>Gmail + Nodemailer</strong>
              <small>La contraseña de aplicación se configura únicamente en variables de entorno.</small>
            </span>
            <button className={styles.primary} disabled={saving}>
              <Check size={16} />
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
