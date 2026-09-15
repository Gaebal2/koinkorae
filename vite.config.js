import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://127.0.0.1:3001' } },
  base: process.env.GITHUB_ACTIONS ? '/koinkorae/' : '/',
});
