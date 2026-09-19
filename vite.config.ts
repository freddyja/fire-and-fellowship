import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = dirname(fileURLToPath(import.meta.url));

const proxy = {
  "/api": "http://127.0.0.1:8787",
  "/ws": { target: "ws://127.0.0.1:8787", ws: true },
};

export default defineConfig({
  appType: "mpa",
  plugins: [
    {
      name: "ff-handout-redirect",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === "/handout" || req.url === "/handout/") {
            res.statusCode = 302;
            res.setHeader("Location", "/handout.html");
            res.end();
            return;
          }
          next();
        });
      },
    },
  ],
  server: {
    host: true,
    port: 5173,
    proxy,
  },
  preview: {
    host: true,
    port: 4173,
    proxy,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        live: resolve(root, "live/index.html"),
        phone: resolve(root, "live/phone.html"),
        tv: resolve(root, "live/tv.html"),
      },
    },
  },
});
