// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

export default defineConfig({
  plugins: [
    {
      name: "desol-private-runtime-environment",
      config(_config, { mode }) {
        // Load private backend settings without adding them to client defines.
        const values = loadEnv(mode, process.cwd(), "DESOL_");
        for (const name of [
          "DESOL_API_BASE_URL",
          "DESOL_DEVICE_ID",
          "DESOL_API_TOKEN",
          "DESOL_SAMPLE_INTERVAL_SECONDS",
          "DESOL_ESP32_BASE_URL",
        ]) {
          if (process.env[name] === undefined && values[name] !== undefined)
            process.env[name] = values[name];
        }
      },
    },
  ],
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
