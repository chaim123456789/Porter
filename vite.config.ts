import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." still resolve in production builds.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }

          // Inject built JS and CSS bundle paths into dist/sw.js so the service worker
          // pre-stores the complete compiled app shell for offline relaunches.
          const swPath = path.resolve(distDir, 'sw.js');
          const assetsDir = path.resolve(distDir, 'assets');
          if (fs.existsSync(swPath) && fs.existsSync(assetsDir)) {
            const builtAssets = fs
              .readdirSync(assetsDir)
              .filter((name) => /\.(js|css)$/i.test(name))
              .map((name) => `/assets/${name}`);
            const swSource = fs.readFileSync(swPath, 'utf8');
            const updatedSw = swSource.replace(
              '/*__BUILT_SHELL_ASSETS__*/[]',
              JSON.stringify(builtAssets)
            );
            fs.writeFileSync(swPath, updatedSw, 'utf8');
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
