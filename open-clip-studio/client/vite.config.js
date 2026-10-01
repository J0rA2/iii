import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': 'http://localhost:5000',
      '/uploads': 'http://localhost:5000',
      '/samples': 'http://localhost:5000',
      '/exports': 'http://localhost:5000',
      '/sfx': 'http://localhost:5000'
    }
  }
})
