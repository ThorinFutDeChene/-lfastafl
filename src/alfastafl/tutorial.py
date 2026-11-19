"""Local learning exercises evaluated by the real game engine.

Exercises are stateless: every request builds a fresh position. They never
create a hosted game, an invitation, a player session or a saved game.
The HTTP layer is responsible for limiting access to the host computer.
"""
from dataclasses import dataclass

from .core import CENTER, CORNERS, DWARF, ELF, EMPTY, KING, Game, coord, team


MODE_NAMES = {
    'historical': 'Historique · Tawlbwrdd',
    'fetlar': 'Classique · Fetlar 2018',
    'copenhagen': 'Compétition · Copenhague',
}

_SOURCES = {
    'historical': (
        ('Tawlbwrdd : reconstruction historique', 'https://aagenielsen.dk/tawlbwrdd_summary.php'),
        ('Règles historiques illustrées', 'https://aagenielsen.dk/TaflRulesEnglish.pdf'),
    ),
    'fetlar': (
        ('Fetlar Museum Trust : règles de 2018', 'https://aagenielsen.dk/fetlar_rules2018visual.pdf'),
    ),
    'copenhagen': (
        ('Règles de Copenhague', 'https://aagenielsen.dk/copenhagen_rules.php'),
        ('Règles de Copenhague illustrées', 'https://aagenielsen.dk/Copenhagen_Hnefatafl_11x11.pdf'),
    ),
}


@dataclass(frozen=True)
class _Lesson:
    id: str
    title: str
    explanation: tuple
    objective: str
    start: tuple
    end: tuple
    pieces: tuple | None
    success: str
    camp: str = 'dwarf'
    goal: str = 'destination'
    victims: tuple = ()


def _square(position):
    row, column = position
    return f'{chr(65 + column)}{11 - row}'


def _position(king, *pieces):
    return ((king[0], king[1], KING),) + pieces


