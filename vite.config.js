import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        part1: resolve(__dirname, 'part1.html'),
        part2: resolve(__dirname, 'part2.html'),
      },
    },
  },
});
