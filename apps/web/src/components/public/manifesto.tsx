import Image from "next/image";
import type { Branch, DanceStyle, PublicImage } from "@/lib/public-site/types";
import { SITE } from "@/lib/public-site/site";
import site from "./site.module.css";
import s from "./manifesto.module.css";

interface ManifestoProps {
  image: PublicImage;
  branch: Branch;
  styles: DanceStyle[];
}

function listStyles(styles: DanceStyle[]): string {
  const names = styles.map((style) => style.name);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} y ${names.at(-1)}`;
}

export function Manifesto({ image, branch, styles }: ManifestoProps) {
  return (
    <section id="manifiesto" className={s.manifesto} aria-labelledby="manifesto-title">
      <div className={`${site.container} ${s.inner}`}>
        <p className={s.mark} aria-hidden="true">
          <span>02</span> Manifiesto / 08
        </p>

        <h2 id="manifesto-title" className={s.statement}>
          <span className={`${s.row} ${s.rowA}`}>No venís</span>{" "}
          <span className={`${s.row} ${s.rowB}`}>
            solo a <span className={s.outline}>aprender</span>
          </span>{" "}
          <span className={`${s.row} ${s.rowC}`}>pasos.</span>
        </h2>
      </div>

      <figure className={s.strip}>
        <Image
          src={image.src}
          alt={image.alt}
          fill
          sizes="100vw"
          quality={65}
          className={s.stripImage}
          style={{ objectPosition: image.focus }}
        />
        <figcaption className={s.timecode} aria-hidden="true">
          M&amp;M / 02 — Toma 01 — 00:05:06:07
        </figcaption>
      </figure>

      <div className={`${site.container} ${s.inner}`}>
        <p className={s.answer}>
          <span className={s.answerLead}>Venís a</span>{" "}
          <span className={s.bailar} data-text="bailar.">
            bailar.
          </span>
        </p>

        <div className={s.about}>
          <h3 className={s.aboutTitle}>Qué es M&amp;M Academia</h3>
          <p className={s.aboutText}>
            {SITE.name} es una academia de baile en {branch.locality}, en {branch.streetAddress}, {branch.betweenStreets}.
            Damos clases de {listStyles(styles)}.
          </p>
          <p className={s.aboutText}>
            Aprendés técnica, sí. Pero sobre todo aprendés a escuchar la música, a moverte con otras personas y a
            sentirte a gusto en una pista.
          </p>
        </div>
      </div>
    </section>
  );
}
