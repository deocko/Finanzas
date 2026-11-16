import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// base relativa: funciona en GitHub Pages (/finanzas/) y en cualquier otra ruta.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  // Firebase se carga aparte y solo cuando está configurado
  build: { chunkSizeWarningLimit: 700 },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
