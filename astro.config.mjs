import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import vercel from "@astrojs/vercel";

export default defineConfig({
  site: "https://universotriba.com",
  devToolbar: { enabled: false },
  vite: {
    esbuild: { jsxDev: false },
  },
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
  ],
  output: "server",
  adapter: vercel(),
});
