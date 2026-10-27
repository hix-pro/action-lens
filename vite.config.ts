import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    // React Flow and React dominate the bundle; 600 kB minified is expected.
    chunkSizeWarningLimit: 700,
  },
})
