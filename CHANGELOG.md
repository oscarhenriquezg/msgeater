# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

## [0.6.0] - 2026-08-30

### Añadido

- **Detección de macros en adjuntos ofimáticos.** Si un `.docm`, `.xls`,
  `.docx`… trae un proyecto VBA, se añade una señal de riesgo: los documentos
  con macros son una vía de entrega de malware habitual y no se distinguen a
  simple vista de uno inofensivo.
  - Se comprueba **sin abrir ni ejecutar el documento**, buscando la huella
    del proyecto (`vbaProject.bin` en los formatos ZIP modernos; una entrada
    de directorio `_VBA_PROJECT`/`Macros` en los `.doc`/`.xls` antiguos).
  - Se revisan también las extensiones que en teoría no llevan macros
    (`.docx`, `.xlsx`): si las llevan, es más sospechoso, no menos.
  - No afecta al tiempo de apertura: solo se leen los bytes de los adjuntos
    ofimáticos, que en un correo normal son ninguno.
- El escaneo de VirusTotal posterior a cada release propone ahora por pull
  request la actualización del resultado publicado en el README, en lugar de
  dejarlo desfasado hasta que se corrija a mano. Se conserva el resultado del
  peor de los cinco instalables, no el más favorable.

## [0.5.0] - 2026-08-30

### Añadido

- **Triaje de phishing.** Bajo los metadatos aparece un aviso —solo si hay
  algo que reportar— con las señales de riesgo detectadas: autenticación del
  remitente fallida (SPF/DKIM/DMARC), suplantación de dirección (`From` frente
  a `Return-Path`, `Reply-To` desviado), adjuntos que pueden ejecutar código,
  dominios con homografía IDN y enlaces acortados. Al pulsarlo se abre el
  detalle con la explicación de cada señal.
  - **Indicadores del mensaje**: URLs, dominios, IPs y direcciones extraídos y
    deduplicados, copiables por grupo para reportar un phishing sin
    recopilarlos a mano.
  - **SHA-256 de los adjuntos**, calculados bajo demanda. Permiten consultar
    un archivo en un servicio de reputación **buscando por hash, sin subirlo**:
    el contenido del correo no sale del equipo.
  - Si no se detecta ninguna señal **no se muestra nada**: no detectar nada no
    equivale a que el correo sea seguro, así que la app no exhibe un indicador
    "en verde" que induzca confianza injustificada.
- Pruebas basadas en propiedades (`fast-check`) sobre las funciones que
  procesan entrada no confiable.
- Los releases incluyen la procedencia también como `.intoto.jsonl`, además
  del bundle Sigstore.
- Escaneo automático de los instalables publicados con VirusTotal (~70
  motores) al publicar cada release.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `docs/USER-GUIDE.md` y traducciones
  al inglés del README y la política de seguridad. El proyecto obtuvo el badge
  *passing* de OpenSSF Best Practices.
- La cobertura de tests se mide y se reporta en cada corrida de CI.

### Corregido

- `sameOrganization` comparaba solo las dos últimas etiquetas del dominio, de
  modo que `bank.co.uk` y `attacker.co.uk` se trataban como la misma
  organización y **se suprimían** las señales de suplantación en un caso de
  phishing real.
- La extracción de enlaces ignoraba los atributos HTML sin comillas
  (`<a href=https://...>`), que siguen siendo clicables: esos enlaces evadían
  tanto las señales como los indicadores.
- Los adjuntos marcados `inline` quedaban fuera de la señal de ejecutable,
  aunque un `.eml` puede etiquetar así un archivo que la interfaz sigue
  ofreciendo para abrir y guardar.
- El filtro interno de `<script>`/`<style>` no seguía la regla de cierre de
  HTML (`</script >`, `</script/>`), lo que permitía colar contenido de un
  script en el texto analizado.

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