def _lessons(mode):
    first_start, first_end = ((0, 4), (0, 2)) if mode == 'historical' else ((0, 3), (2, 3))
    result = [
        _Lesson(
            'first_move', 'Les camps et le premier coup',
            ('Les 24 nains attaquent. Les 12 elfes protègent leur roi, reconnaissable à sa couronne.',
             'Les nains commencent. À chaque tour, un joueur déplace une seule pièce de son camp.'),
            f'Déplacez le nain de {_square(first_start)} vers {_square(first_end)}.',
            first_start, first_end, None,
            'Premier coup réussi : ce serait maintenant au camp des elfes de jouer.'),
        _Lesson(
            'movement', 'Se déplacer en ligne droite',
            ('Le roi et les soldats se déplacent horizontalement ou verticalement, du nombre de cases libres souhaité.',
             'Les diagonales sont interdites. Les exercices suivants utilisent des positions réduites pour isoler chaque règle.'),
            'Déplacez le nain de C7 vers H7, sur la même ligne.',
            (4, 2), (4, 7), _position((7, 7), (4, 2, DWARF)),
            'Vous avez parcouru plusieurs cases libres en un seul déplacement horizontal.'),
        _Lesson(
            'blocking', 'Les pièces bloquent le passage',
            ('Aucune pièce ne peut sauter par-dessus une autre, amie ou ennemie.',
             'On ne peut pas non plus terminer un déplacement sur une case occupée. Une prise se fait par encadrement.'),
            'Avancez le nain de C9 vers D9, juste avant le nain qui bloque la ligne en E9.',
            (2, 2), (2, 3), _position((7, 7), (2, 2, DWARF), (2, 4, DWARF), (4, 2, ELF)),
            'Vous vous êtes arrêté avant la pièce qui bloque la ligne. Amis et ennemis sont des obstacles.'),
        _Lesson(
            'throne', 'Traverser le trône vide',
            ('La case centrale F6 est le trône. Seul le roi peut y terminer un déplacement.',
             'Un soldat peut traverser le trône lorsqu’il est vide, si toute la trajectoire est libre.'),
            'Déplacez le nain de C6 vers I6 en traversant le trône vide F6.',
            (5, 2), (5, 8), _position((7, 7), (5, 2, DWARF)),
            'Le passage par le trône vide est autorisé ; s’y arrêter avec un soldat ne le serait pas.'),
        _Lesson(
            'capture', 'Prendre un soldat par encadrement',
            ('Pour prendre un soldat adverse, fermez un encadrement entre votre pièce déplacée et une pièce de votre camp.',
             'Les deux pièces doivent toucher la victime sur deux côtés opposés : gauche et droite, ou haut et bas.'),
            'Avec le nain de C7, capturez l’elfe de E7 en rejoignant D7.',
            (4, 2), (4, 3), _position((7, 7), (4, 2, DWARF), (4, 4, ELF), (4, 5, DWARF)),
            'L’elfe de E7 est pris entre les nains de D7 et F7 et retiré du plateau.',
            goal='capture', victims=((4, 4),)),
        _Lesson(
            'hostile_square', 'Utiliser le trône pour capturer',
            ('Le trône vide peut remplacer la seconde pièce d’un encadrement contre un soldat de l’un ou l’autre camp.',
             'Un bord ordinaire du plateau ne permet pas, à lui seul, de prendre une pièce.'),
            'Déplacez le nain de D8 vers D6 pour prendre l’elfe de E6 contre le trône vide F6.',
            (3, 3), (5, 3), _position((7, 7), (3, 3, DWARF), (5, 4, ELF)),
            'L’elfe est encadré entre votre nain et le trône vide : il est capturé.',
            goal='capture', victims=((5, 4),)),
        _Lesson(
            'safe_entry', 'Entrer entre deux ennemis',
            ('Une prise se produit lorsque l’adversaire ferme le piège par son déplacement.',
             'Entrer volontairement entre deux ennemis ne retire donc pas votre pièce. Cela peut néanmoins être dangereux aux tours suivants.'),
            'Déplacez l’elfe de C10 vers C9, entre les deux nains.',
            (1, 2), (2, 2), _position((7, 7), (1, 2, ELF), (2, 1, DWARF), (2, 3, DWARF)),
            'L’elfe reste sur C9 : vous êtes entré dans l’encadrement, aucun adversaire ne vient de le fermer.',
            camp='elf', goal='survive'),
    ]
    if mode == 'historical':
        result.extend((
            _Lesson(
                'escape', 'Faire sortir le roi par un bord',
                ('Dans la reconstruction historique Tawlbwrdd utilisée ici, le roi gagne dès qu’il atteint une case du bord.',
                 'Les coins ne sont pas réservés au roi dans cette variante.'),
                'Faites s’échapper le roi de F10. La sortie la plus proche est F11.',
                (1, 5), (0, 5), _position((1, 5), (7, 7, DWARF)),
                'Le roi a atteint un bord : le camp des elfes remporte la partie.',
                camp='elf', goal='escape'),
            _Lesson(
                'king_capture', 'Capturer le roi historique',
                ('Loin du trône, le roi historique est pris entre deux nains opposés.',
                 'Sur le trône, il faut quatre nains ; juste à côté, il faut trois nains et le trône vide.'),
                'Déplacez le nain de I5 vers H5 pour encadrer le roi de G5 avec le nain de F5.',
                (6, 8), (6, 7), _position((6, 6), (6, 5, DWARF), (6, 8, DWARF)),
                'Le piège vient d’être fermé sur deux côtés opposés : les nains gagnent.',
                goal='king_capture'),
        ))
    else:
        result.append(_Lesson(
            'escape', 'Conduire le roi jusqu’à un coin',
            ('Dans cette variante, le roi doit atteindre l’un des quatre coins pour s’échapper. Un autre emplacement du bord ne suffit pas.',
             'Seul le roi peut occuper les coins.'),
            'Faites s’échapper le roi de D11 en rejoignant un coin, par exemple A11.',
            (0, 3), (0, 0), _position((0, 3), (7, 7, DWARF)),
            'Le roi a atteint un coin : le camp des elfes remporte la partie.',
            camp='elf', goal='escape'))
        if mode == 'fetlar':
            result.append(_Lesson(
                'king_capture', 'Capturer le roi à Fetlar',
                ('À Fetlar 2018, il faut fermer les quatre côtés du roi avec quatre nains pour le capturer.',
                 'Le trône vide ne remplace pas un attaquant. Le roi ne peut pas être capturé sur le bord.'),
                'Déplacez le nain de I5 vers H5 pour fermer le quatrième côté du roi de G5.',
                (6, 8), (6, 7), _position((6, 6), (5, 6, DWARF), (7, 6, DWARF), (6, 5, DWARF), (6, 8, DWARF)),
                'Les quatre côtés sont fermés par des nains : le roi est capturé.',
                goal='king_capture'))
        else:
            result.extend((
                _Lesson(
                    'king_capture', 'Capturer le roi près du trône',
                    ('À Copenhague, le roi est normalement capturé sur quatre côtés par des nains.',
                     'Près du trône vide, celui-ci remplace un attaquant : trois nains suffisent. Le roi n’est pas capturable sur le bord.'),
                    'Déplacez le nain de B6 vers D6 pour fermer le piège autour du roi de E6.',
                    (5, 1), (5, 3), _position((5, 4), (4, 4, DWARF), (6, 4, DWARF), (5, 1, DWARF)),
                    'Les trois nains et le trône vide ferment les quatre côtés du roi : les nains gagnent.',
                    goal='king_capture'),
                _Lesson(
                    'shieldwall', 'Fermer un mur de boucliers',
                    ('À Copenhague, un groupe d’au moins deux soldats ennemis sur le bord peut être pris si ses deux extrémités et tout son front sont fermés.',
                     'Le coup final doit fermer une extrémité du groupe. Le roi est immunisé contre cette prise collective.'),
                    'Déplacez le nain de G9 vers G11 pour capturer ensemble les elfes de E11 et F11.',
                    (2, 6), (0, 6), _position((5, 5), (0, 4, ELF), (0, 5, ELF),
                                             (0, 3, DWARF), (1, 4, DWARF), (1, 5, DWARF), (2, 6, DWARF)),
                    'Vous avez fermé le flanc droit du mur de boucliers : les deux elfes sont capturés.',
                    goal='capture', victims=((0, 4), (0, 5))),
            ))
    return tuple(result)


