"""Select a trusted local IPv4 network and hold the privileged firewall lease.

No root operations happen in this module. The separate, root-owned
firewall_helper.py is started via pkexec after explicit desktop authorization.
"""
from dataclasses import dataclass
import ipaddress
import json
import os
from pathlib import Path
import re
import subprocess

PORT = 8766
IP_BIN = '/usr/sbin/ip'
PKEXEC = '/usr/bin/pkexec'
PYTHON = '/usr/bin/python3'
RFC1918 = tuple(ipaddress.IPv4Network(v) for v in (
    '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'))
PHYSICAL = re.compile(r'^(wl[a-zA-Z0-9._-]*|en[a-zA-Z0-9._-]*|eth[0-9]+)$')


class LanError(Exception):
    """LAN activation is unavailable; the loopback game still works."""


@dataclass(frozen=True)
class LocalNetwork:
    interface: str
    address: str
    subnet: str


def select_network(interfaces, routes=()):
    """Choose an up, private, physical LAN interface (not a VPN/container)."""
    defaults = {entry.get('dev') for entry in routes
                if entry.get('dst') == 'default' and entry.get('dev')}
    candidates = []
    for entry in interfaces:
        interface = entry.get('ifname', '')
        if not PHYSICAL.fullmatch(interface) or entry.get('operstate') in ('DOWN', 'LOWERLAYERDOWN'):
            continue
        for addr in entry.get('addr_info', []):
            try:
                if addr.get('family') != 'inet' or addr.get('scope', 'global') != 'global':
                    continue
                address = ipaddress.IPv4Address(addr['local'])
                subnet = ipaddress.IPv4Network(f"{address}/{int(addr['prefixlen'])}", strict=False)
                if not any(address in block and subnet.subnet_of(block) for block in RFC1918):
                    continue
                if not 8 <= subnet.prefixlen <= 30:
                    continue
            except (ValueError, KeyError, TypeError):
                continue
            # Prefer an interface that actually routes, then Wi-Fi (for guests).
            score = (0 if interface in defaults else 1,
                     0 if interface.startswith('wl') else 1, interface, str(address))
            candidates.append((score, LocalNetwork(interface, str(address), str(subnet))))
    if not candidates:
        raise LanError('Aucun réseau local IPv4 actif détecté. Connectez le PC au Wi-Fi ou Ethernet.')
    candidates.sort(key=lambda row: row[0])
    return candidates[0][1]


def detect_network(run=subprocess.run):
    try:
        args = dict(capture_output=True, text=True, check=True, timeout=8)
        interfaces = json.loads(run([IP_BIN, '-j', '-4', 'address', 'show', 'up'], **args).stdout)
        routes = json.loads(run([IP_BIN, '-j', '-4', 'route', 'show', 'default'], **args).stdout)
        return select_network(interfaces, routes)
    except (OSError, subprocess.SubprocessError, json.JSONDecodeError) as exc:
        raise LanError(f'Impossible de détecter le réseau local : {exc}') from exc


class FirewallLease:
    """Live root helper owns a single, scoped UFW rule until pipe EOF."""

    def __init__(self, popen=subprocess.Popen, helper_path=None):
        self._popen = popen
        self._helper_path = Path(helper_path or Path(__file__).with_name('firewall_helper.py'))
        self.process = None
        self.network = None

    def start(self, network):
        if self.process is not None:
            raise LanError('Le port local est déjà géré par Álfastafl.')
        if not Path(PKEXEC).is_file():
            raise LanError('pkexec est absent : impossible de gérer automatiquement UFW.')
        # Require the desktop polkit agent; never wait on a textual prompt in a pipe.
        command = [PKEXEC, '--disable-internal-agent', PYTHON, str(self._helper_path),
                   network.interface, network.address, network.subnet]
        try:
            process = self._popen(command, stdin=subprocess.PIPE,
                                  stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                  text=True, bufsize=1)
        except OSError as exc:
            raise LanError(f'Impossible de demander l’autorisation Linux : {exc}') from exc
        self.process = process
        try:
            # Runs in a worker thread; polkit may ask for an administrator password.
            line = process.stdout.readline()
            response = json.loads(line)
            if not response.get('ready'):
                raise LanError(response.get('error', 'UFW : autorisation ou ouverture refusée.'))
            if response.get('address') != network.address:
                raise LanError('Le réseau déclaré par le service UFW est incohérent.')
            self.network = network
            return response
        except (json.JSONDecodeError, LanError) as exc:
            try:
                process.stdin.close()
            except (OSError, AttributeError):
                pass
            try:
                process.wait(timeout=4)
            except (subprocess.TimeoutExpired, OSError):
                pass
            self.process = None
            if isinstance(exc, LanError):
                raise
            raise LanError('Autorisation UFW refusée ou service indisponible.') from exc

    def alive(self):
        return self.process is not None and self.process.poll() is None

    def close(self):
        process = self.process
        self.process = None
        self.network = None
        if process is None:
            return
        try:
            process.stdin.close()
        except (OSError, AttributeError):
            pass
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            # The root helper also cleans stale owned rules on next launch.
            pass
        try:
            process.stdout.close()
            process.stderr.close()
        except (OSError, AttributeError):
            pass
