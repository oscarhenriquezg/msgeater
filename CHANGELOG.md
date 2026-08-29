# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

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
