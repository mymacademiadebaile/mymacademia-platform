import type { ReactNode } from "react";
import s from "./section-heading.module.css";

interface SectionHeadingProps {
  /** Count of the "eight count" narrative: 01…08. */
  count: string;
  label: string;
  title: ReactNode;
  titleId: string;
  tone?: "dark" | "light";
  /** Heading level. Section pages that already own the H1 keep h2. */
  as?: "h1" | "h2";
  /** Total of the count ("/ 08" on the home narrative). null hides it. */
  total?: string | null;
  children?: ReactNode;
}

export function SectionHeading({ count, label, title, titleId, tone = "dark", as: Tag = "h2", total = "08", children }: SectionHeadingProps) {
  return (
    <div className={`${s.heading} ${tone === "light" ? s.light : ""}`}>
      <p className={s.kicker}>
        <span className={s.count}>{count}</span>
        <span className={s.rule} aria-hidden="true" />
        <span>{label}</span>
        {total ? (
          <span className={s.of} aria-hidden="true">
            / {total}
          </span>
        ) : null}
      </p>
      <Tag id={titleId} className={s.title}>
        {title}
      </Tag>
      {children ? <div className={s.aside}>{children}</div> : null}
    </div>
  );
}
