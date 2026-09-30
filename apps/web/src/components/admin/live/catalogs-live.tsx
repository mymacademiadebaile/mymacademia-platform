"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Edit3,
  Globe,
  ImagePlus,
  PauseCircle,
  PlayCircle,
  Plus,
  Trash2
} from "lucide-react";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import type { CatalogItem } from "./live-types";
import {
  ErrorBlock,
  Field,
  LiveModal,
  LoadingBlock,
  WebChecklist,
  WebSwitch
} from "./live-common";
import styles from "./live.module.css";

const groups = [
  {
    type: "DISCIPLINE" as const,
    title: "Ritmos / disciplinas",
    description: "Bachata, Salsa, Estilo Femenino..."
  },
  {
    type: "SEGMENT" as const,
    title: "Público",
    description: "Infantil, adolescentes, adultos..."
  },
  {
    type: "LEVEL" as const,
    title: "Niveles",
    description: "Inicial, intermedio, avanzado..."
  }
];

const TAGLINE_MAX = 160;
const DESCRIPTION_MAX = 2000;

function webStatus(item: CatalogItem): "live" | "incomplete" | "" {
  if (!item.publishOnWeb) return "";
  return item.isActive && item.image && item.tagline?.trim() ? "live" : "incomplete";
}

export function CatalogsLive({ embedded = false }: { embedded?: boolean }) {
  const { toast, confirm } = useAdminFeedback();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [webId, setWebId] = useState("");
  const [webTagline, setWebTagline] = useState("");
  const [webDescription, setWebDescription] = useState("");
  const [webSlug, setWebSlug] = useState("");
  const [webPublish, setWebPublish] = useState(false);
  const [webError, setWebError] = useState("");
  const [webSaving, setWebSaving] = useState(false);
  const [webImageBusy, setWebImageBusy] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      setItems(await apiFetch<CatalogItem[]>("/admin/catalogs"));
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(
    () =>
      Object.fromEntries(
        groups.map((group) => [
          group.type,
          items.filter((item) => item.type === group.type)
        ])
      ) as Record<(typeof groups)[number]["type"], CatalogItem[]>,
    [items]
  );

  async function add(type: CatalogItem["type"]) {
    const name = values[type]?.trim();
    if (!name) return;

    setError("");

    try {
      await apiFetch<CatalogItem>("/admin/catalogs", {
        method: "POST",
        body: JSON.stringify({
          type,
          name,
          sortOrder: grouped[type].length
        })
      });
      setValues((current) => ({ ...current, [type]: "" }));
      toast("Opción agregada");
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError));
    }
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;

    const form = new FormData(event.currentTarget);
    setBusyId(editing._id);
    setError("");

    try {
      await apiFetch<CatalogItem>(`/admin/catalogs/${editing._id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: form.get("name") })
      });
      setEditing(null);
      toast("Nombre actualizado");
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setBusyId("");
    }
  }

  const webItem = useMemo(
    () => items.find((item) => item._id === webId) ?? null,
    [items, webId]
  );

  function openWeb(item: CatalogItem) {
    setWebId(item._id);
    setWebTagline(item.tagline ?? "");
    setWebDescription(item.description ?? "");
    setWebSlug(item.slug ?? "");
    setWebPublish(Boolean(item.publishOnWeb));
    setWebError("");
  }

  function closeWeb() {
    if (webSaving || webImageBusy) return;
    setWebId("");
  }

  async function uploadWebImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !webItem) return;

    const form = new FormData();
    form.append("file", file);
    setWebImageBusy(true);
    setWebError("");

    try {
      await apiFetch(`/admin/catalogs/${webItem._id}/image`, {
        method: "POST",
        body: form
      });
      toast("Imagen actualizada");
      await load();
    } catch (requestError) {
      setWebError(apiMessage(requestError));
    } finally {
      setWebImageBusy(false);
    }
  }

  async function removeWebImage() {
    if (!webItem) return;

    const approved = await confirm({
      title: "Quitar imagen",
      description: webItem.publishOnWeb
        ? "Sin imagen el ritmo se despublica y deja de verse en la web."
        : "La imagen de portada se quitará de este ritmo.",
      confirmLabel: "Quitar",
      tone: "danger"
    });
    if (!approved) return;

    setWebImageBusy(true);
    setWebError("");

    try {
      await apiFetch(`/admin/catalogs/${webItem._id}/image`, { method: "DELETE" });
      setWebPublish(false);
      toast("Imagen eliminada");
      await load();
    } catch (requestError) {
      setWebError(apiMessage(requestError));
    } finally {
      setWebImageBusy(false);
    }
  }

  async function saveWeb(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!webItem) return;

    const payload: Record<string, unknown> = {
      tagline: webTagline.trim(),
      description: webDescription.trim()
    };
    const slug = webSlug.trim();
    if (slug !== (webItem.slug ?? "")) payload.slug = slug;
    if (webPublish !== Boolean(webItem.publishOnWeb)) payload.publishOnWeb = webPublish;

    setWebSaving(true);
    setWebError("");

    try {
      await apiFetch<CatalogItem>(`/admin/catalogs/${webItem._id}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      toast("Ficha web guardada");
      setWebId("");
      await load();
    } catch (requestError) {
      setWebError(apiMessage(requestError));
    } finally {
      setWebSaving(false);
    }
  }

  async function toggle(item: CatalogItem) {
    const usage = item.usage?.total ?? 0;
    let confirmInUse = false;

    if (item.isActive && usage > 0) {
      confirmInUse = await confirm({
        title: "Desactivar opción en uso",
        description:
          '"' + item.name + '" está en uso por ' + (item.usage?.classes ?? 0) + " clase(s)" +
          (item.usage?.professors ? " y " + item.usage.professors + " profesor(es)" : "") +
          ". Las referencias actuales se conservan, pero ya no estará disponible para nuevas selecciones." +
          (item.publishOnWeb ? " También dejará de verse en la web." : ""),
        confirmLabel: "Desactivar",
        tone: "danger"
      });

      if (!confirmInUse) return;
    }

    setBusyId(item._id);
    setError("");

    try {
      await apiFetch<CatalogItem>(`/admin/catalogs/${item._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          isActive: !item.isActive,
          confirmInUse
        })
      });
      toast(item.isActive ? "Opción desactivada" : "Opción activada");
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setBusyId("");
    }
  }

  async function move(
    type: CatalogItem["type"],
    item: CatalogItem,
    direction: -1 | 1
  ) {
    const current = [...grouped[type]];
    const index = current.findIndex((candidate) => candidate._id === item._id);
    const target = index + direction;

    if (index < 0 || target < 0 || target >= current.length) return;

    [current[index], current[target]] = [current[target], current[index]];
    setBusyId(item._id);
    setError("");

    try {
      await apiFetch("/admin/catalogs/reorder", {
        method: "POST",
        body: JSON.stringify({
          type,
          orderedIds: current.map((candidate) => candidate._id)
        })
      });
      toast("Orden actualizado");
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setBusyId("");
    }
  }

  return (
    <>
      {!embedded && (
        <PageHeader
          eyebrow="DATOS MAESTROS"
          title="Catálogos"
          description="Administrá las opciones que usan clases y profesores, sin texto libre."
        />
      )}

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}
      {loading && !items.length && <LoadingBlock />}

      {(items.length > 0 || !loading) && (
        <div className={styles.catalogColumns}>
          {groups.map((group) => (
            <section className={styles.catalogColumn} key={group.type}>
              <div className={styles.catalogColumnHeader}>
                <strong>{group.title}</strong>
                <small>{group.description}</small>
              </div>

              <div className={styles.catalogAdd}>
                <input
                  value={values[group.type] ?? ""}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [group.type]: event.target.value
                    }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void add(group.type);
                    }
                  }}
                  placeholder="Agregar..."
                />
                <button onClick={() => void add(group.type)} aria-label="Agregar">
                  <Plus size={17} />
                </button>
              </div>

              {grouped[group.type].length === 0 && (
                <div className={styles.catalogEmpty}>Todavía no hay opciones.</div>
              )}

              {grouped[group.type].map((item, index) => (
                <div className={styles.catalogItem} key={item._id}>
                  <div className={styles.catalogOrder}>
                    <button
                      aria-label="Subir"
                      disabled={index === 0 || busyId === item._id}
                      onClick={() => void move(group.type, item, -1)}
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      aria-label="Bajar"
                      disabled={
                        index === grouped[group.type].length - 1 ||
                        busyId === item._id
                      }
                      onClick={() => void move(group.type, item, 1)}
                    >
                      <ArrowDown size={13} />
                    </button>
                  </div>

                  <div className={styles.catalogBody}>
                    <strong>{item.name}</strong>
                    <small>
                      {item.usage?.classes ?? 0} clase(s)
                      {group.type === "DISCIPLINE"
                        ? ` · ${item.usage?.professors ?? 0} profesor(es)`
                        : ""}
                    </small>
                    {group.type === "DISCIPLINE" && webStatus(item) === "live" && (
                      <span className={styles.webStatusOk}>En la web</span>
                    )}
                    {group.type === "DISCIPLINE" && webStatus(item) === "incomplete" && (
                      <span className={styles.webStatusWarn}>Incompleto</span>
                    )}
                  </div>

                  <span className={item.isActive ? styles.pill : styles.pillOff}>
                    {item.isActive ? "Activo" : "Inactivo"}
                  </span>

                  <div className={styles.catalogActions}>
                    {group.type === "DISCIPLINE" && (
                      <button
                        type="button"
                        className={styles.inlineAction}
                        disabled={busyId === item._id}
                        onClick={() => openWeb(item)}
                        title="Ficha web"
                        aria-label={"Ficha web de " + item.name}
                      >
                        <Globe size={13} />
                      </button>
                    )}
                    <button
                      className={styles.inlineAction}
                      disabled={busyId === item._id}
                      onClick={() => setEditing(item)}
                      title="Editar nombre"
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      className={styles.inlineAction}
                      disabled={busyId === item._id}
                      onClick={() => void toggle(item)}
                      title={item.isActive ? "Desactivar" : "Activar"}
                    >
                      {item.isActive ? (
                        <PauseCircle size={13} />
                      ) : (
                        <PlayCircle size={13} />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}

      <LiveModal
        open={Boolean(webItem)}
        eyebrow="LANDING PÚBLICA"
        title={"Ficha web" + (webItem ? " · " + webItem.name : "")}
        description="Lo que se ve de este ritmo en la página pública. Se ve en la web si está activo y publicado (con imagen y descripción corta)."
        submitting={webSaving}
        onClose={closeWeb}
        onSubmit={saveWeb}
      >
        {webItem && (
          <>
            {webError && (
              <div className={styles.webFormError} role="alert">{webError}</div>
            )}

            <div className={styles.webImageRow}>
              <div className={styles.webImagePreview}>
                {webItem.image ? (
                  <img src={webItem.image.url} alt={"Portada de " + webItem.name} />
                ) : (
                  <span>Sin imagen</span>
                )}
              </div>
              <div className={styles.webImageSide}>
                <strong>Imagen de portada</strong>
                <p className={styles.webHelp}>
                  Formato vertical recomendado (4:5), mínimo 1000 px de ancho. JPG, PNG o WEBP, máx. 4 MB.
                </p>
                <div className={styles.webImageActions}>
                  <label aria-disabled={webImageBusy}>
                    <ImagePlus size={14} />
                    {webImageBusy ? "Subiendo…" : webItem.image ? "Cambiar" : "Cargar imagen"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={webImageBusy}
                      onChange={(event) => void uploadWebImage(event)}
                    />
                  </label>
                  {webItem.image && (
                    <button
                      type="button"
                      disabled={webImageBusy}
                      onClick={() => void removeWebImage()}
                    >
                      <Trash2 size={14} /> Quitar
                    </button>
                  )}
                </div>
              </div>
            </div>

            <Field label="Descripción corta" wide>
              <input
                value={webTagline}
                maxLength={TAGLINE_MAX}
                onChange={(event) => setWebTagline(event.target.value)}
                aria-describedby="web-tagline-count"
              />
              <span className={styles.webCounter} id="web-tagline-count">
                {webTagline.length}/{TAGLINE_MAX}
              </span>
            </Field>

            <Field label="Descripción larga" wide>
              <textarea
                rows={6}
                value={webDescription}
                maxLength={DESCRIPTION_MAX}
                onChange={(event) => setWebDescription(event.target.value)}
                aria-describedby="web-description-help"
              />
              <span className={styles.webCounter} id="web-description-help">
                Separá los párrafos con una línea en blanco · {webDescription.length}/{DESCRIPTION_MAX}
              </span>
            </Field>

            <Field label="URL de la clase" wide>
              <div className={styles.webSlug}>
                <span>/clases/</span>
                <input
                  value={webSlug}
                  onChange={(event) => setWebSlug(event.target.value)}
                  placeholder="se genera al publicar"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-describedby="web-slug-help"
                />
                <span>-la-plata</span>
              </div>
              <span className={styles.webHelp} id="web-slug-help">
                Si queda vacía se genera al publicar. Cambiarla rompe los links ya compartidos.
              </span>
            </Field>

            <div className={styles.webBox}>
              {(() => {
                const requirements = [
                  { label: "Ritmo activo", ok: webItem.isActive },
                  { label: "Descripción corta", ok: webTagline.trim().length > 0 },
                  { label: "Imagen", ok: Boolean(webItem.image) }
                ];
                const ready = requirements.every((requirement) => requirement.ok);

                return (
                  <>
                    <WebChecklist items={requirements} />
                    <WebSwitch
                      label="Publicar en la web"
                      checked={webPublish}
                      disabled={!ready && !webPublish}
                      describedBy="web-publish-help"
                      onChange={setWebPublish}
                    />
                    <p
                      id="web-publish-help"
                      className={ready || webPublish ? styles.webHelp : styles.webHelpWarn}
                    >
                      {ready || webPublish
                        ? "El cambio se aplica al tocar Guardar."
                        : "Completá los requisitos para poder publicar."}
                    </p>
                  </>
                );
              })()}
            </div>
          </>
        )}
      </LiveModal>

      <LiveModal
        open={Boolean(editing)}
        title="Editar opción"
        description="El cambio se aplica a todas las pantallas que referencian este catálogo."
        submitting={Boolean(busyId)}
        onClose={() => setEditing(null)}
        onSubmit={saveEdit}
      >
        <Field label="Nombre" wide>
          <input
            name="name"
            defaultValue={editing?.name ?? ""}
            key={editing?._id ?? "catalog-edit"}
            required
          />
        </Field>
      </LiveModal>
    </>
  );
}
