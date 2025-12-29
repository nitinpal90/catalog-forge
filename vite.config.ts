import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
  define: {
    // Ensuring the API_KEY is stringified safely even if missing during build
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY || ""),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'jszip', 'xlsx'],
        },
      },
    },
  },
  server: {
    port: 3000,
    strictPort: true,
  }
});