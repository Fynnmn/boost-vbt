import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Biblioteca: un solo bundle con todos los componentes exportados desde src/index.js.
export default defineConfig({
  plugins: [react()],
  server: { port: 5177, strictPort: true },
  build: {
    lib: {
      entry: resolve(process.cwd(), 'src/index.js'),
      name: 'BoostDesignSystem',
      formats: ['es'],
      fileName: () => 'boost-design-system.js',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
    },
  },
});
