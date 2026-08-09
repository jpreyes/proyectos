import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Proyectos",
    short_name: "Proyectos",
    description: "Gestor personal de proyectos",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0b0d10",
    theme_color: "#0b0d10",
    orientation: "any",
    lang: "es-CL",
    categories: ["productivity"],
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      // Maskable needs its own padded artwork or Android crops the glyph.
      { src: "/icons/512m", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Bandeja", short_name: "Bandeja", url: "/inbox" },
      { name: "Workspaces", short_name: "Workspaces", url: "/w" },
    ],
  };
}
