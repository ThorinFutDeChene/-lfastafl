"""Deterministic tafl mechanics.

Historical and modern rule details require further independent rules audits.
The built-in variants are an initial playable implementation, not a claim of
perfect adherence to every Fetlar/Copenhagen/Nielsen exception.
"""
from dataclasses import dataclass, field
from typing import Optional
import uuid

SIZE=11
CENTER=(5,5)
CORNERS={(0,0),(0,10),(10,0),(10,10)}
ELF='E'; DWARF='N'; KING='R'
MODES={'historical','fetlar','copenhagen'}


def initial_board(mode):
    if mode not in MODES: raise ValueError('Unknown mode')
    b=[['.' for _ in range(SIZE)] for _ in range(SIZE)]
    b[5][5]=KING
    defenders=[(3,5),(4,4),(4,5),(4,6),(5,3),(5,4),(5,6),(5,7),(6,4),(6,5),(6,6),(7,5)]
    # This coordinate list has 13 values because the central king replaces (5,5):
    # count defenders precisely and assert below.
    for r,c in defenders: b[r][c]=ELF
    if mode=='historical':
        top=[(0,4),(0,5),(0,6),(1,4),(1,6),(2,5)]
    else:
        top=[(0,3),(0,4),(0,5),(0,6),(0,7),(1,5)]
    for r,c in top:
        for rr,cc in {(r,c),(SIZE-1-r,SIZE-1-c),(c,SIZE-1-r),(SIZE-1-c,r)}:
            b[rr][cc]=DWARF
    pieces=sum(row.count(ELF)+row.count(DWARF)+row.count(KING) for row in b)
    assert pieces==37 and sum(row.count(ELF) for row in b)==12 and sum(row.count(DWARF) for row in b)==24, (mode,pieces)
    return b


def adjacent(pos):
    r,c=pos
    return [(r+dr,c+dc) for dr,dc in ((1,0),(-1,0),(0,1),(0,-1)) if 0<=r+dr<SIZE and 0<=c+dc<SIZE]


def other(team):return 'elf' if team=='dwarf' else 'dwarf'


def team(piece):
    if piece in (KING,ELF):return 'elf'
    if piece==DWARF:return 'dwarf'
    return None


def special_passable(mode, piece, pos):
    if piece!=KING and pos in CORNERS and mode!='historical':return False
    if piece!=KING and pos==CENTER:return False
    return True


@dataclass
class Game:
    mode:str='fetlar'
    id:str=field(default_factory=lambda:str(uuid.uuid4()))
    board:list=field(default_factory=list)
    turn:str='dwarf'
    history:list=field(default_factory=list)
    status:str='active'
    winner:Optional[str]=None
    reason:Optional[str]=None
    positions:list=field(default_factory=list)
    settings:dict=field(default_factory=dict)
    def __post_init__(self):
        if self.mode not in MODES:raise ValueError('Unknown mode')
        if not self.board:self.board=initial_board(self.mode)
        if not self.positions:self.positions=[self.signature()]
        if any(len(row)!=SIZE for row in self.board) or len(self.board)!=SIZE:raise ValueError('Bad board')
    def signature(self):return ''.join(''.join(row) for row in self.board)+':'+self.turn
    def legal(self, start):
        r,c=start
        if not (0<=r<SIZE and 0<=c<SIZE):return []
        p=self.board[r][c]
        if team(p)!=self.turn:return []
        result=[]
        for dr,dc in ((1,0),(-1,0),(0,1),(0,-1)):
            rr,cc=r+dr,c+dc
            while 0<=rr<SIZE and 0<=cc<SIZE and self.board[rr][cc]=='.':
                if special_passable(self.mode,p,(rr,cc)):result.append([rr,cc])
                # The empty throne cannot be occupied by soldiers, but may be crossed.
                rr+=dr;cc+=dc
        return result
    def hostile(self,pos,captured):
        r,c=pos
        if not (0<=r<SIZE and 0<=c<SIZE):return False
        p=self.board[r][c]
        if team(p) and team(p)!=team(captured):return True
        if p!='.':return False
        if pos==CENTER:return True
        if self.mode!='historical' and pos in CORNERS:return True
        return False
    def king_captured(self):
        found=[(r,c) for r,row in enumerate(self.board) for c,p in enumerate(row) if p==KING]
        if not found:return True
        r,c=found[0]
        if self.mode=='historical':
            if (r,c)==CENTER:
                return all(self.board[rr][cc]==DWARF for rr,cc in adjacent((r,c)))
            if CENTER in adjacent((r,c)):
                return all(self.board[rr][cc]==DWARF for rr,cc in adjacent((r,c)) if (rr,cc)!=CENTER)
            return ((r>0 and r<10 and self.board[r-1][c]==DWARF and self.board[r+1][c]==DWARF) or
                    (c>0 and c<10 and self.board[r][c-1]==DWARF and self.board[r][c+1]==DWARF))
        if self.mode=='fetlar':
            return len(adjacent((r,c)))==4 and all(self.board[rr][cc]==DWARF for rr,cc in adjacent((r,c)))
        # Copenhagen: empty throne counts as a hostile neighbor beside the throne.
        if CENTER in adjacent((r,c)):
            return all(self.board[rr][cc]==DWARF for rr,cc in adjacent((r,c)) if (rr,cc)!=CENTER) and self.board[5][5]=='.'
        return len(adjacent((r,c)))==4 and all(self.board[rr][cc]==DWARF for rr,cc in adjacent((r,c)))
    def move(self,start,end):
        if self.status!='active':raise ValueError('Game not active')
        sr,sc=start;er,ec=end
        if [er,ec] not in self.legal((sr,sc)):raise ValueError('Illegal move')
        moving=self.board[sr][sc]
        self.board[sr][sc]='.';self.board[er][ec]=moving
        captured=[]
        for dr,dc in ((1,0),(-1,0),(0,1),(0,-1)):
            pr,pc=er+dr,ec+dc
            if not (0<=pr<SIZE and 0<=pc<SIZE):continue
            target=self.board[pr][pc]
            if target in ('.',KING) or team(target)==team(moving):continue
            opposite=(pr+dr,pc+dc)
            if self.hostile(opposite,target):
                self.board[pr][pc]='.';captured.append([pr,pc,target])
        win=None;reason=None
        if moving==KING and ((self.mode=='historical' and (er in (0,10) or ec in (0,10))) or (self.mode!='historical' and (er,ec) in CORNERS)):
            win='elf';reason='escape'
        elif moving==DWARF and self.king_captured():
            win='dwarf';reason='king_captured'
        self.turn=other(self.turn)
        if win:self.winner=win;self.status='finished';self.reason=reason
        occurrence=self.positions.count(self.signature())+1
        self.positions.append(self.signature())
        if occurrence>=3 and self.status=='active':
            if self.mode=='fetlar':
                self.status='finished';self.reason='threefold';self.winner=None
            else:
                self.status='paused';self.reason='repetition_review'
        record={'n':len(self.history)+1,'from':[sr,sc],'to':[er,ec],'piece':moving,'captured':captured,'status':self.status,'winner':self.winner,'reason':self.reason}
        self.history.append(record)
        return record
    def as_dict(self):
        return {'version':1,'id':self.id,'mode':self.mode,'board':self.board,'turn':self.turn,'history':self.history,'status':self.status,'winner':self.winner,'reason':self.reason,'positions':self.positions,'settings':self.settings}
    @classmethod
    def from_dict(cls,d):
        return cls(**{k:d[k] for k in ('id','mode','board','turn','history','status','winner','reason','positions','settings') if k in d})
