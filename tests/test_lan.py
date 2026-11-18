"""LAN setup must be automatic, scoped, reversible and reject public interfaces."""
import io
import ipaddress
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from alfastafl import lan, firewall_helper as helper

SAMPLE = [{
    'ifname': 'wlp1s0', 'operstate': 'UP',
    'addr_info': [{'family': 'inet', 'scope': 'global',
                   'local': '192.168.1.102', 'prefixlen': 24}]
}]
VPN = {'ifname': 'tun0', 'operstate': 'UP',
       'addr_info': [{'family': 'inet', 'scope': 'global',
                      'local': '10.8.0.2', 'prefixlen': 24}]}
OTHER = {'ifname': 'docker0', 'operstate': 'UP',
         'addr_info': [{'family': 'inet', 'scope': 'global',
                        'local': '172.17.0.1', 'prefixlen': 16}]}


class NetworkDetection(unittest.TestCase):
    def test_finds_own_wifi_network(self):
        network = lan.select_network([OTHER, VPN, *SAMPLE],
                                     [{'dst': 'default', 'dev': 'tun0'}])
        self.assertEqual(network, lan.LocalNetwork('wlp1s0', '192.168.1.102', '192.168.1.0/24'))

    def test_refuses_public_address(self):
        public = [{'ifname': 'enp0s1', 'addr_info': [
            {'family': 'inet', 'scope': 'global', 'local': '8.8.8.8', 'prefixlen': 24}]}]
        with self.assertRaises(lan.LanError):
            lan.select_network(public)

    def test_refuses_only_vpn(self):
        with self.assertRaises(lan.LanError):
            lan.select_network([VPN])

    def test_prefers_physical_wifi_when_no_default(self):
        ethernet = {'ifname': 'enp2s0', 'addr_info': [
            {'family': 'inet', 'scope': 'global', 'local': '192.168.2.5', 'prefixlen': 24}]}
        self.assertEqual(lan.select_network([ethernet, *SAMPLE]).interface, 'wlp1s0')

    def test_detect_runs_ip_not_shell(self):
        import json
        def command(args, **_):
            output = SAMPLE if 'address' in args else [{'dst': 'default', 'dev': 'wlp1s0'}]
            return SimpleNamespace(stdout=json.dumps(output))
        self.assertEqual(lan.detect_network(run=command).address, '192.168.1.102')

    def test_unavailable_ip_reports_error(self):
        with self.assertRaises(lan.LanError):
            lan.detect_network(run=Mock(side_effect=OSError('no ip')))


