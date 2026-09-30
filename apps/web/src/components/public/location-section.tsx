import { PUBLIC_EVENTS, trackAttrs } from "@/lib/public-site/analytics";
import { mapsDirectionsUrl, mapsEmbedUrl } from "@/lib/public-site/maps";
import { SITE, whatsappHref } from "@/lib/public-site/site";
import type { Branch } from "@/lib/public-site/types";
import { ArrowUpRightIcon, WhatsAppIcon } from "./icons";
import { SectionHeading } from "./section-heading";
import site from "./site.module.css";
import s from "./location-section.module.css";

interface LocationSectionProps {
  branch: Branch;
  count?: string;
  total?: string | null;
  headingAs?: "h1" | "h2";
}

export function LocationSection({ branch, count = "07", total, headingAs = "h2" }: LocationSectionProps) {
  const [street, number] = branch.streetAddress.split(" N.º ");

  return (
    <section id="ubicacion" className={s.section} aria-labelledby="ubicacion-title">
      <div className={`${site.container} ${s.grid}`}>
        <div className={s.info}>
          <SectionHeading
            count={count}
            label="Ubicación"
            titleId="ubicacion-title"
            as={headingAs}
            total={total}
            title="Encontranos"
          />

          <address className={s.address}>
            <span className={s.addressName}>{branch.name}</span>
            <span className={s.addressStreet}>
              <span>{street}</span>{" "}
              {number ? <span className={s.addressNumber}>N.º {number}</span> : null}
            </span>
            <span className={s.addressRest}>
              {branch.betweenStreets}
              <br />
              {branch.locality}, {branch.region}
            </span>
            <a className={s.phone} href={whatsappHref()} target="_blank" rel="noopener noreferrer" {...trackAttrs(PUBLIC_EVENTS.whatsappClick, "location-phone")}>
              WhatsApp {SITE.whatsapp.display}
            </a>
          </address>

          <div className={s.actions}>
            <a
              href={mapsDirectionsUrl(branch)}
              className={site.button}
              target="_blank"
              rel="noopener noreferrer"
              {...trackAttrs(PUBLIC_EVENTS.directionsClick, "location")}
            >
              Cómo llegar
              <ArrowUpRightIcon className={site.buttonArrow} />
            </a>
            <a
              href={whatsappHref()}
              className={site.textLink}
              target="_blank"
              rel="noopener noreferrer"
              {...trackAttrs(PUBLIC_EVENTS.whatsappClick, "location")}
            >
              <WhatsAppIcon />
              Consultar por WhatsApp
            </a>
          </div>
        </div>

        <figure className={s.map}>
          <span className={s.crop} aria-hidden="true" />
          <iframe
            className={s.iframe}
            src={mapsEmbedUrl(branch)}
            title={`Mapa: ${branch.name}, ${branch.streetAddress}, ${branch.locality}`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <figcaption className={s.mapCaption}>
            <span>M&amp;M / 07</span> {branch.streetAddress} — {branch.locality}
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
