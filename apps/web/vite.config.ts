import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// mode "single": gera um único index.html (usado para o link de demonstração hospedado).
export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE ?? './',
  plugins: [react(), tailwindcss(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  server: { port: 5173, host: true },
}));
