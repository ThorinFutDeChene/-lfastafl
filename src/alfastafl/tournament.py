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
    def __init__(self,name,format,players,rounds=3,id=None,history=None,matches=None,round_no=0):
        if format not in self.FORMATS:raise ValueError('Invalid tournament format')
        if len(players)<2 or len(set(players))!=len(players):raise ValueError('Need unique players')
        self.id=id or str(uuid.uuid4());self.name=name;self.format=format;self.players=players
        self.rounds=rounds;self.history=history or {p:[] for p in players}
        self.matches=matches or [];self.round_no=round_no
    def as_dict(self):return dict(id=self.id,name=self.name,format=self.format,players=self.players,rounds=self.rounds,history=self.history,matches=self.matches,round_no=self.round_no)
    @classmethod
    def from_dict(cls,d):return cls(**d)
    def standings(self):
        score={p:0 for p in self.players}
        for m in self.matches:
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
    def next_round(self):
        if any(m.get('winner') is None for m in self.matches):raise ValueError('Finish current round')
        if self.format=='swiss' and self.round_no>=self.rounds:return []
        if self.format=='round_robin' and self.round_no>=len(self.players)-1:return []
        if self.format=='knockout' and self.round_no:
            last=[m for m in self.matches if m['round']==self.round_no]
            pool=[m['winner'] for m in last if m['winner'] not in (None,'draw')]
            if len(pool)<2:return []
        else:pool=list(self.players)
        self.round_no+=1
        pairs=[]
        if self.format=='round_robin':
            people=pool[:]
            if len(people)%2:people.append(None)
            n=len(people)
            for _ in range(self.round_no-1):people=[people[0]]+[people[-1]]+people[1:-1]
            pairs=[(people[i],people[n-i-1]) for i in range(n//2) if people[i] and people[n-i-1]]
        elif self.format=='swiss':
            past={frozenset((m['a'],m['b'])) for m in self.matches}
            scores=self.standings();pool=sorted(pool,key=lambda p:(-scores[p],p))
            while len(pool)>1:
                a=pool.pop(0)
                idx=next((i for i,b in enumerate(pool) if frozenset((a,b)) not in past),0)
                pairs.append((a,pool.pop(idx)))
        else:
            for i in range(0,len(pool)-1,2):pairs.append((pool[i],pool[i+1]))
        round_matches=[]
        for a,b in pairs:
            ca,cb=balanced_camps(a,b,self.history)
            m={'id':str(uuid.uuid4()),'round':self.round_no,'a':a,'b':b,'camp_a':ca,'camp_b':cb,'winner':None}
            self.matches.append(m);round_matches.append(m)
        return round_matches
