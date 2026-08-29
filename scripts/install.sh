#!/usr/bin/env bash
# Instalador de MsgEater para Linux y macOS.
# Uso:  bash -c "$(curl -fsSL https://raw.githubusercontent.com/oscarhenriquezg/msgeater/main/scripts/install.sh)"
#
# Linux : detecta la familia de la distro e instala el paquete nativo
#         correspondiente (.deb en Debian/Ubuntu/Mint…, .rpm en
#         Fedora/RHEL/openSUSE…) con el gestor de paquetes del sistema
#         (requiere sudo). Si no reconoce ninguna de las dos familias, cae al
#         AppImage (~/.local/bin, sin root, con entrada de menú propia).
# macOS : descarga el .zip universal (arm64 + Intel), descomprime "MsgEater.app"
#         en ~/Applications y le quita la cuarentena (la app no está firmada).
#
# Si ya hay una instalación previa, este script la actualiza: si es del mismo
# tipo (p. ej. .deb sobre .deb) deja que el gestor de paquetes / la simple
# sobrescritura del binario apliquen solo el cambio necesario; si es de un
# tipo distinto (p. ej. venías de AppImage y tu distro ahora resuelve a .deb)
# ofrece limpiar la instalación anterior antes de poner la nueva, para no
# terminar con dos entradas de MsgEater en el menú.
set -euo pipefail

REPO="oscarhenriquezg/msgeater"
API="https://api.github.com/repos/${REPO}/releases/latest"

info() { printf '\033[1;34m==>\033[0m %s\n' "$1"; }
ok()   { printf '\033[1;32m%s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m%s\033[0m\n' "$1"; }
err()  { printf '\033[1;31mError:\033[0m %s\n' "$1" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || err "curl no está instalado."

# --- Detección de SO y arquitectura (patrón estilo Homebrew) ----------------
arch="$(uname -m)"
case "$(uname)" in
  Linux)  OS=linux ;;
  Darwin) OS=macos ;;
  *)      err "Solo se soporta Linux y macOS." ;;
esac

# Resuelve la URL de descarga del asset cuyo nombre casa con el patrón regex $1.
asset_url() {
  local pat="$1" url
  url="$(curl -fsSL "$API" | grep -oE "https://[^\"]*${pat}")" || true
  [ -n "$url" ] || err "No se encontró un asset que case con '${pat}' en el último release."
  printf '%s\n' "$url"
}

# Confirmación interactiva (prompt en /dev/tty, porque en `curl | bash` el
# stdin es el propio script). Sin tty: no se asume consentimiento (default no).
confirm() {
  local prompt="$1" ans=''
  if { exec 3</dev/tty; } 2>/dev/null; then
    printf '%s [s/N] ' "$prompt"
    read -r ans <&3 || ans=''
    exec 3<&-
    case "$ans" in s|S|y|Y) return 0 ;; *) return 1 ;; esac
  fi
  return 1
}

# --- FUSE2: los AppImage necesitan libfuse.so.2 (FUSE 2, no FUSE 3) ----------
has_fuse2() {
  ldconfig -p 2>/dev/null | grep -q 'libfuse\.so\.2' && return 0
  local p
  for p in /usr/lib/libfuse.so.2 /usr/lib/*/libfuse.so.2 /lib/*/libfuse.so.2 /lib64/libfuse.so.2; do
    [ -e "$p" ] && return 0
  done
  return 1
}

# Comando de instalación de FUSE2 según el gestor de paquetes de la distro.
fuse2_install_cmd() {
  if command -v apt-get >/dev/null 2>&1; then
    # Ubuntu 24.04+ renombró el paquete a libfuse2t64.
    echo 'sudo apt-get install -y libfuse2 || sudo apt-get install -y libfuse2t64'
  elif command -v dnf >/dev/null 2>&1; then
    echo 'sudo dnf install -y fuse fuse-libs'
  elif command -v pacman >/dev/null 2>&1; then
    echo 'sudo pacman -S --needed --noconfirm fuse2'
  elif command -v zypper >/dev/null 2>&1; then
    echo 'sudo zypper install -y libfuse2'
  fi
}

