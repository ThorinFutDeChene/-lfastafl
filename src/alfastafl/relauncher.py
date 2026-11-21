"""Unprivileged, detached restart after a successful Debian update.

The watcher is independent of Qt and waits until the old process has fully
exited, including any LAN/firewall and game checkpoint cleanup. It does not
run a shell, need root, or reopen LAN permissions.
"""

import os
from pathlib import Path
import subprocess
import sys
import time


LAUNCHER = '/usr/bin/alfastafl'
WAIT_SECONDS = 60
POLL_SECONDS = 0.2


class RestartError(RuntimeError):
    """Automatic restart could not be arranged safely."""


def process_status(pid):
    """Return (Linux start ticks, process state) or None when PID is gone.

    Start ticks prevent a reused PID from being mistaken for the old instance.
    Zombie processes are treated as exited; kill(pid, 0) does not do this.
    """
    try:
        raw = Path(f'/proc/{pid}/stat').read_text(encoding='ascii')
    except FileNotFoundError:
        return None
    except OSError as exc:
        raise RestartError(f'Impossible de lire le processus {pid}') from exc
    # The comm field is in parentheses and can itself contain spaces and ')'.
    parts = raw.rsplit(') ', 1)
    if len(parts) != 2:
        raise RestartError('Métadonnées du processus invalides')
    fields = parts[1].split()
    if len(fields) < 20:
        raise RestartError('Métadonnées du processus incomplètes')
    return fields[19], fields[0]  # starttime (field 22), state (field 3)


def wait_for_exit(pid, start_ticks, timeout=WAIT_SECONDS, interval=POLL_SECONDS):
    """Wait for the precise old instance, not just any process with its PID."""
    deadline = time.monotonic() + timeout
    while True:
        current = process_status(pid)
        if current is None or current[0] != start_ticks or current[1] in ('Z', 'X', 'x'):
            return True
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return False
        time.sleep(min(interval, remaining))


def _detached(argv):
    return subprocess.Popen(
        argv, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL, close_fds=True, start_new_session=True,
        cwd='/')


def schedule_restart(launcher=LAUNCHER):
    """Spawn a no-root watcher while the old Qt application is still running.

    Call only after an APT install returned success. The caller must then quit
    the Qt event loop so Store.shutdown() persists clocks and stops LAN.
    """
    if not (Path(launcher).is_file() and os.access(launcher, os.X_OK)):
        raise RestartError('Lanceur Álfastafl absent ou non exécutable')
    pid = os.getpid()
    status = process_status(pid)
    if status is None:
        raise RestartError('Processus Álfastafl introuvable')
    try:
        return _detached([
            sys.executable, '-m', 'alfastafl.relauncher',
            '--wait-for-exit', str(pid), status[0], launcher,
        ])
    except OSError as exc:
        raise RestartError('Impossible de programmer le redémarrage automatique') from exc


def restart_after_exit(pid, start_ticks, launcher):
    """Executed by the child watcher, never by the still-running GUI."""
    if not wait_for_exit(pid, start_ticks):
        return False  # Never launch a second copy while the old one is alive.
    if not (Path(launcher).is_file() and os.access(launcher, os.X_OK)):
        return False
    try:
        _detached([launcher])
    except OSError:
        return False
    return True


def main(args=None):
    argv = sys.argv[1:] if args is None else args
    if len(argv) != 4 or argv[0] != '--wait-for-exit':
        return 2
    try:
        pid = int(argv[1])
        if pid <= 1 or not argv[2].isdigit() or len(argv[2]) > 32:
            return 2
        if argv[3] != LAUNCHER:
            return 2
        return 0 if restart_after_exit(pid, argv[2], argv[3]) else 1
    except (ValueError, RestartError):
        return 1


if __name__ == '__main__':
    sys.exit(main())
