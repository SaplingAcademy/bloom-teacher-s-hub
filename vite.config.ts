// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Target Vercel serverless functions instead of Cloudflare Workers.
  // The lovable plugin reads options.nitro at the TOP level (not inside tanstackStart).
  // It only force-applies cloudflare-module when LOVABLE_SANDBOX=1; an explicit preset
  // here is preserved in all other environments (local build, Vercel CI).
  nitro: { preset: "vercel" },
  vite: {
    server: {
      port: 8080,
    },
  },
});
