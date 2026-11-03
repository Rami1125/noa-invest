// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

/** Native node-canvas pulled by konva's Node entry — never ship on Vercel serverless. */
const KONVA_NATIVE_EXTERNALS = ["canvas", "konva", "react-konva"] as const;

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
    // Browser-only drawing stack — keep native `canvas` / Node konva entry out of SSR graph
    ssr: {
      external: [...KONVA_NATIVE_EXTERNALS],
      noExternal: [],
    },
    optimizeDeps: {
      exclude: ["canvas"],
      include: ["konva", "react-konva"],
    },
    resolve: {
      // Prefer browser build of konva when the bundler can choose
      conditions: ["browser", "module", "import", "default"],
    },
    build: {
      rollupOptions: {
        external: ["canvas"],
      },
      rolldownOptions: {
        external: ["canvas"],
      },
    },
  },
  nitro: {
    externals: {
      external: [...KONVA_NATIVE_EXTERNALS],
    },
    moduleSideEffects: false,
  },
});
