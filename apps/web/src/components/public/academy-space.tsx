import Image from "next/image";
import type { Branch, PublicImage } from "@/lib/public-site/types";
import { SectionHeading } from "./section-heading";
import site from "./site.module.css";
import s from "./academy-space.module.css";

interface AcademySpaceProps {
  branch: Branch;
  /** Order matters: [tall, wide, detail]. Any real photos can be swapped in. */
  images: [PublicImage, PublicImage, PublicImage];
}

const FIGURE_CLASS = [s.figTall, s.figWide, s.figDetail];
const FIGURE_SIZES = ["(max-width: 1023px) 60vw, 30vw", "(max-width: 1023px) 90vw, 50vw", "(max-width: 1023px) 55vw, 28vw"];

export function AcademySpace({ branch, images }: AcademySpaceProps) {
  return (
    <section id="academia" className={s.section} aria-labelledby="academia-title">
      <div className={site.container}>
        <SectionHeading count="06" label="La academia" titleId="academia-title" title="El salón">
          <p>
            Un lugar para practicar, equivocarte y volver a intentar. Con gente que está en la misma que vos, en{" "}
            {branch.streetAddress}, {branch.betweenStreets}, {branch.locality}.
          </p>
        </SectionHeading>

        <div className={s.collage}>
          {images.map((image, index) => (
            <figure key={image.src} className={`${s.figure} ${FIGURE_CLASS[index]}`}>
              <div className={s.frame}>
                <Image
                  src={image.src}
                  alt={image.alt}
                  fill
                  sizes={FIGURE_SIZES[index]}
                  quality={65}
                  className={s.image}
                  style={{ objectPosition: image.focus }}
                />
              </div>
              <figcaption className={s.caption}>
                <span>Fig. {String(index + 1).padStart(2, "0")}</span>
                {image.isPlaceholder ? "Foto temporal" : image.alt}
              </figcaption>
            </figure>
          ))}

          <p className={s.crossing} aria-hidden="true">
            La Plata
          </p>
        </div>

        <ul className={s.words} aria-label="Lo que pasa en el salón">
          <li>Practicar</li>
          <li>Compartir</li>
          <li>Bailar</li>
        </ul>
      </div>
    </section>
  );
}
