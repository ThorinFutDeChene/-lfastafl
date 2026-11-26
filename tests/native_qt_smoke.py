#!/usr/bin/python3
"""CI smoke: really start Qt6/WebEngine under Xvfb, not fake classes.

Previous DEV8/DEV9 builds passed mocked unit tests and Chromium while
QWebEngineSettings.WebAttribute.JavascriptCanCloseWindows crashed Qt during
startup. This test must run with the Debian system PyQt6 packages.
"""
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request


def request(url):
    try:
        with urllib.request.urlopen(url, timeout=0.6) as response:
            return response.read(1_000_000).decode("utf-8", errors="replace")
    except (OSError, ValueError):
        return None


def main():
    with tempfile.TemporaryDirectory(prefix="alfastafl-native-qt-") as tmp:
        root = pathlib.Path(tmp)
        runtime = root / "runtime"
        runtime.mkdir(mode=0o700)
        env = os.environ.copy()
        env.update(
            XDG_DATA_HOME=str(root / "data"),
            XDG_CONFIG_HOME=str(root / "config"),
            XDG_CACHE_HOME=str(root / "cache"),
            XDG_RUNTIME_DIR=str(runtime),
            QTWEBENGINE_DISABLE_SANDBOX="1",  # isolated CI / Xvfb ONLY
            QTWEBENGINE_REMOTE_DEBUGGING="17867",  # isolated CI / Xvfb ONLY
            QTWEBENGINE_CHROMIUM_FLAGS="--disable-gpu",
            QT_QUICK_BACKEND="software",
            LIBGL_ALWAYS_SOFTWARE="1",
            PYTHONPATH=str(pathlib.Path(__file__).resolve().parents[1] / "src"),
        )
        # Exercise the actual Qt fullscreen poster in addition to native
        # WebEngine startup. Generate a local image only for CI, not the product.
        from PIL import Image, ImageDraw
        poster = root / "data" / "alfastafl" / "affiche.png"
        poster.parent.mkdir(parents=True, exist_ok=True)
        artwork = Image.new("RGB", (960, 640), "#26352c")
        paint = ImageDraw.Draw(artwork)
        paint.rectangle((70, 70, 890, 570), outline="#d8b879", width=12)
        paint.text((290, 260), "ALFASTAFL - TEST", fill="#f4d9a1")
        artwork.save(poster)
        proc = subprocess.Popen(
            ["/usr/bin/python3", "-m", "alfastafl.desktop"],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            env=env, text=True,
        )
        did_serve = False
        saw_webengine = False
        saw_window = False
        try:
            deadline = time.monotonic() + 25
            while time.monotonic() < deadline:
                if proc.poll() is not None:
                    output = proc.communicate(timeout=2)[0]
                    raise AssertionError(
                        f"Álfastafl native Qt exited during startup "
                        f"(exit={proc.returncode}):\n{output[-8000:]}"
                    )
                if request("http://127.0.0.1:8766/api/address"):
                    did_serve = True
                raw = request("http://127.0.0.1:17867/json/list")
                if raw:
                    try:
                        pages = json.loads(raw)
                        saw_webengine |= any(
                            "/?desktop=shell" in str(tab.get("url", ""))
                            for tab in pages
                        )
                    except (TypeError, ValueError):
                        pass
                if not saw_window:
                    try:
                        win = subprocess.run(
                            ["xwininfo", "-root", "-tree"],
                            text=True, capture_output=True, timeout=2, check=True,
                        )
                        saw_window = "Álfastafl" in win.stdout or "Alfastafl" in win.stdout
                    except (OSError, subprocess.SubprocessError):
                        pass
                if did_serve and saw_window and saw_webengine:
                    # A genuine visible Qt window + a loaded WebEngine page,
                    # not merely the headless local HTTP server.
                    time.sleep(1)
                    assert proc.poll() is None, "Qt crashed after page load"
                    print("ALFASTAFL_NATIVE_QT_STARTUP_OK", flush=True)
                    return
                time.sleep(0.35)
            raise AssertionError(
                "Native Qt did not open a usable window and WebEngine page "
                f"(server={did_serve}, window={saw_window}, "
                f"webengine={saw_webengine}, running={proc.poll() is None})."
            )
        finally:
            if proc.poll() is None:
                proc.terminate()
            try:
                output = proc.communicate(timeout=5)[0]
            except subprocess.TimeoutExpired:
                proc.kill()
                output = proc.communicate(timeout=3)[0]
            if output:
                print("Qt startup diagnostics:\n" + output[-9000:], file=sys.stderr)


if __name__ == "__main__":
    main()
