import { defineConfig } from 'vite';

/**
 * Builds the self-contained single-file ES module (Lit inlined) served from a
 * plain <script type="module"> tag (FR-P-2). The npm library surface is
 * emitted separately by tsc (dist/**, Lit external).
 */
export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'forms-engine.esm.js',
    },
    outDir: 'dist',
    emptyOutDir: false,
    target: 'es2022',
    minify: true,
  },
  test: {
    environment: 'jsdom',
  },
});
