# Contribuir a MsgEater

Gracias por el interés. MsgEater es un visor de correo pensado para abrir
archivos potencialmente hostiles sin exponer al usuario, así que las
contribuciones —y muy especialmente los reportes de seguridad— son bienvenidas.

> **Idioma / Language.** El proyecto se documenta en español, pero se aceptan y
> responden *issues*, *pull requests* y comentarios de código **en inglés**
> igual que en español. No hace falta escribir en español para participar.
> *Issues, pull requests and code comments in English are equally welcome.*

## Cómo reportar un problema

- **Bugs y solicitudes de mejora** → abre un
  [issue](https://github.com/oscarhenriquezg/msgeater/issues). Incluye la
  versión de la app, tu sistema operativo, los pasos para reproducirlo y, si
  aplica, un archivo de ejemplo **anonimizado** (sin datos personales ni
  corporativos reales).
- **Vulnerabilidades de seguridad** → **no abras un issue público**. Sigue el
  procedimiento de [`SECURITY.md`](SECURITY.md): GitHub Security Advisories
  (preferente) o un correo a `oscar.henriquez.gonzalez@gmail.com` con el asunto
  `[SECURITY] msgeater`.

## Proceso de contribución

1. Haz *fork* del repositorio.
2. Crea una rama descriptiva a partir de `main`
   (p. ej. `fix/adjuntos-nombre-vacio`).
3. Haz tus cambios y súbelos a tu fork.
4. Abre un *pull request* contra `main`.

La rama `main` está **protegida**: no admite *push* directo ni *force push*, y
todo *pull request* debe pasar los checks requeridos —**`test`**, **`CodeQL`** y
**`dependency-review`**— antes de poder mergearse. Si algún check falla, el
merge queda bloqueado hasta que se corrija.

## Requisitos para que una contribución sea aceptable

Antes de abrir el PR, comprueba en local que todo esto pasa:

```bash
npm ci
npm run lint          # ESLint, sin errores
npm run typecheck     # TypeScript en modo strict, sin errores
npm run fixtures      # genera el corpus de prueba
npm test              # tests unitarios (Vitest)
npm run build
npx playwright test   # tests E2E sobre la app construida
```

Además:

- **Estilo de commits: [Conventional Commits](https://www.conventionalcommits.org/).**
  El historial del repo ya los usa: `feat(security): …`, `fix(ci): …`,
  `docs: …`. El *scope* es opcional pero ayuda.
- **Cambios de seguridad**: si tocas sanitización, el sandbox del iframe, el
  bloqueo de red o el manejo de adjuntos, explica en el PR qué invariante
  preserva tu cambio. El modelo de amenazas está en
  [`docs/SECURITY-ARCHITECTURE.md`](docs/SECURITY-ARCHITECTURE.md).
- **Sin datos reales**: nunca subas correos reales al repo.
  `tests/fixtures/real/` está en `.gitignore` justamente para eso; los fixtures
  versionados se generan sintéticamente con `npm run fixtures`.

## Política de tests

**Todo cambio que agregue o modifique funcionalidad debe agregar o actualizar
los tests automatizados correspondientes. Un pull request con comportamiento
nuevo y sin tests no se mergea.**

Guía práctica de dónde va cada tipo de test:

| Tipo de cambio | Dónde va el test |
| --- | --- |
| Lógica pura (parsing, saneado, formato) | `tests/unit/*.test.ts` (Vitest) |
| Invariantes sobre entrada no confiable | `tests/unit/property.test.ts` (fast-check) |
| Comportamiento de la interfaz o del proceso main | `tests/e2e/app.spec.ts` (Playwright) |
| Formato de archivo nuevo o caso malformado | fixture en `scripts/make-fixtures.mjs` + su test |

### Cobertura

La cobertura se mide en cada corrida de CI con
`npm run test:coverage` (Vitest + `@vitest/coverage-v8`) y el resumen queda en
el log de la corrida. Se mide `src/main` y `src/shared`; `src/renderer` y
`src/preload` quedan fuera de esa medición porque Vitest corre en entorno
`node` y ese código necesita el DOM y las APIs de Electron — su cobertura la
aportan los tests E2E de Playwright, que ejercitan la interfaz sobre la app
construida.

No hay un umbral mínimo obligatorio, pero un PR que **baje** la cobertura de la
lógica sin justificarlo probablemente reciba comentarios pidiendo tests.

## Preguntas

Si algo no queda claro, abre un issue con la etiqueta `question` — también
sirve para proponer una idea antes de invertir tiempo en implementarla.
