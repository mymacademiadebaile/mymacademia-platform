const ACADEMY_HOSTS = ["mymacademiadebaile.com.ar", "www.mymacademiadebaile.com.ar"];

/** The academy's apex redirects to www; both must work with the same APP_ORIGIN.
 * Other environments keep their exact configured origin. Never trust Host/forwarded headers.
 */
export function isTrustedAppOrigin(origin: string, appOrigin: string): boolean {
  try {
    const configured = new URL(appOrigin), incoming = new URL(origin);
    if (incoming.origin !== origin || incoming.username || incoming.password) return false;
    if (incoming.origin === configured.origin) return true;
    return configured.protocol === "https:" && incoming.protocol === "https:"
      && configured.port === incoming.port
      && ACADEMY_HOSTS.includes(configured.hostname) && ACADEMY_HOSTS.includes(incoming.hostname);
  } catch { return false; }
}
