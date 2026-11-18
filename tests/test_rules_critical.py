"""Critical rule audit: variants, king, shieldwall, enclosure, repetition."""
import json
import unittest

from alfastafl.core import Game, ELF, DWARF, KING, EMPTY, initial_board


def position(mode='copenhagen', king=(5, 5), turn='dwarf'):
    game = Game(mode=mode)
    game.board = [[EMPTY] * 11 for _ in range(11)]
    game.board[king[0]][king[1]] = KING
    game.turn = turn
    game.history = []
    game.positions = [game.signature()]
    return game


class InitialPositions(unittest.TestCase):
    def test_historical_bell(self):
        board = initial_board('historical')
        for x, y in ((0, 4), (0, 5), (0, 6), (1, 4), (1, 6), (2, 5)):
            self.assertEqual(board[x][y], DWARF)
        self.assertEqual(board[0][3], EMPTY)

    def test_modern_t(self):
        board = initial_board('copenhagen')
        for x, y in ((0, 3), (0, 4), (0, 5), (0, 6), (0, 7), (1, 5)):
            self.assertEqual(board[x][y], DWARF)
        self.assertEqual(board[1][4], EMPTY)
        self.assertEqual(board, initial_board('fetlar'))


class MovementAndCaptures(unittest.TestCase):
    def test_no_oblique_jump(self):
        game = position()
        game.board[2][2] = DWARF
        game.board[2][3] = ELF
        self.assertNotIn([2, 4], game.legal((2, 2)))
        self.assertNotIn([3, 3], game.legal((2, 2)))

    def test_throne_crossed_but_never_occupied_by_soldier(self):
        game = position(king=(7, 7))
        game.board[5][1] = DWARF
        self.assertNotIn([5, 5], game.legal((5, 1)))
        self.assertIn([5, 8], game.legal((5, 1)))

    def test_victim_can_enter_a_sandwich_safely(self):
        game = position(turn='elf', king=(5, 5))
        game.board[2][1] = DWARF
        game.board[2][3] = DWARF
        game.board[1][2] = ELF
        game.move([1, 2], [2, 2])
        self.assertEqual(game.board[2][2], ELF)

    def test_capture_multiple_regular_soldiers(self):
        game = position()
        for cell in ((5, 2), (5, 6), (4, 4), (6, 4)):
            game.board[cell[0]][cell[1]] = DWARF
        for cell in ((5, 3), (5, 5), (4, 5), (6, 5)):
            if cell != (5, 5):
                game.board[cell[0]][cell[1]] = ELF
        game.board[5][5] = KING
        # Closing horizontally would sandwich one elf against the king, not vice-versa.
        game.board[4][2] = DWARF
        game.move([4, 2], [4, 3])
        self.assertEqual(game.board[4][3], DWARF)

    def test_corner_is_hostile_to_both_soldier_camps(self):
        for moving_side, victim, mover, partner in (
            ('dwarf', ELF, DWARF, DWARF),
            ('elf', DWARF, ELF, ELF),
        ):
            game = position(turn=moving_side, king=(5, 5))
            game.board[0][1] = victim
            game.board[2][2] = mover
            game.board[0][3] = partner
            game.move([2, 2], [0, 2])
            self.assertEqual(game.board[0][1], EMPTY)

    def test_no_corner_capture_in_historical_mode(self):
        game = position('historical')
        game.board[0][1] = ELF
        game.board[2][2] = DWARF
        game.move([2, 2], [0, 2])
        self.assertEqual(game.board[0][1], ELF)

    def test_throne_empty_hostile_to_defenders(self):
        game = position(king=(6, 7))
        game.board[5][4] = ELF
        game.board[4][3] = DWARF
        game.move([4, 3], [5, 3])
        self.assertEqual(game.board[5][4], EMPTY)

    def test_occupied_throne_friendly_to_defenders(self):
        game = position(king=(5, 5))
        game.board[5][4] = ELF
        game.board[4][3] = DWARF
        game.move([4, 3], [5, 3])
        self.assertEqual(game.board[5][4], ELF)

    def test_occupied_throne_hostile_to_attackers(self):
        game = position(turn='elf', king=(5, 5))
        game.board[5][4] = DWARF
        game.board[4][3] = ELF
        game.move([4, 3], [5, 3])
        self.assertEqual(game.board[5][4], EMPTY)

    def test_illegal_move_is_transactional(self):
        game = Game()
        before = json.dumps(game.as_dict(), sort_keys=True)
        for start, end in (([0, 3], [1, 4]), ([0, 3], [10, 3]),
                           ([0, 3], ['1', 3]), ([0, 3], [True, 3]),
                           ([-1, 3], [0, 1]), ([0], [0, 0])):
            with self.assertRaises(ValueError):
                game.move(start, end)
            self.assertEqual(json.dumps(game.as_dict(), sort_keys=True), before)


