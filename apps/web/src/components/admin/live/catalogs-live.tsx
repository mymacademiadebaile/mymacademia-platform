"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Edit3,
  PauseCircle,
  PlayCircle,
  Plus
} from "lucide-react";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import type { CatalogItem } from "./live-types";
import { ErrorBlock, Field, LiveModal, LoadingBlock } from "./live-common";
import styles from "./live.module.css";

const groups = [
  {
    type: "DISCIPLINE" as const,
    title: "Disciplinas",
    description: "Reggaetón, Bachata, Salsa..."
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

export function CatalogsLive() {
  const { toast, confirm } = useAdminFeedback();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<CatalogItem | null>(null);
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

  async function toggle(item: CatalogItem) {
    const usage = item.usage?.total ?? 0;
    let confirmInUse = false;

    if (item.isActive && usage > 0) {
      confirmInUse = await confirm({
        title: "Desactivar opción en uso",
        description:
          '"' + item.name + '" está en uso por ' + (item.usage?.classes ?? 0) + " clase(s)" +
          (item.usage?.professors ? " y " + item.usage.professors + " profesor(es)" : "") +
          ". Las referencias actuales se conservan, pero ya no estará disponible para nuevas selecciones.",
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
      <PageHeader
        eyebrow="DATOS MAESTROS"
        title="Catálogos"
        description="Administrá las opciones que usan clases y profesores, sin texto libre."
      />

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
                  </div>

                  <span className={item.isActive ? styles.pill : styles.pillOff}>
                    {item.isActive ? "Activo" : "Inactivo"}
                  </span>

                  <div className={styles.catalogActions}>
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
