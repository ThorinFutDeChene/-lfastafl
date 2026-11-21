"""Exercise desktop LAN opt-in and shutdown without Qt, sockets or root access."""
import sys
import unittest
from contextlib import ExitStack
from types import ModuleType
from unittest.mock import Mock, patch

from alfastafl import desktop, lan


class Signal:
    def __init__(self, queue=None):
        self.slots = []
        self.queue = queue

    def connect(self, slot):
        self.slots.append(slot)

    def emit(self, *args):
        for slot in self.slots:
            if self.queue is None:
                slot(*args)
            else:
                self.queue.append(lambda slot=slot, args=args: slot(*args))


class Action:
    def __init__(self, text, _parent):
        self.text = text
        self.checked = False
        self.enabled = True
        self.blocked = False
        self.toggled = Signal()

    def setCheckable(self, value):
        self.checkable = value

    def setEnabled(self, value):
        self.enabled = value

    def setChecked(self, value):
        changed = self.checked != value
        self.checked = value
        if changed and not self.blocked:
            self.toggled.emit(value)

    def setText(self, value):
        self.text = value

    def blockSignals(self, value):
        self.blocked = value

    def click(self):
        if self.enabled:
            self.setChecked(not self.checked)


class DesktopSession:
    """Run main() with deterministic worker completion and queued Qt signals."""
    def __init__(self, scenario):
        self.scenario = scenario
        self.pending = []
        self.events = []
        self.actions = []
        self.menu_actions = {}
        self.servers = []
        self.network = lan.LocalNetwork('wlp1s0', '192.168.1.102', '192.168.1.0/24')
        self.detect = Mock(return_value=self.network)
        self.lease = Mock()
        self.lease.alive.return_value = True
        self.lease.start.side_effect = lambda _: self.events.append('lease.start')
        self.lease.close.side_effect = lambda: self.events.append('lease.close')
        self.lease_factory = Mock(return_value=self.lease)
        self.run_server = Mock(side_effect=self.make_server)
        self.store = Mock()
        self.warning = Mock()
        self.updater_factory = Mock()
        self.quitting = False
        self.scenario_executed = False
        self.aboutToQuit = Signal()

    def make_server(self, host, _port, _store):
        server = Mock(lan_enabled=False, lan_address=host)
        server.shutdown.side_effect = lambda: self.events.append(host + '.shutdown')
        server.server_close.side_effect = lambda: self.events.append(host + '.close')
        self.servers.append(server)
        return server

    def drain(self):
        while self.pending:
            self.pending.pop(0)()

    def activate(self):
        # Simulate the event sent from localhost's host-only HTTP endpoint.
        self.servers[0].lan_activation_requested()
        self.drain()

    def quit(self):
        if not self.quitting:
            self.quitting = True
            self.aboutToQuit.emit()

    def exec(self):
        # Execute any scheduled startup callbacks before the user interaction.
        self.drain()
        self.scenario_executed = True
        self.scenario(self)
        self.quit()
        return 0

    def run(self):
        session = self

        class QObject:
            def __init__(self, *_):
                pass

        class QTimer:
            def __init__(self, *_):
                self.timeout = Signal()

            def start(self, _interval):
                pass

            def stop(self):
                pass

            @staticmethod
            def singleShot(_delay, callback):
                session.pending.append(callback)

        def action_factory(*args):
            action = Action(*args)
            self.actions.append(action)
            return action

        class FakeMenu:
            def __init__(self, name):
                self.name = name

            def addAction(self, label):
                action = Mock()
                action.triggered = Signal()
                session.menu_actions[self.name, label] = action
                return action

            def addSeparator(self):
                return None

            def addActions(self, actions):
                return None

        def window_factory(*_):
            window=Mock()
            window.menuBar.return_value.addMenu.side_effect=FakeMenu
            return window

        def thread_factory(*, target, **_):
            # No OS threads or real serve_forever calls; mocked server methods
            # return immediately and worker results use the queued signals.
            return Mock(start=Mock(side_effect=target))

        class FakeWebEngineView:
            """Test double subclassable like Qt's real QWebEngineView."""
            def __init__(self, *_):
                self.setUrl = Mock()
                self.settings = Mock(return_value=Mock())
                self.page = Mock(return_value=Mock())

        class FakeQt:
            class WidgetAttribute:
                WA_DeleteOnClose = 0

        class FakeWebAttribute:
            JavascriptCanOpenWindows = 1

        class FakeSettings:
            WebAttribute = FakeWebAttribute

        definitions = {
            'PyQt6': {},
            'PyQt6.QtWidgets': {
                'QApplication': lambda _: self,
                'QMainWindow': window_factory,
                'QToolBar': lambda *_: Mock(),
                'QMessageBox': Mock(warning=self.warning),
            },
            'PyQt6.QtGui': {
                'QAction': action_factory,
                'QShortcut': lambda *_: Mock(activated=Signal()),
                'QKeySequence': lambda value: value,
            },
            'PyQt6.QtCore': {
                'QUrl': str, 'QObject': QObject, 'QTimer': QTimer,
                'Qt': FakeQt, 'pyqtSignal': lambda *_: Signal(self.pending),
            },
            'PyQt6.QtWebEngineCore': {'QWebEngineSettings': FakeSettings},
            'PyQt6.QtWebEngineWidgets': {'QWebEngineView': FakeWebEngineView},
            'alfastafl.updater_ui': {'UpdateController': self.updater_factory},
        }
        modules = {}
        for name, attributes in definitions.items():
            module = ModuleType(name)
            module.__dict__.update(attributes)
            modules[name] = module

        with ExitStack() as stack:
            stack.enter_context(patch.dict(sys.modules, modules))
            stack.enter_context(patch.object(desktop, 'run', self.run_server))
            stack.enter_context(patch.object(desktop, 'Store', return_value=self.store))
            stack.enter_context(patch.object(desktop.threading, 'Thread', side_effect=thread_factory))
            stack.enter_context(patch.object(lan, 'detect_network', self.detect))
            stack.enter_context(patch.object(lan, 'FirewallLease', self.lease_factory))
            try:
                desktop.main()
            except SystemExit as exc:
                if exc.code != 0:
                    raise
        if not self.scenario_executed:
            raise AssertionError('The desktop event loop did not execute the scenario')


