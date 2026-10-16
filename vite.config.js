import {defineConfig, loadEnv} from 'vite';
import {fileURLToPath} from 'node:url';
import react from '@vitejs/plugin-react';

export default defineConfig(({mode}) => ({
  resolve: {alias: {'@community-backend': fileURLToPath(new URL(
    (process.env.VITE_DATA_BACKEND || loadEnv(mode, process.cwd(), 'VITE_').VITE_DATA_BACKEND) === 'firebase'
      ? './src/firebase-data.js' : './src/supabase-data.js', import.meta.url))}},
  plugins: [react()],
  server: { proxy: { '/api': 'http://127.0.0.1:3001' } },
  base: process.env.VITE_BASE_PATH ?? (process.env.GITHUB_ACTIONS ? '/koinkorae/' : '/'),
}));
