"""Offline tests for GitHub release selection, integrity and native installer."""

import hashlib
import io
import json
from pathlib import Path
from unittest import TestCase, mock
import threading

from alfastafl import updater as u


class FakeResponse:
    def __init__(self, data, url, headers=None):
        self.stream = io.BytesIO(data)
        self.url = url
        self.headers = headers or {'Content-Length': str(len(data))}

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.stream.close()

    def read(self, n=-1):
        return self.stream.read(n)

    def geturl(self):
        return self.url


def release(tag, prerelease, digest=None):
    m = u.TAG_RE.fullmatch(tag)
    assert m, tag
    version = m.group(1) + ('~dev' + m.group(2) if m.group(2) else '')
    pkg = 'alfastafl_' + version.replace('~', '_') + '_all.deb'
    base = 'https://github.com/' + u.OWNER + '/' + u.REPOSITORY + '/releases/download/' + tag + '/'
    return {
        'tag_name': tag,
        'prerelease': prerelease,
        'draft': False,
        'html_url': base[:-1],
        'body': 'Notes du test',
        'assets': [
            {'name': pkg, 'state': 'uploaded', 'browser_download_url': base + pkg, 'digest': digest},
            {'name': 'SHA256SUMS.txt', 'state': 'uploaded', 'browser_download_url': base + 'SHA256SUMS.txt'},
        ],
    }


class ReleaseSelectionTests(TestCase):
    def test_version_priority(self):
        self.assertTrue(u.newer_than('0.1.0~dev3', '0.1.0~dev2'))
        self.assertFalse(u.newer_than('0.1.0~dev2', '0.1.0~dev3'))
        self.assertTrue(u.newer_than('0.1.0', '0.1.0~dev9'))
        self.assertTrue(u.newer_than('0.1.1~dev1', '0.1.0'))

    def test_stable_never_receives_dev(self):
        payload = [release('v0.1.0-dev4', True), release('v0.1.0', False)]
        self.assertEqual([x.tag for x in u.parse_releases(payload, 'stable')], ['v0.1.0'])

    def test_dev_receives_both(self):
        payload = [release('v0.1.0-dev4', True), release('v0.1.0', False)]
        self.assertEqual(len(u.parse_releases(payload, 'dev')), 2)

    def test_rejects_mislabeled_release_and_drafts(self):
        x = release('v0.1.0-dev3', False)
        y = release('v0.1.1-dev1', True)
        y['draft'] = True
        self.assertEqual(u.parse_releases([x, y], 'dev'), [])

    def test_rejects_asset_url_wrong_host(self):
        r = release('v0.1.0-dev3', True)
        r['assets'][0]['browser_download_url'] = 'https://evil.example/fake.deb'
        self.assertEqual(u.parse_releases([r], 'dev'), [])

    def test_rejects_missing_checksum_asset(self):
        r = release('v0.1.0-dev3', True)
        r['assets'] = r['assets'][:1]
        self.assertEqual(u.parse_releases([r], 'dev'), [])

    def test_latest_semver_not_release_list_order(self):
        data = [release('v0.1.0-dev3', True), release('v0.2.0-dev1', True), release('v0.1.0-dev4', True)]
        with mock.patch.object(u, '_read_url', return_value=json.dumps(data).encode()):
            found = u.check_for_update('dev', '0.1.0~dev2')
        self.assertEqual(found.version, '0.2.0~dev1')

    def test_up_to_date(self):
        with mock.patch.object(u, '_read_url', return_value=json.dumps([release('v0.1.0-dev3', True)]).encode()):
            self.assertIsNone(u.check_for_update('dev', '0.1.0~dev3'))

    def test_offline_has_clear_error(self):
        with mock.patch.object(u, '_read_url', side_effect=OSError('Offline')):
            with self.assertRaises(u.UpdateError):
                u.check_for_update('dev', '0.1.0~dev2')

    def test_invalid_channel(self):
        with self.assertRaises(ValueError):
            u.parse_releases([], 'inconnu')

    def test_current_source_version(self):
        self.assertEqual(u.local_version(), '0.2.0~dev1')