_CATALOGUE = {mode: _lessons(mode) for mode in MODE_NAMES}
# Reference solutions for regression and integration checks, never used to
# calculate the list of legal moves: that always comes from Game.legal().
SOLUTIONS = {
    mode: {lesson.id: (lesson.start, lesson.end) for lesson in lessons}
    for mode, lessons in _CATALOGUE.items()
}


def _select(mode, lesson):
    if not isinstance(mode, str) or mode not in _CATALOGUE:
        raise ValueError('Variante de règles inconnue.')
    lessons = _CATALOGUE[mode]
    if lesson is None:
        return lessons, lessons[0]
    if not isinstance(lesson, str):
        raise ValueError('Exercice inconnu.')
    for item in lessons:
        if item.id == lesson:
            return lessons, item
    raise ValueError('Exercice inconnu pour cette variante.')


def _game(mode, lesson):
    if lesson.pieces is None:
        return Game(mode=mode, turn=lesson.camp)
    board = [[EMPTY] * 11 for _ in range(11)]
    for row, column, piece in lesson.pieces:
        board[row][column] = piece
    return Game(mode=mode, board=board, turn=lesson.camp)


def _rules(mode):
    rules = [
        ('Les deux camps', '24 nains attaquent 12 elfes et leur roi. Les nains jouent en premier ; les camps alternent ensuite un déplacement chacun.'),
        ('Déplacements', 'Toutes les pièces avancent en ligne horizontale ou verticale sur des cases libres, sans saut ni déplacement diagonal.'),
        ('Trône', 'Seul le roi peut s’arrêter sur le trône central F6. Toute pièce peut le traverser lorsqu’il est vide.'),
        ('Capture des soldats', 'Un soldat est pris lorsque l’adversaire ferme un encadrement sur deux côtés opposés. Le roi participe aussi aux prises. Entrer volontairement entre deux ennemis ne provoque pas de capture immédiate.'),
        ('Cases hostiles', 'Le trône vide peut servir à prendre un soldat de chaque camp. Occupé par le roi, il protège les elfes et peut aider à prendre les nains. Un bord ordinaire ne sert pas de seconde mâchoire.'),
    ]
    if mode == 'historical':
        rules.extend((
            ('Sortie du roi', 'Le roi gagne dès qu’il atteint n’importe quelle case du bord. Les coins restent des cases ordinaires pour les soldats.'),
            ('Capture du roi', 'Deux nains opposés suffisent loin du trône. Sur le trône, il en faut quatre ; à côté du trône vide, trois. Un nain doit fermer le piège par son déplacement.'),
            ('Encerclement et blocage', 'Les nains gagnent si tous les défenseurs, roi compris, sont coupés du bord. Un camp qui ne dispose d’aucun coup légal perd.'),
            ('Répétitions', 'À la troisième position identique avec le même camp au trait, Álfastafl suspend la partie pour un accord des joueurs. En cas de désaccord, le dernier coup est annulé et temporairement interdit : c’est une convention du logiciel pour cette reconstruction historique.'),
        ))
    else:
        rules.append(('Coins et sortie', 'Seul le roi peut occuper un coin ; atteindre un coin lui donne la victoire. Un coin vide peut aider à capturer un soldat de chaque camp.'))
        if mode == 'fetlar':
            rules.extend((
                ('Capture du roi', 'Quatre nains doivent fermer ses quatre côtés. Le trône vide ne remplace pas un nain et le roi n’est pas capturable sur le bord.'),
                ('Parties nulles', 'La troisième position identique avec le même camp au trait, ou l’absence de coup légal pour le joueur au trait, donne une partie nulle.'),
                ('Pas de prise collective', 'Le mur de boucliers de Copenhague et sa victoire par encerclement ne s’appliquent pas à Fetlar 2018.'),
            ))
        else:
            rules.extend((
                ('Capture du roi', 'Quatre nains doivent fermer ses côtés, ou trois nains avec le trône vide sur le quatrième côté. Le roi n’est pas capturable sur le bord.'),
                ('Mur de boucliers', 'Au moins deux soldats ennemis contigus au bord sont pris si les extrémités et le front sont fermés. Le dernier coup doit fermer un flanc. Le roi lui-même n’est pas retiré par cette prise.'),
                ('Autres victoires', 'Les nains gagnent si tous les défenseurs sont coupés du bord. Une forteresse de sortie peut faire gagner le roi sur le bord s’il peut encore bouger et ne peut plus être pris.'),
                ('Blocage et répétitions', 'Un camp sans coup légal perd. Une troisième position identique avec le même camp au trait entraîne la défaite des elfes.'),
            ))
    rules.append(('Accord des joueurs', 'Une partie nulle peut être convenue entre les deux joueurs ; un joueur peut également abandonner.'))
    return [{'title': title, 'text': text} for title, text in rules]