class DesktopLanTests(unittest.TestCase):
    def assert_local_only(self, session):
        # Startup no longer contains a manual LAN activation menu item.
        self.assertNotIn(('Réseau', 'Activer accès LAN'), session.menu_actions)
        self.assertIn(('Réseau','Connexions et demandes d’accès…'),
                      session.menu_actions)
        session.detect.assert_not_called()
        session.lease_factory.assert_not_called()
        session.run_server.assert_called_once_with('127.0.0.1', desktop.PORT, session.store)
        self.assertFalse(session.servers[0].lan_enabled)

    def assert_lan_closed(self, session):
        self.assertFalse(session.servers[0].lan_enabled)
        self.assertEqual(session.servers[0].lan_address, '127.0.0.1')
        session.lease.close.assert_called_once_with()
        events=session.events
        self.assertLess(events.index(session.network.address + '.shutdown'),
                        events.index(session.network.address + '.close'))
        self.assertLess(events.index(session.network.address + '.close'),
                        events.index('lease.close'))

    def test_launch_and_exit_without_game_never_starts_lan(self):
        session=DesktopSession(self.assert_local_only)
        session.run()
        session.lease_factory.assert_not_called()
        session.servers[0].shutdown.assert_called_once_with()
        session.servers[0].server_close.assert_called_once_with()

    def test_new_game_native_menu_opens_lan_without_manual_menu(self):
        def scenario(session):
            session.menu_actions[('Fichier','Nouvelle partie…')].triggered.emit()
            session.drain()
            session.detect.assert_called_once_with()
            session.lease.start.assert_called_once_with(session.network)
            self.assertEqual([c.args[0] for c in session.run_server.call_args_list],
                             ['127.0.0.1',session.network.address])
            self.assertTrue(session.servers[0].lan_enabled)
            self.assertFalse(('Réseau','Activer accès LAN') in session.menu_actions)
            # Subsequent activations are idempotent, including requests
            # arriving while a game/tournament is already connected.
            session.activate()
            session.lease.start.assert_called_once_with(session.network)
        DesktopSession(scenario).run()

    def test_saved_games_menu_does_not_open_lan_until_a_game_is_selected(self):
        def scenario(session):
            session.menu_actions[('Fichier','Sauvegardes…')].triggered.emit()
            session.drain()
            session.detect.assert_not_called()
            session.activate()  # The saved-game selection calls the local API.
            session.detect.assert_called_once_with()
            self.assertTrue(session.servers[0].lan_enabled)
        DesktopSession(scenario).run()

    def test_tutorial_and_tournament_native_commands_can_open_lan(self):
        for menu_item in (('Partie','Tutoriel…'),
                          ('Partie','Tournois et tirage des factions…')):
            with self.subTest(menu_item=menu_item):
                def scenario(session):
                    session.menu_actions[menu_item].triggered.emit()
                    session.drain()
                    session.detect.assert_called_once_with()
                    self.assertTrue(session.servers[0].lan_enabled)
                DesktopSession(scenario).run()

    def test_application_exit_closes_lan_before_firewall_lease(self):
        def scenario(session):
            session.activate()
            session.quit()
            self.assert_lan_closed(session)
            session.store.shutdown.assert_called_once_with()
        DesktopSession(scenario).run()

    def test_new_session_starts_off_after_previous_session_used_lan(self):
        previous=DesktopSession(lambda session: session.activate())
        previous.run()
        self.assert_lan_closed(previous)
        DesktopSession(self.assert_local_only).run()

    def test_update_restart_closes_active_lan_and_checkpoints(self):
        def scenario(session):
            session.activate()
            with patch.object(desktop,'schedule_restart') as launch:
                callback=session.updater_factory.call_args.kwargs['restart_callback']
                callback()
                launch.assert_called_once_with()
                session.drain()
                session.store.shutdown.assert_called_once_with()
                session.servers[0].shutdown.assert_called_once_with()
                self.assert_lan_closed(session)
                callback()
                launch.assert_called_once_with()
        DesktopSession(scenario).run()

    def test_restart_scheduler_error_does_not_quit_or_close_lan(self):
        def scenario(session):
            with patch.object(desktop,'schedule_restart',
                              side_effect=OSError('relaunch failed')):
                callback=session.updater_factory.call_args.kwargs['restart_callback']
                with self.assertRaisesRegex(OSError,'relaunch failed'):
                    callback()
                self.assertFalse(session.quitting)
                session.store.shutdown.assert_not_called()
        DesktopSession(scenario).run()

    def test_ready_queued_before_exit_cannot_reopen_lan_after_exit(self):
        def scenario(session):
            session.servers[0].lan_activation_requested()
            # Worker has run, but Qt's queued ready signal was not delivered.
            session.pending.pop(0)()  # Controller.start()
            session.lease.start.assert_called_once_with(session.network)
            session.quit()
            session.drain()
            session.run_server.assert_called_once_with('127.0.0.1',desktop.PORT,
                                                       session.store)
            session.lease.close.assert_called_once_with()
            self.assertFalse(session.servers[0].lan_enabled)
        DesktopSession(scenario).run()


if __name__=='__main__':
    unittest.main()
