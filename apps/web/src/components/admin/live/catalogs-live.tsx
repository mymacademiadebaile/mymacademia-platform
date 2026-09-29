"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import type { CatalogItem } from "./live-types";
import { ErrorBlock, LoadingBlock } from "./live-common";
import styles from "./live.module.css";

const groups = [
  { type: "DISCIPLINE" as const, title: "Disciplinas", description: "Reggaetón, Bachata, Salsa..." },
  { type: "SEGMENT" as const, title: "Público", description: "Infantil, adolescentes, adultos..." },
  { type: "LEVEL" as const, title: "Niveles", description: "Inicial, intermedio, avanzado..." }
];

export function CatalogsLive() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
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

    try {
      await apiFetch<CatalogItem>("/admin/catalogs", {
        method: "POST",
        body: JSON.stringify({ type, name, sortOrder: grouped[type].length })
      });
      setValues((current) => ({ ...current, [type]: "" }));
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError));
    }
  }

  async function toggle(item: CatalogItem) {
    try {
      await apiFetch<CatalogItem>(`/admin/catalogs/${item._id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !item.isActive })
      });
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError));
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="DATOS MAESTROS"
        title="Catálogos"
        description="Estas son las opciones reales que después seleccionan profesores y administración."
      />

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}
      {loading && !items.length && <LoadingBlock />}

      {!loading && (
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
                    setValues((current) => ({ ...current, [group.type]: event.target.value }))
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
              {grouped[group.type].map((item) => (
                <div className={styles.catalogItem} key={item._id}>
                  <strong>{item.name}</strong>
                  <span className={item.isActive ? styles.pill : styles.pillOff}>
                    {item.isActive ? "Activo" : "Inactivo"}
                  </span>
                  <button className={styles.inlineAction} onClick={() => void toggle(item)}>
                    {item.isActive ? "Pausar" : "Activar"}
                  </button>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
