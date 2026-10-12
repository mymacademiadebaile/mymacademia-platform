"use client";

import { ChevronDown } from "lucide-react";
import styles from "./calendar.module.css";

export function MultiSelect({
  options,
  selectedIds,
  onChange,
  placeholder,
  open,
  onOpenChange
}: {
  options: Array<{ _id: string; name?: string; displayName?: string }>;
  selectedIds: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const selectedLabels = options
    .filter((item) => selectedIds.includes(item._id))
    .map((item) => item.displayName ?? item.name ?? "")
    .filter(Boolean);

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id]);
  }

  return (
    <details className={styles.multiSelect} open={open} onToggle={(event) => onOpenChange(event.currentTarget.open)}>
      <summary>
        <span className={selectedLabels.length ? "" : styles.multiSelectPlaceholder}>
          {selectedLabels.length ? selectedLabels.join(", ") : placeholder}
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </summary>
      <div className={styles.multiSelectOptions}>
        {options.map((item) => {
          const label = item.displayName ?? item.name ?? "Sin nombre";
          return (
            <div key={item._id} className={styles.multiSelectOption}>
              <input id={`class-create-${item._id}`} type="checkbox" checked={selectedIds.includes(item._id)} onChange={() => toggle(item._id)} />
              <label htmlFor={`class-create-${item._id}`}>{label}</label>
            </div>
          );
        })}
      </div>
    </details>
  );
}
