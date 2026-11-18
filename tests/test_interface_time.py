"""Clock controls and host disconnection UI must remain present in both layouts."""
from html.parser import HTMLParser
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]

class IDParser(HTMLParser):
    def __init__(self):
        super().__init__();self.ids=set()
    def handle_starttag(self,tag,attrs):
        v=dict(attrs).get('id')
        if v:self.ids.add(v)

class TimeInterface(unittest.TestCase):
    def test_new_options_exist(self):
        parser=IDParser();parser.feed((ROOT/'web/index.html').read_text('utf-8'))
        for id in ('time-mode','time-seconds','reconnect-minutes','clock-elf',
                   'clock-dwarf','clock-status','game-list','save-leave','resume-game',
                   'forfeit','forfeit-camp','substitute','save-disconnected','connection-state'):
            with self.subTest(id=id):self.assertIn(id,parser.ids)

    def test_browser_cannot_award_its_own_time_expiry(self):
        js=(ROOT/'web/app.js').read_text('utf-8')
        self.assertIn('serverTimeReceivedAt=state.server_now',js)
        self.assertNotIn("game.status='finished'",js)
        self.assertIn("game.clock?.started",js)

    def test_reconnect_token_is_not_exposed_through_qr_urls(self):
        js=(ROOT/'web/app.js').read_text('utf-8')
        self.assertIn("localStorage.setItem('alfastafl.device.'+id,token)",js)
        self.assertIn("clearDevice(gameId)",js)
        self.assertNotIn("'&session='+session",js)

    def test_responsive_clocks_defined(self):
        css=(ROOT/'web/style.css').read_text('utf-8')
        self.assertIn('.clock-panel{display:grid;',css)
        self.assertIn('@media(max-width:500px){.clock-panel',css)

if __name__=='__main__':unittest.main()
