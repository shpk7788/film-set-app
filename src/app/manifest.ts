import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Film Set",
    short_name: "Film Set",
    description: "Call sheets, crew lists and updates for film shoots",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f5f7",
    theme_color: "#1f5fbf",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
