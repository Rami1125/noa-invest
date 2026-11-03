// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    server: {
      host: "0.0.0.0",
      port: 3000,
    },
    // Konva's node entry imports the native `canvas` package. We only use Konva in the browser.
    // Externalize so Nitro/SSR does not try to resolve/bind native canvas on Vercel.
    ssr: {
      external: ["canvas", "konva"],
    },
    optimizeDeps: {
      exclude: ["canvas"],
    },
    build: {
      rollupOptions: {
        external: ["canvas"],
      },
      // Vite 8 / Rolldown path used by Nitro server bundle
      rolldownOptions: {
        external: ["canvas"],
      },
    },
  },
  // Nitro (Vercel preset) — keep native canvas out of the server function graph
  nitro: {
    externals: {
      external: ["canvas", "konva"],
    },
  },
});
