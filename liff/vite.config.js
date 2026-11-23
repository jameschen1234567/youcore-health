import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // 也一併跑 Supabase Edge Function 的純函式測試
    dir: '..',
    include: ['liff/src/**/*.test.{js,jsx}', 'liff/api/**/*.test.js', 'supabase/functions/**/*.test.ts'],
  },
})
