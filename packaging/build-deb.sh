#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
VERSION=$(cat "$ROOT/VERSION")
if ! printf '%s\n' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(~dev[0-9]+)?$'; then
    echo 'Refus de construire: VERSION doit être une version Debian Álfastafl valide' >&2
    exit 1
fi
if printf '%s' "$VERSION" | grep -q '~dev'; then
    APP_NAME='Álfastafl (DEV)'
    PACKAGE_DESCRIPTION='Alfastafl Viking-fantasy tafl network game (development preview)'
    PACKAGE_DETAIL=' Experimental LAN tafl software, not yet feature-complete.'
else
    APP_NAME='Álfastafl'
    PACKAGE_DESCRIPTION='Alfastafl Viking-fantasy tafl local-network game'
    PACKAGE_DETAIL=' Open-source 11x11 tafl game with LAN play and persistent saves.'
fi
# The approved original poster is part of the main package, not an optional download.
(cd "$ROOT" && printf '%s  %s\n' '07bd456f33d6005657aa1bfa89e028bae10d2baca66271aaf2da389a89fd4c69' 'web/assets/affiche.png' | sha256sum -c -)
FILE_VERSION=$(printf '%s' "$VERSION" | tr '~' '_')
OUTPUT=${1:-"$ROOT/../alfastafl_${FILE_VERSION}_all.deb"}
BUILD=$(mktemp -d)
trap 'rm -rf "$BUILD"' EXIT
mkdir -p "$BUILD/DEBIAN" "$BUILD/opt/alfastafl/src" "$BUILD/opt/alfastafl/web" "$BUILD/usr/bin" "$BUILD/usr/share/applications" "$BUILD/usr/share/doc/alfastafl"
cp -R "$ROOT/src/alfastafl" "$BUILD/opt/alfastafl/src/"
find "$BUILD" -type d -name __pycache__ -exec rm -rf {} +
cp -R "$ROOT/web/." "$BUILD/opt/alfastafl/web/"
cp "$ROOT/VERSION" "$BUILD/opt/alfastafl/VERSION"
cp "$ROOT/README.md" "$BUILD/usr/share/doc/alfastafl/README.md"
cp "$ROOT/RULES.md" "$BUILD/usr/share/doc/alfastafl/RULES.md"
cp "$ROOT/THIRD_PARTY_NOTICES.md" "$BUILD/usr/share/doc/alfastafl/THIRD_PARTY_NOTICES.md"
cp "$ROOT/LICENSE" "$BUILD/usr/share/doc/alfastafl/copyright"
cat > "$BUILD/DEBIAN/control" <<CTRL
Package: alfastafl
Version: $VERSION
Section: games
Priority: optional
Architecture: all
Maintainer: Alfastafl Contributors <contact@thorinux.fr>
Depends: python3, python3-pyqt6, python3-pyqt6.qtwebengine, python3-qrcode, python3-pil, iproute2, ufw, pkexec | policykit-1
Description: $PACKAGE_DESCRIPTION
$PACKAGE_DETAIL
CTRL
cat > "$BUILD/usr/bin/alfastafl" <<'SHCMD'
#!/bin/sh
PYTHONPATH=/opt/alfastafl/src exec /usr/bin/python3 -m alfastafl.desktop "$@"
SHCMD
chmod 755 "$BUILD/usr/bin/alfastafl"
cat > "$BUILD/usr/share/applications/alfastafl.desktop" <<SHDESK
[Desktop Entry]
Type=Application
Name=$APP_NAME
Comment=Jeu de tafl viking-fantasy en réseau local
Exec=/usr/bin/alfastafl
Terminal=false
Categories=Game;BoardGame;
SHDESK
dpkg-deb --build --root-owner-group "$BUILD" "$OUTPUT"
sha256sum "$OUTPUT"
