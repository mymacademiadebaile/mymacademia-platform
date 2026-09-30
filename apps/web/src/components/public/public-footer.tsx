import Image from "next/image";
import Link from "next/link";
import { PUBLIC_EVENTS, trackAttrs } from "@/lib/public-site/analytics";
import { SITE, whatsappHref } from "@/lib/public-site/site";
import type { Branch } from "@/lib/public-site/types";
import site from "./site.module.css";
import s from "./public-footer.module.css";

const SITE_LINKS = [
  { label: "Clases", href: "/clases" },
  { label: "Profesores", href: "/profesores" },
  { label: "Horarios", href: "/horarios" },
  { label: "Contacto", href: "/contacto" }
];

export function PublicFooter({ branch }: { branch: Branch }) {
  const year = new Date().getFullYear();

  return (
    <footer className={s.footer}>
      <div className={`${site.container} ${s.grid}`}>
        <div className={s.brand}>
          <Image src={SITE.logo.src} alt={SITE.name} width={88} height={88} className={s.logo} />
          <p className={s.name}>{SITE.name}</p>
          <address className={s.address}>
            {branch.streetAddress}, {branch.betweenStreets}
            <br />
            {branch.locality}, {branch.region}
          </address>
        </div>

        <nav className={s.col} aria-label="Sitio">
          <p className={s.colTitle}>Sitio</p>
          <ul>
            {SITE_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={s.link}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className={s.col}>
          <p className={s.colTitle}>Contacto</p>
          <ul>
            <li>
              <a
                className={s.link}
                href={whatsappHref()}
                target="_blank"
                rel="noopener noreferrer"
                {...trackAttrs(PUBLIC_EVENTS.whatsappClick, "footer")}
              >
                WhatsApp
              </a>
            </li>
            {SITE.instagramUrl ? (
              <li>
                <a className={s.link} href={SITE.instagramUrl} target="_blank" rel="noopener noreferrer">
                  Instagram
                </a>
              </li>
            ) : null}
            <li className={s.phone}>{SITE.whatsapp.display}</li>
          </ul>
        </div>
      </div>

      <div className={`${site.container} ${s.bottom}`}>
        <p>
          © {year} {SITE.name}. La Plata, Buenos Aires, Argentina.
        </p>
        <Link href="/login" className={s.staff}>
          Acceso equipo
        </Link>
      </div>
    </footer>
  );
}
