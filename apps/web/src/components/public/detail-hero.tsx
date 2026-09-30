import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { PublicImage } from "@/lib/public-site/types";
import site from "./site.module.css";
import s from "./detail-hero.module.css";

interface DetailHeroProps {
  crumbs: { name: string; href?: string }[];
  kicker: string;
  title: ReactNode;
  image: PublicImage;
  badge?: ReactNode;
  children?: ReactNode;
}

/** Split opening for a style or professor page: text left, portrait photo right. */
export function DetailHero({ crumbs, kicker, title, image, badge, children }: DetailHeroProps) {
  return (
    <section className={s.hero} aria-labelledby="detalle-title">
      <div className={`${site.container} ${s.grid}`}>
        <div className={s.text}>
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
          <h1 id="detalle-title" className={s.title}>
            {title}
          </h1>
          {children ? <div className={s.body}>{children}</div> : null}
        </div>
        <figure className={s.figure}>
          <Image
            src={image.src}
            alt={image.alt}
            fill
            priority
            sizes="(max-width: 1023px) 100vw, 45vw"
            quality={70}
            className={s.image}
            style={{ objectPosition: image.focus }}
          />
          {badge ? <span className={s.badge}>{badge}</span> : null}
        </figure>
      </div>
    </section>
  );
}

export function DetailFacts({ items }: { items: { term: string; value: ReactNode }[] }) {
  return (
    <dl className={s.facts}>
      {items.map((item) => (
        <div key={item.term}>
          <dt>{item.term}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
