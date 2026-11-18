"""Avoid placing player and spectator QR codes next to one another ambiguously."""
from html.parser import HTMLParser
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]

class _Structure(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids=[]
        self.qrs=[]
    def handle_starttag(self, tag, attrs):
        attr=dict(attrs)
        if attr.get('id'):
            self.ids.append(attr['id'])
        if tag=='img' and attr.get('id','').startswith('qr-'):
            self.qrs.append((attr['id'],attr.get('alt','')))

class InvitationLayoutTests(unittest.TestCase):
    def test_player_left_details_middle_spectator_right(self):
        html=(ROOT/'web/index.html').read_text()
        tree=_Structure();tree.feed(html)
        ids=tree.ids
        self.assertLess(ids.index('qr-player'), ids.index('hostmsg'))
        self.assertLess(ids.index('hostmsg'), ids.index('qr-spectator'))
        self.assertEqual([x[0] for x in tree.qrs],['qr-player','qr-spectator'])
        self.assertIn('jouer',tree.qrs[0][1])
        self.assertIn('observer',tree.qrs[1][1])
    def test_grid_spacing_and_mobile_fallback(self):
        css=(ROOT/'web/style.css').read_text()
        self.assertIn('.invitations{display:grid;grid-template-columns:',css)
        self.assertIn('@media(max-width:720px)',css)
        self.assertIn('.invite-info{grid-column:1 / -1;grid-row:1',css)
    def test_qr_images_not_reloaded_on_each_network_poll(self):
        js=(ROOT/'web/app.js').read_text()
        self.assertIn('if(panel.dataset.signature!==qrSignature)',js)
        self.assertIn('gameId+origin+state.invites.player+state.invites.spectator',js)
        self.assertNotIn("$('qrcodes')",js)

if __name__=='__main__':
    unittest.main()
