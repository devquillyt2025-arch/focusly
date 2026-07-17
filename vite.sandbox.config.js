import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  envDir: 'C:/Users/JEEVIT~1/AppData/Local/Temp/claude/d--My-Projects-nook/0a7996f2-3641-4779-9d42-35740964c782/scratchpad/sandbox-env',
  server: { port: 5260, strictPort: true },
})
