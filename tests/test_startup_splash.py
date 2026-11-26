"""Native Qt splash: full poster, persistent asset preference and no menu regression."""
import tempfile
import hashlib
import unittest
from pathlib import Path

from alfastafl.desktop import splash_image_path, SPLASH_MIN_MS, SPLASH_MAX_MS


class StartupSplashTests(unittest.TestCase):
    def test_official_original_poster_is_bundled(self):
        root = Path(__file__).resolve().parents[1]
        poster = root / 'web' / 'assets' / 'affiche.png'
        self.assertTrue(poster.is_file(), 'Official poster missing from package sources')
        self.assertEqual(hashlib.sha256(poster.read_bytes()).hexdigest(),
                         '07bd456f33d6005657aa1bfa89e028bae10d2baca66271aaf2da389a89fd4c69')
        from PIL import Image
        with Image.open(poster) as art:
            self.assertEqual(art.size, (1536, 1024))
            art.verify()

    def test_uses_persistent_art_instead_of_pkg_and_preserves_original(self):
        with tempfile.TemporaryDirectory() as folder:
            home=Path(folder)/'userdata'
            repo=Path(folder)/'source'
            bundled=repo/'web'/'assets'/'affiche.png'
            user=home/'alfastafl'/'affiche.png'
            shared=Path(folder)/'system'
            self.assertIsNone(splash_image_path(home,repo,shared))
            system=shared/'affiche.png'
            system.parent.mkdir(parents=True)
            system.write_bytes(b'official-poster')
            self.assertEqual(splash_image_path(home,repo,shared),system)
            bundled.parent.mkdir(parents=True)
            bundled.write_bytes(b'packaged-art')
            self.assertEqual(splash_image_path(home,repo,shared),bundled)
            user.parent.mkdir(parents=True)
            user.write_bytes(b'approved-original-poster')
            self.assertEqual(splash_image_path(home,repo,shared),user)
            self.assertEqual(user.read_bytes(),b'approved-original-poster')

    def test_splash_is_visible_for_ten_seconds_with_a_safety_timeout(self):
        self.assertEqual(SPLASH_MIN_MS,10000)
        self.assertEqual(SPLASH_MAX_MS,15000)

    def test_widget_still_has_its_normal_menu_and_screen(self):
        from alfastafl.desktop import PARTY_MENU_COMMANDS, show_main_window
        self.assertIn(('2 joueurs','new'),PARTY_MENU_COMMANDS)
        class Window:
            calls=[]
            def showFullScreen(self):
                self.calls.append('fullscreen')
        w=Window()
        show_main_window(w)
        self.assertEqual(w.calls,['fullscreen'])


if __name__=='__main__':
    unittest.main()
