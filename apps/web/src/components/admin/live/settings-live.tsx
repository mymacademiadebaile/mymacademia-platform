"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from "react";
import {
  BookOpenCheck,
  CalendarCog,
  Building2,
  Check,
  Edit3,
  ImagePlus,
  Mail,
  MapPin,
  MessageCircle,
  Plus,
  Power,
  RotateCcw,
  Settings2,
  Share2,
  UserRound
} from "lucide-react";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import type { Branch } from "./live-types";
import { ErrorBlock, Field, LiveModal, LoadingBlock } from "./live-common";
import { SchedulingSettingsPanel } from "../scheduling/scheduling-settings-panel";
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
    instagramUrl?: string;
    tiktokUrl?: string;
    facebookUrl?: string;
    youtubeUrl?: string;
    timezone?: string;
    cancellationNoticeHours?: number;
    academySpaceImages?: Partial<Record<AcademySpaceImageSlot, LandingImage>>;
  };
  primaryBranch: Branch | null;
  branches: Branch[];
};

type AcademySpaceImageSlot = "tall" | "wide" | "detail";
type LandingImage = { url: string; width?: number; height?: number };
type SettingsTab = "academy" | "inquiries" | "operation" | "channels" | "landing" | "branches" | "catalogs" | "scheduling";

const ACADEMY_SPACE_IMAGES: Record<AcademySpaceImageSlot, {
  title: string;
  help: string;
  fallback: string;
  previewClass: string;
}> = {
  tall: {
    title: "Foto vertical",
    help: "La imagen alta de la izquierda. Mejor si es vertical.",
    fallback: "/landing/mock/space-studio-barre.jpg",
    previewClass: "tall"
  },
  wide: {
    title: "Foto horizontal",
    help: "La imagen amplia del centro. Mejor si es horizontal.",
    fallback: "/landing/mock/space-group-overhead.jpg",
    previewClass: "wide"
  },
  detail: {
    title: "Foto de detalle",
    help: "La imagen pequeña de la derecha. Puede ser horizontal o cuadrada.",
    fallback: "/landing/mock/space-class-mirror.jpg",
    previewClass: "detail"
  }
};

