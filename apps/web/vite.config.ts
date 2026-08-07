import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Honors a harness-assigned port (autoPort) so two chat sessions can each
    // run their own dev server side by side; falls back to vite's default.
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
})
