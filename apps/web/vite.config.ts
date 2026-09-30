import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: { '/api': 'http://localhost:8000' }, // dev: same-origin API, no CORS needed
  },
  build: { sourcemap: false, chunkSizeWarningLimit: 700 },
});
