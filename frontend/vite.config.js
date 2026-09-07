import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({ globals: { Buffer: true, process: true, global: true } }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://api:3000", changeOrigin: true },
      "/socket.io": { target: "http://api:3000", ws: true, changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    commonjsOptions: { transformMixedEsModules: true },
    // The whole app used to emit as one ~3 MB JS file. Splitting vendor code
    // out means Rollup serializes several smaller chunks instead of one huge
    // module graph (lower peak memory on this 1.9 GB box's build), the
    // wallet SDKs only download on the routes that use them (see the
    // React.lazy boundaries in App.jsx), and a code change no longer
    // invalidates the cached vendor bundles.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          // react-vendor: eager, stable, its own chunk for long-term caching.
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) {
            return "react-vendor";
          }
          // vendor: the libs the app pulls in on first paint (analytics, HTTP,
          // sockets, state). Naming them keeps a code change from busting the
          // cached vendor bundle.
          if (/[\\/]node_modules[\\/](posthog-js|axios|socket\.io-client|engine\.io-client|zustand)[\\/]/.test(id)) {
            return "vendor";
          }
          // Everything else — the wallet SDKs above all — is left to Rollup.
          // They're imported only by lazy routes (/wallets, /onboarding), so
          // Rollup keeps them in those async chunks. Forcing a *named* manual
          // chunk here would make Vite emit a <link modulepreload> for it on
          // the entry HTML, pulling ~760 KB of Solana/Tron SDK onto the
          // marketing path — the exact thing this split is meant to avoid.
          return;
        },
      },
    },
  },
});
