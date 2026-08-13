import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'src/client',
  publicDir: resolve(__dirname, 'src/client/public'),
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/client/main.ts'),
      formats: ['es'],
      fileName: () => 'main.js',
    },
    rollupOptions: {
      output: {
        assetFileNames: 'style.css',
      },
    },
    cssCodeSplit: false,
  },
});
