"""Qt6 native host: loopback UI plus automatically leased LAN and UFW access."""
import threading

from .server import run, Store, PORT


def show_main_window(window):
    """Start maximized while preserving native desktop panels and window controls."""
    window.showMaximized()


def main():
    try:
        from PyQt6.QtWidgets import QApplication, QMainWindow, QToolBar, QMessageBox
        from PyQt6.QtGui import QAction
        from PyQt6.QtCore import QUrl, QObject, pyqtSignal, QTimer
        from PyQt6.QtWebEngineWidgets import QWebEngineView
    except ImportError as exc:
        raise SystemExit('PyQt6 et QtWebEngine requis : apt install python3-pyqt6 python3-pyqt6.qtwebengine') from exc
    from .updater_ui import UpdateController
    from .lan import FirewallLease, LanError, detect_network
    import sys

    app = QApplication(sys.argv)
    store = Store()
    # A local-only web service is immediately accessible even without Wi-Fi,
    # a polkit agent, or an authorized firewall change.
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
    lan_action = QAction('Activation LAN automatique…', win)
    lan_action.setCheckable(True)
    lan_action.setEnabled(False)
    bar.addAction(lan_action)

    # A second listener is bound to the exact private LAN IPv4 address.
    # Keeping the 127.0.0.1 listener avoids broad 0.0.0.0 exposure,
    # preserves the administrator-only controls and keeps the UI connected.
    network_server = [None]
    network_thread = [None]

    def open_network_server(network):
        remote = run(network.address, PORT, store)
        remote.lan_address = network.address
        remote.lan_enabled = True
        worker = threading.Thread(target=remote.serve_forever, daemon=True)
        worker.start()
        network_server[0], network_thread[0] = remote, worker
        server[0].lan_address = network.address
        server[0].lan_enabled = True

    def close_network_server():
        # QR/link generation is disabled before the remote listener stops.
        server[0].lan_enabled = False
        server[0].lan_address = '127.0.0.1'
        remote = network_server[0]
        network_server[0], network_thread[0] = None, None
        if remote is not None:
            remote.shutdown()
            remote.server_close()

    class LanController(QObject):
        ready = pyqtSignal(object, object)
        error = pyqtSignal(str)

        def __init__(self):
            super().__init__(win)
            self.lease = None
            self.activating = False
            self.closing = False
            self.ready.connect(self.on_ready)
            self.error.connect(self.on_error)
            self.timer = QTimer(self)
            self.timer.timeout.connect(self.monitor)
            self.timer.start(1500)

        def set_action(self, active, label):
            lan_action.blockSignals(True)
            lan_action.setChecked(active)
            lan_action.setText(label)
            lan_action.setEnabled(True)
            lan_action.blockSignals(False)

        def start(self):
            if self.activating or self.lease or self.closing:
                return
            self.activating = True
            lan_action.setEnabled(False)
            lan_action.setText('Ouverture sécurisée du LAN…')

            def worker():
                lease = FirewallLease()
                try:
                    network = detect_network()
                    lease.start(network)
                    if self.closing:
                        lease.close()
                    else:
                        self.ready.emit(network, lease)
                except Exception as exc:
                    lease.close()
                    if not self.closing:
                        self.error.emit(str(exc))

            threading.Thread(target=worker, daemon=True).start()

        def on_ready(self, network, lease):
            self.activating = False
            if self.closing:
                lease.close()
                return
            try:
                open_network_server(network)
            except OSError as exc:
                lease.close()
                self.set_action(False, 'Activer accès LAN')
                QMessageBox.warning(win, 'Serveur local',
                                    f'Ouverture du serveur LAN impossible : {exc}\n'
                                    'Le jeu reste disponible sur cet ordinateur.')
                return
            self.lease = lease
            self.set_action(True, 'Accès LAN actif — désactiver')
            win.statusBar().showMessage(
                f'Partage local actif : http://{network.address}:{PORT}/', 10000)

        def on_error(self, message):
            self.activating = False
            if self.closing:
                return
            self.set_action(False, 'Activer accès LAN')
            QMessageBox.warning(win, 'Réseau local indisponible',
                                message + '\n\nLe plateau local reste utilisable. '
                                'Aucune ouverture générale du pare-feu n’a été effectuée.')

        def stop(self):
            close_network_server()
            if self.lease is not None:
                self.lease.close()
                self.lease = None
            self.set_action(False, 'Activer accès LAN')

        def monitor(self):
            if self.lease and not self.lease.alive():
                self.stop()
                QMessageBox.warning(win, 'Pare-feu LAN',
                                    'Le service de surveillance du pare-feu s’est arrêté. '
                                    'L’accès réseau a été désactivé par précaution.')

        def toggle(self, enabled):
            if enabled:
                self.start()
            else:
                self.stop()

        def quit(self):
            self.closing = True
            self.timer.stop()
            self.stop()

    controller = LanController()
    lan_action.toggled.connect(controller.toggle)
    win.updates = UpdateController(win, bar)

    def shutdown():
        controller.quit()
        store.shutdown()
        server[0].shutdown()
        server[0].server_close()

    app.aboutToQuit.connect(shutdown)
    show_main_window(win)
    # The local server is started first; the LAN opens automatically only
    # once polkit authorizes our narrowly scoped UFW rule.
    QTimer.singleShot(250, controller.start)
    sys.exit(app.exec())


if __name__ == '__main__':
    main()
