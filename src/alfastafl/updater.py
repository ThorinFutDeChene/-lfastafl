"""Opt-in Debian package updates from public, versioned GitHub Releases.

No Qt dependency: discovery, checksums and package validation are unit tested.
Downloading never needs root; only the confirmed package installation does.
"""

from dataclasses import dataclass
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

OWNER = 'ThorinFutDeChene'
REPOSITORY = '-lfastafl'
API_URL = f'https://api.github.com/repos/{OWNER}/{REPOSITORY}/releases?per_page=100'
TAG_RE = re.compile(r'^v(\d+\.\d+\.\d+)(?:-dev(\d+))?$')
MAX_METADATA_BYTES = 2 * 1024 * 1024
MAX_CHECKSUM_BYTES = 128 * 1024
MAX_PACKAGE_BYTES = 2 * 1024 * 1024 * 1024
USER_AGENT = 'Alfastafl-Updater/0.1 (+https://github.com/ThorinFutDeChene/-lfastafl)'


class UpdateError(Exception):
    """A download, integrity, authentication or installation error."""


class UpdateCancelled(UpdateError):
    """A user-initiated download cancellation."""


@dataclass(frozen=True)
class Release:
    tag: str
    version: str
    package_name: str
    package_url: str
    checksums_url: str
    description: str
    page_url: str
    asset_digest: str | None = None


def local_version():
    """Version of the *running* app, not an arbitrarily newer apt record."""
    root = Path(__file__).resolve().parents[2]
    try:
        value = (root / 'VERSION').read_text(encoding='utf-8').strip()
        if re.fullmatch(r'\d+\.\d+\.\d+(?:~dev\d+)?', value):
            return value
    except OSError:
        pass
    try:
        p = subprocess.run(
            ['dpkg-query', '-W', '-f=${Version}', 'alfastafl'],
            capture_output=True, text=True, timeout=8, check=False)
        if p.returncode == 0 and p.stdout.strip():
            return p.stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        pass
    return '0.0.0'


