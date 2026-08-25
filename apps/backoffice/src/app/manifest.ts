import type { MetadataRoute } from "next";

import { APP_CONFIG } from "@/config/app-config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_CONFIG.meta.title,
    short_name: APP_CONFIG.name,
    description: APP_CONFIG.meta.description,
    start_url: "/dashboard/lpbot",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
