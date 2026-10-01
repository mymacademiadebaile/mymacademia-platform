import type { Metadata, Viewport } from "next";
import { Archivo, Big_Shoulders } from "next/font/google";
import { SearchableSelects } from "@/components/ui/searchable-selects";
import "./globals.css";

const display = Big_Shoulders({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  axes: ["opsz"],
  adjustFontFallback: false,
  fallback: ["Impact", "Arial Narrow", "sans-serif"]
});

const body = Archivo({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
  axes: ["wdth"]
});

export const metadata: Metadata = {
  title: "M&M Academia",
  description: "Gestión de M&M Academia de Baile",
  applicationName: "M&M Academia"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#5b21b6"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${display.variable} ${body.variable}`}>
        {children}
        <SearchableSelects />
      </body>
    </html>
  );
}