def newer_than(left, right):
    """Debian version ordering: dev prereleases precede the stable release."""
    if not left or not right:
        raise UpdateError('Version de paquet invalide')
    try:
        result = subprocess.run(
            ['/usr/bin/dpkg', '--compare-versions', left, 'gt', right],
            capture_output=True, text=True, timeout=8, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise UpdateError('Comparaison de versions Debian indisponible') from exc
    if result.returncode not in (0, 1):
        raise UpdateError('Erreur lors de la comparaison des versions Debian')
    return result.returncode == 0


def _read_url(url, limit, timeout=12):
    request = Request(url, headers={
        'User-Agent': USER_AGENT,
        'Accept': 'application/vnd.github+json' if url.startswith('https://api.github.com/') else 'text/plain',
    })
    with urlopen(request, timeout=timeout) as response:
        if urlsplit(response.geturl()).scheme != 'https':
            raise UpdateError('Redirection non sécurisée refusée')
        body = response.read(limit + 1)
    if len(body) > limit:
        raise UpdateError('Réponse distante trop volumineuse')
    return body


def _valid_release_url(url, tag, name):
    parts = urlsplit(url)
    return (parts.scheme == 'https' and parts.netloc == 'github.com'
            and parts.path == f'/{OWNER}/{REPOSITORY}/releases/download/{tag}/{name}'
            and not parts.query and not parts.fragment)


def parse_releases(payload, channel):
    """Return verified release *metadata*, ignoring incomplete/wrong-channel entries.

    GitHub's `prerelease` flag alone is not trusted for categorization: the
    tag must match our stable/dev scheme too.
    """
    if channel not in ('stable', 'dev'):
        raise ValueError('Canal inconnu')
    if not isinstance(payload, list):
        raise UpdateError('Réponse GitHub inattendue')
    candidates = []
    for item in payload:
        if not isinstance(item, dict) or item.get('draft'):
            continue
        tag = item.get('tag_name', '')
        match = TAG_RE.fullmatch(tag) if isinstance(tag, str) else None
        if not match:
            continue
        base, dev_number = match.groups()
        prerelease = bool(item.get('prerelease'))
        if prerelease != (dev_number is not None):
            continue
        if channel == 'stable' and dev_number is not None:
            continue
        version = base + (f'~dev{dev_number}' if dev_number is not None else '')
        package_name = f"alfastafl_{version.replace('~', '_')}_all.deb"
        assets = item.get('assets', [])
        if not isinstance(assets, list):
            continue
        by_name = {asset.get('name'): asset for asset in assets
                   if isinstance(asset, dict) and asset.get('state') == 'uploaded'}
        deb = by_name.get(package_name)
        sums = by_name.get('SHA256SUMS.txt')
        if not deb or not sums:
            continue
        deb_url = deb.get('browser_download_url', '')
        sum_url = sums.get('browser_download_url', '')
        if not (_valid_release_url(deb_url, tag, package_name)
                and _valid_release_url(sum_url, tag, 'SHA256SUMS.txt')):
            continue
        page_url = item.get('html_url', '')
        if urlsplit(page_url).scheme != 'https' or urlsplit(page_url).netloc != 'github.com':
            continue
        digest = deb.get('digest')
        if digest is not None and not re.fullmatch(r'sha256:[0-9a-fA-F]{64}', digest):
            continue
        candidates.append(Release(
            tag=tag, version=version, package_name=package_name,
            package_url=deb_url, checksums_url=sum_url,
            description=str(item.get('body') or ''), page_url=page_url,
            asset_digest=digest.split(':', 1)[1].lower() if digest else None,
        ))
    return candidates


def check_for_update(channel, current_version=None):
    """Network operation: call from a worker thread only."""
    version = current_version or local_version()
    try:
        payload = json.loads(_read_url(API_URL, MAX_METADATA_BYTES).decode('utf-8'))
    except (ValueError, UnicodeError, OSError) as exc:
        raise UpdateError(f'Impossible de consulter les versions GitHub : {exc}') from exc
    candidates = parse_releases(payload, channel)
    best = None
    for release in candidates:
        if newer_than(release.version, version) and (
                best is None or newer_than(release.version, best.version)):
            best = release
    return best


def _checksum_for(text, filename):
    for line in text.splitlines():
        match = re.fullmatch(r'([0-9a-fA-F]{64})\s+\*?(\S+)', line.strip())
        if match and match.group(2) == filename:
            return match.group(1).lower()
    raise UpdateError(f'Empreinte SHA-256 absente pour {filename}')


def validate_deb(path, expected_version):
    """Reject incorrect package/architecture/version before invoking pkexec."""
    try:
        result = subprocess.run(
            ['/usr/bin/dpkg-deb', '--field', str(path), 'Package', 'Version', 'Architecture'],
            capture_output=True, text=True, check=False, timeout=20)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise UpdateError('Impossible de vérifier les métadonnées du paquet Debian') from exc
    if result.returncode != 0:
        raise UpdateError('Le fichier téléchargé n’est pas un paquet Debian valide')
    fields = {}
    for line in result.stdout.splitlines():
        if ': ' in line:
            k, v = line.split(': ', 1)
            fields[k.strip()] = v.strip()
    if fields.get('Package') != 'alfastafl' or fields.get('Version') != expected_version:
        raise UpdateError('Nom ou version du paquet incompatible avec la Release')
    if fields.get('Architecture') not in ('all', 'amd64'):
        raise UpdateError('Architecture de paquet non prise en charge')


def download_verified(release, progress=None, cancelled=None):
    """Download to an isolated temporary directory; verify SHA-256 and .deb metadata.

    Returns (file_path, temp_dir). Caller must clean temp_dir after install or
    cancellation. URL and asset name come from strictly validated metadata.
    """
    expected = _checksum_for(
        _read_url(release.checksums_url, MAX_CHECKSUM_BYTES).decode('utf-8'),
        release.package_name,
    )
    if release.asset_digest and not hmac.compare_digest(expected, release.asset_digest):
        raise UpdateError('Empreinte GitHub incompatible avec SHA256SUMS.txt')
    folder = Path(tempfile.mkdtemp(prefix='alfastafl-update-'))
    filename = folder / release.package_name
    try:
        req = Request(release.package_url, headers={'User-Agent': USER_AGENT})
        hasher = hashlib.sha256()
        received = 0
        with urlopen(req, timeout=30) as response, filename.open('wb') as dest:
            if urlsplit(response.geturl()).scheme != 'https':
                raise UpdateError('Redirection non sécurisée refusée')
            size = response.headers.get('Content-Length', '')
            try:
                total = int(size) if size else 0
            except ValueError:
                total = 0
            if total > MAX_PACKAGE_BYTES:
                raise UpdateError('Paquet trop volumineux')
            while True:
                if cancelled is not None and cancelled.is_set():
                    raise UpdateCancelled('Téléchargement annulé')
                block = response.read(256 * 1024)
                if not block:
                    break
                received += len(block)
                if received > MAX_PACKAGE_BYTES:
                    raise UpdateError('Paquet trop volumineux')
                dest.write(block)
                hasher.update(block)
                if progress and total:
                    progress(min(99, int(received * 100 / total)))
        if not hmac.compare_digest(hasher.hexdigest(), expected):
            raise UpdateError('Échec du contrôle SHA-256 : paquet refusé')
        validate_deb(filename, release.version)
        if progress:
            progress(100)
        return filename, folder
    except Exception:
        shutil.rmtree(folder, ignore_errors=True)
        raise


def install_package(path, version):
    """Explicit, privileged install after UI consent. Never run shell commands."""
    validate_deb(path, version)
    if not Path('/usr/bin/pkexec').is_file():
        raise UpdateError('pkexec absent : installer le paquet Ubuntu « pkexec »')
    try:
        result = subprocess.run(
            ['/usr/bin/pkexec', '/usr/bin/apt-get', 'install', '-y', str(path.resolve())],
            capture_output=True, text=True, timeout=600, check=False)
    except subprocess.TimeoutExpired as exc:
        raise UpdateError('Installation trop longue ; vérifier l’état d’APT') from exc
    except OSError as exc:
        raise UpdateError(f'Impossible de lancer l’authentification Linux : {exc}') from exc
    if result.returncode:
        details = (result.stderr or result.stdout or 'Installation annulée').strip()
        raise UpdateError(details[-1500:])
    return True
