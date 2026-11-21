"""Keep one native fullscreen host application with a real menu bar."""
from unittest import TestCase
from alfastafl.desktop import show_main_window, show_board_window


class DummyWindow:
    def __init__(self):
        self.calls = []

    def showMaximized(self):
        self.calls.append("maximized")

    def showFullScreen(self):
        self.calls.append("fullscreen")

    def show(self):
        self.calls.append("normal")


class DesktopWindowTests(TestCase):
    def test_starts_fullscreen_with_native_menus(self):
        window = DummyWindow()
        show_main_window(window)
        self.assertEqual(window.calls, ["fullscreen"])

    def test_game_and_tutorial_are_separate_native_fullscreen_windows(self):
        popup = DummyWindow()
        show_board_window(popup)
        self.assertEqual(popup.calls, ["fullscreen"],
                         "Board/tutorial must be separate OS-level fullscreen windows")

    def test_single_host_board_is_fullscreen_without_a_maximized_manager(self):
        main = DummyWindow()
        show_main_window(main)
        self.assertEqual(main.calls, ["fullscreen"])
        self.assertNotIn("maximized", main.calls)
