"""Qt6 native host: open and retire a scoped LAN lease for live sessions."""
import threading
import time

from .server import run, Store, PORT
from .relauncher import schedule_restart


def show_main_window(window):
    """Álfastafl's single native fullscreen game window (menus remain usable)."""
    window.showFullScreen()


def show_board_window(window):
    """A board or tutorial uses its own real OS-level fullscreen window."""
    window.showFullScreen()


def toggle_main_fullscreen(window, action=None):
    """Switch between a normal desktop window and the immersive board.

    Returning to windowed mode only changes the Qt window state; the local
    server, LAN invitations, tournament and saved game stay untouched.
    The menu label always describes the NEXT available action.
    """
    if window.isFullScreen():
        window.showNormal()
        fullscreen = False
    else:
        show_main_window(window)
        fullscreen = True
    if action is not None:
        action.setText('Quitter le plein écran (F11)' if fullscreen
                       else 'Passer en plein écran (F11)')
    return fullscreen


def main():
    try:
        from PyQt6.QtWidgets import QApplication, QMainWindow, QToolBar, QMessageBox
        from PyQt6.QtGui import QAction, QShortcut, QKeySequence
        from PyQt6.QtCore import QUrl, QObject, pyqtSignal, QTimer, Qt
        from PyQt6.QtWebEngineCore import QWebEngineSettings
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
    win.setWindowTitle('Álfastafl — Plateau et menus (DEV)')
    win.resize(1280, 850)

    # JavaScript window.open is handled by Qt, NOT an embedded browser tab:
    # the administration window stays visible/available on its own screen,
    # while each game board/tutorial receives an actual separate OS window.
    open_windows = []
    class DisplayWebView(QWebEngineView):
        def __init__(self, parent=None):
            super().__init__(parent)
            settings = self.settings()
            # Qt WebEngine exposes JavascriptCanOpenWindows, but NOT the
            # old Qt WebKit JavascriptCanCloseWindows attribute. The latter
            # crashed the entire application before showing its first window.
            settings.setAttribute(QWebEngineSettings.WebAttribute.JavascriptCanOpenWindows, True)

        def createWindow(self, window_type):
            popup = QMainWindow()
            popup.setWindowTitle('Álfastafl — Plateau / Tutoriel')
            popup.resize(1200, 820)
            popup.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose, True)
            content = DisplayWebView(popup)
            popup.setCentralWidget(content)
            popup._escape_fullscreen = QShortcut(QKeySequence('F11'), popup)
            popup._escape_fullscreen.activated.connect(
                lambda: popup.showNormal() if popup.isFullScreen()
                else show_board_window(popup))
            content.page().windowCloseRequested.connect(popup.close)
            open_windows.append(popup)
            popup.destroyed.connect(
                lambda *_: open_windows.remove(popup) if popup in open_windows else None)
            # Do not open new tabs or cover the management controls.
            show_board_window(popup)
            return content

    view = DisplayWebView(win)
    win.setCentralWidget(view)
    view.setUrl(QUrl(f'http://127.0.0.1:{PORT}/?desktop=shell'))
    # Keep the Qt updater controller's toolbar API, but put all actions
    # in the native menu bar: the screen belongs to the plateau + QR rail.
    bar = QToolBar('Contrôles internes')
    win.addToolBar(bar)
    bar.hide()
    # LAN is activated by an explicit activity (new game, resumed saved game,
    # tutorial or tournament), never via another manual toggle.
    # Menu commands reach the live page and open its existing controls in
    # modal windows. The game board stays the sole WebGL rendering surface.
    def menu_command(menu, label, command):
        action = menu.addAction(label)
        def dispatch(*_):
            if command in ('new', 'tutorial', 'tournament'):
                # Start immediately on the real native-menu action. The
                # asynchronous firewall helper never blocks the Qt UI.
                controller.start()
            view.page().runJavaScript(
                "window.AlfastaflShell?.open(" + repr(command) + ")")
        action.triggered.connect(dispatch)
        return action

    menus = win.menuBar()
    file_menu = menus.addMenu('Fichier')
    menu_command(file_menu, 'Nouvelle partie…', 'new')
    menu_command(file_menu, 'Sauvegarder la partie', 'save')
    menu_command(file_menu, 'Sauvegardes…', 'saves')
    file_menu.addSeparator()
    quit_action = file_menu.addAction('Quitter')
    quit_action.triggered.connect(win.close)

    game_menu = menus.addMenu('Partie')
    menu_command(game_menu, 'Jouer / Spectateur / Arbitrage…', 'game')
    menu_command(game_menu, 'Historique des coups…', 'history')
    menu_command(game_menu, 'Tutoriel…', 'tutorial')
    menu_command(game_menu, 'Tournois et tirage des factions…', 'tournament')
    menu_command(game_menu, 'Diffusion des rencontres du tournoi…', 'tournament')

    settings_menu = menus.addMenu('Paramètres')
    menu_command(settings_menu, 'Réglages du jeu, affichage et son…', 'settings')

    network_menu = menus.addMenu('Réseau')
    menu_command(network_menu, 'Connexions et demandes d’accès…', 'connections')

    view_menu = menus.addMenu('Affichage')
    menu_command(view_menu, 'Caméra vue de dessus', 'top')
    menu_command(view_menu, 'Réinitialiser la caméra', 'reset-camera')
    menu_command(view_menu, 'Qualité et caméra…', 'settings')
    menu_command(view_menu, 'Arrêter la diffusion du tournoi', 'broadcast-stop')
    # An explicit visible command is essential in a full-screen game:
    # users should never need to know the F11 shortcut to restore Ubuntu's
    # window borders and desktop. Both controls execute the SAME transition.
    fullscreen_action = view_menu.addAction('Quitter le plein écran (F11)')
    fullscreen_action.triggered.connect(
        lambda *_: toggle_main_fullscreen(win, fullscreen_action))
    fullscreen_shortcut = QShortcut(QKeySequence('F11'), win)
    fullscreen_shortcut.activated.connect(
        lambda: toggle_main_fullscreen(win, fullscreen_action))
    # Keep Qt objects alive as long as the main window exists.
    win.fullscreen_action = fullscreen_action
    win.fullscreen_shortcut = fullscreen_shortcut

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

    LAN_IDLE_SECONDS = 60  # Grace for preparing or reopening a session.

    class LanController(QObject):
        ready = pyqtSignal(object, object)
        error = pyqtSignal(str)
        requested = pyqtSignal()

        def __init__(self):
            super().__init__(win)
            self.lease = None
            self.activating = False
            self.closing = False
            self.idle_since = None
            self.ready.connect(self.on_ready)
            self.error.connect(self.on_error)
            # The host-only HTTP endpoint is served from a worker thread.
            # Qt automatically delivers this signal on its UI thread.
            self.requested.connect(self.start)
            self.timer = QTimer(self)
            self.timer.timeout.connect(self.monitor)
            self.timer.start(1500)

        def start(self):
            if self.closing:
                return
            # A renewed host activity cancels a previous idle countdown.
            self.idle_since = None
            if self.activating or self.lease:
                return
            self.activating = True
            win.statusBar().showMessage('Ouverture automatique du réseau local…')

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
                QMessageBox.warning(win, 'Serveur local',
                                    f'Ouverture du serveur LAN impossible : {exc}\n'
                                    'Le jeu reste disponible sur cet ordinateur.')
                return
            self.lease = lease
            self.idle_since = None
            win.statusBar().showMessage(
                f'Partage local actif : http://{network.address}:{PORT}/', 10000)

        def on_error(self, message):
            self.activating = False
            if self.closing:
                return
            QMessageBox.warning(win, 'Réseau local indisponible',
                                message + '\n\nLe plateau local reste utilisable. '
                                'Aucune ouverture générale du pare-feu n’a été effectuée.')

        def stop(self):
            self.idle_since = None
            close_network_server()
            if self.lease is not None:
                self.lease.close()
                self.lease = None
            win.statusBar().showMessage('Réseau local fermé')

        def monitor(self):
            if self.closing or not self.lease:
                return
            if not self.lease.alive():
                self.stop()
                QMessageBox.warning(win, 'Pare-feu LAN',
                                    'Le service de surveillance du pare-feu s’est arrêté. '
                                    'L’accès réseau a été désactivé par précaution.')
                return
            if store.lan_in_use():
                self.idle_since = None
                return
            now = time.monotonic()
            if self.idle_since is None:
                self.idle_since = now
            elif now - self.idle_since >= LAN_IDLE_SECONDS:
                # Listener is closed BEFORE the privileged UFW lease.
                # The local host and its saved games remain untouched.
                self.stop()
                win.statusBar().showMessage(
                    'LAN fermé automatiquement : aucune activité réseau', 10000)

        def quit(self):
            self.closing = True
            self.timer.stop()
            self.stop()

    controller = LanController()
    # The local server alone can enqueue the native activation. LAN peers
    # have no handler for this endpoint and cannot obtain a privileged action.
    server[0].lan_activation_requested = controller.requested.emit
    restart_pending = [False]

    def restart_after_update():
        if restart_pending[0]:
            return
        # Launch only a local, unprivileged watcher. It starts the new binary
        # after the old Qt process has finished its on-exit Store/LAN cleanup.
        schedule_restart()
        restart_pending[0] = True
        win.statusBar().showMessage('Mise à jour installée — redémarrage automatique…')
        QTimer.singleShot(0, app.quit)

    win.updates = UpdateController(win, bar, restart_callback=restart_after_update)
    update_menu = menus.addMenu('Mises à jour')
    update_menu.addActions(win.updates.button.menu().actions())

    def shutdown():
        for popup in tuple(open_windows):
            popup.close()
        controller.quit()
        store.shutdown()
        server[0].shutdown()
        server[0].server_close()

    app.aboutToQuit.connect(shutdown)
    show_main_window(win)
    # No LAN listener until game creation, selected save or tutorial use.
    sys.exit(app.exec())


if __name__ == '__main__':
    main()
