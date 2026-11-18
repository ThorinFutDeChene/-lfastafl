"""Minimal privileged UFW lifetime helper.

Invoked only by the desktop through pkexec. Its stdin is a lifetime pipe:
normal shutdown or host crash closes the pipe, triggering cleanup.
Never disable UFW and never delete unmarked rules (for example Enyalië).
"""
import ipaddress
import json
import os
import re
import shlex
import secrets
import socket
import subprocess
import sys

UFW = '/usr/sbin/ufw'
IP = '/usr/sbin/ip'
PORT = '8766'
MARKER_PREFIX = 'Alfastafl-auto-'
RULE_NUMBER = re.compile(r'^\[\s*(\d+)\]\s+(.*)\s+#\s*(Alfastafl-auto-[0-9a-f]{24})\s*$')
VALID_IFACE = re.compile(r'^[a-zA-Z0-9_.-]{1,15}$')
RFC1918 = tuple(ipaddress.IPv4Network(v) for v in (
    '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'))


def command(args, timeout=20):
    env = dict(os.environ, LC_ALL='C')
    proc = subprocess.run(args, capture_output=True, text=True,
                          timeout=timeout, check=False, env=env)
    if proc.returncode:
        raise RuntimeError((proc.stderr or proc.stdout).strip()[:600])
    return proc.stdout


def validate_network(interface, address, subnet, ifdata=None):
    """Validate exact local address, subnet and physical interface before touching UFW."""
    if not VALID_IFACE.fullmatch(interface) or not re.match(r'^(wl|en|eth\d)', interface):
        raise ValueError('Interface LAN refusée')
    socket.if_nametoindex(interface)
    ip = ipaddress.IPv4Address(address)
    network = ipaddress.IPv4Network(subnet, strict=True)
    if not (ip in network and 8 <= network.prefixlen <= 30 and
            any(ip in block and network.subnet_of(block) for block in RFC1918)):
        raise ValueError('Adresse LAN privée ou sous-réseau invalide')
    if ifdata is None:
        ifdata = json.loads(command([IP, '-j', '-4', 'address', 'show', 'dev', interface]))
    if not any(entry.get('ifname') == interface and
               any(a.get('local') == address and int(a.get('prefixlen', -1)) == network.prefixlen
                   for a in entry.get('addr_info', []) if a.get('family') == 'inet')
               for entry in ifdata):
        raise ValueError('L’adresse IP ne correspond pas à l’interface réseau')
    return True


def owned_rule_numbers(numbered_status):
    """Only numbered IPv4 inbound rules carrying our exact program marker."""
    numbers = []
    for line in numbered_status.splitlines():
        match = RULE_NUMBER.match(line.strip())
        if match:
            index, body, marker = match.groups()
            if '8766/tcp' in body and 'ALLOW IN' in body and ' on ' in body:
                numbers.append((int(index), marker))
    return sorted(numbers, reverse=True)


def owned_added_rules(added_output):
    """Detect only our exact ``ufw show added`` entries, even while UFW is off."""
    owned = []
    for line in added_output.splitlines():
        try:
            args = shlex.split(line)
            # The helper only creates this narrow, fixed-form rule; reject all else.
            if (len(args) == 15 and args[:4] == ['ufw', 'allow', 'in', 'on']
                    and args[5] == 'from' and args[7] == 'to'
                    and args[9:14] == ['port', PORT, 'proto', 'tcp', 'comment']
                    and re.fullmatch(r'Alfastafl-auto-[0-9a-f]{24}', args[14])
                    and VALID_IFACE.fullmatch(args[4])):
                ip = ipaddress.IPv4Address(args[8])
                network = ipaddress.IPv4Network(args[6], strict=True)
                if ip in network and any(network.subnet_of(x) for x in RFC1918):
                    owned.append(args[1:])
        except (ValueError, IndexError, TypeError):
            continue
    return owned


def remove_owned_rules():
    status = command([UFW, 'status', 'numbered'])
    for number, _ in owned_rule_numbers(status):
        # Descending indices preserve the numbering of all preceding rules.
        command([UFW, '--force', 'delete', str(number)])
    # UFW can be disabled while the game is running: numbered status then
    # hides saved rules. 'show added' still exposes the exact tagged entries.
    for rule in owned_added_rules(command([UFW, 'show', 'added'])):
        command([UFW, '--force', 'delete', *rule])


def ufw_activated():
    status = command([UFW, 'status'])
    if 'Status: active' in status:
        return True
    if 'Status: inactive' in status:
        return False
    raise RuntimeError('Etat du pare-feu UFW illisible')


def serve(interface, address, subnet, stdin=None, stdout=None):
    stdin = sys.stdin.buffer if stdin is None else stdin
    stdout = sys.stdout if stdout is None else stdout
    validate_network(interface, address, subnet)
    managed = False
    marker = MARKER_PREFIX + secrets.token_hex(12)
    # Only this application-specific set of rules is eligible for stale cleanup.
    remove_owned_rules()
    try:
        if ufw_activated():
            command([UFW, 'allow', 'in', 'on', interface, 'from', subnet,
                     'to', address, 'port', PORT, 'proto', 'tcp', 'comment', marker])
            status = command([UFW, 'status', 'numbered'])
            managed = any(found_marker == marker
                          for _, found_marker in owned_rule_numbers(status))
            if not managed:
                # UFW may have skipped a duplicate rule already owned by the admin.
                # Do not delete an existing non-Alfastafl rule later.
                if not any('8766/tcp' in line and 'ALLOW IN' in line
                           and f' on {interface}' in line and subnet in line
                           for line in status.splitlines()):
                    raise RuntimeError('UFW ne confirme pas l’ouverture LAN')
        stdout.write(json.dumps({'ready': True, 'address': address,
                                  'firewall_managed': managed}) + '\n')
        stdout.flush()
        while stdin.read(4096):
            pass
    finally:
        if managed:
            remove_owned_rules()


def main(args):
    if os.geteuid() != 0:
        raise PermissionError('Le service UFW doit être autorisé par pkexec')
    if len(args) != 3:
        raise ValueError('Paramètres LAN invalides')
    serve(*args)


if __name__ == '__main__':
    try:
        main(sys.argv[1:])
    except Exception as exc:
        sys.stdout.write(json.dumps({'ready': False, 'error': str(exc)[:600]}) + '\n')
        sys.stdout.flush()
        sys.exit(1)
