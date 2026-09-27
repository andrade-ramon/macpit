import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const server = `http://127.0.0.1:${process.env.MACPIT_PORT ?? '7777'}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Versiona o cache do service worker: cada build descarta a casca antiga.
  define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36)) },
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    // changeOrigin reescreve Host para 127.0.0.1:<porta>, que o servidor aceita; Origin fica localhost:5173 (liberada em dev).
    proxy: {
      '/api': { target: server, changeOrigin: true },
      '/auth': { target: server, changeOrigin: true },
      '/ws': { target: server, changeOrigin: true, ws: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        // service worker: precisa ficar em /sw.js (nome fixo, na raiz, para ter escopo "/")
        sw: fileURLToPath(new URL('./src/sw/sw.ts', import.meta.url)),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
  test: { environment: 'node' },
});
