import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 移动端 H5：开发端口 5174，/api 与 /ws 代理到后端 4000
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://127.0.0.1:4000', changeOrigin: true },
      '/ws': { target: 'ws://127.0.0.1:4000', ws: true },
    },
  },
});
