import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Backend origin — the dev server proxies /api to it, so the frontend can
// use relative URLs and CORS stays out of the way.
const backend = process.env.VITE_BACKEND_URL || 'http://localhost:4000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': backend,
    },
  },
})
