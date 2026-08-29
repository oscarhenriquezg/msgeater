import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@shared': resolve(__dirname, 'src/shared') }
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // Solo código propio: `out/` y `release/` son artefactos de build y
      // `tests/` no se mide a sí mismo.
      include: ['src/**/*.ts'],
      // El renderer y los preload NO se excluyen por conveniencia: vitest corre
      // en entorno `node` y ese código necesita el DOM y las APIs de Electron,
      // así que aquí saldría 0% siempre por imposibilidad técnica, no por falta
      // de pruebas. Su cobertura real la aportan los tests E2E de Playwright
      // (`tests/e2e/`), que ejercitan la UI sobre la app empaquetada.
      exclude: ['src/renderer/**', 'src/preload/**'],
      reporter: ['text', 'lcov']
    }
  }
});
