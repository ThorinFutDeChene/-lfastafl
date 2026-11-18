"""Native Qt6 desktop window hosting the LAN game and update controller."""
import threading
from .server import run, Store, PORT


def main():
    try:
        from PyQt6.QtWidgets import QApplication, QMainWindow, QToolBar, QMessageBox
        from PyQt6.QtGui import QAction
        from PyQt6.QtCore import QUrl
        from PyQt6.QtWebEngineWidgets import QWebEngineView
    except ImportError as exc:
        raise SystemExit('PyQt6 and QtWebEngine required: apt install python3-pyqt6 python3-pyqt6.qtwebengine') from exc
    from .updater_ui import UpdateController
    import sys
    app = QApplication(sys.argv)
    store = Store()
    server = [run('127.0.0.1', PORT, store)]
    thread = [threading.Thread(target=server[0].serve_forever, daemon=True)]
    thread[0].start()
    win = QMainWindow()
    win.setWindowTitle('Álfastafl — DEV')
    win.resize(1100, 820)
    view = QWebEngineView()
    win.setCentralWidget(view)
    view.setUrl(QUrl(f'http://127.0.0.1:{PORT}/'))
    bar = QToolBar('Réseau local')
    win.addToolBar(bar)
    lan = QAction('Activer accès LAN', win)
    lan.setCheckable(True)
    bar.addAction(lan)

    def toggle(on):
        server[0].shutdown()
        server[0].server_close()
        thread[0].join(timeout=3)
        try:
            new = run('0.0.0.0' if on else '127.0.0.1', PORT, store)
        except OSError as exc:
            QMessageBox.critical(win, 'Réseau', str(exc))
            lan.blockSignals(True)
            lan.setChecked(not on)
            lan.blockSignals(False)
            new = run('127.0.0.1', PORT, store)
        server[0] = new
        thread[0] = threading.Thread(target=new.serve_forever, daemon=True)
        thread[0].start()
        view.reload()

    lan.toggled.connect(toggle)
    win.updates = UpdateController(win, bar)
    app.aboutToQuit.connect(lambda: (server[0].shutdown(), server[0].server_close()))
    win.show()
    sys.exit(app.exec())


if __name__ == '__main__':
    main()
