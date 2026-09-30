import type { FaqItem } from "@/lib/public-site/types";
import site from "./site.module.css";
import s from "./faq-section.module.css";

interface FaqSectionProps {
  items: FaqItem[];
  title?: string;
  id?: string;
}

export function FaqSection({ items, title = "Preguntas frecuentes", id = "preguntas" }: FaqSectionProps) {
  if (items.length === 0) return null;
  return (
    <section id={id} className={s.section} aria-labelledby={`${id}-title`}>
      <div className={`${site.container} ${s.grid}`}>
        <h2 id={`${id}-title`} className={s.title}>
          {title}
        </h2>
        <div className={s.list}>
          {items.map((item, index) => (
            <details key={item.question} className={s.item} name={id}>
              <summary className={s.question}>
                <span className={s.number} aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className={s.questionText}>{item.question}</span>
                <span className={s.toggle} aria-hidden="true" />
              </summary>
              <div className={s.answer}>
                <p>{item.answer}</p>
                {item.isPlaceholder ? <span className={site.placeholderTag}>Respuesta a confirmar</span> : null}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
