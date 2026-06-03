import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// WAŻNE: jeśli nazwiesz repozytorium GitHub inaczej niż "Bukmacher",
// zmień poniższą wartość na "/nazwa-twojego-repo/".
const BASE = "/bukmacher/";

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon-192.png", "icon-512.png"],
      workbox: {
        // Nie cache'ujemy zapytań do API Anthropic.
        navigateFallbackDenylist: [/^https:\/\/api\.anthropic\.com/],
        runtimeCaching: [],
      },
      manifest: {
        name: "Bukmacher AI",
        short_name: "Bukmacher",
        description: "Analiza szans na wynik meczu na podstawie statystyk (do zabawy).",
        lang: "pl",
        theme_color: "#0b6e3b",
        background_color: "#0f1115",
        display: "standalone",
        orientation: "portrait",
        start_url: BASE,
        scope: BASE,
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
});
