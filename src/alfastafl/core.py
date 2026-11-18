"""Rule engine for Alfastafl's three 11x11 tafl variants.

References and interpretative limits are recorded in RULES.md.
The historical mode follows the selected Tawlbwrdd Bell reconstruction.
Fetlar deliberately follows the 2018 museum leaflet, not later online rules.
"""
from collections import deque
from dataclasses import dataclass, field
from typing import Optional
import uuid

SIZE = 11
CENTER = (5, 5)
CORNERS = {(0, 0), (0, 10), (10, 0), (10, 10)}
ELF, DWARF, KING, EMPTY = 'E', 'N', 'R', '.'
MODES = {'historical', 'fetlar', 'copenhagen'}
DIRECTIONS = ((1, 0), (-1, 0), (0, 1), (0, -1))


def in_board(r, c):
    return 0 <= r < SIZE and 0 <= c < SIZE


def coord(pos):
    return (isinstance(pos, (tuple, list)) and len(pos) == 2
            and all(type(value) is int for value in pos)
            and in_board(pos[0], pos[1]))


def adjacent(pos):
    r, c = pos
    return [(r + dr, c + dc) for dr, dc in DIRECTIONS if in_board(r + dr, c + dc)]


def team(piece):
    if piece in (KING, ELF):
        return 'elf'
    if piece == DWARF:
        return 'dwarf'
    return None


def other(side):
    return 'elf' if side == 'dwarf' else 'dwarf'


def initial_board(mode):
    if mode not in MODES:
        raise ValueError('Unknown mode')
    board = [[EMPTY] * SIZE for _ in range(SIZE)]
    board[5][5] = KING
    defenders = ((3, 5), (4, 4), (4, 5), (4, 6),
                 (5, 3), (5, 4), (5, 6), (5, 7),
                 (6, 4), (6, 5), (6, 6), (7, 5))
    for r, c in defenders:
        board[r][c] = ELF
    if mode == 'historical':
        top = ((0, 4), (0, 5), (0, 6), (1, 4), (1, 6), (2, 5))
    else:
        top = ((0, 3), (0, 4), (0, 5), (0, 6), (0, 7), (1, 5))
    for r, c in top:
        for rr, cc in {(r, c), (10 - r, 10 - c), (c, 10 - r), (10 - c, r)}:
            board[rr][cc] = DWARF
    assert sum(row.count(ELF) for row in board) == 12
    assert sum(row.count(DWARF) for row in board) == 24
    return board


def special_passable(mode, piece, pos):
    if piece != KING and pos == CENTER:
        return False
    if piece != KING and mode != 'historical' and pos in CORNERS:
        return False
    return True