class KingRuleTests(unittest.TestCase):
    def test_historical_two_sided_capture(self):
        game = position('historical', king=(6, 6))
        game.board[6][4] = DWARF
        game.board[6][7] = DWARF
        event = game.move([6, 4], [6, 5])
        self.assertEqual(event['winner'], 'dwarf')
        self.assertEqual(event['reason'], 'king_captured')

    def test_historical_king_on_throne_requires_four(self):
        game = position('historical')
        for p in ((4, 5), (5, 4), (6, 5)):
            game.board[p[0]][p[1]] = DWARF
        game.board[5][8] = DWARF
        event = game.move([5, 8], [5, 6])
        self.assertEqual(event['winner'], 'dwarf')

    def test_historical_king_adjacent_throne_needs_three(self):
        game = position('historical', king=(5, 4))
        for p in ((4, 4), (6, 4)):
            game.board[p[0]][p[1]] = DWARF
        game.board[5][1] = DWARF
        event = game.move([5, 1], [5, 3])
        self.assertEqual(event['winner'], 'dwarf')

    def test_fetlar_2018_three_plus_throne_does_not_capture(self):
        game = position('fetlar', king=(5, 4))
        for p in ((4, 4), (6, 4)):
            game.board[p[0]][p[1]] = DWARF
        game.board[5][1] = DWARF
        event = game.move([5, 1], [5, 3])
        self.assertNotEqual(event['winner'], 'dwarf')
        self.assertEqual(game.board[5][4], KING)

    def test_copenhagen_three_plus_throne(self):
        game = position('copenhagen', king=(5, 4))
        for p in ((4, 4), (6, 4)):
            game.board[p[0]][p[1]] = DWARF
        game.board[5][1] = DWARF
        event = game.move([5, 1], [5, 3])
        self.assertEqual(event['winner'], 'dwarf')

    def test_fetlar_four_on_ordinary_square(self):
        game = position('fetlar', king=(6, 6))
        for p in ((5, 6), (7, 6), (6, 7)):
            game.board[p[0]][p[1]] = DWARF
        game.board[6][3] = DWARF
        event = game.move([6, 3], [6, 5])
        self.assertEqual(event['winner'], 'dwarf')

    def test_king_on_edge_cannot_be_captured_copenhagen(self):
        game = position('copenhagen', king=(0, 5))
        for p in ((0, 4), (0, 6)):
            game.board[p[0]][p[1]] = DWARF
        game.board[2][5] = DWARF
        game.board[4][4] = ELF  # Avoid an unrelated no-legal-move defeat.
        event = game.move([2, 5], [1, 5])
        self.assertIsNone(event['winner'])
        self.assertEqual(game.board[0][5], KING)

    def test_moving_king_into_capture_trap_is_not_instant_capture(self):
        game = position('historical', king=(7, 3), turn='elf')
        game.board[6][5] = DWARF
        game.board[8][5] = DWARF
        game.move([7, 3], [7, 5])
        self.assertEqual(game.board[7][5], KING)
        self.assertNotEqual(game.winner, 'dwarf')

    def test_historical_old_sandwich_not_counted_on_other_axis(self):
        game = position('historical', king=(7, 5))
        game.board[6][5] = DWARF
        game.board[8][5] = DWARF
        game.board[7][2] = DWARF
        # The king voluntarily stepped into the vertical trap previously.
        # A new horizontal neighbor must not activate the old vertical trap.
        game.move([7, 2], [7, 4])
        self.assertNotEqual(game.reason, 'king_captured')
        self.assertEqual(game.board[7][5], KING)

    def test_historical_king_on_edge_wins(self):
        game = position('historical', king=(1, 5), turn='elf')
        game.move([1, 5], [0, 5])
        self.assertEqual(game.winner, 'elf')

    def test_modern_king_needs_corner_to_escape(self):
        game = position('fetlar', king=(1, 5), turn='elf')
        game.move([1, 5], [0, 5])
        self.assertIsNone(game.winner)


