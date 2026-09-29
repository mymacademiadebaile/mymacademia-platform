import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "M&M Academia",
    short_name: "M&M Academia",
    description: "Gestión de M&M Academia de Baile",
    start_url: "/professor",
    display: "standalone",
    background_color: "#f7f5fb",
    theme_color: "#5b21b6"
  };
}
