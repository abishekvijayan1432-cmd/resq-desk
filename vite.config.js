import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// ResQ Desk dev server. Bound to 0.0.0.0 so the cloud preview can reach it.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    // Only the preview hostname issued for this workspace is allowed.
    allowedHosts: [
      'pv-f60951e97370-4e7a3092-f836-4ba8-a2a1-09f5c9c6bab5.style.dev',
      'localhost',
      '127.0.0.1',
    ],
  },
})
