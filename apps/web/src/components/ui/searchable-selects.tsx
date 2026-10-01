"use client";

import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type SelectOption = {
  value: string;
  label: string;
  disabled: boolean;
  selected: boolean;
};

type PopoverState = {
  select: HTMLSelectElement;
  label: string;
  bounds: DOMRect;
};

function readOptions(select: HTMLSelectElement): SelectOption[] {
  return Array.from(select.options).map((option) => ({
    value: option.value,
    label: option.text.trim(),
    disabled: option.disabled,
    selected: option.selected
  }));
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-AR");
}

function selectLabel(select: HTMLSelectElement) {
  return select.getAttribute("aria-label") ?? select.labels?.[0]?.textContent?.trim() ?? "Buscar opción";
}

/**
 * Adds a searchable popover to every native select without replacing the field.
 * The original select remains the form control, so controlled React fields and
 * native FormData submissions continue to behave exactly as before.
 */
export function SearchableSelects() {
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [options, setOptions] = useState<SelectOption[]>([]);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalize(query);
    return options.filter((option) => !normalizedQuery || normalize(option.label).includes(normalizedQuery));
  }, [options, query]);

  const close = () => {
    if (popover) popover.select.removeAttribute("data-search-open");
    setPopover(null);
    setOptions([]);
    setQuery("");
  };

  const open = (select: HTMLSelectElement, initialQuery = "") => {
    if (select.disabled || select.dataset.searchableSelect === "false") return;

    if (popover?.select && popover.select !== select) {
      popover.select.removeAttribute("data-search-open");
    }

    const nextOptions = readOptions(select);
    select.dataset.searchOpen = "true";
    setPopover({ select, label: selectLabel(select), bounds: select.getBoundingClientRect() });
    setOptions(nextOptions);
    setQuery(initialQuery);
    setActiveIndex(Math.max(0, nextOptions.findIndex((option) => option.selected && !option.disabled)));
  };

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const select = target.closest("select");
      if (!select || !(select instanceof HTMLSelectElement) || select.dataset.searchableSelect === "false") {
        if (popoverRef.current && !popoverRef.current.contains(target)) close();
        return;
      }

      event.preventDefault();
      open(select);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement) || target.dataset.searchableSelect === "false") return;

      if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        open(target);
      } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        open(target, event.key);
      }
    };

    const handleChange = (event: Event) => {
      if (popover && event.target === popover.select) setOptions(readOptions(popover.select));
    };

    const updatePosition = () => {
      if (!popover) return;
      setPopover((current) => current && { ...current, bounds: current.select.getBoundingClientRect() });
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("change", handleChange, true);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("change", handleChange, true);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [popover]);

  useEffect(() => {
    if (popover) inputRef.current?.focus();
  }, [popover]);

  useEffect(() => {
    setActiveIndex((current) => Math.min(Math.max(0, current), Math.max(0, filteredOptions.length - 1)));
  }, [filteredOptions.length]);

  if (!popover) return null;

  const choose = (option: SelectOption) => {
    if (option.disabled) return;

    if (popover.select.multiple) {
      const nativeOption = Array.from(popover.select.options).find((item) => item.value === option.value);
      if (nativeOption) nativeOption.selected = !nativeOption.selected;
    } else {
      popover.select.value = option.value;
    }

    popover.select.dispatchEvent(new Event("input", { bubbles: true }));
    popover.select.dispatchEvent(new Event("change", { bubbles: true }));
    setOptions(readOptions(popover.select));
    if (!popover.select.multiple) {
      popover.select.focus();
      close();
    }
  };

  const maxPopoverHeight = Math.min(332, window.innerHeight * 0.45 + 52);
  const top = Math.max(8, Math.min(popover.bounds.bottom + 6, window.innerHeight - maxPopoverHeight - 8));
  const width = Math.max(220, popover.bounds.width);

  return (
    <div
      ref={popoverRef}
      className="searchableSelectPopover"
      style={{ left: popover.bounds.left, top, width }}
      role="dialog"
      aria-label={`Opciones: ${popover.label}`}
    >
      <label className="searchableSelectSearch">
        <Search size={16} aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          placeholder="Buscar opción..."
          aria-label={`Buscar en ${popover.label}`}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              popover.select.focus();
              close();
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((current) => Math.max(0, Math.min(current + 1, filteredOptions.length - 1)));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((current) => Math.max(current - 1, 0));
            }
            if (event.key === "Enter" && filteredOptions[activeIndex]) {
              event.preventDefault();
              choose(filteredOptions[activeIndex]);
            }
          }}
        />
      </label>
      <div className="searchableSelectOptions" role="listbox" aria-multiselectable={popover.select.multiple || undefined}>
        {filteredOptions.length ? (
          filteredOptions.map((option, index) => (
            <button
              key={`${option.value}-${index}`}
              type="button"
              className="searchableSelectOption"
              data-active={index === activeIndex}
              data-selected={option.selected}
              disabled={option.disabled}
              role="option"
              aria-selected={option.selected}
              onMouseMove={() => setActiveIndex(index)}
              onClick={() => choose(option)}
            >
              {option.label || "Sin especificar"}
              {option.selected && <span aria-hidden="true">✓</span>}
            </button>
          ))
        ) : (
          <p className="searchableSelectEmpty">No encontramos opciones.</p>
        )}
      </div>
    </div>
  );
}
