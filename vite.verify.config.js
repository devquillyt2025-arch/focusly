import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  envDir: 'C:/Users/JEEVIT~1/AppData/Local/Temp/claude/d--My-Projects-nook/0c75497e-6b8e-4d50-a629-c6e6db35345d/scratchpad/verify-env',
  server: { port: 5250, strictPort: true },
})
