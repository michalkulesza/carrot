import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";

export default defineConfig(({ mode }) => {
  // Not VITE_-prefixed on purpose: it must stay server-side (proxy target)
  // and never get bundled into client code, so the browser always talks to
  // the app's own origin (same-origin cookies, no API-side CORS changes).
  const env = loadEnv(mode, process.cwd(), "");
  const apiProxyTarget = env.API_PROXY_TARGET || "http://localhost:8088";

  return {
    build: {
      sourcemap: true,
    },
    plugins: [tailwindcss(), react(), sentryVitePlugin({ telemetry: false })],
    server: {
      port: 5173,
      host: true,
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