class FirewallRootHelper(unittest.TestCase):
    def test_only_own_ufw_rules_selected(self):
        text = '''Status: active
[ 1] 192.168.1.102 8765/tcp on wlp1s0 ALLOW IN 192.168.1.0/24 # Enyalie partage local
[ 2] 192.168.1.102 8766/tcp on wlp1s0 ALLOW IN 192.168.1.0/24 # Alfastafl-auto-111111111111111111111111
[ 3] 192.168.1.102 8766/tcp on wlp1s0 ALLOW IN 192.168.1.0/24 # manuel
[ 4] 192.168.1.102 8766/tcp on wlp1s0 ALLOW IN 192.168.1.0/24 # Alfastafl-auto-222222222222222222222222
'''
        self.assertEqual(helper.owned_rule_numbers(text), [(4, 'Alfastafl-auto-' + '2'*24),
                                                          (2, 'Alfastafl-auto-' + '1'*24)])

    def test_cleanup_does_not_remove_enyalie_or_manually_configured_rules(self):
        status = '''Status: active
[ 1] 192.168.1.102 8765/tcp on wlp1s0 ALLOW IN 192.168.1.0/24 # Enyalie partage local
[ 2] 192.168.1.102 8766/tcp on wlp1s0 ALLOW IN 192.168.1.0/24 # Alfastafl-auto-111111111111111111111111
[ 3] 192.168.1.102 8766/tcp on wlp1s0 ALLOW IN 192.168.1.0/24 # manuel
'''
        calls = []
        def fake(args, **_):
            calls.append(args)
            return status if args[-2:] == ['status', 'numbered'] else ''
        with patch.object(helper, 'command', side_effect=fake):
            helper.remove_owned_rules()
        self.assertEqual(calls, [[helper.UFW, 'status', 'numbered'],
                                 [helper.UFW, '--force', 'delete', '2'],
                                 [helper.UFW, 'show', 'added']])

    def test_ufw_show_added_recognizes_only_own_exact_rule(self):
        output = """Added user rules:
ufw allow in on wlp1s0 from 192.168.1.0/24 to 192.168.1.102 port 8765 proto tcp comment 'Enyalie partage local'
ufw allow in on wlp1s0 from 192.168.1.0/24 to 192.168.1.102 port 8766 proto tcp comment 'Alfastafl-auto-111111111111111111111111'
ufw allow in on wlp1s0 from 192.168.1.0/24 to 192.168.1.102 port 8766 proto tcp comment 'manuel'
"""
        expected = ['allow', 'in', 'on', 'wlp1s0', 'from', '192.168.1.0/24',
                    'to', '192.168.1.102', 'port', '8766', 'proto', 'tcp',
                    'comment', 'Alfastafl-auto-111111111111111111111111']
        self.assertEqual(helper.owned_added_rules(output), [expected])

    def test_inactive_ufw_owned_rule_removed_without_touching_enyalie(self):
        added = """Added user rules:
ufw allow in on wlp1s0 from 192.168.1.0/24 to 192.168.1.102 port 8765 proto tcp comment 'Enyalie partage local'
ufw allow in on wlp1s0 from 192.168.1.0/24 to 192.168.1.102 port 8766 proto tcp comment 'Alfastafl-auto-111111111111111111111111'
"""
        calls = []
        def fake(args, **_):
            calls.append(args)
            if args[-2:] == ['show', 'added']:
                return added
            return 'Status: inactive\n'
        with patch.object(helper, 'command', side_effect=fake):
            helper.remove_owned_rules()
        self.assertEqual([x for x in calls if 'delete' in x],
                         [[helper.UFW, '--force', 'delete', 'allow', 'in', 'on',
                           'wlp1s0', 'from', '192.168.1.0/24', 'to',
                           '192.168.1.102', 'port', '8766', 'proto', 'tcp',
                           'comment', 'Alfastafl-auto-111111111111111111111111']])

    def test_refuses_non_private_ip(self):
        with patch.object(helper.socket, 'if_nametoindex', return_value=3):
            with self.assertRaises(ValueError):
                helper.validate_network('wlp1s0', '8.8.8.8', '8.8.8.0/24')

    def test_validates_ip_against_actual_host_interface(self):
        with patch.object(helper.socket, 'if_nametoindex', return_value=3):
            self.assertTrue(helper.validate_network('wlp1s0', '192.168.1.102', '192.168.1.0/24', SAMPLE))
            with self.assertRaises(ValueError):
                helper.validate_network('wlp1s0', '192.168.1.11', '192.168.1.0/24', SAMPLE)

    def test_rejects_vpn_interface_even_private(self):
        with self.assertRaises(ValueError):
            helper.validate_network('tun0', '10.8.0.2', '10.8.0.0/24')

    def test_ufw_rule_added_only_on_selected_interface_then_removed(self):
        marker = 'Alfastafl-auto-' + '1'*24
        status_added = ('Status: active\n[ 1] 192.168.1.102 8766/tcp on wlp1s0 '
                        'ALLOW IN 192.168.1.0/24 # ' + marker + '\n')
        calls = []
        def fake(args, **_):
            calls.append(args)
            if args[-2:] == ['status', 'numbered']:
                if any('comment' in command for command in calls if command[1:2] == ['allow']):
                    return status_added
                return 'Status: active\n'
            if args[-1:] == ['status']:
                return 'Status: active\n'
            return 'Rule added\n'
        out = io.StringIO()
        with patch.object(helper, 'command', side_effect=fake), \
             patch.object(helper, 'validate_network', return_value=True), \
             patch.object(helper.secrets, 'token_hex', return_value='1'*24):
            helper.serve('wlp1s0', '192.168.1.102', '192.168.1.0/24',
                         stdin=io.BytesIO(), stdout=out)
        self.assertIn('"ready": true', out.getvalue())
        self.assertIn([helper.UFW, 'allow', 'in', 'on', 'wlp1s0', 'from', '192.168.1.0/24',
                       'to', '192.168.1.102', 'port', '8766', 'proto', 'tcp', 'comment', marker], calls)
        self.assertIn([helper.UFW, '--force', 'delete', '1'], calls)
        self.assertTrue(all('disable' not in cmd and 'reset' not in cmd for cmd in calls))

    def test_ufw_inactive_never_creates_rule(self):
        calls = []
        def fake(args, **_):
            calls.append(args)
            if args[-1:] == ['status']:
                return 'Status: inactive\n'
            return 'Status: inactive\n'
        out = io.StringIO()
        with patch.object(helper, 'command', side_effect=fake), \
             patch.object(helper, 'validate_network', return_value=True):
            helper.serve('wlp1s0', '192.168.1.102', '192.168.1.0/24',
                         stdin=io.BytesIO(), stdout=out)
        self.assertIn('"firewall_managed": false', out.getvalue())
        self.assertFalse(any('allow' in cmd for cmd in calls))

    def test_no_root_without_authorization(self):
        with patch.object(helper.os, 'geteuid', return_value=1000):
            with self.assertRaises(PermissionError):
                helper.main(['wlp1s0', '192.168.1.102', '192.168.1.0/24'])


