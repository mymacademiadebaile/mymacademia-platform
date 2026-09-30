import Link from "next/link";
import type { ReactNode } from "react";
import site from "./site.module.css";
import s from "./page-intro.module.css";

interface PageIntroProps {
  crumbs: { name: string; href?: string }[];
  kicker: string;
  title: ReactNode;
  children?: ReactNode;
}

/** Dark opening block for inner pages: breadcrumbs + the page H1. */
export function PageIntro({ crumbs, kicker, title, children }: PageIntroProps) {
  return (
    <div className={s.intro}>
      <div className={site.container}>
        <nav aria-label="Migas de pan" className={s.crumbs}>
          <ol>
            {crumbs.map((crumb) => (
              <li key={crumb.name}>
                {crumb.href ? <Link href={crumb.href}>{crumb.name}</Link> : <span aria-current="page">{crumb.name}</span>}
              </li>
            ))}
          </ol>
        </nav>
        <p className={s.kicker}>{kicker}</p>
        <h1 className={s.title}>{title}</h1>
        {children ? <div className={s.lead}>{children}</div> : null}
      </div>
    </div>
  );
}