class PackageTests(TestCase):
    def setUp(self):
        self.raw = b'example test deb bytes' * 200
        self.hash = hashlib.sha256(self.raw).hexdigest()
        self.record = u.parse_releases([release('v0.1.0-dev3', True)], 'dev')[0]

    def test_parse_checksums(self):
        self.assertEqual(u._checksum_for(self.hash + '  ' + self.record.package_name + '\n', self.record.package_name), self.hash)
        with self.assertRaises(u.UpdateError):
            u._checksum_for(self.hash + '  another.deb\n', self.record.package_name)

    def test_verified_download(self):
        sum_text = self.hash + '  ' + self.record.package_name + '\n'
        with mock.patch.object(u, '_read_url', return_value=sum_text.encode()), \
                mock.patch.object(u, 'urlopen', return_value=FakeResponse(self.raw, self.record.package_url)), \
                mock.patch.object(u, 'validate_deb') as check:
            path, folder = u.download_verified(self.record)
        try:
            self.assertEqual(path.read_bytes(), self.raw)
            check.assert_called_once_with(path, '0.1.0~dev3')
        finally:
            import shutil
            shutil.rmtree(folder)

    def test_bad_checksum_refused(self):
        bad = '0' * 64 + '  ' + self.record.package_name + '\n'
        with mock.patch.object(u, '_read_url', return_value=bad.encode()), \
                mock.patch.object(u, 'urlopen', return_value=FakeResponse(self.raw, self.record.package_url)):
            with self.assertRaisesRegex(u.UpdateError, 'SHA-256'):
                u.download_verified(self.record)

    def test_mismatch_between_release_digest_and_manifest(self):
        rec = u.parse_releases([release('v0.1.0-dev3', True, 'sha256:' + '1' * 64)], 'dev')[0]
        sums = self.hash + '  ' + rec.package_name + '\n'
        with mock.patch.object(u, '_read_url', return_value=sums.encode()):
            with self.assertRaisesRegex(u.UpdateError, 'incompatible'):
                u.download_verified(rec)

    def test_cancelled_before_streaming(self):
        cancelled = threading.Event()
        cancelled.set()
        sums = self.hash + '  ' + self.record.package_name + '\n'
        with mock.patch.object(u, '_read_url', return_value=sums.encode()), \
                mock.patch.object(u, 'urlopen', return_value=FakeResponse(self.raw, self.record.package_url)):
            with self.assertRaises(u.UpdateCancelled):
                u.download_verified(self.record, cancelled=cancelled)

    def test_insecure_redirect_refused(self):
        sums = self.hash + '  ' + self.record.package_name + '\n'
        with mock.patch.object(u, '_read_url', return_value=sums.encode()), \
                mock.patch.object(u, 'urlopen', return_value=FakeResponse(self.raw, 'http://download.example/file.deb')):
            with self.assertRaisesRegex(u.UpdateError, 'non sécurisée'):
                u.download_verified(self.record)

    def test_install_requires_polkit(self):
        with mock.patch.object(u, 'validate_deb'), mock.patch.object(Path, 'is_file', return_value=False):
            with self.assertRaisesRegex(u.UpdateError, 'pkexec absent'):
                u.install_package(Path('/tmp/alfastafl_test.deb'), '0.1.0~dev3')

    def test_install_uses_argument_array_and_pkexec(self):
        completed = mock.Mock(returncode=0, stdout='ok', stderr='')
        with mock.patch.object(u, 'validate_deb'), \
                mock.patch.object(Path, 'is_file', return_value=True), \
                mock.patch.object(u.subprocess, 'run', return_value=completed) as run:
            u.install_package(Path('/tmp/example.deb'), '0.1.0~dev3')
        args = run.call_args.args[0]
        self.assertEqual(args[:4], ['/usr/bin/pkexec', '/usr/bin/apt-get', 'install', '-y'])
        self.assertEqual(args[4], '/tmp/example.deb')


if __name__ == '__main__':
    import unittest
    unittest.main()
