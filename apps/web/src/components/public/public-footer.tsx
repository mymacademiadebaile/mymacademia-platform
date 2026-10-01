import Image from "next/image";
import Link from "next/link";
import { PUBLIC_EVENTS, trackAttrs } from "@/lib/public-site/analytics";
import { SITE, whatsappHref } from "@/lib/public-site/site";
import type { Branch, PublicSocialLinks } from "@/lib/public-site/types";
import { FacebookIcon, InstagramIcon, TikTokIcon, YouTubeIcon } from "./icons";
import site from "./site.module.css";
import s from "./public-footer.module.css";

const SITE_LINKS = [
  { label: "Clases", href: "/clases" },
  { label: "Profesores", href: "/profesores" },
  { label: "Horarios", href: "/horarios" },
  { label: "Contacto", href: "/contacto" }
];

const SOCIAL_NETWORKS = [
  { key: "instagram", label: "Instagram", Icon: InstagramIcon },
  { key: "tiktok", label: "TikTok", Icon: TikTokIcon },
  { key: "facebook", label: "Facebook", Icon: FacebookIcon },
  { key: "youtube", label: "YouTube", Icon: YouTubeIcon }
] as const;

export function PublicFooter({ branch, socialLinks }: { branch: Branch; socialLinks: PublicSocialLinks }) {
  const year = new Date().getFullYear();
  const visibleSocialNetworks = SOCIAL_NETWORKS.flatMap((network) => {
    const href = socialLinks[network.key];
    return href ? [{ ...network, href }] : [];
  });

  return (
    <footer id="public-footer" className={s.footer}>
      <div className={`${site.container} ${s.grid} ${visibleSocialNetworks.length ? s.gridWithSocials : ""}`}>
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
            <li className={s.phone}>{SITE.whatsapp.display}</li>
          </ul>
        </div>

        {visibleSocialNetworks.length ? (
          <nav className={s.col} aria-label="Redes sociales">
            <p className={s.colTitle}>Seguinos</p>
            <ul className={s.socialLinks}>
              {visibleSocialNetworks.map(({ key, label, Icon, href }) => (
                <li key={key}>
                  <a
                    className={s.socialLink}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${label} de ${SITE.shortName}`}
                    title={label}
                  >
                    <Icon size={20} />
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
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