class CopenhagenSpecials(unittest.TestCase):
    def setup_shieldwall(self, mode='copenhagen'):
        game = position(mode)
        for p in ((0, 4), (0, 5)):
            game.board[p[0]][p[1]] = ELF
        for p in ((0, 3), (1, 4), (1, 5), (2, 6)):
            game.board[p[0]][p[1]] = DWARF
        return game

    def test_flanking_shieldwall_removes_row(self):
        game = self.setup_shieldwall()
        event = game.move([2, 6], [0, 6])
        self.assertEqual({tuple(c[:2]) for c in event['captured']}, {(0, 4), (0, 5)})

    def test_shieldwall_not_used_in_fetlar_or_historical(self):
        for mode in ('historical', 'fetlar'):
            game = self.setup_shieldwall(mode)
            game.move([2, 6], [0, 6])
            self.assertEqual(game.board[0][4], ELF)
            self.assertEqual(game.board[0][5], ELF)

    def test_front_move_does_not_trigger_shieldwall(self):
        game = self.setup_shieldwall()
        game.board[0][6] = DWARF
        game.board[1][5] = EMPTY
        game.board[2][5] = DWARF
        game.board[2][6] = EMPTY
        game.move([2, 5], [1, 5])
        self.assertEqual(game.board[0][4], ELF)
        self.assertEqual(game.board[0][5], ELF)

    def test_corner_can_flank_shieldwall(self):
        game = position()
        for c in (1, 2):
            game.board[0][c] = ELF
            game.board[1][c] = DWARF
        game.board[2][3] = DWARF
        game.move([2, 3], [0, 3])
        self.assertEqual(game.board[0][1], EMPTY)
        self.assertEqual(game.board[0][2], EMPTY)

    def test_king_cannot_be_taken_by_shieldwall(self):
        game = position(king=(0, 4))
        game.board[0][5] = ELF
        for p in ((0, 3), (1, 4), (1, 5), (2, 6)):
            game.board[p[0]][p[1]] = DWARF
        event = game.move([2, 6], [0, 6])
        self.assertEqual(game.board[0][4], KING)
        self.assertEqual(game.board[0][5], EMPTY)
        self.assertEqual(len(event['captured']), 1)

    def test_enclosure_win_requires_all_defenders_inside(self):
        for mode in ('historical', 'copenhagen'):
            game = position(mode)
            for c in range(3, 8):
                game.board[3][c] = DWARF
                game.board[7][c] = DWARF
            for r in range(3, 8):
                game.board[r][3] = DWARF
                game.board[r][7] = DWARF
            game.board[7][5] = EMPTY
            game.board[8][5] = DWARF
            game.board[4][4] = ELF
            game.move([8, 5], [7, 5])
            self.assertEqual(game.reason, 'encirclement')
            self.assertEqual(game.winner, 'dwarf')

    def test_enclosure_fails_if_one_guard_escaped(self):
        game = position()
        for c in range(3, 8):
            game.board[3][c] = DWARF
            game.board[7][c] = DWARF
        for r in range(3, 8):
            game.board[r][3] = DWARF
            game.board[r][7] = DWARF
        game.board[7][5] = EMPTY
        game.board[8][5] = DWARF
        game.board[0][2] = ELF
        game.move([8, 5], [7, 5])
        self.assertNotEqual(game.reason, 'encirclement')

    def test_exit_fort_recognizes_reference_patterns(self):
        for guards, king, pocket in (
            (((10, 3), (10, 6), (9, 4), (9, 5)), (10, 4), (10, 5)),
            (((10, 4), (10, 6), (9, 4), (9, 6), (8, 4), (8, 5)), (10, 5), (9, 5)),
        ):
            game = position(king=king, turn='elf')
            for p in guards:
                game.board[p[0]][p[1]] = ELF
            self.assertEqual(game.board[pocket[0]][pocket[1]], EMPTY)
            self.assertTrue(game._exit_fort())
            game.board[guards[0][0]][guards[0][1]] = EMPTY
            self.assertFalse(game._exit_fort())

    def test_fetlar_has_no_exit_fort(self):
        game = position('fetlar', king=(10, 5))
        for p in ((10, 4), (10, 6), (9, 4), (9, 6), (8, 4), (8, 5)):
            game.board[p[0]][p[1]] = ELF
        self.assertFalse(game._exit_fort())


