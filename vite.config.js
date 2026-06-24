import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      "/api/trm": {
        target: "https://www.datos.gov.co",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/trm/, "/resource/32sa-8pi3.json")
      }
    }
  },
  preview: {
    proxy: {
      "/api/trm": {
        target: "https://www.datos.gov.co",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/trm/, "/resource/32sa-8pi3.json")
      }
    }
  }
});
