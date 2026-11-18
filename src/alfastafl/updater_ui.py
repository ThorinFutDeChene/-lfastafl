"""Qt6 interface to the optional, non-blocking Álfastafl updater.

All networking and package operations happen off the Qt GUI thread.
"""

import shutil
import threading
from pathlib import Path
import os

from PyQt6.QtCore import QObject, pyqtSignal, QSettings, QTimer, Qt
from PyQt6.QtGui import QAction, QActionGroup
from PyQt6.QtWidgets import QMessageBox, QMenu, QProgressDialog, QToolButton

from . import updater


def settings_path():
    base = Path(os.environ.get('XDG_CONFIG_HOME') or Path.home() / '.config')
    return base / 'alfastafl' / 'settings.ini'


class UpdateController(QObject):
    """Owns the Update menu and receives background worker results via Qt signals."""

    checked = pyqtSignal(object, bool, object)
    progressed = pyqtSignal(int)
    downloaded = pyqtSignal(object, object)
    installed = pyqtSignal(bool, object)

    def __init__(self, window, toolbar):
        super().__init__(window)
        self.window = window
        self.busy = False
        self.cancel_event = threading.Event()
        self.temp_folder = None
        self._progress = None
        self._installer_progress = None
        self._pending_release = None
        self.settings_file = settings_path()
        self.settings_file.parent.mkdir(parents=True, exist_ok=True)
        self.settings = QSettings(str(self.settings_file), QSettings.Format.IniFormat)
        detected_dev = '~dev' in updater.local_version()
        chosen = str(self.settings.value('updates/channel', 'dev' if detected_dev else 'stable'))
        self.channel = chosen if chosen in ('stable', 'dev') else 'stable'
        raw_auto = str(self.settings.value('updates/automatic', 'true')).lower()
        self.auto = raw_auto in ('true', '1', 'yes')

        menu = QMenu(window)
        self.check_action = menu.addAction('Vérifier maintenant')
        self.check_action.triggered.connect(lambda: self.check(automatic=False))
        menu.addSeparator()
        menu.addSection('Canal de mises à jour')
        self.channel_group = QActionGroup(menu)
        self.channel_group.setExclusive(True)
        self.stable_action = QAction('Stable', menu)
        self.dev_action = QAction('Développement (DEV)', menu)
        self.stable_action.setCheckable(True)
        self.dev_action.setCheckable(True)
        for action in (self.stable_action, self.dev_action):
            self.channel_group.addAction(action)
            menu.addAction(action)
        self.stable_action.setChecked(self.channel == 'stable')
        self.dev_action.setChecked(self.channel == 'dev')
        self.stable_action.triggered.connect(lambda: self.set_channel('stable'))
        self.dev_action.triggered.connect(lambda: self.set_channel('dev'))
        menu.addSeparator()
        self.auto_action = menu.addAction('Rechercher au démarrage')
        self.auto_action.setCheckable(True)
        self.auto_action.setChecked(self.auto)
        self.auto_action.toggled.connect(self.set_auto)

        self.button = QToolButton(window)
        self.button.setMenu(menu)
        self.button.setPopupMode(QToolButton.ToolButtonPopupMode.InstantPopup)
        self.button.setToolButtonStyle(Qt.ToolButtonStyle.ToolButtonTextOnly)
        self._update_button_text()
        toolbar.addWidget(self.button)

        self.checked.connect(self._on_checked)
        self.progressed.connect(self._on_progress)
        self.downloaded.connect(self._on_downloaded)
        self.installed.connect(self._on_installed)
        if self.auto:
            QTimer.singleShot(2500, lambda: self.check(automatic=True))

    def _update_button_text(self):
        self.button.setText('Mises à jour (' + self.channel.upper() + ')')

    def set_channel(self, value):
        if self.busy:
            self.stable_action.setChecked(self.channel == 'stable')
            self.dev_action.setChecked(self.channel == 'dev')
            return
        self.channel = value
        self.settings.setValue('updates/channel', value)
        self.settings.sync()
        self._update_button_text()
        self.window.statusBar().showMessage('Canal sélectionné : ' + value, 5000)
        self.check(automatic=False)

    def set_auto(self, value):
        self.auto = bool(value)
        self.settings.setValue('updates/automatic', self.auto)
        self.settings.sync()

    def _set_busy(self, value):
        self.busy = value
        self.check_action.setEnabled(not value)
        self.stable_action.setEnabled(not value)
        self.dev_action.setEnabled(not value)

    def check(self, automatic=False):
        if self.busy:
            return
        self._set_busy(True)
        channel = self.channel
        self.window.statusBar().showMessage('Vérification des mises à jour…')

        def task():
            try:
                found = updater.check_for_update(channel)
                self.checked.emit(found, automatic, None)
            except Exception as error:
                self.checked.emit(None, automatic, str(error))
        threading.Thread(target=task, daemon=True).start()

    def _on_checked(self, release, automatic, error):
        self._set_busy(False)
        if error:
            self.window.statusBar().showMessage('Mises à jour : connexion indisponible', 6000)
            if not automatic:
                QMessageBox.warning(self.window, 'Mises à jour', error)
            return
        if release is None:
            self.window.statusBar().showMessage('Álfastafl est à jour pour le canal ' + self.channel, 6000)
            if not automatic:
                QMessageBox.information(self.window, 'Mises à jour',
                                        'Aucune version plus récente disponible sur le canal ' + self.channel + '.')
            return
        self.window.statusBar().showMessage('Nouvelle version disponible : ' + release.tag)
        message = QMessageBox(self.window)
        message.setWindowTitle('Mise à jour Álfastafl')
        message.setIcon(QMessageBox.Icon.Information)
        message.setText('Une nouvelle version est disponible : ' + release.tag)
        message.setInformativeText('Canal : ' + self.channel + '\nVersion installée : '
                                   + updater.local_version()
                                   + '\n\nTélécharger le paquet vérifié avant de l’installer ?')
        if release.description:
            message.setDetailedText(release.description[:12000])
        install_button = message.addButton('Télécharger', QMessageBox.ButtonRole.AcceptRole)
        message.addButton('Plus tard', QMessageBox.ButtonRole.RejectRole)
        message.exec()
        if message.clickedButton() is install_button:
            self._download(release)

    def _download(self, release):
        self._pending_release = release
        self.cancel_event.clear()
        self._set_busy(True)
        self._progress = QProgressDialog('Téléchargement sécurisé de ' + release.tag + '…',
                                         'Annuler', 0, 100, self.window)
        self._progress.setWindowTitle('Álfastafl — Mise à jour')
        self._progress.setMinimumDuration(0)
        self._progress.setAutoClose(False)
        self._progress.setAutoReset(False)
        self._progress.canceled.connect(self.cancel_event.set)
        self._progress.setValue(0)
        self._progress.show()

        def task():
            try:
                path, folder = updater.download_verified(
                    release, progress=lambda n: self.progressed.emit(n),
                    cancelled=self.cancel_event)
                self.downloaded.emit((path, folder), None)
            except Exception as error:
                self.downloaded.emit(None, error)
        threading.Thread(target=task, daemon=True).start()

    def _on_progress(self, value):
        if self._progress is not None:
            self._progress.setValue(value)

    def _on_downloaded(self, result, error):
        if self._progress:
            self._progress.close()
            self._progress.deleteLater()
            self._progress = None
        self._set_busy(False)
        if error:
            if not isinstance(error, updater.UpdateCancelled):
                QMessageBox.critical(self.window, 'Échec du téléchargement', str(error))
            return
        path, folder = result
        self.temp_folder = folder
        reply = QMessageBox.question(
            self.window, 'Installer la mise à jour ?',
            'Le paquet ' + self._pending_release.tag + ' a été téléchargé et vérifié (SHA-256 et métadonnées Debian).\n\n'
            'L’installation exige une autorisation administrateur Linux.\n'
            'La partie en cours doit être sauvegardée avant de redémarrer l’application.\n\n'
            'Installer maintenant ?',
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No)
        if reply != QMessageBox.StandardButton.Yes:
            self._clean_download()
            return
        self._install(path, self._pending_release.version)

    def _install(self, path, version):
        self._set_busy(True)
        self._installer_progress = QProgressDialog(
            'Installation par APT — validez la demande d’authentification Linux…',
            '', 0, 0, self.window)
        self._installer_progress.setWindowTitle('Installation Álfastafl')
        self._installer_progress.setCancelButton(None)
        self._installer_progress.setWindowModality(Qt.WindowModality.WindowModal)
        self._installer_progress.setMinimumDuration(0)
        self._installer_progress.show()

        def task():
            try:
                updater.install_package(path, version)
                self.installed.emit(True, None)
            except Exception as error:
                self.installed.emit(False, str(error))
        threading.Thread(target=task, daemon=True).start()

    def _on_installed(self, success, error):
        if self._installer_progress:
            self._installer_progress.close()
            self._installer_progress.deleteLater()
            self._installer_progress = None
        self._set_busy(False)
        self._clean_download()
        if success:
            self.window.statusBar().showMessage('Mise à jour installée : redémarrage nécessaire')
            QMessageBox.information(self.window, 'Mise à jour installée',
                                    'La mise à jour a été installée.\n'
                                    'Fermez puis relancez Álfastafl pour utiliser la nouvelle version.\n'
                                    'Vos sauvegardes personnelles sont conservées.')
        else:
            QMessageBox.critical(self.window, 'Installation impossible',
                                 str(error) + '\n\nVous pouvez continuer à jouer avec la version actuelle.')

    def _clean_download(self):
        if self.temp_folder:
            shutil.rmtree(self.temp_folder, ignore_errors=True)
        self.temp_folder = None
