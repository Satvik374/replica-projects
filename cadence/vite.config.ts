import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The preview proxy uses its own hostname; allow it only when passed explicitly.
const allowedHosts = process.env.CADENCE_ALLOWED_HOSTS?.split(',').filter(Boolean);

// Relative base so the built bundle also loads from file:// inside Electron.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    ...(allowedHosts && allowedHosts.length > 0 ? { allowedHosts } : {}),
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
