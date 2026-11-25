import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {createRequire} from 'node:module';
import {defineConfig} from 'vite';

// Resolve through the installed engine so its WASM always has the same version.
const engineRequire = createRequire(createRequire(import.meta.url).resolve('@embedpdf/engines'));
const pdfiumWasmPath = engineRequire.resolve('@embedpdf/pdfium/pdfium.wasm');

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'local-pdfium-wasm',
        configureServer(server) {
          server.middlewares.use('/assets/pdfium.wasm', (_req, res) => {
            res.setHeader('Content-Type', 'application/wasm');
            res.setHeader('Cache-Control', 'no-cache');
            const stream = fs.createReadStream(pdfiumWasmPath);
            stream.on('error', () => { res.statusCode = 500; res.end('Cannot load PDFium WASM'); });
            stream.pipe(res);
          });
        },
        generateBundle() {
          this.emitFile({ type: 'asset', fileName: 'assets/pdfium.wasm', source: fs.readFileSync(pdfiumWasmPath) });
        },
      },
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
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
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
