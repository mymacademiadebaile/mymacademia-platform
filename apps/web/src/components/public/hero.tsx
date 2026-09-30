import Image from "next/image";
import { PUBLIC_EVENTS, trackAttrs } from "@/lib/public-site/analytics";
import { whatsappHref } from "@/lib/public-site/site";
import type { Branch, DanceStyle, PublicImage } from "@/lib/public-site/types";
import { ArrowIcon, WhatsAppIcon } from "./icons";
import site from "./site.module.css";
import s from "./hero.module.css";

interface HeroProps {
  image: PublicImage;
  branch: Branch;
  styles: DanceStyle[];
}

export function Hero({ image, branch, styles }: HeroProps) {
  const ticker = styles.map((style) => style.name);

  return (
    <section className={s.hero} aria-labelledby="hero-title">
      <div className={s.media}>
        <Image
          src={image.src}
          alt={image.alt}
          fill
          priority
          fetchPriority="high"
          sizes="(max-width: 1023px) 100vw, 58vw"
          quality={70}
          className={s.image}
          style={{ objectPosition: image.focus }}
        />
      </div>

      <p className={s.countIn} aria-hidden="true">
        <span>5</span>
        <span>6</span>
        <span>7</span>
        <span>8</span>
      </p>

      <div className={s.content}>
        <h1 id="hero-title" className={s.title}>
          <span className={s.line}>
            <span>Tu cuerpo.</span>
          </span>{" "}
          <span className={s.line}>
            <span>Tu ritmo.</span>
          </span>{" "}
          <span className={`${s.line} ${s.accent}`}>
            <span>Tu lugar.</span>
          </span>{" "}
          <span className={s.subtitle}>M&amp;M Academia de Baile — academia de baile en La Plata</span>
        </h1>

        <div className={s.actions}>
          <a href="#estilos" className={site.button}>
            Ver clases
            <ArrowIcon className={site.buttonArrow} />
          </a>
          <a
            href={whatsappHref()}
            className={site.textLink}
            target="_blank"
            rel="noopener noreferrer"
            {...trackAttrs(PUBLIC_EVENTS.whatsappClick, "hero")}
          >
            <WhatsAppIcon />
            Quiero empezar
          </a>
        </div>
      </div>

      <address className={s.location}>
        <span className={s.locationLabel}>Dónde</span>
        {branch.streetAddress}
        <br />
        {branch.locality}
      </address>

      <p className={s.vertical} aria-hidden="true">
        La Plata — Buenos Aires — Argentina
      </p>

      <div className={s.ticker} aria-hidden="true">
        <div className={s.tickerTrack}>
          {[0, 1].map((copy) => (
            <span key={copy} className={s.tickerGroup}>
              {Array.from({ length: 3 }).flatMap((_, round) =>
                ticker.map((name) => (
                  <span key={`${round}-${name}`} className={s.tickerItem}>
                    {name}
                    <span className={s.tickerSlash}>/</span>
                  </span>
                ))
              )}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
