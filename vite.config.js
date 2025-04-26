import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/encode-decode-tool/',
  build: { outDir: 'docs' },
  plugins: [react()]
});