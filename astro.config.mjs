import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import react from "@astrojs/react";
import vercel from "@astrojs/vercel";

export default defineConfig({
  site: "https://www.universotriba.com",
  i18n: {
    locales: ["es", "en"],
    defaultLocale: "es",
    routing: { prefixDefaultLocale: false },
  },
  devToolbar: { enabled: false },
  // checkOrigin rechaza todo POST multipart en Vercel (el Origin del browser nunca
  // coincide con url.origin del runtime). Desactivado porque la única subida de
  // formulario es la de ediciones (gated por requireAdmin + cookie SameSite=Lax).
  security: { checkOrigin: false },
  vite: {
    esbuild: { jsxDev: false },
  },
  integrations: [
    tailwind(),
    react(),
  ],
  output: "server",
  adapter: vercel(),
});
