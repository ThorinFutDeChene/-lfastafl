"""Keep the Ubuntu application maximized at startup."""
from unittest import TestCase
from alfastafl.desktop import show_main_window


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
