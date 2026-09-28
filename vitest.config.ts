import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // Mirrors electron.vite.config.ts's renderer alias (ticket #20:
      // renderer-side modules import shared pure logic via `@shared/*`;
      // vitest needs the same resolution outside the electron-vite build).
      '@renderer': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
})
