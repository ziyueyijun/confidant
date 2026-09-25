import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 端口从环境变量读（预览服务器会注入 PORT），否则用默认值。
export default defineConfig({
  plugins: [react()],
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5178,
    strictPort: false,
  },
})
