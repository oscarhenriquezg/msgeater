# Guía de usuario — interfaz externa de MsgEater

Documentación de referencia de la interfaz externa: cómo se invoca la
aplicación, qué acepta como entrada y qué produce como salida. Para el modelo
de seguridad ver [`../SECURITY.md`](../SECURITY.md) y
[`SECURITY-ARCHITECTURE.md`](SECURITY-ARCHITECTURE.md); para verificar un
release, [`VERIFY-RELEASE.md`](VERIFY-RELEASE.md).

## 1. Invocación

MsgEater es una aplicación de escritorio (Electron). No expone una API de red
ni un modo servidor: toda su interfaz externa son los archivos que abre, los
que escribe y su ventana.

### Desde la línea de comandos

```bash
# AppImage
./MsgEater-x.y.z-x86_64.AppImage correo.msg

# Instalación .deb/.rpm (Linux)
msgeater correo.msg

# macOS
open -a MsgEater correo.msg
# o directamente:
/Applications/MsgEater.app/Contents/MacOS/MsgEater correo.msg
```

- Acepta **una ruta de archivo** como argumento; puede ser relativa (se
  resuelve contra el directorio de trabajo actual) o absoluta.
- **Sin argumentos**: abre la ventana en el estado inicial, con la zona para
  arrastrar un archivo y el botón *Abrir*.
- Los argumentos que empiezan por `-` se ignoran (quedan para los flags de
  Electron/Chromium).
- **Instancia única**: si ya hay una ventana abierta, invocar de nuevo la app
  con un archivo **no** lanza un proceso nuevo; entrega la ruta a la instancia
  existente, que reemplaza el mensaje mostrado y toma el foco.
- **Códigos de salida**: la aplicación no define códigos propios. Sale con `0`
  al cerrarse normalmente. Un archivo ilegible o no soportado **no** provoca
  una salida con error: se muestra el error dentro de la ventana.

### Otras formas de abrir

- **Diálogo Abrir** (`Ctrl/Cmd+O`), con filtro `.msg`, `.eml`, `.emlx`.
- **Arrastrar y soltar** un archivo sobre la ventana.
- **Doble clic en el gestor de archivos**, si se han asociado los tipos
  (ver §7).

## 2. Formatos de entrada

| Extensión | Formato | Detección |
| --- | --- | --- |
| `.msg` | Outlook / MAPI sobre CFBF (OLE2) | firma binaria del contenedor CFBF |
| `.eml` | Correo MIME estándar (RFC 5322) | estructura de cabeceras del contenido |
| `.emlx` | Apple Mail (longitud + MIME + plist) | prefijo de longitud + MIME embebido |

**La interpretación del archivo es por contenido, no por extensión**: MsgEater
inspecciona los bytes (CFBF → `.msg`; cabeceras RFC 5322 → `.eml`; prefijo de
longitud → `.emlx`) y la extensión no influye en cómo se parsea. Un `.msg`
renombrado a `.eml` se abre correctamente igual.

> **Matiz importante:** esa detección aplica a *cómo se interpreta* el archivo
> una vez seleccionado. Para *seleccionarlo*, la ruta pasada por línea de
> comandos sí debe terminar en `.msg`, `.eml` o `.emlx` — un archivo con otra
> extensión se ignora como argumento. Arrastrándolo a la ventana no hay tal
> restricción y se abre por contenido.

Si el contenido no corresponde a ninguno de los tres formatos, la ventana
muestra un error descriptivo y la aplicación sigue funcionando.

## 3. Acciones, menús y atajos de teclado

Los atajos usan `Ctrl` en Linux y `Cmd` en macOS.

### Archivo

| Acción | Atajo |
| --- | --- |
| Abrir… | `Ctrl/Cmd+O` |
| Recientes (últimos 10) | — (submenú) |
| Guardar como… | `Ctrl/Cmd+S` |
| Imprimir… | `Ctrl/Cmd+P` |
| Asociar tipos de archivo… | — |
| Salir | `Ctrl+Q` (Linux) / `Cmd+W` (macOS) |

### Exportar (submenú de Archivo)

| Formato | Atajo |
| --- | --- |
| PDF | `Ctrl/Cmd+Shift+P` |
| EML | `Ctrl/Cmd+Shift+E` |
| PNG | `Ctrl/Cmd+Shift+G` |
| HTML | `Ctrl/Cmd+Shift+H` |
| TXT | `Ctrl/Cmd+Shift+T` |
| Markdown | `Ctrl/Cmd+Shift+D` |
| MHT (web) | `Ctrl/Cmd+Shift+M` |
| JSON | `Ctrl/Cmd+Shift+J` |
| ZIP (con adjuntos) | `Ctrl/Cmd+Shift+Z` |

### Edición

