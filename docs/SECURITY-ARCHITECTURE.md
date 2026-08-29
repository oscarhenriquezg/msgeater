# Arquitectura de seguridad

Este documento explica cómo MsgEater procesa contenido potencialmente
hostil: un `.msg`/`.eml`/`.emlx` puede venir de cualquier parte (un ticket de
soporte, un adjunto reenviado), así que se trata como **no confiable** en
todo momento hasta que llega sanitizado a la pantalla.

No es una promesa de invulnerabilidad — es un mapa de qué protege qué, dónde
están los límites, y qué queda como riesgo residual. Para el proceso de
release (checksums, SBOM, attestations), ver
[docs/VERIFY-RELEASE.md](VERIFY-RELEASE.md). Para cómo reportar un fallo, ver
[SECURITY.md](../SECURITY.md).

## Flujo de datos

```mermaid
flowchart TD
    A["Archivo no confiable<br/>.msg / .eml / .emlx"] --> B["Validación por contenido<br/>(no solo por extensión)"]
    B --> C["Parser en worker thread<br/>(CFBF/OLE, MIME, RTF)"]
    C --> D["Extracción de HTML<br/>(nativo → RTF des-encapsulado → texto)"]
    D --> E["DOMPurify<br/>(política compartida main/renderer)"]
    E --> F["Documento sanitizado<br/>serializado vía IPC"]
    F --> G["Renderer (proceso aislado)"]
    G --> H["iframe sandbox<br/>allow-same-origin, sin scripts"]
    H --> I["Pantalla"]

    H -.bloqueado.-> J["❌ scripts"]
    H -.bloqueado.-> K["❌ popups / window.open"]
    H -.bloqueado.-> L["❌ navegación del top-level"]
    H -.bloqueado.-> M["❌ recursos remotos automáticos"]
    H -.confirmación.-> N["✅ enlace externo\n(shell.openExternal, allowlist http/https/mailto)"]
    H -.clic + aviso.-> O["✅ imagen remota puntual\n(fetch en main, allowlist, 25MB/15s, → data URI)"]
```

## Fronteras de confianza (trust boundaries)

| # | Frontera | Qué la protege |
| --- | --- | --- |
| **TB1** | Archivo de entrada | Nada todavía lo ha tocado: puede ser cualquier byte. Se abre por ruta (argv, diálogo, drag&drop) o buffer; nunca se ejecuta ni se interpreta directamente. |
| **TB2** | Parser (CFBF/OLE, MIME, RTF) | `@kenjiuno/msgreader`, `mailparser`, `rtf-stream-parser`, `iconv-lite`. Formatos binarios complejos con historial de parsers inseguros en el ecosistema; de ahí el corpus adversarial (`scripts/make-fixtures.mjs`: truncados, bytes aleatorios, cabeceras falsas, RTF/MIME malformado). |
| **TB3** | Worker thread ↔ proceso main | El parsing corre en un `worker_thread` separado (`src/main/parsing.ts`); un crash o cuelgue del parser no tumba la ventana ni el proceso main. Comunicación solo por `postMessage` (estructuras serializables, no referencias vivas). |
| **TB4** | IPC main ↔ preload ↔ renderer | `contextIsolation: true`, `nodeIntegration: false` en ambas ventanas. El preload (`src/preload/index.ts`) expone una API tipada mínima vía `contextBridge` (`MsgEaterApi`); el renderer no tiene `require`, `process`, ni acceso a Node. |
| **TB5** | Sanitización HTML | DOMPurify con una única política compartida (`@shared/sanitize-policy`) entre el renderer (DOM nativo, para mostrar) y el proceso main (jsdom, para la vista de código fuente/exportaciones) — evita que las dos rutas diverjan. La vista de código fuente muestra un *diff* de lo removido. |
| **TB6** | iframe sandbox del cuerpo | `sandbox="allow-same-origin"` **sin** `allow-scripts`, `allow-popups` ni `allow-top-navigation(-by-user-activation)`. `allow-same-origin` es intencional: permite que el renderer padre enganche listeners (clic, drag, `mouseover` para la barra anti-phishing) sobre `contentDocument`; como no hay `allow-scripts`, el contenido del correo no puede ejecutar nada — los listeners los pone la app, no el correo. |
| **TB7** | URLs externas | Todo enlace pasa por confirmación (`confirmLeave`) antes de `shell.openExternal`, que además revalida el protocolo (`http:`/`https:`/`mailto:` únicamente) en el proceso main — nunca se confía en lo que mande el renderer sin revalidar. |
| **TB8** | Filesystem / adjuntos | Los adjuntos solo se escriben a disco por acción explícita. `sanitizeAttachmentName` (`src/shared/attachment-name.ts`) impide path traversal/zip-slip en el nombre. Adjuntos ejecutables (`isExecutableAttachment`) piden confirmación extra antes de guardarse o abrirse. Los temporales de "Abrir adjunto" se purgan al cerrar (`will-quit`). |
| **TB9** | Red | Bloqueo por defecto a nivel de sesión (`session.defaultSession.webRequest.onBeforeRequest`, allowlist de esquema: `file:`, `data:`, `msgprint:`, `devtools:`, + servidor de dev en modo desarrollo). Única excepción deliberada: cargar una imagen remota bloqueada, solo tras clic explícito del usuario y aviso de rastreo — se hace con `fetch` en el proceso main (fuera de ese bloqueo de sesión, a propósito), con allowlist de protocolo, límite de 25 MB, timeout de 15 s, validación de `content-type`, y el resultado se entrega como `data:` URI (nunca una URL viva en el DOM). |

## Amenazas

