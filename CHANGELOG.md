# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

## [0.4.4] - 2026-08-29

### Añadido

- Cada release incluye ahora también `msgeater-x.y.z.sigstore.json`: el
  bundle de procedencia (mismo contenido que la Artifact Attestation) como
  archivo descargable, para quien prefiera verificarlo sin depender de la
  API de GitHub. Necesario además porque OpenSSF Scorecard solo reconoce
  procedencia firmada si existe como asset del release con ese sufijo — no
  consulta la API de attestations.
- `main` protegida: PRs obligatorios, checks requeridos (test, CodeQL,
  dependency-review) antes de mergear, sin force-push ni borrado de rama.

### Cambiado

- `release.yml`: `contents: write` ya no es un permiso de todo el workflow,
  se declara solo en los jobs que de verdad suben assets (mejora el check
  Token-Permissions de OpenSSF Scorecard sin cambiar el comportamiento).
- `esbuild` (dependencia de desarrollo, anidada bajo vite) forzado a
  `^0.28.1` vía `overrides` -- corrige un aviso LOW (GHSA-g7r4-m6w7-qqqr,
  solo explotable en el dev-server de Vite en Windows).
- 3 GitHub Actions (`codeql-action`, `attest-build-provenance`,
  `scorecard-action`) tenían el commit SHA mal resuelto (apuntaban al
  objeto *tag* anotado, no al *commit*); corregido tras un fallo real
  detectado en el publish de OpenSSF Scorecard.

## [0.4.3] - 2026-08-29

### Añadido

- Cada release incluye ahora `SHA256SUMS` y una
  [GitHub Artifact Attestation](https://docs.github.com/actions/security-guides/using-artifact-attestations-to-establish-provenance-for-builds)
  (Sigstore) por artefacto, más un SBOM en formato SPDX generado desde el
  dependency graph nativo de GitHub. `docs/VERIFY-RELEASE.md` documenta cómo
  comprobarlos. README: nueva sección "Security & Trust".
- CI: análisis estático con CodeQL, Dependency Review en PRs y evaluación
  independiente con OpenSSF Scorecard.

### Corregido

- CI llevaba roto varios commits: `npm audit --omit=dev --audit-level=high`
  bloqueaba todo el job por vulnerabilidades HIGH reales en dependencias de
  producción (`nodemailer` vía `mailparser`, `undici` vía `jsdom`). Se
  actualizaron ambas dependencias.
- Carrera en el test e2e de seguridad más importante del proyecto ("sin
  ejecución de scripts en el iframe"), que fallaba de forma consistente al
  capturar el iframe a mitad de su navegación interna a `about:srcdoc`.
- `SECURITY.md`: la tabla de versiones soportadas seguía en "0.2.x".
- GitHub Actions de terceros fijadas por commit SHA en vez de por tag mutable.

## [0.4.2] - 2026-08-28

### Corregido

- Los iconos de la app (menú de aplicaciones, barra de tareas/ventana,
  diálogo "Acerca de") tenían fondo negro opaco en vez de transparente, por
  lo que se veían como un bloque invisible en launchers con tema oscuro. Se
  regeneraron `build/icon.png`, `build/icon.icns`, `build/icons/*` y los
  iconos embebidos del renderer desde el pack transparente actualizado en
  `assets/icon-source/`.

### Cambiado

- El estado vacío (arrastra un `.msg`) ahora muestra el tux comiéndose el
  sobre `.msg` en vez de un icono de sobre genérico.
- README: captura de pantalla actualizada e icono de la app añadido bajo el
  título.

## [0.4.1] - 2026-08-28

### Cambiado

- Rebranding completo de "MSG Viewer" a **MsgEater**: nombre, iconos, API IPC
  interna (`window.msgEater`), asociación de tipos de archivo, instalador y
  documentación.

### Corregido

- Un adjunto con nombre de archivo malicioso (p. ej. `../../evil.txt`) podía
  escapar del directorio elegido al usar "Guardar todos los adjuntos" o al
  exportar a ZIP (path traversal / zip slip). Se sanea el nombre antes de
  escribirlo a disco.
