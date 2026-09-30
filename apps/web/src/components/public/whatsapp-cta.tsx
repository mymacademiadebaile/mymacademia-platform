import Image from "next/image";
import { PUBLIC_EVENTS, trackAttrs } from "@/lib/public-site/analytics";
import { whatsappHref } from "@/lib/public-site/site";
import type { PublicImage } from "@/lib/public-site/types";
import { ArrowIcon, WhatsAppIcon } from "./icons";
import site from "./site.module.css";
import s from "./whatsapp-cta.module.css";

const TRIAL_MESSAGE = "Hola, vi la web de M&M Academia y quiero probar una clase.";

/** Closing section: count 08, the end of the phrase. */
export function FinalCta({ image, message = TRIAL_MESSAGE }: { image: PublicImage; message?: string }) {
  return (
    <section id="empezar" className={s.final} aria-labelledby="empezar-title">
      <Image
        src={image.src}
        alt=""
        fill
        sizes="100vw"
        quality={60}
        className={s.image}
        style={{ objectPosition: image.focus }}
      />
      <div className={`${site.container} ${s.inner}`}>
        <p className={s.count} aria-hidden="true">
          <span>08</span> — y arranca la música
        </p>
        <h2 id="empezar-title" className={s.title}>
          <span className={s.big}>¿Bailamos?</span>{" "}
          <span className={s.small}>Tu próxima clase empieza acá.</span>
        </h2>
        <a
          href={whatsappHref(message)}
          className={`${site.button} ${site.buttonPurple} ${s.cta}`}
          target="_blank"
          rel="noopener noreferrer"
          {...trackAttrs(PUBLIC_EVENTS.whatsappClick, "final-cta")}
        >
          <WhatsAppIcon />
          Quiero probar una clase
          <ArrowIcon className={site.buttonArrow} />
        </a>
      </div>

      <div className={s.seam} aria-hidden="true">
        <div className={s.seamTrack}>
          {Array.from({ length: 8 }).map((_, index) => (
            <span key={index}>Bailar</span>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Persistent, discreet WhatsApp access. Appears once the hero is left behind. */
export function WhatsAppFloat() {
  return (
    <a
      className={s.float}
      href={whatsappHref()}
      target="_blank"
      rel="noopener noreferrer"
      {...trackAttrs(PUBLIC_EVENTS.whatsappClick, "floating")}
    >
      <span className={s.floatIcon}>
        <WhatsAppIcon size={18} />
      </span>
      <span className={s.floatText}>Quiero empezar</span>
    </a>
  );
}