# Si falta FUSE2, lo ofrece (prompt en /dev/tty, porque en `curl | bash` el
# stdin es el propio script). Sin tty o sin gestor conocido: muestra el comando.
ensure_fuse2() {
  local appimage="$1"
  has_fuse2 && return 0
  local cmd; cmd="$(fuse2_install_cmd)"
  info "FUSE2 (libfuse.so.2) no está instalado; los AppImage lo necesitan para arrancar."
  if [ -z "$cmd" ]; then
    echo "  Instálalo con tu gestor (paquete libfuse2 / fuse-libs / fuse2),"
    echo "  o ejecuta sin FUSE:  ${appimage} --appimage-extract-and-run"
    return 0
  fi
  if confirm "  ¿Instalarlo ahora? Se ejecutará (pedirá tu contraseña de sudo):
    ${cmd}"; then
    if eval "$cmd"; then ok "✓ FUSE2 instalado."
    else echo "  No se pudo instalar. Hazlo a mano, o usa: ${appimage} --appimage-extract-and-run"; fi
  else
    echo "  Saltado. Para instalarlo luego:  $cmd"
    echo "  (o ejecuta sin FUSE:  ${appimage} --appimage-extract-and-run)"
  fi
}

# --- Familia de paquete Linux, según la distro (deb / rpm / appimage) -------
linux_pkg_family() {
  if [ -r /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    case " ${ID:-} ${ID_LIKE:-} " in
      *' debian '*|*' ubuntu '*) echo deb; return ;;
      *' rhel '*|*' fedora '*|*' suse '*) echo rpm; return ;;
    esac
  fi
  # Sin /etc/os-release (o distro no reconocida): usa el gestor presente.
  command -v dpkg >/dev/null 2>&1 && { echo deb; return; }
  command -v rpm  >/dev/null 2>&1 && { echo rpm; return; }
  echo appimage
}

# --- Detección de instalaciones previas (Linux) -----------------------------
# Imprime, una por línea, cada método de instalación previa detectado.
detect_linux_installed() {
  dpkg -s msgeater >/dev/null 2>&1 && echo deb
  rpm -q msgeater >/dev/null 2>&1 && echo rpm
  [ -e "${HOME}/.local/bin/MsgEater.AppImage" ] && echo appimage
  return 0
}

remove_appimage_install() {
  local bin_dir="${HOME}/.local/bin" apps_dir="${HOME}/.local/share/applications"
  rm -f "${bin_dir}/MsgEater.AppImage" "${apps_dir}/msgeater.desktop"
  update-desktop-database "$apps_dir" >/dev/null 2>&1 || true
}

remove_deb_install() {
  if command -v apt-get >/dev/null 2>&1; then sudo apt-get remove -y msgeater
  else sudo dpkg -r msgeater
  fi
}

remove_rpm_install() {
  if command -v dnf >/dev/null 2>&1; then sudo dnf remove -y msgeater
  elif command -v yum >/dev/null 2>&1; then sudo yum remove -y msgeater
  elif command -v zypper >/dev/null 2>&1; then sudo zypper remove -y msgeater
  else sudo rpm -e msgeater
  fi
}

# Si hay instalaciones previas de un método distinto al elegido, ofrece
# limpiarlas primero para no terminar con dos MsgEater en el menú. La del
# mismo método no se toca aquí: el propio instalador del paquete (o la
# sobrescritura del AppImage) se encarga de actualizarla en su sitio.
reconcile_previous_installs() {
  local target="$1" m
  local -a installed=()
  while IFS= read -r m; do installed+=("$m"); done < <(detect_linux_installed)
  [ "${#installed[@]}" -eq 0 ] && return 0

  info "Instalación previa detectada (${installed[*]}). Actualizando a la última versión…"
  for m in "${installed[@]}"; do
    [ "$m" = "$target" ] && continue
    if confirm "  Instalación previa vía '${m}' distinta de la elegida ('${target}'). ¿Eliminarla para evitar duplicados?"; then
      case "$m" in
        deb) remove_deb_install ;;
        rpm) remove_rpm_install ;;
        appimage) remove_appimage_install ;;
      esac
      ok "  ✓ Instalación previa (${m}) eliminada."
    else
      warn "  Se deja intacta; podrías terminar con dos entradas de MsgEater en el menú."
    fi
  done
}