export function SettingsLive() {
  const { toast, confirm } = useAdminFeedback();
  const [data, setData] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [branchModal, setBranchModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchSaving, setBranchSaving] = useState(false);
  const [landingImageBusy, setLandingImageBusy] = useState<AcademySpaceImageSlot | null>(null);
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>("academy");
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
          instagramUrl: form.get("instagramUrl"),
          tiktokUrl: form.get("tiktokUrl"),
          facebookUrl: form.get("facebookUrl"),
          youtubeUrl: form.get("youtubeUrl"),
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

  async function uploadLandingImage(slot: AcademySpaceImageSlot, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const form = new FormData();
    form.append("file", file);
    setLandingImageBusy(slot);
    setError("");

    try {
      await apiFetch(`/admin/settings/landing-images/${slot}`, { method: "POST", body: form });
      toast(`${ACADEMY_SPACE_IMAGES[slot].title} actualizada`);
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setLandingImageBusy(null);
    }
  }

  async function restoreLandingImage(slot: AcademySpaceImageSlot) {
    const approved = await confirm({
      title: "Restaurar imagen predeterminada",
      description: `Se quitará la foto personalizada de ${ACADEMY_SPACE_IMAGES[slot].title.toLocaleLowerCase("es-AR")} y volverá a mostrarse la imagen actual de la landing.`,
      confirmLabel: "Restaurar",
      tone: "danger"
    });
    if (!approved) return;

    setLandingImageBusy(slot);
    setError("");

    try {
      await apiFetch(`/admin/settings/landing-images/${slot}`, { method: "DELETE" });
      toast("Imagen predeterminada restaurada");
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setLandingImageBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="SISTEMA"
        title="Configuración"
        description="Organizá los datos que definen cómo funciona la academia y cómo se presenta en la web."
      />

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}
      {loading && !data && <LoadingBlock />}

      {data && (
        <>
          <nav className={styles.settingsNav} aria-label="Secciones de configuración" role="tablist">
            <button type="button" role="tab" id="academy-tab" aria-controls="academy-settings" aria-selected={activeSettingsTab === "academy"} onClick={() => setActiveSettingsTab("academy")}><Building2 size={16} /> Academia</button>
            <button type="button" role="tab" id="inquiries-tab" aria-controls="inquiries-settings" aria-selected={activeSettingsTab === "inquiries"} onClick={() => setActiveSettingsTab("inquiries")}><MessageCircle size={16} /> Consultas</button>
            <button type="button" role="tab" id="operation-tab" aria-controls="operation-settings" aria-selected={activeSettingsTab === "operation"} onClick={() => setActiveSettingsTab("operation")}><Settings2 size={16} /> Operación</button>
            <button type="button" role="tab" id="channels-tab" aria-controls="channels-settings" aria-selected={activeSettingsTab === "channels"} onClick={() => setActiveSettingsTab("channels")}><Share2 size={16} /> Canales</button>
            <button type="button" role="tab" id="landing-tab" aria-controls="landing-settings" aria-selected={activeSettingsTab === "landing"} onClick={() => setActiveSettingsTab("landing")}><ImagePlus size={16} /> Landing</button>
            <button type="button" role="tab" id="branches-tab" aria-controls="branches-settings" aria-selected={activeSettingsTab === "branches"} onClick={() => setActiveSettingsTab("branches")}><MapPin size={16} /> Sedes</button>
            <button type="button" role="tab" id="catalogs-tab" aria-controls="catalogs-settings" aria-selected={activeSettingsTab === "catalogs"} onClick={() => setActiveSettingsTab("catalogs")}><BookOpenCheck size={16} /> Catálogos</button>
            <button type="button" role="tab" id="scheduling-tab" aria-controls="scheduling-settings" aria-selected={activeSettingsTab === "scheduling"} onClick={() => setActiveSettingsTab("scheduling")}><CalendarCog size={16} /> Pistas, feriados y cobros</button>
          </nav>

          <form className={styles.settingsForm} onSubmit={save}>
            <section className={styles.settingsGroup} id="academy-settings" role="tabpanel" aria-labelledby="academy-tab" hidden={activeSettingsTab !== "academy"}>
              <div className={styles.settingsGroupHeader}>
                <span className={styles.settingsGroupIcon}><Building2 size={19} /></span>
                <div>
                  <h2 id="academy-settings-title">Identidad de la academia</h2>
                  <p>Estos datos se usan dentro del sistema y en las comunicaciones institucionales.</p>
                </div>
              </div>
              <div className={styles.settingsFieldGrid}>
                <label className={styles.fieldWide}>
                  <span>Nombre de la academia</span>
                  <input name="name" defaultValue={data.organization.name} required />
                </label>
                <label className={styles.field}>
                  <span>Email institucional</span>
                  <input name="email" type="email" defaultValue={data.organization.email ?? ""} />
                </label>
                <label className={styles.field}>
                  <span>Teléfono</span>
                  <input name="phone" defaultValue={data.organization.phone ?? ""} placeholder="Ej. +54 9 221 ..." />
                </label>
              </div>
            </section>

            <section className={styles.settingsGroup} id="inquiries-settings" role="tabpanel" aria-labelledby="inquiries-tab" hidden={activeSettingsTab !== "inquiries"}>
              <div className={styles.settingsGroupHeader}>
                <span className={styles.settingsGroupIcon}><MessageCircle size={19} /></span>
                <div>
                  <h2 id="inquiries-settings-title">Consultas e inscripciones</h2>
                  <p>Definí un único contacto para responder a quienes llegan desde la web.</p>
                </div>
              </div>
              <div className={styles.settingsFieldGrid}>
                <label className={styles.field}>
                  <span>Responsable de consultas</span>
                  <div className={styles.fieldWithIcon}>
                    <UserRound size={15} />
                    <input name="inquiryContactName" defaultValue={data.organization.inquiryContactName ?? ""} placeholder="Ej. Administración" />
                  </div>
                </label>
                <label className={styles.field}>
                  <span>WhatsApp de consultas e inscripción</span>
                  <div className={styles.fieldWithIcon}>
                    <MessageCircle size={15} />
                    <input name="inquiryWhatsApp" defaultValue={data.organization.inquiryWhatsApp ?? ""} placeholder="Ej. +54 9 221 ..." />
                  </div>
                </label>
              </div>
              <p className={styles.settingsHint}>Los profesores no reciben contactos públicos de forma directa.</p>
            </section>

            <section className={styles.settingsGroup} id="operation-settings" role="tabpanel" aria-labelledby="operation-tab" hidden={activeSettingsTab !== "operation"}>
              <div className={styles.settingsGroupHeader}>
                <span className={styles.settingsGroupIcon}><Settings2 size={19} /></span>
                <div>
                  <h2 id="operation-settings-title">Reglas operativas</h2>
                  <p>Preferencias que impactan en turnos, agenda y cancelaciones.</p>
                </div>
              </div>
              <div className={styles.settingsFieldGrid}>
                <label className={styles.field}>
                  <span>Zona horaria</span>
                  <input name="timezone" defaultValue={data.organization.timezone ?? "America/Argentina/Buenos_Aires"} required />
                </label>
                <label className={styles.field}>
                  <span>Anticipación mínima para cancelar</span>
                  <div className={styles.fieldUnit}>
                    <input name="cancellationNoticeHours" type="number" min="0" max="168" defaultValue={data.organization.cancellationNoticeHours ?? 6} required />
                    <span>horas</span>
                  </div>
                  <small>Los cambios entre turnos no tienen costo ni límite.</small>
                </label>
              </div>
            </section>

            <section className={styles.settingsGroup} id="channels-settings" role="tabpanel" aria-labelledby="channels-tab" hidden={activeSettingsTab !== "channels"}>
              <div className={styles.settingsGroupHeader}>
                <span className={styles.settingsGroupIcon}><Share2 size={19} /></span>
                <div>
                  <h2 id="channels-settings-title">Canales públicos</h2>
                  <p>Elegí cómo te encuentran y qué redes se muestran en el pie de la web.</p>
                </div>
              </div>
              <div className={styles.settingsFieldGrid}>
                <label className={styles.field}>
                  <span>Instagram</span>
                  <input name="instagramUrl" type="url" defaultValue={data.organization.instagramUrl ?? ""} placeholder="https://www.instagram.com/..." />
                </label>
                <label className={styles.field}>
                  <span>TikTok</span>
                  <input name="tiktokUrl" type="url" defaultValue={data.organization.tiktokUrl ?? ""} placeholder="https://www.tiktok.com/@..." />
                </label>
                <label className={styles.field}>
                  <span>Facebook</span>
                  <input name="facebookUrl" type="url" defaultValue={data.organization.facebookUrl ?? ""} placeholder="https://www.facebook.com/..." />
                </label>
                <label className={styles.field}>
                  <span>YouTube</span>
                  <input name="youtubeUrl" type="url" defaultValue={data.organization.youtubeUrl ?? ""} placeholder="https://www.youtube.com/@..." />
                </label>
              </div>
              <div className={styles.settingsIntegration}>
                <span className={styles.avatar}><Mail size={17} /></span>
                <span className={styles.rowBody}>
                  <strong>Envíos por Gmail</strong>
                  <small>Las credenciales SMTP están protegidas en variables de entorno.</small>
                </span>
                <span className={styles.pillOff}>Administrado</span>
              </div>
            </section>

            <div className={styles.settingsSaveBar} hidden={!(["academy", "inquiries", "operation", "channels"] as SettingsTab[]).includes(activeSettingsTab)}>
              <span>
                <strong>Guardá los cambios de configuración</strong>
                <small>Podés modificar distintos grupos antes de confirmar.</small>
              </span>
              <button className={styles.primary} disabled={saving}>
                <Check size={16} />
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </form>

          <section className={`${styles.historySection} ${styles.settingsStandaloneSection}`} id="landing-settings" role="tabpanel" aria-labelledby="landing-tab" hidden={activeSettingsTab !== "landing"}>
            <div className={styles.sectionTitleRow}>
              <div>
                <span className={styles.cardLabel}>LANDING PÚBLICA · 06</span>
                <h3 id="landing-images-title">La academia / El salón</h3>
                <p>Reemplazá las tres imágenes del collage que se muestra hoy en esta sección de la landing.</p>
              </div>
            </div>

            <div className={styles.landingImageGrid}>
              {(Object.keys(ACADEMY_SPACE_IMAGES) as AcademySpaceImageSlot[]).map((slot) => {
                const definition = ACADEMY_SPACE_IMAGES[slot];
                const image = data.organization.academySpaceImages?.[slot];
                const busy = landingImageBusy === slot;

                return (
                  <article className={styles.landingImageCard} key={slot}>
                    <div className={`${styles.landingImagePreview} ${styles[`landingImagePreview${definition.previewClass[0].toUpperCase()}${definition.previewClass.slice(1)}`]}`}>
                      <img src={image?.url ?? definition.fallback} alt="Vista previa de la imagen de la landing" />
                    </div>
                    <div className={styles.landingImageBody}>
                      <div>
                        <strong>{definition.title}</strong>
                        <p>{definition.help}</p>
                      </div>
                      <span className={image ? styles.pill : styles.pillOff}>
                        {image ? "Personalizada" : "Imagen actual"}
                      </span>
                    </div>
                    <div className={styles.landingImageActions}>
                      <label className={styles.secondary} aria-disabled={busy}>
                        <ImagePlus size={14} />
                        {busy ? "Subiendo…" : image ? "Cambiar" : "Cargar imagen"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          disabled={busy}
                          onChange={(event) => void uploadLandingImage(slot, event)}
                        />
                      </label>
                      {image && (
                        <button
                          type="button"
                          className={styles.inlineAction}
                          disabled={busy}
                          onClick={() => void restoreLandingImage(slot)}
                        >
                          <RotateCcw size={14} /> Restaurar
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
            <p className={styles.landingImageNote}>
              Formatos admitidos: JPG, PNG o WEBP de hasta 4 MB. La landing puede tardar hasta un minuto en reflejar el cambio.
            </p>
          </section>

          <section className={`${styles.historySection} ${styles.settingsStandaloneSection}`} id="branches-settings" role="tabpanel" aria-labelledby="branches-tab" hidden={activeSettingsTab !== "branches"}>
            <div className={styles.sectionTitleRow}>
              <div>
                <span className={styles.cardLabel}>SEDES</span>
                <h3>Sedes de la academia</h3>
                <p>Administrá ubicaciones actuales y futuras sin cambiar código.</p>
              </div>
              <button type="button" className={styles.primary} onClick={openNewBranch}>
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

          <section className={`${styles.historySection} ${styles.settingsStandaloneSection}`} id="catalogs-settings" role="tabpanel" aria-labelledby="catalogs-tab" hidden={activeSettingsTab !== "catalogs"}>
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

          <section className={`${styles.historySection} ${styles.settingsStandaloneSection}`} id="scheduling-settings" role="tabpanel" aria-labelledby="scheduling-tab" hidden={activeSettingsTab !== "scheduling"}>
            {activeSettingsTab === "scheduling" && <SchedulingSettingsPanel branches={data.branches} />}
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