| Acción | Atajo |
| --- | --- |
| Copiar | `Ctrl/Cmd+C` |
| Seleccionar todo | `Ctrl/Cmd+A` |
| Buscar en el mensaje… | `Ctrl/Cmd+F` |
| Copiar metadatos del mensaje | `Ctrl/Cmd+Shift+C` |
| Copiar metadatos como JSON | `Ctrl/Cmd+Alt+C` |

Dentro de la barra de búsqueda: `Enter` va a la coincidencia siguiente,
`Shift+Enter` a la anterior y `Esc` cierra la barra. `Ctrl/Cmd+F` funciona
también con el foco dentro del cuerpo del mensaje.

### Ver

| Acción | Atajo |
| --- | --- |
| Acercar (zoom del cuerpo) | `Ctrl/Cmd++` |
| Alejar | `Ctrl/Cmd+-` |
| Tamaño real | `Ctrl/Cmd+0` |
| Analizar el mensaje (señales, indicadores y hashes) | `Ctrl/Cmd+Shift+A` |
| Ver código fuente del mensaje | `Ctrl/Cmd+U` |
| Herramientas de desarrollo | `F12` (oculto en el menú) |

### Barra de herramientas

De izquierda a derecha: **Nuevo** (cierra el mensaje) · **Abrir** · **Guardar
como** · **Copiar con formato** · **Buscar** · **Acercar** · **Alejar** ·
**Oscurecer el cuerpo** (accesibilidad) · **Unlink** (deja todos los enlaces
inertes) · **Resaltar enlaces engañosos** · **Analizar el mensaje** · **Ver código fuente** ·
**Exportar** · **Acerca de**.

### Adjuntos

Cada adjunto aparece como una "chip" bajo las cabeceras:

- **Clic** → menú con *Abrir* (con la aplicación predeterminada del sistema) y
  *Guardar como…*.
- **Arrastrar fuera de la ventana** → suelta el archivo extraído en el gestor
  de archivos o en otra aplicación.
- Los adjuntos **ejecutables** (`.exe`, `.sh`, `.jar`, `.ps1`…) se marcan con
  un aviso y piden confirmación explícita antes de abrirse o guardarse.
- Un `.msg`/`.eml` adjunto se abre en **ventana propia**, con el mismo
  tratamiento de seguridad.

## 4. Formatos de salida

Nueve formatos de exportación, más *Guardar como…* (que ofrece los mismos y
además el archivo original). En *Guardar como…* el formato se decide por la
extensión que elijas en el diálogo.

| Formato | Extensión | Contenido |
| --- | --- | --- |
| PDF | `.pdf` | Cabeceras y cuerpo renderizados. El tamaño de página se elige solo según la región del sistema: Carta en US/CA/MX/CL/CO/PH, A4 en el resto |
| EML | `.eml` | Mensaje en RFC 5322. Si el origen ya era `.eml`/`.emlx`, es copia byte a byte; si era `.msg`, se reconstruye desde las propiedades MAPI |
| PNG | `.png` | Captura del mensaje renderizado (también copiable al portapapeles) |
| HTML | `.html` | Documento autocontenido con cabeceras y cuerpo sanitizado |
| TXT | `.txt` | Texto plano |
| Markdown | `.md` | Cabeceras y cuerpo en Markdown |
| MHT | `.mht` | Página web única con las imágenes embebidas |
| JSON | `.json` | Documento estructurado (esquema abajo) |
| ZIP | `.zip` | Bundle completo (estructura abajo) |

### Esquema de la exportación JSON

```jsonc
{
  "subject": "string",
  "from":    { "name": "string", "email": "string" },
  "recipients": [
    { "name": "string", "email": "string", "type": "to" | "cc" | "bcc" }
  ],
  "sentDate":      "string (ISO 8601) | null",
  "receivedDate":  "string (ISO 8601) | null",
  "messageClass":  "string",            // p. ej. "IPM.Note"
  "signaturePresent": true,             // S/MIME firmado (presencia, NO verificación)
  "bodySource": "html" | "rtf-deencapsulated" | "rtf-converted" | "plaintext",
  "bodyHtml":   "string",               // HTML ya sanitizado con DOMPurify
  "attachments": [
    {
      "fileName":  "string",
      "extension": "string",            // con punto, p. ej. ".pdf"
      "size":      0,                   // bytes
      "inline":    false,               // imagen referenciada con cid:
      "contentId": "string | null",     // sin <>
      "embeddedMessage": false          // el adjunto es a su vez un mensaje
    }
  ],
  "sourcePath": "string"                // ruta del archivo de origen
}
```

`bodySource` indica de dónde salió el cuerpo, en orden de preferencia: HTML
nativo → HTML des-encapsulado del RTF → conversión aproximada desde RTF →
texto plano.

### Estructura de la exportación ZIP

