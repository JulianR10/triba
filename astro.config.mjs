import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import react from "@astrojs/react";
import node from "@astrojs/node";
import sitemap from "@astrojs/sitemap";
import sentry from "@sentry/astro";

export default defineConfig({
  site: "https://comunidadtriba.com",
  integrations: [
    tailwind(),
    react(),
    sitemap({
      filter: (page) => {
        const url = new URL(page);
        return !url.pathname.startsWith("/admin") &&
               !url.pathname.startsWith("/iniciar-sesion") &&
               !url.pathname.startsWith("/api");
      },
    }),
    sentry({
      sourceMapsUploadOptions: {
        enabled: import.meta.env.PROD,
      },
    }),
  ],
  output: "server",
  adapter: node({ mode: "standalone" }),
});
