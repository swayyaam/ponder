import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { sandbox } from './server/sandbox.ts'

// Where Ollama lives. Override with OLLAMA_URL=http://host:port npm run dev
const ollamaUrl = process.env.OLLAMA_URL ?? 'http://localhost:11434'

export default defineConfig({
  plugins: [react(), sandbox(fileURLToPath(new URL('./sandbox', import.meta.url)))],
  define: {
    __OLLAMA_URL__: JSON.stringify(ollamaUrl),
  },
  server: {
    proxy: {
      '/ollama': {
        target: ollamaUrl,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/ollama/, ''),
      },
    },
  },
})
