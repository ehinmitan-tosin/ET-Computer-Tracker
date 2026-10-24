import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "site");

export default defineConfig({
  // The frontend lives in site/; .env and public/ are read from there too.
  root: site,
  build: {
    outDir: resolve(here, "dist"),
    emptyOutDir: true,
    // Page scripts use top-level await.
    target: "es2022",
    rollupOptions: {
      input: {
        dashboard: resolve(site, "index.html"),
        login: resolve(site, "login.html"),
        intake: resolve(site, "intake.html"),
        job: resolve(site, "job.html"),
        photos: resolve(site, "photos.html"),
      },
    },
  },
});