```
message.msg          # o message.eml, según el formato de origen (copia exacta)
metadata.json        # el mismo esquema JSON de arriba
body.html            # cuerpo sanitizado, autocontenido
body.txt             # cuerpo en texto plano
attachments/
  informe.pdf        # un archivo por adjunto no inline, con su nombre original
  ...
```

Los nombres de los adjuntos se sanean antes de escribirse: un nombre malicioso
como `../../evil.txt` no puede escribir fuera de `attachments/`.

## 5. Señales de riesgo (triaje de phishing)

Hay dos formas de llegar al análisis:

- **El aviso automático**, que aparece bajo los metadatos **solo si hay algo
  que reportar**, con el número de señales detectadas.
- **El botón «Analizar el mensaje»** de la barra de herramientas (o
  `Ctrl/Cmd+Shift+A`), disponible siempre: los indicadores y los hashes de los
  adjuntos son útiles aunque el correo no dispare ninguna señal.

En ambos casos se abre el mismo panel:

- **Autenticación del remitente**: SPF, DKIM o DMARC en `fail`, `softfail` o
  error. Un `none`/`neutral` **no** se marca: significa que no se pudo
  comprobar, no que fallara.
- **Suplantación de dirección**: el dominio de `From` no coincide con el de
  `Return-Path` (ruta de retorno) o el `Reply-To` desvía la respuesta a otro
  dominio. Los subdominios de la misma organización no se marcan, porque los
  boletines y listas legítimos los usan de forma habitual.
- **Adjuntos ejecutables**: archivos que pueden ejecutar código.
- **Macros en documentos ofimáticos**: se busca la huella de un proyecto VBA
  dentro del archivo (`vbaProject.bin` en los formatos ZIP modernos,
  `_VBA_PROJECT`/`Macros` en los `.doc`/`.xls` antiguos) **sin abrirlo ni
  ejecutar nada**. Se revisan también las extensiones que en teoría no llevan
  macros (`.docx`, `.xlsx`): si las llevan, es más sospechoso, no menos.
- **Enlaces**: dominios con homografía IDN (caracteres de otro alfabeto que
  imitan al latino) y acortadores de URL, cuyo destino real no es visible.
- **Indicadores del mensaje**: URLs, dominios, IPs y direcciones extraídos y
  deduplicados, con botón de copiar por grupo — para reportar un phishing sin
  recopilarlos a mano.
- **SHA-256 de los adjuntos**: calculado bajo demanda al abrir el detalle.
  Permite consultar un archivo en un servicio de reputación **buscando por
  hash, sin subirlo**: el contenido del correo no sale del equipo.

> **Qué significa que no aparezca el aviso.** Solo que no se detectó ninguna
> de las señales anteriores. **No** es un certificado de que el correo sea
> seguro, y por eso la app no muestra ningún indicador "en verde": un análisis
> automático no puede descartar un mensaje malicioso bien construido. Si abres
> el panel a mano en un correo sin señales, el texto lo dice con esas mismas
> palabras.

## 6. Vista de código fuente (`Ctrl/Cmd+U`)

Ventana aparte, orientada a análisis forense del mensaje:

- Cabeceras y cuerpo crudos con resaltado de sintaxis, búsqueda y copia.
- **Ruta del mensaje**: cadena `Received` en orden cronológico, con la demora
  entre saltos y el resultado de **SPF/DKIM/DMARC**.
- **Decodificador** de bloques base64 y quoted-printable en el sitio.
- **Propiedades MAPI crudas** (tabla de PidTag) para archivos `.msg`.
- **Diff de sanitización**: lista exacta de los scripts y manejadores de evento
  que el correo traía y que se eliminaron.

Exportable a PDF, HTML o TXT, e imprimible.

## 7. Asociación con el sistema operativo

*Archivo → Asociar tipos de archivo…* abre un diálogo para elegir cuáles de los
tres tipos (`.msg`, `.eml`, `.emlx`) debe abrir MsgEater al hacer doble clic.

- **Linux**: escribe un `.desktop` y el MIME a nivel de usuario en
  `~/.local/share/` y fija el predeterminado con `xdg-mime`. No requiere root
  y funciona igual con AppImage, paquete instalado o modo desarrollo.
- **macOS**: no hay registro programático; el diálogo muestra las instrucciones
  para hacerlo desde Finder (*Obtener información → Abrir con → Cambiar todo*).

La app ofrece esta asociación una vez al inicio si detecta que no está hecha;
puede desestimarse permanentemente.

## 8. Red y privacidad

MsgEater no realiza ninguna conexión saliente por sí misma: no hay telemetría,
ni actualizaciones automáticas, ni carga de recursos remotos del mensaje. La
**única** excepción es descargar una imagen remota concreta cuando el usuario
hace clic en su marcador y acepta el aviso de rastreo; esa descarga tiene
límite de tamaño (25 MB) y de tiempo (15 s), y el resultado se incrusta como
`data:` URI.
