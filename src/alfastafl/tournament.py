"""Tournament pairing prototype: balanced camps + 3 tournament formats."""
import secrets
import uuid


def balanced_camps(a, b, history):
    """Allocate the least-played camp, then recency, then a genuine draw.

    Each match always has one elf and one dwarf. Once a participant has
    played, prefer reducing the WORST per-player imbalance first, then
    the total imbalance. If the participants still want the same camp,
    the one who played that contested camp most recently gets the OTHER.
    Round numbers (rather than list positions) handle tournament byes.
    """
    def entries(player):
        return history.get(player, [])

    def difference(player):
        return sum(1 if item['camp'] == 'elf' else -1 for item in entries(player))

    def other(camp):
        return 'dwarf' if camp == 'elf' else 'elf'

    def score(camp_a):
        after_a = difference(a) + (1 if camp_a == 'elf' else -1)
        after_b = difference(b) + (1 if camp_a == 'dwarf' else -1)
        return (max(abs(after_a), abs(after_b)), abs(after_a) + abs(after_b))

    # Both players' first tournament match must use an unbiased draw.
    if not entries(a) and not entries(b):
        return ('elf', 'dwarf') if secrets.randbelow(2) == 0 else ('dwarf', 'elf')

    score_elf = score('elf')
    score_dwarf = score('dwarf')
    if score_elf < score_dwarf:
        return ('elf', 'dwarf')
    if score_dwarf < score_elf:
        return ('dwarf', 'elf')

    def preferred(player):
        d = difference(player)
        if d < 0:
            return 'elf'
        if d > 0:
            return 'dwarf'
        games = entries(player)
        return other(games[-1]['camp']) if games else None

    pa, pb = preferred(a), preferred(b)
    if pa and pb and pa != pb:
        return (pa, pb)
    if pa and not pb:
        return (pa, other(pa))
    if pb and not pa:
        return (other(pb), pb)

    def last_round(player, camp):
        # Historical saves may contain only {'camp': ...}. Fallback to
        # their chronological list position without inventing timestamps.
        for index in range(len(entries(player)) - 1, -1, -1):
            item = entries(player)[index]
            if item['camp'] == camp:
                return item.get('round', index + 1)
        return -1

    if pa and pb and pa == pb:
        recent_a, recent_b = last_round(a, pa), last_round(b, pb)
        if recent_a < recent_b:
            return (pa, other(pa))
        if recent_b < recent_a:
            return (other(pa), pa)

    # Same count, same recency (or both never played): last resort lottery.
    return ('elf', 'dwarf') if secrets.randbelow(2) == 0 else ('dwarf', 'elf')

