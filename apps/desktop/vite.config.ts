import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tauri expects a fixed dev port
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // Don't let the Rust file watcher restart on src-tauri changes
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    target: 'esnext',
  },
});
