"""Check Qt updater success/failure paths without installing Qt or a Debian package."""
import importlib.util
from pathlib import Path
import sys
from types import ModuleType
import unittest
from unittest.mock import Mock, patch


def load_updater_ui():
    modules = {}
    definitions = {
        'PyQt6': {},
        'PyQt6.QtCore': {
            'QObject': object, 'pyqtSignal': lambda *args: object(),
            'QSettings': object, 'QTimer': object, 'Qt': object,
        },
        'PyQt6.QtGui': {'QAction': object, 'QActionGroup': object},
        'PyQt6.QtWidgets': {
            'QMessageBox': Mock(), 'QMenu': object, 'QProgressDialog': object, 'QToolButton': object,
        },
    }
    for name, attrs in definitions.items():
        module = ModuleType(name)
        module.__dict__.update(attrs)
        modules[name] = module
    with patch.dict(sys.modules, modules):
        path = Path(__file__).resolve().parents[1] / 'src/alfastafl/updater_ui.py'
        spec = importlib.util.spec_from_file_location('alfastafl._restart_ui_test', path)
        ui = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(ui)
    return ui, modules['PyQt6.QtWidgets'].QMessageBox


class InstallerUiRestartTests(unittest.TestCase):
    def make_controller(self):
        controller = Mock()
        controller._installer_progress = None
        controller.restart_callback = Mock()
        return controller

    def test_success_restarts_without_modal_dialog(self):
        ui, messages = load_updater_ui()
        controller = self.make_controller()
        ui.UpdateController._on_installed(controller, True, None)
        controller._set_busy.assert_called_once_with(False)
        controller._clean_download.assert_called_once_with()
        controller.restart_callback.assert_called_once_with()
        messages.information.assert_not_called()
        messages.warning.assert_not_called()
        messages.critical.assert_not_called()

    def test_failed_apt_install_does_not_restart_or_quit(self):
        ui, messages = load_updater_ui()
        controller = self.make_controller()
        ui.UpdateController._on_installed(controller, False, 'APT refusé')
        controller.restart_callback.assert_not_called()
        controller._clean_download.assert_called_once_with()
        messages.critical.assert_called_once()
        messages.warning.assert_not_called()

    def test_restart_error_keeps_current_window_and_warns(self):
        ui, messages = load_updater_ui()
        controller = self.make_controller()
        controller.restart_callback.side_effect = OSError('helper absent')
        ui.UpdateController._on_installed(controller, True, None)
        controller._clean_download.assert_called_once_with()
        messages.warning.assert_called_once()
        self.assertIn('relance automatique', messages.warning.call_args.args[2])
        messages.information.assert_not_called()
        messages.critical.assert_not_called()

    def test_without_callback_keeps_window_open(self):
        ui, messages = load_updater_ui()
        controller = self.make_controller()
        controller.restart_callback = None
        ui.UpdateController._on_installed(controller, True, None)
        messages.warning.assert_called_once()
        messages.critical.assert_not_called()


if __name__ == '__main__':
    unittest.main()
