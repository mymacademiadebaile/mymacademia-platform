"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Building2, Check, Edit3, Mail, MessageCircle, Plus, Power, UserRound } from "lucide-react";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import type { Branch } from "./live-types";
import { ErrorBlock, Field, LiveModal, LoadingBlock } from "./live-common";
import { CatalogsLive } from "./catalogs-live";
import styles from "./live.module.css";

type SettingsData = {
  organization: {
    _id: string;
    name: string;
    email?: string;
    phone?: string;
    inquiryContactName?: string;
    inquiryWhatsApp?: string;
    timezone?: string;
    cancellationNoticeHours?: number;
  };
  primaryBranch: Branch | null;
  branches: Branch[];
};

export function SettingsLive() {
  const { toast, confirm } = useAdminFeedback();
  const [data, setData] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [branchModal, setBranchModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchSaving, setBranchSaving] = useState(false);
  const [error, setError] = useState("");

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

    try {
      await apiFetch("/admin/settings", {
        method: "PUT",
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          phone: form.get("phone"),
          inquiryContactName: form.get("inquiryContactName"),
          inquiryWhatsApp: form.get("inquiryWhatsApp"),
          timezone: form.get("timezone"),
          cancellationNoticeHours: Number(form.get("cancellationNoticeHours"))
        })
      });
      toast("Configuración general guardada");
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  function openNewBranch() {
    setEditingBranch(null);
    setBranchModal(true);
  }

  function openEditBranch(branch: Branch) {
    setEditingBranch(branch);
    setBranchModal(true);
  }

  async function saveBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBranchSaving(true);
    setError("");

    try {
      const body = JSON.stringify({
        name: form.get("name"),
        address: form.get("address")
      });

      if (editingBranch) {
        await apiFetch(`/admin/branches/${editingBranch._id}`, {
          method: "PATCH",
          body
        });
        toast("Sede actualizada");
      } else {
        await apiFetch("/admin/branches", {
          method: "POST",
          body
        });
        toast("Sede creada");
      }

      setBranchModal(false);
      setEditingBranch(null);
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setBranchSaving(false);
    }
  }

  async function toggleBranch(branch: Branch) {
    const approved = await confirm({
      title: branch.isActive ? "Desactivar sede" : "Activar sede",
      description: branch.isActive
        ? "La sede " + branch.name + " dejará de estar disponible para nuevas operaciones."
        : "La sede " + branch.name + " volverá a estar disponible.",
      confirmLabel: branch.isActive ? "Desactivar" : "Activar",
      tone: branch.isActive ? "danger" : "default"
    });
    if (!approved) return;

    setError("");

    try {
      await apiFetch(`/admin/branches/${branch._id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !branch.isActive })
      });
      toast("Sede " + (branch.isActive ? "desactivada" : "activada"));
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError));
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="SISTEMA"
        title="Configuración"
        description="Datos de la academia, integraciones y sedes operativas."
      />

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}
      {loading && !data && <LoadingBlock />}

      {data && (
        <>
          <form className={styles.card} onSubmit={save}>
            <div className={styles.communicationHeader}>
              <div>
                <span className={styles.cardLabel}>DATOS GENERALES</span>
                <strong>Academia</strong>
              </div>
              <Building2 size={22} color="#5b21b6" />
            </div>

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
                <span>Responsable de consultas</span>
                <div style={{ position: "relative" }}>
                  <UserRound size={15} style={{ position: "absolute", left: 10, top: 13, color: "#7c7284" }} />
                  <input
                    name="inquiryContactName"
                    defaultValue={data.organization.inquiryContactName ?? ""}
                    placeholder="Ej. Administración"
                    style={{ paddingLeft: 34 }}
                  />
                </div>
              </label>
              <label className={styles.field}>
                <span>WhatsApp de consultas e inscripción</span>
                <div style={{ position: "relative" }}>
                  <MessageCircle size={15} style={{ position: "absolute", left: 10, top: 13, color: "#7c7284" }} />
                  <input
                    name="inquiryWhatsApp"
                    defaultValue={data.organization.inquiryWhatsApp ?? ""}
                    placeholder="Ej. +54 9 221 ..."
                    style={{ paddingLeft: 34 }}
                  />
                </div>
              </label>
              <label className={styles.fieldWide}>
                <span>Zona horaria</span>
                <input
                  name="timezone"
                  defaultValue={data.organization.timezone ?? "America/Argentina/Buenos_Aires"}
                  required
                />
              </label>
              <label className={styles.fieldWide}>
                <span>Anticipación mínima para cancelar (horas)</span>
                <input
                  name="cancellationNoticeHours"
                  type="number"
                  min="0"
                  max="168"
                  defaultValue={data.organization.cancellationNoticeHours ?? 6}
                  required
                />
                <small>Los cambios entre turnos no tienen costo ni límite.</small>
              </label>
            </div>

            <div className={styles.notice} style={{ marginTop: 14 }}>
              Las consultas e inscripciones se centralizan en el contacto de la academia. Los profesores no reciben leads públicos directamente.
            </div>

            <div style={{ marginTop: 18, paddingTop: 15, borderTop: "1px solid #eee8f2", display: "flex", alignItems: "center", gap: 9 }}>
              <span className={styles.avatar}><Mail size={17} /></span>
              <span className={styles.rowBody}>
                <strong>Gmail + Nodemailer</strong>
                <small>Las credenciales SMTP viven únicamente en variables de entorno.</small>
              </span>
              <button className={styles.primary} disabled={saving}>
                <Check size={16} />
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </form>

          <section className={styles.historySection}>
            <div className={styles.sectionTitleRow}>
              <div>
                <span className={styles.cardLabel}>SEDES</span>
                <h3>Sedes de la academia</h3>
                <p>Administrá ubicaciones actuales y futuras sin cambiar código.</p>
              </div>
              <button className={styles.primary} onClick={openNewBranch}>
                <Plus size={16} /> Nueva sede
              </button>
            </div>

            <div className={styles.liveGrid3}>
              {data.branches.map((branch) => (
                <article className={styles.card} key={branch._id}>
                  <div className={styles.cardTopLine}>
                    <span className={styles.avatar}><Building2 size={17} /></span>
                    <span className={branch.isActive ? styles.pill : styles.pillOff}>
                      {branch.isActive ? "Activa" : "Inactiva"}
                    </span>
                  </div>
                  <strong className={styles.cardTitle}>{branch.name}</strong>
                  <span className={styles.cardDetail}>{branch.address || "Sin dirección cargada"}</span>
                  <div className={styles.branchActions}>
                    <button className={styles.inlineAction} onClick={() => openEditBranch(branch)}>
                      <Edit3 size={14} /> Editar
                    </button>
                    <button className={styles.inlineAction} onClick={() => void toggleBranch(branch)}>
                      <Power size={14} /> {branch.isActive ? "Desactivar" : "Activar"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.historySection}>
            <div className={styles.sectionTitleRow}>
              <div>
                <span className={styles.cardLabel}>CONFIGURACIÓN ACADÉMICA</span>
                <h3>Ritmos, público y niveles</h3>
                <p>
                  Agregá, editá, ordená, activá o desactivá las opciones que después se usan
                  en clases y profesores.
                </p>
              </div>
            </div>

            <CatalogsLive embedded />
          </section>

          <LiveModal
            open={branchModal}
            title={editingBranch ? "Editar sede" : "Nueva sede"}
            description="Nombre y dirección operativa de la academia."
            submitting={branchSaving}
            onClose={() => {
              setBranchModal(false);
              setEditingBranch(null);
            }}
            onSubmit={saveBranch}
          >
            <Field label="Nombre">
              <input
                name="name"
                defaultValue={editingBranch?.name ?? ""}
                required
                key={editingBranch?._id ?? "new-name"}
              />
            </Field>
            <Field label="Dirección" wide>
              <input
                name="address"
                defaultValue={editingBranch?.address ?? ""}
                key={editingBranch?._id ?? "new-address"}
              />
            </Field>
          </LiveModal>
        </>
      )}
    </>
  );
}
