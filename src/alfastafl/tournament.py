"""Tournament pairing prototype: balanced camps + 3 tournament formats."""
import secrets
import uuid


def balanced_camps(a,b,history):
    """Minimize total post-game absolute elf/dwarf differences."""
    def delta(p):
        return sum(1 if item['camp']=='elf' else -1 for item in history.get(p,[]))
    score_ab=abs(delta(a)+1)+abs(delta(b)-1)
    score_ba=abs(delta(a)-1)+abs(delta(b)+1)
    if score_ab==score_ba: return ('elf','dwarf') if secrets.randbelow(2)==0 else ('dwarf','elf')
    return ('elf','dwarf') if score_ab<score_ba else ('dwarf','elf')

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
        self.history[m['a']].append({'camp':m['camp_a']})
        self.history[m['b']].append({'camp':m['camp_b']})
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