install_deb() {
  local url tmp
  url="$(asset_url 'amd64\.deb')"
  info "Descargando: ${url##*/}"
  tmp="$(mktemp -d)"
  curl -fL "$url" -o "${tmp}/msgeater.deb"
  info "Instalando el paquete .deb (pedirá tu contraseña de sudo)…"
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get install -y "${tmp}/msgeater.deb"
  else
    sudo dpkg -i "${tmp}/msgeater.deb" || sudo apt-get install -f -y
  fi
  rm -rf "$tmp"
  ok "✓ MsgEater instalado (.deb)."
  echo "  Lánzalo desde el menú de aplicaciones, o con: msgeater"
}

install_rpm() {
  local url tmp
  url="$(asset_url 'x86_64\.rpm')"
  info "Descargando: ${url##*/}"
  tmp="$(mktemp -d)"
  curl -fL "$url" -o "${tmp}/msgeater.rpm"
  info "Instalando el paquete .rpm (pedirá tu contraseña de sudo)…"
  if command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y "${tmp}/msgeater.rpm"
  elif command -v yum >/dev/null 2>&1; then
    sudo yum install -y "${tmp}/msgeater.rpm"
  elif command -v zypper >/dev/null 2>&1; then
    sudo zypper install -y "${tmp}/msgeater.rpm"
  else
    sudo rpm -Uvh "${tmp}/msgeater.rpm"
  fi
  rm -rf "$tmp"
  ok "✓ MsgEater instalado (.rpm)."
  echo "  Lánzalo desde el menú de aplicaciones, o con: msgeater"
}

install_appimage() {
  local bin_dir="${HOME}/.local/bin" apps_dir="${HOME}/.local/share/applications"
  local target="${bin_dir}/MsgEater.AppImage" url
  url="$(asset_url 'x86_64\.AppImage')"

  info "Descargando: ${url##*/}"
  mkdir -p "$bin_dir" "$apps_dir"
  curl -fL "$url" -o "$target"
  chmod +x "$target"

  info "Creando entrada en el menú de aplicaciones…"
  cat > "${apps_dir}/msgeater.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=MsgEater
Exec=${target} %f
Icon=msgeater
MimeType=application/vnd.ms-outlook;
Categories=Office;
Terminal=false
EOF
  update-desktop-database "$apps_dir" >/dev/null 2>&1 || true

  # Comprobar FUSE2 (requisito de los AppImage) y ofrecer instalarlo si falta.
  ensure_fuse2 "$target"

  ok "✓ MsgEater instalado (AppImage)."
  echo "  Ejecutable: ${target}"
  case ":${PATH}:" in
    *":${bin_dir}:"*) echo "  Lánzalo con: MsgEater.AppImage   (o desde el menú de apps)";;
    *) echo "  Añade ~/.local/bin al PATH, o lánzalo con: ${target}";;
  esac
}

install_linux() {
  [ "$arch" = "x86_64" ] || err "En Linux solo hay build x86_64 (detectado: ${arch})."

  local target; target="$(linux_pkg_family)"
  reconcile_previous_installs "$target"

  case "$target" in
    deb) install_deb ;;
    rpm) install_rpm ;;
    appimage) install_appimage ;;
  esac
}

install_macos() {
  command -v unzip >/dev/null 2>&1 || err "unzip no está disponible."
  local apps_dir="${HOME}/Applications" app="MsgEater.app" url tmp
  url="$(asset_url 'mac\.zip')"   # .zip universal: sirve para arm64 e Intel

  [ -d "${apps_dir}/${app}" ] && info "Instalación previa detectada en ${apps_dir}/${app}. Actualizando…"

  info "Descargando: ${url##*/}"
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  curl -fL "$url" -o "${tmp}/app.zip"

  info "Instalando en ${apps_dir}…"
  mkdir -p "$apps_dir"
  rm -rf "${apps_dir:?}/${app}"
  unzip -q "${tmp}/app.zip" -d "$apps_dir"
  # App sin firmar: quitar la cuarentena para que Gatekeeper no la bloquee.
  xattr -dr com.apple.quarantine "${apps_dir}/${app}" 2>/dev/null || true

  ok "✓ MsgEater instalado."
  echo "  App: ${apps_dir}/${app}"
  echo "  Ábrela desde Launchpad/Finder, o con: open \"${apps_dir}/${app}\""
}

case "$OS" in
  linux) install_linux ;;
  macos) install_macos ;;
esac
