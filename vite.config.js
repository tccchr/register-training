import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // base คือชื่อ GitHub repo ของคุณ — จำเป็นสำหรับ GitHub Pages
  // ถ้าเปลี่ยนชื่อ repo ต้องเปลี่ยนตรงนี้ด้วย
  base: '/register-training/',
})