@dataclass
class Game:
    mode: str = 'fetlar'
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    board: list = field(default_factory=list)
    turn: str = 'dwarf'
    history: list = field(default_factory=list)
    status: str = 'active'
    winner: Optional[str] = None
    reason: Optional[str] = None
    positions: list = field(default_factory=list)
    settings: dict = field(default_factory=dict)
    forbidden: Optional[dict] = None
    draw_offer: Optional[str] = None
    clock: Optional[dict] = None
    disconnect: Optional[dict] = None
    players: dict = field(default_factory=dict)
    events: list = field(default_factory=list)
    suspended_context: Optional[dict] = None

    def __post_init__(self):
        if self.mode not in MODES:
            raise ValueError('Unknown mode')
        if not self.board:
            self.board = initial_board(self.mode)
        if (len(self.board) != SIZE or any(not isinstance(row, list) or
                len(row) != SIZE or any(x not in (EMPTY, ELF, DWARF, KING) for x in row)
                for row in self.board)):
            raise ValueError('Bad board')
        if self.turn not in ('elf', 'dwarf'):
            raise ValueError('Bad turn')
        if self.status not in ('active', 'paused', 'finished'):
            raise ValueError('Bad status')
        if not self.positions:
            self.positions = [self.signature()]

    def signature(self):
        return ''.join(''.join(row) for row in self.board) + ':' + self.turn

    def _moves_for(self, start, side, ignore_forbidden=False):
        if not coord(start):
            return []
        r, c = start
        piece = self.board[r][c]
        if team(piece) != side:
            return []
        moves = []
        for dr, dc in DIRECTIONS:
            rr, cc = r + dr, c + dc
            while in_board(rr, cc) and self.board[rr][cc] == EMPTY:
                if special_passable(self.mode, piece, (rr, cc)):
                    if (ignore_forbidden or not self.forbidden or
                        self.forbidden.get('position') != self.signature() or
                        self.forbidden.get('from') != [r, c] or
                        self.forbidden.get('to') != [rr, cc]):
                        moves.append([rr, cc])
                rr += dr
                cc += dc
        return moves

    def legal(self, start):
        if self.status != 'active':
            return []
        return self._moves_for(start, self.turn)

    def can_move(self, side):
        return any(self._moves_for((r, c), side)
                   for r in range(SIZE) for c in range(SIZE)
                   if team(self.board[r][c]) == side)

    def hostile(self, pos, captured):
        """Whether the far jaw (piece or restricted square) is hostile to victim."""
        r, c = pos
        if not in_board(r, c):
            return False  # The ordinary board edge is never hostile.
        occupant = self.board[r][c]
        if occupant != EMPTY:
            return team(occupant) == other(team(captured))
        if (r, c) == CENTER:
            return True  # Empty throne is hostile to soldiers of either camp.
        return self.mode != 'historical' and (r, c) in CORNERS

    def king_position(self):
        for r, row in enumerate(self.board):
            for c, piece in enumerate(row):
                if piece == KING:
                    return (r, c)
        return None

    def king_captured(self, last_moved=None):
        """Check a *newly closed* trap, not a king's voluntary move into danger."""
        position = self.king_position()
        if position is None:
            return False
        if last_moved not in adjacent(position):
            return False
        r, c = position
        if self.mode == 'historical':
            if position == CENTER:
                return all(self.board[x][y] == DWARF for x, y in adjacent(position))
            if CENTER in adjacent(position):
                return all(self.board[x][y] == DWARF for x, y in adjacent(position)
                           if (x, y) != CENTER)
            return ((0 < r < 10 and last_moved in ((r - 1, c), (r + 1, c)) and
                     self.board[r - 1][c] == DWARF and self.board[r + 1][c] == DWARF) or
                    (0 < c < 10 and last_moved in ((r, c - 1), (r, c + 1)) and
                     self.board[r][c - 1] == DWARF and self.board[r][c + 1] == DWARF))
        if self.mode == 'copenhagen' and CENTER in adjacent(position):
            return (self.board[5][5] == EMPTY and
                    all(self.board[x][y] == DWARF for x, y in adjacent(position)
                        if (x, y) != CENTER))
        return (len(adjacent(position)) == 4 and
                all(self.board[x][y] == DWARF for x, y in adjacent(position)))

    def _edge(self, edge, index):
        if edge == 0:
            return (0, index), (1, index)
        if edge == 1:
            return (10, index), (9, index)
        if edge == 2:
            return (index, 0), (index, 1)
        return (index, 10), (index, 9)

    def _shieldwall_captures(self, moving_to, moving_side):
        if self.mode != 'copenhagen':
            return []
        captures = []
        opposing = other(moving_side)
        for edge in range(4):
            i = 0
            while i < SIZE:
                place, _ = self._edge(edge, i)
                if team(self.board[place[0]][place[1]]) != opposing:
                    i += 1
                    continue
                start = i
                while i < SIZE:
                    p, _ = self._edge(edge, i)
                    if team(self.board[p[0]][p[1]]) != opposing:
                        break
                    i += 1
                end = i - 1
                if end - start + 1 < 2 or start < 1 or end > 9:
                    continue
                left, _ = self._edge(edge, start - 1)
                right, _ = self._edge(edge, end + 1)
                # Copenhagen requires a *flanking* move, not one from the front.
                if moving_to not in (left, right):
                    continue
                if not all(self.hostile(p, self.board[self._edge(edge, start)[0][0]]
                                              [self._edge(edge, start)[0][1]])
                           for p in (left, right)):
                    continue
                valid = True
                for index in range(start, end + 1):
                    _, front = self._edge(edge, index)
                    if team(self.board[front[0]][front[1]]) != moving_side:
                        valid = False
                        break
                if valid:
                    for index in range(start, end + 1):
                        p, _ = self._edge(edge, index)
                        if self.board[p[0]][p[1]] != KING:
                            captures.append(p)
        return sorted(set(captures))

    def _enclosed_all_defenders(self):
        """Enemy ring cuts every surviving defender off from the outer edge."""
        defenders = {(r, c) for r in range(SIZE) for c in range(SIZE)
                     if team(self.board[r][c]) == 'elf'}
        if not defenders or self.king_position() is None:
            return False
        seen = set()
        queue = deque()
        for i in range(SIZE):
            for pos in {(0, i), (10, i), (i, 0), (i, 10)}:
                if self.board[pos[0]][pos[1]] != DWARF and pos not in seen:
                    seen.add(pos)
                    queue.append(pos)
        while queue:
            pos = queue.popleft()
            if pos in defenders:
                return False
            for nxt in adjacent(pos):
                if nxt not in seen and self.board[nxt[0]][nxt[1]] != DWARF:
                    seen.add(nxt)
                    queue.append(nxt)
        return True

    def _exit_fort(self):
        """Conservative check: two documented unbreakable edge-fort formations.

        This recognizes rotations, reflections and translations of the two
        Copenhagen reference diagrams. It intentionally avoids false wins
        for arbitrary purported fortresses requiring tactical adjudication.
        """
        if self.mode != 'copenhagen':
            return False
        king = self.king_position()
        if king is None or not any(x in (0, 10) for x in king):
            return False
        # Canonical diagrams from Copenhagen rules, oriented along bottom edge.
        patterns = (
            ((10, 4), ((10, 3), (10, 6), (9, 4), (9, 5)), (10, 5)),
            ((10, 5), ((10, 4), (10, 6), (9, 4), (9, 6), (8, 4), (8, 5)), (9, 5)),
        )
        for base_king, guards, pocket in patterns:
            for shift in range(-5, 6):
                for flip in (False, True):
                    for turns in range(4):
                        def transform(point):
                            r, c = point
                            c += shift
                            if flip:
                                c = 10 - c
                            for _ in range(turns):
                                r, c = c, 10 - r
                            return r, c
                        k = transform(base_king)
                        if k != king:
                            continue
                        wall = [transform(p) for p in guards]
                        vacancy = transform(pocket)
                        if (all(in_board(*p) and self.board[p[0]][p[1]] == ELF
                                for p in wall) and in_board(*vacancy)
                                and self.board[vacancy[0]][vacancy[1]] == EMPTY
                                and vacancy in adjacent(king)):
                            return True
        return False

    def move(self, start, end):
        if self.status != 'active':
            raise ValueError('Game not active')
        if not coord(start) or not coord(end):
            raise ValueError('Invalid coordinates')
        sr, sc = start
        er, ec = end
        if [er, ec] not in self.legal((sr, sc)):
            raise ValueError('Illegal move')
        moving = self.board[sr][sc]
        side = team(moving)
        self.board[sr][sc] = EMPTY
        self.board[er][ec] = moving
        captured = []
        for dr, dc in DIRECTIONS:
            tr, tc = er + dr, ec + dc
            if not in_board(tr, tc):
                continue
            victim = self.board[tr][tc]
            if victim in (EMPTY, KING) or team(victim) == side:
                continue
            if self.hostile((tr + dr, tc + dc), victim):
                captured.append((tr, tc))
        for p in self._shieldwall_captures((er, ec), side):
            captured.append(p)
        captured = sorted(set(captured))
        removed = [[r, c, self.board[r][c]] for r, c in captured]
        for r, c in captured:
            self.board[r][c] = EMPTY
        self.turn = other(self.turn)
        self.draw_offer = None
        self.forbidden = None
        win, reason = None, None
        if moving == KING and (self.mode == 'historical' and
                              (er in (0, 10) or ec in (0, 10)) or
                              self.mode != 'historical' and (er, ec) in CORNERS):
            win, reason = 'elf', 'escape'
        elif moving == DWARF and self.king_captured((er, ec)):
            win, reason = 'dwarf', 'king_captured'
        elif self.mode in ('historical', 'copenhagen') and self._enclosed_all_defenders():
            win, reason = 'dwarf', 'encirclement'
        elif self._exit_fort():
            win, reason = 'elf', 'exit_fort'
        if win:
            self.winner, self.status, self.reason = win, 'finished', reason
        elif not self.can_move(self.turn):
            self.winner = None if self.mode == 'fetlar' else side
            self.status = 'finished'
            self.reason = 'stalemate'
        signature = self.signature()
        occurrence = self.positions.count(signature) + 1
        self.positions.append(signature)
        if occurrence >= 3 and self.status == 'active':
            if self.mode == 'fetlar':
                self.status, self.winner, self.reason = 'finished', None, 'threefold'
            elif self.mode == 'copenhagen':
                self.status, self.winner, self.reason = 'finished', 'dwarf', 'threefold'
            else:
                self.status, self.winner, self.reason = 'paused', None, 'repetition_review'
        record = {'n': len(self.history) + 1, 'from': [sr, sc], 'to': [er, ec],
                  'piece': moving, 'captured': removed, 'status': self.status,
                  'winner': self.winner, 'reason': self.reason}
        self.history.append(record)
        return record

    def undo_repetition(self):
        if self.mode != 'historical' or self.status != 'paused' or self.reason != 'repetition_review':
            raise ValueError('No historical repetition review in progress')
        last = self.history.pop()
        sr, sc = last['from']
        er, ec = last['to']
        self.board[sr][sc] = self.board[er][ec]
        self.board[er][ec] = EMPTY
        for r, c, piece in last['captured']:
            self.board[r][c] = piece
        self.positions.pop()
        self.turn = team(last['piece'])
        self.status, self.winner, self.reason = 'active', None, None
        self.forbidden = {'position': self.signature(), 'from': [sr, sc], 'to': [er, ec]}
        if not self.can_move(self.turn):
            self.status, self.reason = 'paused', 'draw_proposal'
        return last

    def resolve_repetition(self, outcome):
        if self.mode != 'historical' or self.status != 'paused' or self.reason != 'repetition_review':
            raise ValueError('No repetition review in progress')
        if outcome not in ('dwarf', 'elf', 'draw'):
            raise ValueError('Invalid repetition verdict')
        self.winner = None if outcome == 'draw' else outcome
        self.status, self.reason = 'finished', 'repetition_agreed'

    def as_dict(self):
        return {'version': 3, 'id': self.id, 'mode': self.mode, 'board': self.board,
                'turn': self.turn, 'history': self.history, 'status': self.status,
                'winner': self.winner, 'reason': self.reason, 'positions': self.positions,
                'settings': self.settings, 'forbidden': self.forbidden,
                'draw_offer': self.draw_offer, 'clock': self.clock,
                'disconnect': self.disconnect, 'players': self.players, 'events': self.events,
                'suspended_context': self.suspended_context}

    @classmethod
    def from_dict(cls, data):
        return cls(**{key: data[key] for key in ('id', 'mode', 'board', 'turn', 'history',
                    'status', 'winner', 'reason', 'positions', 'settings', 'forbidden',
                    'draw_offer', 'clock', 'disconnect', 'players', 'events',
                    'suspended_context') if key in data})
