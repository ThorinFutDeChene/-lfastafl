"""Keep the Ubuntu application maximized at startup."""
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
    def test_starts_maximized_without_fullscreen(self):
        window = DummyWindow()
        show_main_window(window)
        self.assertEqual(window.calls, ["maximized"])

    def test_game_and_tutorial_are_separate_native_fullscreen_windows(self):
        popup = DummyWindow()
        show_board_window(popup)
        self.assertEqual(popup.calls, ["fullscreen"],
                         "Board/tutorial must be separate OS-level fullscreen windows")

    def test_management_window_does_not_switch_to_fullscreen_when_board_opens(self):
        manager, board = DummyWindow(), DummyWindow()
        show_main_window(manager)
        show_board_window(board)
        self.assertEqual(manager.calls, ["maximized"])
        self.assertEqual(board.calls, ["fullscreen"])
