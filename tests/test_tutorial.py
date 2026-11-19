"""Exercises teach real legal moves without retaining or sharing a game state."""
import copy
import json
import unittest

from alfastafl.core import DWARF, ELF, EMPTY, KING
from alfastafl.tutorial import SOLUTIONS, lesson_state, legal_moves, play_move


class TutorialCatalogueTests(unittest.TestCase):
    def test_first_exercise_has_the_real_starting_camps_and_first_player(self):
        for mode, count in (('historical', 9), ('fetlar', 9), ('copenhagen', 10)):
            with self.subTest(mode=mode):
                state = lesson_state(mode)
                pieces = [piece for row in state['board'] for piece in row]
                self.assertEqual(pieces.count(DWARF), 24)
                self.assertEqual(pieces.count(ELF), 12)
                self.assertEqual(pieces.count(KING), 1)
                self.assertEqual(state['board'][5][5], KING)
                self.assertEqual(state['camp'], 'dwarf')
                self.assertEqual(state['lesson'], 'first_move')
                self.assertEqual(state['lesson_index'], 0)
                self.assertEqual(state['lesson_count'], count)
                self.assertEqual(len({item['id'] for item in state['lessons']}), count)
                self.assertFalse(state['completed'])

    def test_all_reference_solutions_are_legal_and_finish_the_exercise(self):
        for mode, solutions in SOLUTIONS.items():
            for index, (lesson, (start, end)) in enumerate(solutions.items()):
                with self.subTest(mode=mode, lesson=lesson):
                    initial = lesson_state(mode, lesson)
                    self.assertEqual(initial['lesson_index'], index)
                    self.assertIn(list(end), legal_moves(mode, lesson, start))
                    result = play_move(mode, lesson, start, end)
                    self.assertTrue(result['completed'], result['feedback'])
                    self.assertEqual(result['feedback_kind'], 'success')
                    self.assertEqual(result['board'][start[0]][start[1]], EMPTY)
                    self.assertEqual(result['board'][end[0]][end[1]], initial['board'][start[0]][start[1]])
                    self.assertEqual(result['last_move']['from'], list(start))
                    self.assertEqual(result['last_move']['to'], list(end))
                    self.assertEqual(result['last_move']['n'], 1)
                    self.assertEqual(lesson_state(mode, lesson), initial)
                    # Every state can be returned directly as a JSON payload.
                    json.dumps(result, ensure_ascii=False)

    def test_all_states_provide_the_navigation_and_learning_contract(self):
        fields = {'mode', 'mode_label', 'lesson', 'lesson_index', 'lesson_count',
                  'lessons', 'title', 'explanation', 'objective', 'camp', 'board',
                  'focus', 'targets', 'hint', 'completed', 'feedback',
                  'feedback_kind', 'last_move', 'rules', 'sources', 'limitations'}
        for mode, solutions in SOLUTIONS.items():
            for lesson in solutions:
                with self.subTest(mode=mode, lesson=lesson):
                    state = lesson_state(mode, lesson)
                    self.assertEqual(set(state), fields)
                    self.assertEqual(len(state['board']), 11)
                    self.assertTrue(all(len(row) == 11 for row in state['board']))
                    for field in ('explanation', 'lessons', 'focus', 'targets', 'rules', 'sources', 'limitations'):
                        self.assertIsInstance(state[field], list)
                        self.assertTrue(state[field])
                    self.assertIn(state['camp'], ('dwarf', 'elf'))
                    self.assertTrue(all(source['url'].startswith('https://aagenielsen.dk/')
                                        for source in state['sources']))

    def test_changing_returned_metadata_cannot_corrupt_the_catalogue(self):
        for mode in SOLUTIONS:
            original = lesson_state(mode, 'capture')
            changed = lesson_state(mode, 'capture')
            changed['board'][4][2] = EMPTY
            changed['focus'][0][0] = 0
            changed['targets'][0][1] = 0
            changed['explanation'].clear()
            changed['rules'][0]['text'] = 'changed'
            changed['lessons'][0]['title'] = 'changed'
            changed['sources'][0]['url'] = 'https://invalid.example/'
            changed['limitations'].clear()
            self.assertEqual(lesson_state(mode, 'capture'), original)


