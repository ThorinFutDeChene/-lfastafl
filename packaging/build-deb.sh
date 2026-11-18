#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
OUTPUT=${1:-"$ROOT/../alfastafl_0.1.0~dev2_all.deb"}
BUILD=$(mktemp -d)
trap 'rm -rf "$BUILD"' EXIT
mkdir -p "$BUILD/DEBIAN" "$BUILD/opt/alfastafl/src" "$BUILD/opt/alfastafl/web" "$BUILD/usr/bin" "$BUILD/usr/share/applications" "$BUILD/usr/share/doc/alfastafl"
cp -R "$ROOT/src/alfastafl" "$BUILD/opt/alfastafl/src/"
find "$BUILD" -type d -name __pycache__ -exec rm -rf {} +
cp "$ROOT"/web/* "$BUILD/opt/alfastafl/web/"
cp "$ROOT/README.md" "$BUILD/usr/share/doc/alfastafl/README.md"
cp "$ROOT/LICENSE" "$BUILD/usr/share/doc/alfastafl/copyright"
cat > "$BUILD/DEBIAN/control" <<'CTRL'
Package: alfastafl
Version: 0.1.0~dev2
Section: games
Priority: optional
Architecture: all
Maintainer: Alfastafl Contributors <contact@thorinux.fr>
Depends: python3, python3-pyqt6, python3-pyqt6.qtwebengine, python3-qrcode, python3-pil
Description: Alfastafl Viking-fantasy tafl network game (development preview)
 Experimental LAN tafl software, not yet feature-complete.
CTRL
cat > "$BUILD/usr/bin/alfastafl" <<'SH'
#!/bin/sh
PYTHONPATH=/opt/alfastafl/src exec /usr/bin/python3 -m alfastafl.desktop "$@"
SH
chmod 755 "$BUILD/usr/bin/alfastafl"
cat > "$BUILD/usr/share/applications/alfastafl.desktop" <<'SH'
[Desktop Entry]
Type=Application
Name=Álfastafl (DEV)
Comment=Jeu de tafl viking-fantasy en réseau local
Exec=/usr/bin/alfastafl
Terminal=false
Categories=Game;BoardGame;
SH
dpkg-deb --build --root-owner-group "$BUILD" "$OUTPUT"
sha256sum "$OUTPUT"