def _limitations(mode):
    if mode == 'copenhagen':
        return ['La reconnaissance automatique des forteresses de sortie reste limitée aux deux formations de référence implémentées. Les forteresses atypiques demandent encore un travail de règles et d’arbitrage.']
    if mode == 'fetlar':
        return ['Toutes les positions théoriquement impossibles à terminer ne sont pas détectées automatiquement. Les joueurs peuvent convenir d’une partie nulle.']
    return ['Le mode historique est une reconstruction. L’arbitrage de la troisième répétition décrit ici est une convention d’Álfastafl, pas une règle viking historiquement certaine.']


def lesson_state(mode, lesson=None):
    """Return a fresh lesson and its initial position; no persistent state."""
    lessons, item = _select(mode, lesson)
    return {
        'mode': mode, 'mode_label': MODE_NAMES[mode],
        'lesson': item.id, 'lesson_index': lessons.index(item),
        'lesson_count': len(lessons),
        'lessons': [{'id': entry.id, 'title': entry.title} for entry in lessons],
        'title': item.title, 'explanation': list(item.explanation),
        'objective': item.objective, 'camp': item.camp,
        'board': _game(mode, item).board,
        'focus': [list(item.start)], 'targets': [list(item.end)],
        'hint': f'Sélectionnez la pièce en {_square(item.start)}, puis la case {_square(item.end)}.',
        'completed': False, 'feedback': '', 'feedback_kind': 'info',
        'last_move': None, 'rules': _rules(mode),
        'sources': [{'title': title, 'url': url} for title, url in _SOURCES[mode]],
        'limitations': _limitations(mode),
    }