class TutorialMoveTests(unittest.TestCase):
    def test_a_legal_move_outside_the_objective_restarts_the_position(self):
        initial = lesson_state('fetlar', 'movement')
        self.assertIn([3, 2], legal_moves('fetlar', 'movement', [4, 2]))
        result = play_move('fetlar', 'movement', [4, 2], [3, 2])
        self.assertFalse(result['completed'])
        self.assertEqual(result['feedback_kind'], 'info')
        self.assertIn('légal', result['feedback'])
        self.assertEqual(result['board'], initial['board'])
        self.assertIsNone(result['last_move'])
        self.assertTrue(play_move('fetlar', 'movement', [4, 2], [4, 7])['completed'])

    def test_illegal_moves_are_explained_without_changing_the_board(self):
        cases = (
            ('movement', [4, 2], [5, 3], 'diagonale'),
            ('blocking', [2, 2], [2, 6], 'bloque'),
            ('blocking', [2, 2], [6, 2], 'bloque'),
            ('blocking', [2, 2], [2, 4], 'occupée'),
            ('movement', [4, 2], [4, 2], 'changer de case'),
            ('capture', [4, 4], [3, 4], 'camp des nains'),
            ('movement', [0, 0], [0, 1], 'vide'),
            ('throne', [5, 2], [5, 5], 'trône'),
            ('first_move', [0, 3], [0, 0], 'coins'),
        )
        for lesson, start, end, explanation in cases:
            with self.subTest(lesson=lesson, start=start, end=end):
                initial = lesson_state('fetlar', lesson)
                result = play_move('fetlar', lesson, start, end)
                self.assertFalse(result['completed'])
                self.assertEqual(result['feedback_kind'], 'error')
                self.assertIn(explanation, result['feedback'])
                self.assertEqual(result['board'], initial['board'])
                self.assertIsNone(result['last_move'])

    def test_a_soldier_can_cross_but_not_stop_on_the_empty_throne(self):
        for mode in SOLUTIONS:
            moves = legal_moves(mode, 'throne', [5, 2])
            self.assertIn([5, 8], moves)
            self.assertNotIn([5, 5], moves)
            self.assertTrue(play_move(mode, 'throne', [5, 2], [5, 8])['completed'])

    def test_corner_restriction_depends_on_the_variant(self):
        self.assertIn([0, 0], legal_moves('historical', 'first_move', [0, 4]))
        for mode in ('fetlar', 'copenhagen'):
            self.assertNotIn([0, 0], legal_moves(mode, 'first_move', [0, 3]))

    def test_only_pieces_of_the_exercise_camp_offer_legal_destinations(self):
        for mode in SOLUTIONS:
            self.assertEqual(legal_moves(mode, 'first_move', [5, 5]), [])
            self.assertEqual(legal_moves(mode, 'movement', [0, 0]), [])
            self.assertEqual(legal_moves(mode, 'safe_entry', [2, 1]), [])
            self.assertIn([2, 2], legal_moves(mode, 'safe_entry', [1, 2]))

    def test_regular_and_throne_captures_remove_the_expected_soldier(self):
        for mode in SOLUTIONS:
            for lesson, victim in (('capture', [4, 4, ELF]), ('hostile_square', [5, 4, ELF])):
                with self.subTest(mode=mode, lesson=lesson):
                    start, end = SOLUTIONS[mode][lesson]
                    result = play_move(mode, lesson, start, end)
                    self.assertEqual(result['last_move']['captured'], [victim])
                    self.assertEqual(result['board'][victim[0]][victim[1]], EMPTY)
                    self.assertEqual(result['last_move']['status'], 'active')

    def test_voluntary_entry_does_not_capture_the_elf(self):
        for mode in SOLUTIONS:
            start, end = SOLUTIONS[mode]['safe_entry']
            result = play_move(mode, 'safe_entry', start, end)
            self.assertTrue(result['completed'])
            self.assertEqual(result['board'][2][1:4], [DWARF, ELF, DWARF])
            self.assertEqual(result['last_move']['captured'], [])
            self.assertEqual(result['last_move']['status'], 'active')

    def test_escape_uses_the_variant_and_accepts_another_winning_exit(self):
        historical = play_move('historical', 'escape', [1, 5], [1, 0])
        self.assertTrue(historical['completed'])
        self.assertEqual(historical['last_move']['reason'], 'escape')
        self.assertEqual(historical['last_move']['winner'], 'elf')
        for mode in ('fetlar', 'copenhagen'):
            ordinary_edge = play_move(mode, 'escape', [0, 3], [0, 7])
            self.assertFalse(ordinary_edge['completed'])
            self.assertEqual(ordinary_edge['feedback_kind'], 'info')
            other_corner = play_move(mode, 'escape', [0, 3], [0, 10])
            self.assertTrue(other_corner['completed'])
            self.assertEqual(other_corner['last_move']['reason'], 'escape')
            self.assertEqual(other_corner['last_move']['winner'], 'elf')

    def test_king_capture_exercises_produce_a_real_attacker_victory(self):
        for mode in SOLUTIONS:
            start, end = SOLUTIONS[mode]['king_capture']
            result = play_move(mode, 'king_capture', start, end)
            self.assertTrue(result['completed'])
            self.assertEqual(result['last_move']['status'], 'finished')
            self.assertEqual(result['last_move']['winner'], 'dwarf')
            self.assertEqual(result['last_move']['reason'], 'king_captured')

    def test_shieldwall_is_only_offered_in_copenhagen_and_captures_the_group(self):
        for mode in ('historical', 'fetlar'):
            self.assertNotIn('shieldwall', SOLUTIONS[mode])
            with self.assertRaises(ValueError):
                lesson_state(mode, 'shieldwall')
        start, end = SOLUTIONS['copenhagen']['shieldwall']
        result = play_move('copenhagen', 'shieldwall', start, end)
        self.assertEqual(result['last_move']['captured'], [[0, 4, ELF], [0, 5, ELF]])
        self.assertEqual(result['board'][5][5], KING)