class Tournament:
    FORMATS=('knockout','round_robin','swiss')
    def __init__(self,name,format,players,rounds=3,id=None,history=None,matches=None,round_no=0,
                 devices=None,spectator_devices=None,registration_open=False,
                 completed=False,final_round=False,rankings=None):
        if format not in self.FORMATS:raise ValueError('Invalid tournament format')
        if (len(players)<2 and not registration_open) or len(set(players))!=len(players):
            raise ValueError('Need unique players')
        self.id=id or str(uuid.uuid4());self.name=name;self.format=format;self.players=players
        self.rounds=rounds;self.history=history or {p:[] for p in players}
        self.matches=matches or [];self.round_no=round_no
        # SHA-256 fingerprints only: raw per-browser credentials are never
        # serialized or included in tournament API responses.
        self.devices=devices or {}
        self.spectator_devices=spectator_devices or {}
        self.registration_open=bool(registration_open)
        self.completed=bool(completed)
        self.final_round=bool(final_round)
        self.rankings=list(rankings or [])

    def as_dict(self):
        return dict(id=self.id,name=self.name,format=self.format,
                    players=self.players,rounds=self.rounds,history=self.history,
                    matches=self.matches,round_no=self.round_no,
                    devices=self.devices,spectator_devices=self.spectator_devices,
                    registration_open=self.registration_open,completed=self.completed,
                    final_round=self.final_round,rankings=self.rankings)

    @classmethod
    def from_dict(cls,d):return cls(**d)

    def standings(self):
        score={p:0 for p in self.players}
        for m in self.matches:
            if m.get('bye'):
                # A Swiss bye is a full, explicitly labelled 3-point bye;
                # in round-robin an exemption is unscored. Knockout byes
                # grant qualification but do not fake a game result.
                if self.format=='swiss':score[m['a']]+=3
                continue
            if m.get('winner') in score:score[m['winner']]+=3
            elif m.get('winner')=='draw':
                score[m['a']]+=1;score[m['b']]+=1
        return score

    def result(self,match_id,winner):
        m=next((m for m in self.matches if m['id']==match_id),None)
        if not m:raise ValueError('Unknown match')
        if m.get('winner') is not None:raise ValueError('Already scored')
        if winner not in (m['a'],m['b'],'draw'):raise ValueError('Invalid winner')
        m['winner']=winner
        self.history.setdefault(m['a'], []).append({'camp':m['camp_a'], 'round':m['round']})
        self.history.setdefault(m['b'], []).append({'camp':m['camp_b'], 'round':m['round']})

    def known_place(self, player):
        """A first/second/third medal can be awarded before other games end."""
        if self.rankings and player in self.rankings:
            return self.rankings.index(player)+1
        if not self.registration_open or self.format != 'knockout':
            return None
        finals=[m for m in self.matches if m.get('placement')=='final'
                and m.get('winner') not in (None,'draw')]
        if finals:
            m=finals[-1]
            if player==m['winner']:return 1
            if player==m['a'] or player==m['b']:return 2
        bronzes=[m for m in self.matches if m.get('placement')=='bronze'
                 and m.get('winner') not in (None,'draw')]
        if bronzes and player==bronzes[-1]['winner']:return 3
        return None

    def final_ranking(self):
        """Stable, one-based placement across all tournament formats.

        Points, wins and strength of opponents decide scored formats.
        Remaining exact ties are drawn once using a fair shuffle; the
        complete ordering is persisted and cannot change on refresh.
        """
        people=list(self.players)
        secrets.SystemRandom().shuffle(people)
        if self.format!='knockout':
            points=self.standings()
            wins={p:0 for p in people}
            opponents={p:[] for p in people}
            for m in self.matches:
                if m.get('bye'):continue
                if m.get('winner') in wins:wins[m['winner']]+=1
                if m['a'] in opponents:opponents[m['a']].append(m['b'])
                if m['b'] in opponents:opponents[m['b']].append(m['a'])
            resistance={p:sum(points.get(o,0) for o in opponents[p]) for p in people}
            people.sort(key=lambda p:(-points[p],-wins[p],-resistance[p]))
            return people
        final=[m for m in self.matches if m.get('placement')=='final'
               and m.get('winner') not in (None,'draw')]
        if not final:
            played=[m for m in self.matches if m.get('winner') not in (None,'draw')
                    and not m.get('bye') and m.get('placement')!='bronze']
            final=sorted(played,key=lambda m:m['round'])[-1:]
        ranked=[]
        if final:
            m=final[-1]
            ranked.extend([m['winner'],m['b'] if m['winner']==m['a'] else m['a']])
        bronze=[m for m in self.matches if m.get('placement')=='bronze'
                and m.get('winner') not in (None,'draw')]
        if bronze:
            m=bronze[-1]
            ranked.extend([m['winner'],m['b'] if m['winner']==m['a'] else m['a']])
        # Earlier eliminations follow the round in which the player lost.
        # A tie within the same elimination round is resolved by fair draw.
        defeated={p:-1 for p in people}
        for m in self.matches:
            if m.get('winner') in (None,'draw') or m.get('bye') or m.get('placement')=='bronze':
                continue
            loser=m['b'] if m['winner']==m['a'] else m['a']
            defeated[loser]=max(defeated[loser],m['round'])
        others=[p for p in people if p not in ranked]
        others.sort(key=lambda p:-defeated[p])
        return ranked+others

    def _bye(self,player):
        """Record an exemption, not a fictitious game or camp assignment."""
        m={'id':str(uuid.uuid4()),'round':self.round_no,'a':player,'b':None,
           'camp_a':None,'camp_b':None,'winner':player,'bye':True,'game':None}
        self.matches.append(m)

    def _match(self,a,b,replay_of=None,placement=None):
        ca,cb=balanced_camps(a,b,self.history)
        m={'id':str(uuid.uuid4()),'round':self.round_no,'a':a,'b':b,
           'camp_a':ca,'camp_b':cb,'winner':None}
        if replay_of is not None:m['replay_of']=replay_of
        if placement:m['placement']=placement
        self.matches.append(m)
        return m

    def next_round(self):
        if len(self.players)<2:raise ValueError('Au moins deux inscrits sont nécessaires.')
        if self.completed:return []
        if any(m.get('winner') is None for m in self.matches):
            raise ValueError('Finish current round')
        if self.format=='swiss' and self.round_no>=self.rounds:return []
        # For an odd round-robin, the extra round is essential: N players
        # need N rounds to meet all N-1 opponents exactly once.
        if self.format=='round_robin' and self.round_no>=(
                len(self.players) if len(self.players)%2 else len(self.players)-1):
            return []

        if self.format=='knockout' and self.round_no:
            previous=[m for m in self.matches if m['round']==self.round_no]
            replaced={m.get('replay_of') for m in previous if m.get('replay_of')}
            # A draw NEVER eliminates both contenders. Instead, create a new
            # independent game in the SAME round, until there is a winner.
            # The historical drawn games remain auditable and their real
            # factions count towards a balanced rematch.
            drawn=[m for m in previous if m.get('winner')=='draw' and
                   m['id'] not in replaced]
            if drawn:
                return [self._match(m['a'],m['b'],replay_of=m['id'],
                                    placement=m.get('placement')) for m in drawn]
            decisive=[m for m in previous if m['id'] not in replaced]
            pool=[m['winner'] for m in decisive if m.get('winner') not in (None,'draw')]
            if len(pool)<2:return []
        else:
            pool=list(self.players)

        self.round_no+=1
        pairs=[]
        if self.format=='round_robin':
            people=pool[:]
            if len(people)%2:people.append(None)
            n=len(people)
            for _ in range(self.round_no-1):
                people=[people[0]]+[people[-1]]+people[1:-1]
            for i in range(n//2):
                a,b=people[i],people[n-i-1]
                if a is None or b is None:self._bye(a if a is not None else b)
                else:pairs.append((a,b))
        elif self.format=='swiss':
            past={frozenset((m['a'],m['b'])) for m in self.matches if
                  m.get('b') is not None}
            scores=self.standings()
            pool=sorted(pool,key=lambda p:(-scores[p],p))
            if len(pool)%2:
                # Protect against repeated byes: always select a player with
                # the LEAST exemptions so far; among those take the lowest
                # ranked. Byes are visible and earn 3 points, no false game.
                bye_counts={p:sum(bool(m.get('bye') and m['a']==p)
                                  for m in self.matches) for p in pool}
                least=min(bye_counts.values())
                eligible=[p for p in pool if bye_counts[p]==least]
                lowest_score=min(scores[p] for p in eligible)
                # Tied candidates must be drawn, not favored for having
                # the alphabetically last registration name.
                player=secrets.choice([p for p in eligible
                                       if scores[p]==lowest_score])
                pool.remove(player)
                self._bye(player)
            while len(pool)>1:
                a=pool.pop(0)
                idx=next((i for i,b in enumerate(pool)
                          if frozenset((a,b)) not in past),0)
                pairs.append((a,pool.pop(idx)))
        else:
            if self.round_no==1:
                # Make initial knockout byes equitable, not an advantage of
                # being the last player typed into the registration form.
                secrets.SystemRandom().shuffle(pool)
                # Byes take us to the next power-of-two bracket. E.g. five
                # entrants -> 3 first-round byes + 1 played encounter -> 4.
                bracket=1<<(len(pool)-1).bit_length()
                byes=bracket-len(pool)
                for p in pool[:byes]:self._bye(p)
                pool=pool[byes:]
            for i in range(0,len(pool)-1,2):
                pairs.append((pool[i],pool[i+1]))
        return [self._match(a,b) for a,b in pairs]
