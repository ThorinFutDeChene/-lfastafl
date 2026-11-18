"""The client displays only server-approved moves and user roles."""
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class ClientRulesTests(unittest.TestCase):
    def test_player_moves_validated_by_server(self):
        js = (ROOT / 'web/app.js').read_text(encoding='utf-8')
        self.assertIn("api('legal?game='", js)
        self.assertIn('if(selected&&available(r,c))', js)
        self.assertIn("api('move'", js)

    def test_spectator_has_no_player_controls(self):
        js = (ROOT / 'web/app.js').read_text(encoding='utf-8')
        self.assertIn("you.role==='player'", js)
        self.assertIn("$('player-controls').hidden=!playing", js)

    def test_review_and_draw_controls(self):
        html = (ROOT / 'web/index.html').read_text(encoding='utf-8')
        for item in ('draw-offer', 'draw-accept', 'draw-decline', 'repetition-review',
                     'repetition-options'):
            self.assertIn('id="'+item+'"', html)


if __name__ == '__main__':
    unittest.main()