def _coordinate(value):
    if not coord(value):
        raise ValueError('Case invalide : utilisez deux entiers de 0 à 10.')
    return tuple(value)


def legal_moves(mode, lesson, start):
    """List the engine's legal destinations for the chosen lesson piece."""
    _, item = _select(mode, lesson)
    start = _coordinate(start)
    return _game(mode, item).legal(start)


def legal_details(mode, lesson, start):
    """Return legal and capturing destinations from an isolated exercise board."""
    _, item = _select(mode, lesson)
    start = _coordinate(start)
    game = _game(mode, item)
    moves = game.legal(start)
    return {'moves': moves, 'captures': game.capture_destinations(start, moves)}


def _illegal_feedback(game, start, end):
    piece = game.board[start[0]][start[1]]
    if piece == EMPTY:
        return 'La case de départ est vide. Sélectionnez une pièce de votre camp.'
    if team(piece) != game.turn:
        side = 'nains' if game.turn == 'dwarf' else 'elfes'
        return f'Cet exercice se joue avec le camp des {side}. Choisissez une pièce de ce camp.'
    if start == end:
        return 'Un déplacement doit changer de case. Choisissez une destination.'
    if game.board[end[0]][end[1]] != EMPTY:
        return f'La case {_square(end)} est occupée. On capture par encadrement, sans remplacer la pièce adverse.'
    if start[0] != end[0] and start[1] != end[1]:
        return 'Une pièce se déplace horizontalement ou verticalement, jamais en diagonale.'
    dr = (end[0] > start[0]) - (end[0] < start[0])
    dc = (end[1] > start[1]) - (end[1] < start[1])
    row, column = start[0] + dr, start[1] + dc
    while (row, column) != end:
        if game.board[row][column] != EMPTY:
            return f'Une pièce en {_square((row, column))} bloque le passage. Aucun saut n’est autorisé.'
        row, column = row + dr, column + dc
    if piece != KING and end == CENTER:
        return 'Seul le roi peut s’arrêter sur le trône F6. Un soldat peut seulement le traverser lorsqu’il est vide.'
    if piece != KING and game.mode != 'historical' and end in CORNERS:
        return 'Dans cette variante, les coins sont réservés au roi.'
    return 'Ce déplacement n’est pas autorisé dans cette position.'


def _goal_reached(item, event, game):
    if tuple(event['from']) != item.start:
        return False
    if item.goal == 'escape':
        return event['winner'] == 'elf' and event['reason'] == 'escape'
    if item.goal == 'king_capture':
        return event['winner'] == 'dwarf' and event['reason'] == 'king_captured'
    if item.goal == 'capture':
        captured = {tuple(victim[:2]) for victim in event['captured']}
        return set(item.victims).issubset(captured)
    if item.goal == 'survive':
        return (tuple(event['to']) == item.end and
                game.board[item.end[0]][item.end[1]] == ELF and not event['captured'])
    return tuple(event['to']) == item.end


def play_move(mode, lesson, start, end):
    """Explain an attempted move and keep only a completed exercise's result."""
    _, item = _select(mode, lesson)
    start, end = _coordinate(start), _coordinate(end)
    state = lesson_state(mode, item.id)
    game = _game(mode, item)
    if list(end) not in game.legal(start):
        state['feedback'] = _illegal_feedback(game, start, end)
        state['feedback_kind'] = 'error'
        return state
    event = game.move(start, end)
    if _goal_reached(item, event, game):
        state.update(board=game.board, completed=True, feedback=item.success,
                     feedback_kind='success', last_move=event)
    else:
        state['feedback'] = ('Ce coup est légal, mais ne réalise pas l’objectif de cet exercice. '
                             + item.objective + ' La position est remise en place pour réessayer.')
    return state