| Amenaza | Control existente | Limitación | Riesgo residual |
| --- | --- | --- | --- |
| **HTML/JS malicioso en el cuerpo** | DOMPurify (TB5) + iframe sin `allow-scripts` (TB6): dos capas independientes | DOMPurify tiene su propio historial de CVEs (por eso se mantiene actualizado vía Dependabot/`npm audit` en CI); si fallara, el sandbox del iframe sigue bloqueando ejecución | Bajo — requeriría fallo simultáneo de sanitización *y* bypass del sandbox del navegador |
| **Tracking pixels / recursos remotos** | Bloqueados por defecto (TB9); solo con clic + aviso explícito | El aviso depende de que el usuario lo lea | Bajo — sin acción del usuario no hay fuga de IP/lectura |
| **Phishing (enlaces engañosos)** | Barra con la URL real al pasar el cursor, resaltado opcional de enlaces engañosos, confirmación antes de salir (TB7) | Es una advertencia, no un bloqueo — el usuario puede igualmente decidir abrir un enlace malicioso | Medio — depende del juicio del usuario, como en cualquier cliente de correo |
| **Adjuntos maliciosos (ejecutables, macros)** | Confirmación extra para ejecutables (`isExecutableAttachment`); nada se ejecuta automáticamente | No hay antivirus integrado; el archivo se guarda o abre con la app del SO que decida el usuario | Medio — equivalente a guardar cualquier adjunto de correo con cualquier cliente |
| **Path traversal / zip-slip en nombres de adjunto** | `sanitizeAttachmentName` en todos los puntos de escritura (guardar, exportar ZIP) | Cubierto por test dedicado y fixture adversarial (`path-traversal.msg`) | Bajo |
| **CFBF/OLE, MIME o RTF malformado (parser crash, cuelgue)** | Parsing en worker thread aislado (TB3); corpus adversarial en CI (truncados, bytes aleatorios, tamaños absurdos) | El corpus es una muestra, no una prueba exhaustiva; un parser en JS no está memory-unsafe como uno en C, pero sí puede colgarse en bucles/recursión | Medio — un crash del worker no compromete el proceso main, pero un cuelgue de CPU sigue siendo posible (ver Fase 23/fuzzing incremental en el roadmap) |
| **Mensajes/adjuntos anidados (`.msg` dentro de `.msg`)** | Profundidad máxima (`MAX_EMBEDDED_DEPTH`); cada nivel se abre en ventana propia, mismo pipeline completo | — | Bajo |
| **Decompression bombs / agotamiento de recursos** | Límites explícitos: tamaño máximo de imagen remota (25 MB), timeout de red (15 s), altura máxima de PNG en export (`MAX_PNG_HEIGHT`) | No hay límite genérico de tamaño de adjunto individual al descomprimir RTF/CFBF | Medio — un adjunto/cuerpo extremadamente grande podría degradar rendimiento antes que comprometer seguridad |
| **Escape del renderer de Electron** | `contextIsolation: true`, `nodeIntegration: false`, preload mínimo con API allowlist tipada (TB4); `setWindowOpenHandler` deniega todo | `sandbox: false` en las `BrowserWindow` (ver nota abajo) — el aislamiento de proceso a nivel SO de Chromium no está activo, solo el aislamiento de contexto JS de Electron | Medio — mitigado por las otras capas (sin scripts en contenido no confiable, sin acceso a Node desde el renderer), pero es la capa más débil actual |
| **Abuso de IPC / exposición de APIs de Node** | Preload usa exclusivamente `contextBridge.exposeInMainWorld` con una API tipada (`MsgEaterApi`); cada handler del main valida tipos y, donde aplica, protocolo/ruta antes de actuar | La validación es manual por handler, no hay un esquema declarativo centralizado | Bajo — superficie pequeña y auditada, pero requiere disciplina al añadir handlers nuevos |
| **Abuso de protocolos externos / `file://` arbitrario** | `open-external` revalida protocolo (`http:`/`https:`/`mailto:`) en main antes de `shell.openExternal`; el protocolo interno `msgprint://` ignora la ruta de la URL y solo sirve dos documentos fijos en memoria (sin acceso a filesystem) | — | Bajo |
| **Sobrescritura de archivos al exportar/guardar** | Los diálogos de guardado son nativos del SO (el usuario elige la ruta); nombres de adjunto saneados (TB8) | No hay confirmación adicional de "vas a sobrescribir X" más allá de la que ya da el diálogo nativo del SO | Bajo |

### Nota sobre `sandbox: false`

Ambas `BrowserWindow` corren con `sandbox: false` en el proceso renderer
(webPreferences), documentado en el código junto a cada creación de ventana.
Se probó `sandbox: true`: no solo falla en el contenedor de CI como se creía
originalmente, sino también en un escritorio real, con una causa raíz
identificada — el driver de Electron de Playwright lanza siempre con
`--no-sandbox` a nivel de proceso, y esa combinación con `--enable-sandbox`
(que dispara el webPreference por ventana) deja el renderer en un estado
contradictorio que cuelga. El propio arnés de e2e no puede validar
`sandbox: true` tal como está armado hoy; probarlo de verdad requeriría
lanzar la app empaquetada a mano, fuera de Playwright. Mitigación mientras
tanto: `contextIsolation: true` + `nodeIntegration: false` + preload mínimo
siguen activos, y el único contenido no confiable (el cuerpo del correo)
vive además detrás del sandbox del iframe (TB6), independiente de este.

## Qué queda fuera de este documento

- El proceso de build/release (checksums, SBOM, procedencia firmada): ver
  [VERIFY-RELEASE.md](VERIFY-RELEASE.md).
- Cómo reportar una vulnerabilidad y qué versiones reciben parches: ver
  [SECURITY.md](../SECURITY.md).
