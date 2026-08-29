# Cómo verificar un release de MsgEater

Este documento es para quien no quiere confiar ciegamente en el autor: te
permite comprobar, con herramientas estándar, que un artefacto publicado en
[Releases](https://github.com/oscarhenriquezg/msgeater/releases) corresponde
exactamente al código de este repositorio y no fue alterado después de
construirse.

No reemplaza el juicio propio — es evidencia verificable, no una
certificación. Ver la sección [Qué demuestra esto (y qué no)](#qué-demuestra-esto-y-qué-no)
al final.

## 1. Descargar el artefacto y `SHA256SUMS`

Desde la página del [release](https://github.com/oscarhenriquezg/msgeater/releases/latest),
descarga el archivo que vayas a instalar (`.AppImage`, `.deb`, `.rpm`, `.dmg`
o `.zip`) **y** el archivo `SHA256SUMS` que acompaña a cada release.

## 2. Verificar el checksum SHA-256

**Linux:**

```bash
sha256sum -c SHA256SUMS --ignore-missing
```

Debe imprimir `OK` junto al archivo que descargaste. `--ignore-missing`
evita errores por los artefactos de la otra plataforma que no descargaste.

**macOS:**

```bash
shasum -a 256 -c SHA256SUMS --ignore-missing
```

Si el resultado no dice `OK`, el archivo no coincide con lo publicado —
no lo instales y repórtalo.

## 3. Verificar la procedencia (GitHub Artifact Attestation)

Esto prueba criptográficamente (vía [Sigstore](https://www.sigstore.dev/))
que el archivo salió del workflow de GitHub Actions de este repositorio, en
un commit concreto — no de una máquina o proceso arbitrario.

Requiere la [GitHub CLI](https://cli.github.com/) (`gh`), versión reciente:

```bash
gh attestation verify MsgEater-x.y.z-x86_64.AppImage --repo oscarhenriquezg/msgeater
```

(sustituye el nombre de archivo por el que descargaste). Una verificación
exitosa confirma repositorio, commit y workflow de origen — no requiere estar
autenticado en `gh` para artefactos de un repo público.

El release también incluye `msgeater-x.y.z.sigstore.json`: el mismo bundle
de procedencia como archivo descargable, para quien prefiera inspeccionarlo
sin depender de la API de GitHub (por ejemplo con
[`cosign verify-blob-attestation`](https://docs.sigstore.dev/cosign/verifying/verify/)
o cualquier herramienta compatible con bundles Sigstore). El comando
`gh attestation verify` de arriba sigue siendo la forma más simple.

## 4. Firma / notarización (macOS)

MsgEater **no está firmada con un certificado Developer ID de Apple ni
notarizada** — el build de macOS se distribuye sin firmar (ver
[README](../README.md#instalación) para el porqué). El checksum y la
attestation de los pasos 2 y 3 siguen siendo válidos para un `.dmg`/`.zip`
sin firmar; simplemente no sustituyen la verificación que haría Gatekeeper
sobre una app firmada.

## 5. Consultar el escaneo de VirusTotal (opcional, señal adicional)

Cada release publicado dispara un escaneo automático de los 5 instalables
(~70 motores antivirus vía [VirusTotal](https://www.virustotal.com/)). El
resultado queda en el resumen del run de GitHub Actions correspondiente:
pestaña **Actions** → workflow **VirusTotal scan** → el run del tag que te
interesa → "Summary".

Esto es una **señal adicional**, no una certificación: un resultado limpio
no prueba ausencia de malware (los motores pueden fallar en detectar algo
nuevo), y un falso positivo ocasional en apps Electron no firmadas no es
inusual. Reportamos el número de motores que marcaron algo (p. ej. "0
malicious / 0 suspicious de 71 motores") junto al enlace al informe
completo — nunca frases como "certificado" o "libre de virus".

## Qué demuestra esto (y qué no)

| Verificación | Qué prueba | Qué **no** prueba |
| --- | --- | --- |
| `SHA256SUMS` | El archivo que tienes es *byte a byte* el que se publicó en el release | Que ese contenido esté libre de errores o vulnerabilidades |
| Artifact Attestation | El archivo salió del workflow de GitHub Actions de este repo, en un commit identificable — no de un tercero | Que el código de ese commit sea seguro; solo prueba origen, no ausencia de fallos |
| VirusTotal | ~70 motores antivirus no marcaron el archivo en el momento del escaneo | Que sea imposible que algún motor falle en detectar algo nuevo; no es una certificación |
| Ninguna de las anteriores | — | Que la app sea "100% segura": eso no lo demuestra ningún control individual |

Para el detalle de qué protecciones tiene la app en tiempo de ejecución
(sandbox del iframe, sanitización HTML, bloqueo de red, etc.), ver
[`SECURITY.md`](../SECURITY.md).
