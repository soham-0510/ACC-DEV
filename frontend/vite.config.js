import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Dev: `npm run dev` on :5173 proxies API calls to FastAPI on :8000.
// Prod: `npm run build` -> dist/, served by FastAPI (laptop) or nginx (Kubernetes).
const api = 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': api, '/health': api, '/metrics': api },
  },
})
