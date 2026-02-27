import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://ok200.app",
  integrations: [sitemap()],
  build: {
    format: "file",
  },
  trailingSlash: "never",
  server: {
    port: 3000,
    host: true,
  },
});
