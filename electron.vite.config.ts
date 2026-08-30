import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          'parser/worker': resolve('src/main/parser/worker.ts'),
          // CLI de análisis: Node puro, sin importar `electron`, para poder
          // ejecutarlo sin servidor gráfico (ver src/main/cli.ts).
          cli: resolve('src/main/cli.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
          source: resolve('src/preload/source.ts')
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    }
  }
});