class StalemateAndRepetition(unittest.TestCase):
    def test_blocked_fetlar_is_draw(self):
        game = position('fetlar', king=(0, 5))
        for p in ((0, 4), (0, 6), (1, 5)):
            game.board[p[0]][p[1]] = DWARF
        game.board[2][7] = DWARF
        game.move([2, 7], [3, 7])
        self.assertEqual(game.status, 'finished')
        self.assertIsNone(game.winner)
        self.assertEqual(game.reason, 'stalemate')

    def test_blocked_copenhagen_is_loss(self):
        game = position('copenhagen', king=(0, 5))
        for p in ((0, 4), (0, 6), (1, 5)):
            game.board[p[0]][p[1]] = DWARF
        game.board[2][7] = DWARF
        game.move([2, 7], [3, 7])
        self.assertEqual(game.status, 'finished')
        self.assertEqual(game.winner, 'dwarf')
        self.assertEqual(game.reason, 'stalemate')

    def cycle(self, mode):
        game = position(mode)
        game.board[2][2] = DWARF
        game.board[7][2] = ELF
        game.positions = [game.signature()]
        for _ in range(2):
            for a, b in (([2, 2], [2, 3]), ([7, 2], [7, 3]),
                         ([2, 3], [2, 2]), ([7, 3], [7, 2])):
                game.move(a, b)
                if game.status != 'active':
                    return game
        return game

    def test_threefold_fetlar_is_draw(self):
        game = self.cycle('fetlar')
        self.assertEqual(game.status, 'finished')
        self.assertIsNone(game.winner)
        self.assertEqual(game.reason, 'threefold')

    def test_threefold_copenhagen_loses_for_elves(self):
        game = self.cycle('copenhagen')
        self.assertEqual(game.status, 'finished')
        self.assertEqual(game.winner, 'dwarf')
        self.assertEqual(game.reason, 'threefold')

    def test_historical_repetition_review_rollback_ban(self):
        game = self.cycle('historical')
        self.assertEqual(game.status, 'paused')
        self.assertEqual(game.reason, 'repetition_review')
        self.assertEqual(len(game.history), 8)
        game.undo_repetition()
        self.assertEqual(game.turn, 'elf')
        self.assertEqual(game.status, 'active')
        self.assertEqual(len(game.history), 7)
        self.assertNotIn([7, 2], game.legal((7, 3)))
        self.assertIn([7, 4], game.legal((7, 3)))
        game.move([7, 3], [7, 4])
        self.assertIsNone(game.forbidden)

    def test_save_load_backward_and_new_fields(self):
        game = self.cycle('historical')
        clone = Game.from_dict(json.loads(json.dumps(game.as_dict())))
        self.assertEqual(clone.as_dict(), game.as_dict())
        old = game.as_dict()
        old.pop('forbidden')
        old.pop('draw_offer')
        self.assertIsNone(Game.from_dict(old).forbidden)


if __name__ == '__main__':
    unittest.main()
