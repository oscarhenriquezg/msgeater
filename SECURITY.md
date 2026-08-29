# Política de seguridad

<p align="center">
  <b>Español</b> · <a href="SECURITY.en.md">English</a>
</p>

MsgEater es un visor de correo **100 % offline** cuyo objetivo es abrir
archivos `.msg`/`.eml`/`.emlx` —que pueden ser hostiles— sin poner en riesgo al
usuario. La seguridad es parte del propósito del proyecto, así que los informes
de vulnerabilidad son bienvenidos y se tratan con prioridad.

## Versiones soportadas

Solo se da soporte de seguridad a la **última versión publicada** en
[Releases](https://github.com/oscarhenriquezg/msgeater/releases/latest).
Versiones anteriores no reciben parches: al ser software gratuito de un solo
mantenedor, no es sostenible mantener varias ramas en paralelo. Actualiza a
la última versión antes de reportar, si es posible — puede que el problema ya
esté corregido.

## Cómo reportar una vulnerabilidad

**No abras un issue público** para fallos de seguridad. En su lugar:

1. Preferente: usa **GitHub Security Advisories** →
   [«Report a vulnerability»](https://github.com/oscarhenriquezg/msgeater/security/advisories/new).
2. Alternativa: escribe a **oscar.henriquez.gonzalez@gmail.com** con el asunto
   `[SECURITY] msgeater`.

Incluye, si puedes:

- versión de la app y sistema operativo;
- pasos para reproducirlo y un archivo de prueba mínimo (`.msg`/`.eml`)
  **anonimizado**, sin datos personales ni corporativos reales;
- el impacto que crees que tiene.

### Qué esperar

- **Acuse de recibo** en un plazo de 72 horas.
- Una evaluación inicial y, si procede, un plan de corrección en un máximo de
  2 semanas.
- Crédito en las notas de la versión que corrija el fallo, si así lo deseas.

Por ser un proyecto personal sin ánimo de lucro no existe un programa de
recompensas (bug bounty).

### Divulgación coordinada

Se pide **divulgación coordinada**: no publiques detalles de explotación
(issue, red social, lista de correo) antes de que exista un fix publicado, o
antes de que hayan pasado 90 días desde el acuse de recibo sin respuesta ni
avance por parte del mantenedor — lo que ocurra primero. Si se te da crédito,
se coordina contigo el momento y la forma antes de publicarlo.

## Alcance

Especialmente relevante para este proyecto:

- **Ejecución de contenido del correo**: cualquier forma de ejecutar scripts,
  cargar recursos remotos (fuga de IP / tracking pixels) o salir del entorno
  inerte del cuerpo del mensaje.
- **Escape del sandbox del renderer** o acceso indebido a APIs de Node desde el
  contenido mostrado.
- **Escritura de archivos fuera de lo que el usuario elige** al guardar
  adjuntos o exportar (path traversal con nombres de adjunto manipulados).
- **Cuelgues o corrupción** explotables al procesar archivos malformados.

Fuera de alcance: vulnerabilidades en dependencias de terceros ya conocidas y
sin parche disponible (repórtalas aguas arriba), y ataques que requieran que el
usuario deshabilite voluntariamente las protecciones de la app.

## CVEs en dependencias

Las dependencias están vigiladas de forma automática, no solo cuando alguien
reporta algo:

- **Dependabot** (alertas + actualizaciones) revisa semanalmente lo ya
  instalado, agrupado para no generar ruido innecesario de PRs.
- **`npm audit --omit=dev --audit-level=high`** corre en cada commit/PR (CI)
  y **bloquea el build** ante vulnerabilidades HIGH/CRITICAL en dependencias
  que sí viajan en el binario distribuido (se excluye tooling de desarrollo,
  que no se distribuye).
- **Dependency Review** bloquea en los PRs la introducción de una dependencia
  nueva con vulnerabilidades HIGH/CRITICAL conocidas, antes de mergear.

Un CVE en una dependencia de producción se trata con la misma prioridad que
un fallo propio: si hay parche upstream, se aplica y se publica una versión
corregida; si no lo hay, se evalúa mitigación (pin a una versión sin el
código afectado, evitar la ruta de código vulnerable, o sustituir la
dependencia) según el impacto real en esta app, no solo la severidad
reportada.

## Decisiones de diseño orientadas a seguridad

- El cuerpo del correo se muestra en un `<iframe>` *sandbox*
  (`allow-same-origin`, **sin `allow-scripts` ni `allow-popups`**) con una CSP
  que solo permite `data:` para imágenes.
- El HTML se **sanitiza con DOMPurify** — misma política compartida
  (`@shared/sanitize-policy`) tanto en el renderer (DOM nativo, para lo que
  se muestra) como en el proceso main (para la vista de código fuente y las
  exportaciones) — el visor muestra además un *diff* de lo eliminado.
- **Bloqueo de red saliente** a nivel de sesión: ningún recurso del mensaje
  sale a Internet salvo que el usuario pida explícitamente cargar una imagen
  remota bloqueada (NFR-03).
- El parsing ocurre en un *worker thread* aislado del proceso main.
- Función **Unlink** para inutilizar todos los enlaces de un correo sospechoso,
  y advertencia de confianza antes de abrir cualquier enlace externo.

Estas medidas reducen el riesgo, pero ninguna es perfecta: por eso este
documento existe. El detalle completo — fronteras de confianza, diagrama del
flujo de datos y qué riesgo residual queda en cada punto — está en
[`docs/SECURITY-ARCHITECTURE.md`](docs/SECURITY-ARCHITECTURE.md). Para
verificar que un release publicado corresponde al código de este repo, ver
[`docs/VERIFY-RELEASE.md`](docs/VERIFY-RELEASE.md).
