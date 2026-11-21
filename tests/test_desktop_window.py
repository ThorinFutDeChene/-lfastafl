"""Keep one native fullscreen host application with a real menu bar."""
from unittest import TestCase
from alfastafl.desktop import (
    show_main_window, show_board_window, toggle_main_fullscreen,
    FILE_MENU_COMMANDS, PARTY_MENU_COMMANDS, LAN_ACTIVATING_COMMANDS,
)


class DummyWindow:
    def __init__(self):
        self.calls = []
        self.fullscreen = False

    def isFullScreen(self):
        return self.fullscreen

    def showNormal(self):
        self.fullscreen = False
        self.calls.append("normal")

    def showMaximized(self):
        self.calls.append("maximized")

    def showFullScreen(self):
        self.fullscreen = True
        self.calls.append("fullscreen")

    def show(self):
        self.calls.append("normal")


class DesktopWindowTests(TestCase):
    def test_file_menu_no_longer_contains_new_game(self):
        self.assertEqual(
            FILE_MENU_COMMANDS,
            (('Sauvegarder la partie', 'save'), ('Sauvegardes…', 'saves')),
        )
        self.assertNotIn('new', dict((cmd, label) for label, cmd in FILE_MENU_COMMANDS))

    def test_partie_menu_has_only_two_players_tutorial_and_tournaments(self):
        self.assertEqual(
            PARTY_MENU_COMMANDS,
            (('2 joueurs', 'new'),
             ('Tutoriel…', 'tutorial'),
             ('Tournois et tirage des factions…', 'tournament')),
        )
        self.assertEqual(
            [cmd for _, cmd in PARTY_MENU_COMMANDS],
            ['new', 'tutorial', 'tournament'],
        )
        self.assertNotIn('history', [cmd for _, cmd in PARTY_MENU_COMMANDS])
        self.assertNotIn('game', [cmd for _, cmd in PARTY_MENU_COMMANDS])

    def test_two_player_entry_preserves_lan_activation(self):
        self.assertEqual(PARTY_MENU_COMMANDS[0], ('2 joueurs', 'new'))
        self.assertIn('new', LAN_ACTIVATING_COMMANDS)
        self.assertIn('tutorial', LAN_ACTIVATING_COMMANDS)
        self.assertIn('tournament', LAN_ACTIVATING_COMMANDS)

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

    def test_display_menu_exits_fullscreen_without_closing_the_app(self):
        class FakeMenuAction:
            def __init__(self):
                self.text = None
            def setText(self, text):
                self.text = text

        window = DummyWindow()
        action = FakeMenuAction()
        show_main_window(window)
        self.assertTrue(window.isFullScreen())
        self.assertFalse(toggle_main_fullscreen(window, action))
        self.assertFalse(window.isFullScreen())
        self.assertEqual(window.calls, ["fullscreen", "normal"])
        self.assertEqual(action.text, "Passer en plein écran (F11)")
        self.assertTrue(toggle_main_fullscreen(window, action))
        self.assertTrue(window.isFullScreen())
        self.assertEqual(window.calls, ["fullscreen", "normal", "fullscreen"])
        self.assertEqual(action.text, "Quitter le plein écran (F11)")

    def test_f11_without_menu_action_still_toggles_the_window(self):
        window = DummyWindow()
        show_main_window(window)
        self.assertFalse(toggle_main_fullscreen(window))
        self.assertTrue(toggle_main_fullscreen(window))
        self.assertEqual(window.calls, ["fullscreen", "normal", "fullscreen"])