class TutorialValidationTests(unittest.TestCase):
    def test_unknown_modes_and_lesson_identifiers_are_rejected(self):
        for mode in (None, '', 'Fetlar', 'unknown', [], {}, True, 1):
            with self.subTest(mode=mode), self.assertRaises(ValueError):
                lesson_state(mode)
        for lesson in ('', 'unknown', '../capture', [], {}, True, 0, 1.0):
            with self.subTest(lesson=lesson):
                for call in (lambda: lesson_state('fetlar', lesson),
                             lambda: legal_moves('fetlar', lesson, [4, 2]),
                             lambda: play_move('fetlar', lesson, [4, 2], [4, 3])):
                    with self.assertRaises(ValueError):
                        call()

    def test_malformed_coordinates_are_rejected_instead_of_coerced(self):
        bad_coordinates = (None, [], [0], [0, 0, 0], '4,2', {'row': 4, 'col': 2},
                           [-1, 0], [11, 0], [0, 11], [True, 2], [4, False], [4.0, 2], ['4', 2])
        before = copy.deepcopy(lesson_state('fetlar', 'capture'))
        for position in bad_coordinates:
            with self.subTest(position=position):
                for call in (lambda: legal_moves('fetlar', 'capture', position),
                             lambda: play_move('fetlar', 'capture', position, [4, 3]),
                             lambda: play_move('fetlar', 'capture', [4, 2], position)):
                    with self.assertRaises(ValueError):
                        call()
                self.assertEqual(lesson_state('fetlar', 'capture'), before)


if __name__ == '__main__':
    unittest.main()
