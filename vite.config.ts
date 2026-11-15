import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' ＝ GitHub Pages のように、住所の途中に名前が入る場所でも動くようにする
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5194 },
})
