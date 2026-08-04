import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // @simracing/shared is a symlinked workspace package compiled to CJS —
    // Vite's production build otherwise processes symlinked deps as "your
    // own source" rather than through its normal node_modules CJS-interop
    // pipeline, and its named-export detection for that path silently
    // fails ("X is not exported by .../dist/index.js" even though it
    // genuinely is at runtime — verified independently with the same
    // cjs-module-lexer Rollup itself uses). Forcing it through
    // commonjsOptions explicitly fixes the detection.
    commonjsOptions: {
      include: [/packages\/shared/, /node_modules/],
    },
  },
  optimizeDeps: {
    include: ['@simracing/shared'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