class UIIntegration(unittest.TestCase):
    def test_desktop_auto_starts_lan_and_closes_on_quit(self):
        source = (Path(__file__).resolve().parents[1] / 'src/alfastafl/desktop.py').read_text('utf-8')
        self.assertIn('QTimer.singleShot(250, controller.start)', source)
        self.assertIn('app.aboutToQuit.connect(shutdown)', source)
        self.assertIn('self.lease.close()', source)
        self.assertIn('open_network_server(network)', source)
        self.assertIn('remote = run(network.address, PORT, store)', source)
        self.assertNotIn("run('0.0.0.0', PORT, store)", source)

    def test_invites_remain_hidden_until_lan_ready(self):
        root = Path(__file__).resolve().parents[1]
        js = (root/'web/app.js').read_text('utf-8')
        self.assertIn('if(!addr.lan_enabled){panel.hidden=true;return;}', js)
        self.assertIn('gameId+origin+state.invites.player+state.invites.spectator', js)


if __name__ == '__main__':
    unittest.main()

class LeaseLifecycle(unittest.TestCase):
    def test_polkit_helper_kept_alive_and_closed_without_shell(self):
        network = lan.LocalNetwork('wlp1s0','192.168.1.102','192.168.1.0/24')
        process = Mock()
        process.stdout.readline.return_value = '{"ready": true,"address": "192.168.1.102","firewall_managed": true}\n'
        process.poll.return_value = None
        with patch.object(Path, 'is_file', return_value=True):
            popen = Mock(return_value=process)
            lease = lan.FirewallLease(popen=popen)
            self.assertTrue(lease.start(network)['ready'])
            self.assertTrue(lease.alive())
            args = popen.call_args.args[0]
            self.assertEqual(args[:3], [lan.PKEXEC, '--disable-internal-agent', lan.PYTHON])
            self.assertEqual(args[-3:], ['wlp1s0','192.168.1.102','192.168.1.0/24'])
            self.assertNotIn('shell', popen.call_args.kwargs)
            lease.close()
            process.stdin.close.assert_called_once()
            process.wait.assert_called_once()
            self.assertIsNone(lease.process)

    def test_no_privilege_grant_means_no_live_lease(self):
        network = lan.LocalNetwork('wlp1s0','192.168.1.102','192.168.1.0/24')
        process = Mock()
        process.stdout.readline.return_value = '{"ready": false,"error": "Autorisation refusée"}\n'
        with patch.object(Path, 'is_file', return_value=True):
            lease = lan.FirewallLease(popen=Mock(return_value=process))
            with self.assertRaisesRegex(lan.LanError, 'refusée'):
                lease.start(network)
        process.stdin.close.assert_called()
        self.assertIsNone(lease.process)
