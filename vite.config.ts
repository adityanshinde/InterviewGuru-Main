import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const rootEnv = loadEnv(mode, path.resolve(__dirname, '.'), '');
  const frontendEnv = loadEnv(mode, path.resolve(__dirname, 'frontend'), '');
  /** frontend/.env wins over root .env for duplicate keys */
  const env = {...rootEnv, ...frontendEnv};

  const define: Record<string, string> = {
    'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY ?? ''),
    'process.env.VITE_API_URL': JSON.stringify(env.VITE_API_URL || ''),
  };
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith('VITE_')) {
      define[`import.meta.env.${key}`] = JSON.stringify(value ?? '');
    }
  }

  return {
    plugins: [react(), tailwindcss()],
    build: {
      outDir: 'build',
      emptyOutDir: true,
    },
    define,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        '@frontend': path.resolve(__dirname, 'frontend'),
        '@backend': path.resolve(__dirname, 'backend'),
        '@shared': path.resolve(__dirname, 'shared'),
        '@desktop': path.resolve(__dirname, 'desktop'),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
