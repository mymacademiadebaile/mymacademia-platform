import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { fetchSiteImages } from "@/lib/public-site/queries";
import { SITE } from "@/lib/public-site/site";

export const alt = "M&M Academia de Baile — clases de baile en La Plata";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function dataUrl(publicPath: string, mime: string): Promise<string> {
  const file = await readFile(join(process.cwd(), "public", publicPath));
  return `data:${mime};base64,${file.toString("base64")}`;
}

export default async function OpengraphImage() {
  const images = await fetchSiteImages();
  const [photo, logo] = await Promise.all([dataUrl(images.hero.src, "image/jpeg"), dataUrl(SITE.logo.src, "image/png")]);

  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: "#09090b", color: "#f4f2f7" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 700, padding: 64 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} width={112} height={112} alt="" />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 92, fontWeight: 800, lineHeight: 0.9, letterSpacing: -2, textTransform: "uppercase" }}>
              Tu cuerpo.
            </div>
            <div style={{ fontSize: 92, fontWeight: 800, lineHeight: 0.9, letterSpacing: -2, textTransform: "uppercase" }}>
              Tu ritmo.
            </div>
            <div style={{ fontSize: 92, fontWeight: 800, lineHeight: 0.9, letterSpacing: -2, textTransform: "uppercase", color: "#b392ff" }}>
              Tu lugar.
            </div>
            <div style={{ marginTop: 28, fontSize: 28, color: "rgba(244,242,247,0.75)" }}>
              Academia de baile en La Plata · Calle 3 N.º 164
            </div>
          </div>
        </div>
        <div style={{ display: "flex", position: "relative", width: 500, height: 630 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo} width={500} height={630} alt="" style={{ objectFit: "cover", width: 500, height: 630 }} />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(90deg, #09090b, rgba(9,9,11,0) 45%)"
            }}
          />
        </div>
      </div>
    ),
    size
  );
}
