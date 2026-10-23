import type { Metadata } from "next";

/**
 * 404 responses must not inherit the public layout's home canonical, og:url or
 * index directive. Used by the root not-found page and by dynamic public routes
 * whose metadata runs before `notFound()`.
 */
export const NOT_FOUND_METADATA = {
  title: "Página no encontrada",
  alternates: { canonical: null },
  openGraph: null,
  robots: { index: false, follow: false }
} satisfies Metadata;
