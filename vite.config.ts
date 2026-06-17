import { defineConfig } from 'vite'

export default defineConfig({
  base: '/MADE-2.0/',
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
})
