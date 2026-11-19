"""Automatic restart validation: no privileged relaunch, no duplicate process."""
import unittest
from unittest.mock import Mock, patch

from alfastafl import relauncher as rel


class ProcessIdentityTests(unittest.TestCase):
    def test_status_parses_process_name_containing_parentheses(self):
        # /proc/<pid>/stat fields after the final ') ': state, ppid, ... starttime.
        fields = ['S'] + ['0'] * 18 + ['123456'] + ['0'] * 5
        with patch.object(rel.Path, 'read_text',
                          return_value='42 (Álfa ) tafl) ' + ' '.join(fields)):
            self.assertEqual(rel.process_status(42), ('123456', 'S'))

    def test_missing_pid_is_treated_as_exited(self):
        with patch.object(rel.Path, 'read_text', side_effect=FileNotFoundError):
            self.assertIsNone(rel.process_status(5000))

    def test_zombie_does_not_delay_restart(self):
        with patch.object(rel, 'process_status', return_value=('33', 'Z')), \
             patch.object(rel.time, 'sleep') as sleep:
            self.assertTrue(rel.wait_for_exit(123, '33'))
        sleep.assert_not_called()

    def test_pid_reused_does_not_delay_restart(self):
        with patch.object(rel, 'process_status', return_value=('34', 'S')), \
             patch.object(rel.time, 'sleep') as sleep:
            self.assertTrue(rel.wait_for_exit(123, '33'))
        sleep.assert_not_called()

    def test_waits_until_exact_process_exits(self):
        with patch.object(rel, 'process_status',
                          side_effect=[('33', 'S'), ('33', 'S'), None]), \
             patch.object(rel.time, 'sleep') as sleep:
            self.assertTrue(rel.wait_for_exit(123, '33'))
        self.assertEqual(sleep.call_count, 2)

    def test_timeout_refuses_duplicate_launch(self):
        with patch.object(rel, 'process_status', return_value=('33', 'S')), \
             patch.object(rel.time, 'monotonic', side_effect=[0, 2]), \
             patch.object(rel.time, 'sleep') as sleep, \
             patch.object(rel, '_detached') as launch:
            self.assertFalse(rel.wait_for_exit(123, '33', timeout=1))
        sleep.assert_not_called()
        launch.assert_not_called()


class RestartLifecycleTests(unittest.TestCase):
    def test_schedule_needs_a_real_launcher(self):
        with patch.object(rel.Path, 'is_file', return_value=False), \
             patch.object(rel, '_detached') as launch:
            with self.assertRaises(rel.RestartError):
                rel.schedule_restart()
        launch.assert_not_called()

    def test_schedule_is_detached_and_never_uses_pkexec_or_shell(self):
        with patch.object(rel.Path, 'is_file', return_value=True), \
             patch.object(rel.os, 'access', return_value=True), \
             patch.object(rel.os, 'getpid', return_value=234), \
             patch.object(rel, 'process_status', return_value=('777', 'S')), \
             patch.object(rel.subprocess, 'Popen', return_value=Mock()) as popen:
            rel.schedule_restart()
        argv = popen.call_args.args[0]
        self.assertEqual(argv, [rel.sys.executable, '-m', 'alfastafl.relauncher',
                                '--wait-for-exit', '234', '777', rel.LAUNCHER])
        self.assertNotIn('pkexec', argv)
        self.assertEqual(popen.call_args.kwargs['start_new_session'], True)
        self.assertEqual(popen.call_args.kwargs['close_fds'], True)
        self.assertNotIn('shell', popen.call_args.kwargs)

    def test_launches_new_binary_after_old_process_is_gone(self):
        with patch.object(rel, 'wait_for_exit', return_value=True), \
             patch.object(rel.Path, 'is_file', return_value=True), \
             patch.object(rel.os, 'access', return_value=True), \
             patch.object(rel, '_detached', return_value=Mock()) as launch:
            self.assertTrue(rel.restart_after_exit(234, '777', rel.LAUNCHER))
        launch.assert_called_once_with([rel.LAUNCHER])

    def test_no_restart_on_wait_timeout(self):
        with patch.object(rel, 'wait_for_exit', return_value=False), \
             patch.object(rel, '_detached') as launch:
            self.assertFalse(rel.restart_after_exit(234, '777', rel.LAUNCHER))
        launch.assert_not_called()

    def test_no_restart_when_new_launcher_missing(self):
        with patch.object(rel, 'wait_for_exit', return_value=True), \
             patch.object(rel.Path, 'is_file', return_value=False), \
             patch.object(rel, '_detached') as launch:
            self.assertFalse(rel.restart_after_exit(234, '777', rel.LAUNCHER))
        launch.assert_not_called()

    def test_helper_rejects_unexpected_launcher_and_pid(self):
        self.assertEqual(rel.main(['--wait-for-exit', '100', '33', '/bin/sh']), 2)
        self.assertEqual(rel.main(['--wait-for-exit', '0', '33', rel.LAUNCHER]), 2)

    def test_helper_runs_restart_after_exit(self):
        with patch.object(rel, 'restart_after_exit', return_value=True) as restart:
            self.assertEqual(rel.main(['--wait-for-exit', '234', '777', rel.LAUNCHER]), 0)
        restart.assert_called_once_with(234, '777', rel.LAUNCHER)


if __name__ == '__main__':
    unittest.main()
