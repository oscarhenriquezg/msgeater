# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

## [0.8.0] - 2026-08-31

### Añadido

- **Analizador de línea de comandos** (`msgeater --analyze`): el mismo análisis
  que muestra el panel de la aplicación —señales, ruta de entrega, indicadores
  y SHA-256 de los adjuntos— sin abrir ventana, con salida de texto o `--json`.
  Abrir los correos de uno en uno no sirve para revisar un buzón entero.
  - **No abre ventana ni necesita servidor gráfico**: funciona por SSH, en un
    contenedor o desde un cron, con el mismo binario ya instalado — no hay un
    ejecutable aparte que instalar. Por dentro reutiliza ese binario en modo
    Node, sin arrancar Chromium: hacerlo con `await` en el proceso main no
    sirve, porque en cuanto se cede el control al bucle de mensajes Electron
    inicializa la plataforma gráfica y aborta con «Missing X server».
  - La bandera se atiende **antes** del bloqueo de instancia única, así que el
    comando responde aunque haya una ventana abierta; si no, la invocación se
    la tragaría la instancia en marcha y no imprimiría nada.
  - Códigos de salida pensados para scripts: `0` no se detectó ninguna señal,
    `1` se detectó alguna, `2` algún archivo no se pudo analizar. `0` significa
    exactamente eso, **no** que el correo sea seguro.
  - Acepta varios archivos; uno ilegible se reporta por `stderr` sin abortar
    el análisis de los demás.
  - **No imprime el cuerpo del mensaje**: la salida es el análisis, no el
    contenido, que puede ser privado y acabaría en logs y tuberías sin que
    nadie lo haya pedido. Tampoco toca la red.
  - **Neutraliza las secuencias de escape ANSI** del asunto y de los nombres
    de adjunto. Se cuelan codificadas en RFC 2047 —la cabecera cruda parece
    ASCII inofensivo— y en un terminal mueven el cursor y borran líneas: un
    correo hostil podía tapar las señales que lo delatan dentro de la propia
    salida del análisis. En el modo texto se eliminan; en `--json` se escapan
    (`\u009b`), incluidos los controles C1 que `JSON.stringify` deja pasar
    —U+009B es CSI, que hace de `ESC [` con un solo carácter—.
  - Los textos salen de los mismos ficheros de i18n que la ventana, para que
    no acaben diciendo cosas distintas de la misma señal.
- **Ruta de entrega en el panel de análisis.** La cadena `Received` —los
  servidores por los que pasó el correo— se muestra como una línea de tiempo
  legible, del origen declarado a la entrega final, con la IP de cada salto
  (copiable) y la demora del tramo. Antes ese dato existía pero solo en el
  volcado técnico de `Ctrl/Cmd+U`.
  - Junto a la ruta se explica **hasta dónde es fiable**: cada servidor añade
    su línea sin poder comprobar las anteriores, así que los saltos de origen
    los puede haber escrito íntegramente quien envía el mensaje.
  - Por eso mismo **no genera ninguna señal de riesgo**: derivar un veredicto
    de la cadena sería acusar a partir de datos que controla el atacante.
  - Se indica el nombre inverso (rDNS) solo cuando **no** coincide con el
    nombre con el que el emisor se anunció, que es cuando dice algo.

### Corregido

- El nombre del servidor receptor de cada salto arrastraba el `;` que separa
  la fecha (`mx.example.com;`), tanto en la vista de código fuente como al
  copiarlo.

## [0.7.0] - 2026-08-30

### Añadido

- **El panel de análisis es accesible en cualquier momento**, con un botón
  nuevo en la barra de herramientas, la entrada *Ver → Analizar el mensaje* y
  el atajo `Ctrl/Cmd+Shift+A`. Antes solo se podía abrir cuando el correo
  disparaba alguna señal de riesgo, lo que dejaba sin acceso a los indicadores
  y a los hashes de los adjuntos en un correo normal — y querer el SHA-256 de
  un adjunto no depende de que el mensaje sea sospechoso.
  - El aviso automático no cambia: sigue apareciendo **solo** cuando hay
    señales que reportar.
  - Al abrir el panel en un correo sin señales, se indica exactamente eso —que
    no se detectó ninguna de las señales comprobadas— junto con la advertencia
    de que no equivale a que el correo sea seguro.

### Corregido

- Con la ventana estrecha, la barra de herramientas dejaba **Exportar** y
  **Acerca de** fuera de la pantalla: seguían existiendo pero era imposible
  pulsarlos. Ocurría ya en el ancho mínimo que la propia aplicación permite
  (640 px). Ahora la barra se reorganiza en dos filas y esos botones se
  mantienen alineados a la derecha.

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
