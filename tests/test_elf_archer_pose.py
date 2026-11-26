"""Prevent mistakenly altering dwarf/king sculptures when posing elf archers."""
import pathlib
import re
import unittest


SCRIPT=(pathlib.Path(__file__).resolve().parents[1]/'web'/'figurines3d.js').read_text('utf-8')


class ElfArcherPoseTests(unittest.TestCase):
    def test_original_stone_metal_palettes_remain(self):
        for material in ('0x9b7144','0xe3dfcd','0xd8d7c5'):
            self.assertIn(material,SCRIPT)
        self.assertIn("N: 'Nain de bronze'",SCRIPT)
        self.assertIn("E: 'Elfe de pierre'",SCRIPT)
        self.assertIn("R: 'Roi elfe de pierre'",SCRIPT)

    def test_elf_has_separate_stance_and_real_drawn_nock(self):
        elf=SCRIPT.split('function elf(articulated = false)',1)[1].split(
            'function king(articulated = false)',1)[0]
        self.assertIn('footZ = side < 0 ? -0.135 : 0.145',elf)
        self.assertIn('bowTop = [-0.465, 1.205, 0.20]',elf)
        self.assertIn('bowNock = [0.085, 0.955, 0.20]',elf)
        self.assertIn("b.part('left-arm')",elf)
        self.assertIn("b.part('right-arm')",elf)
        self.assertIn('if (!articulated)',elf)
        self.assertIn('nock.position.set(0.085 * horizontal',SCRIPT)
        self.assertIn('(0.955 - bounds.min.y) * vertical',SCRIPT)
        self.assertIn('0.20 * horizontal - arm.position.z',SCRIPT)

    def test_royal_sword_sceptre_and_dwarf_axe_are_unchanged(self):
        dwarf=SCRIPT.split('function dwarf(articulated = false)',1)[1].split(
            'function elf(articulated = false)',1)[0]
        royal=SCRIPT.split('function king(articulated = false)',1)[1]
        self.assertIn('A compact, visibly asymmetric axe',dwarf)
        self.assertIn('Round shield with a raised rim',dwarf)
        self.assertIn('Ceremonial sword at rest and sceptre',royal)
        self.assertIn('b.pointedEars(1.158, 0.248)',royal)


if __name__=='__main__':
    unittest.main()
