/* Original offline-only Nordic score and game effects, generated with Web Audio.
 * Music and effects use independent gain buses; no external media or fetches. */
(() => {
 'use strict';
 const settings=key=>{try{return localStorage.getItem('alfastafl.'+key);}catch(_){return null;}};
 const remember=(key,value)=>{try{localStorage.setItem('alfastafl.'+key,value);}catch(_){}};
 const clamp=x=>Math.min(1,Math.max(0,Number(x)||0));

 class Soundscape {
  constructor() {
   this.AudioContext=window.AudioContext||window.webkitAudioContext;
   this.ctx=null;this.noiseBuffer=null;
   this.enabled=settings('audio-enabled')!=='off';
   this.musicVolume=clamp(settings('music-volume')??'0.38');
   this.effectsVolume=clamp(settings('effects-volume')??'0.74');
   this.active=false;this.tension=false;this.beat=0;this.timer=null;
   this.onVisibility=()=>this._ensureMusic();
   document.addEventListener('visibilitychange',this.onVisibility);
  }
  status() {
   return {available:Boolean(this.AudioContext),enabled:this.enabled,
    ready:Boolean(this.ctx&&this.ctx.state==='running'),
    music:this.musicVolume,effects:this.effectsVolume};
  }
  async unlock() {
   if(!this.AudioContext)return false;
   try {
    if(!this.ctx) {
     this.ctx=new this.AudioContext();
     this.master=this.ctx.createGain();
     this.master.gain.value=this.enabled?.78:0;
     this.master.connect(this.ctx.destination);
     this.musicBus=this.ctx.createGain();
     this.musicBus.gain.value=this.musicVolume;
     this.musicBus.connect(this.master);
     this.effectsBus=this.ctx.createGain();
     this.effectsBus.gain.value=this.effectsVolume;
     this.effectsBus.connect(this.master);
    }
    if(this.ctx.state!=='running')await this.ctx.resume();
    this._ensureMusic();
    return this.ctx.state==='running';
   }catch(_){return false;}
  }
  setEnabled(on) {
   this.enabled=Boolean(on);
   remember('audio-enabled',this.enabled?'on':'off');
   if(this.ctx&&this.master)
    this.master.gain.setTargetAtTime(this.enabled?.78:0,this.ctx.currentTime,.03);
   this._ensureMusic();
  }
  setVolume(channel,value) {
   if(!['music','effects'].includes(channel))return;
   const normalized=clamp(value);
   if(channel==='music')this.musicVolume=normalized;
   else this.effectsVolume=normalized;
   remember(channel+'-volume',String(normalized));
   const bus=channel==='music'?this.musicBus:this.effectsBus;
   if(bus&&this.ctx)bus.gain.setTargetAtTime(normalized,this.ctx.currentTime,.025);
   if(channel==='music')this._ensureMusic();
  }
  setGame(game) {
   this.active=Boolean(game&&game.status==='active');
   this.tension=Boolean(game&&(game.history?.length||0)>=12);
   this._ensureMusic();
  }
  _ensureMusic() {
   const shouldPlay=this.enabled&&this.active&&Boolean(this.ctx)&&
    this.ctx.state==='running'&&this.musicVolume>0&&!document.hidden;
   if(!shouldPlay) {
    if(this.timer!==null)clearInterval(this.timer);
    this.timer=null;
    return;
   }
   if(this.timer===null) {
    this._beat();
    this.timer=setInterval(()=>this._beat(),1450);
   }
  }
  _voice(freq,start,duration,gain,type='triangle',destination=null,endFreq=null) {
   if(!this.ctx||gain<=0||!Number.isFinite(freq)||freq<=0)return;
   const osc=this.ctx.createOscillator(),amp=this.ctx.createGain();
   const end=start+duration;
   osc.type=type;
   osc.frequency.setValueAtTime(freq,start);
   if(endFreq&&endFreq>0)
    osc.frequency.exponentialRampToValueAtTime(endFreq,Math.max(start+.02,end-.02));
   amp.gain.setValueAtTime(.0001,start);
   amp.gain.exponentialRampToValueAtTime(Math.max(.0002,gain),
    start+Math.min(.055,duration/4));
   amp.gain.exponentialRampToValueAtTime(.0001,end);
   osc.connect(amp).connect(destination||this.effectsBus);
   osc.start(start);
   osc.stop(end+.02);
   osc.onended=()=>{osc.disconnect();amp.disconnect();};
  }
  _getNoise() {
   if(this.noiseBuffer)return this.noiseBuffer;
   const sampleRate=this.ctx.sampleRate||44100;
   const length=Math.floor(sampleRate*2);
   const buffer=this.ctx.createBuffer(1,length,sampleRate);
   const channel=buffer.getChannelData(0);
   let seed=0x9e3779b9;
   for(let i=0;i<length;i++){
    seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
    channel[i]=((seed>>>0)/2147483648)-1;
   }
   this.noiseBuffer=buffer;
   return buffer;
  }
  _noise(start,duration,gain,frequency=450,filterType='lowpass',destination=null) {
   if(!this.ctx||gain<=0)return;
   const src=this.ctx.createBufferSource(),filter=this.ctx.createBiquadFilter(),
    amp=this.ctx.createGain(),end=start+duration;
   src.buffer=this._getNoise();
   src.loop=true;
   filter.type=filterType;
   filter.frequency.setValueAtTime(frequency,start);
   filter.Q.value=.6;
   amp.gain.setValueAtTime(.0001,start);
   amp.gain.exponentialRampToValueAtTime(Math.max(.0002,gain),
    start+Math.min(.11,duration/3));
   amp.gain.exponentialRampToValueAtTime(.0001,end);
   src.connect(filter).connect(amp).connect(destination||this.effectsBus);
   src.start(start);src.stop(end+.02);
   src.onended=()=>{src.disconnect();filter.disconnect();amp.disconnect();};
  }
  _beat() {
   if(!this.enabled||!this.active||document.hidden||!this.ctx||
      this.ctx.state!=='running'||this.musicVolume===0)return;
   const notes=this.tension
    ?[146.83,174.61,220,196,146.83,261.63,220,174.61]
    :[146.83,196,174.61,146.83,220,196,164.81,146.83];
   const now=this.ctx.currentTime+.025;
   const note=notes[this.beat%notes.length];
   // Folk harp, bowed drone, distant wind and frame drum. All synthesised.
   this._voice(note,now,1.65,.039,'triangle',this.musicBus);
   this._voice(note*2,now+.06,1.05,.012,'sine',this.musicBus);
   if(this.beat%4===0){
    this._voice(73.42,now,5.4,.037,'sine',this.musicBus);
    this._voice(98,now+.13,3.8,.016,'triangle',this.musicBus);
    this._noise(now,4.6,.017,380,'lowpass',this.musicBus);
    this._noise(now,.26,.055,170,'lowpass',this.musicBus);
    this._voice(78,now,.32,.048,'sine',this.musicBus,44);
   }else if(this.beat%2===0){
    this._noise(now,.16,.028,220,'lowpass',this.musicBus);
   }
   if(this.tension&&this.beat%2===0)
    this._voice(110,now,.25,.023,'triangle',this.musicBus,65);
   this.beat++;
  }
  effect(name,delay=0) {
   if(!this.enabled||!this.ctx||this.ctx.state!=='running'||
      this.effectsVolume===0||document.hidden)return;
   const now=this.ctx.currentTime+Math.max(0,Number(delay)||0);
   if(name==='select') {
    this._voice(440,now,.11,.032,'triangle',null,600);
   }else if(name==='move'){
    this._noise(now,.22,.064,680,'bandpass');
    this._voice(175,now,.29,.070,'triangle',null,108);
    this._voice(385,now+.1,.2,.021,'sine',null,235);
   }else if(name==='swing'){
    this._noise(now,.44,.079,1100,'bandpass');
    this._voice(620,now,.39,.084,'sawtooth',null,90);
    this._voice(360,now+.03,.3,.04,'triangle',null,105);
   }else if(name==='arrow'){
     this._noise(now,.19,.05,1600,'highpass');
     this._voice(780,now,.23,.035,'triangle',null,240);
     this._voice(280,now+.09,.26,.025,'sine',null,160);
    }else if(name==='guard'){
     this._noise(now,.16,.095,430,'bandpass');
     this._voice(310,now,.30,.065,'triangle',null,175);
    }else if(name==='shield'){
     this._noise(now,.31,.13,360,'bandpass');
     this._voice(145,now,.42,.15,'triangle',null,70);
     this._voice(480,now+.02,.30,.038,'triangle',null,290);
    }else if(name==='counter'){
    this._noise(now,.17,.074,900,'bandpass');
    this._voice(390,now,.19,.063,'triangle',null,190);
    this._voice(134,now+.065,.18,.028,'square',null,77);
   }else if(name==='blade'){
     this._voice(1280,now,.31,.036,'triangle',null,820);
     this._noise(now,.16,.029,1900,'highpass');
    }else if(name==='slice'){
     this._noise(now,.26,.091,1460,'bandpass');
     this._voice(940,now,.25,.060,'sawtooth',null,270);
     this._voice(168,now+.095,.28,.092,'triangle',null,76);
    }else if(name==='strike'){
    this._noise(now,.35,.16,260,'lowpass');
    this._voice(95,now,.67,.17,'triangle',null,40);
    this._voice(810,now,.32,.04,'square',null,170);
   }else if(name==='shatter'){
    this._noise(now,.55,.13,1500,'highpass');
    [440,710,1040,1470,1930].forEach((pitch,i)=>
     this._voice(pitch,now+i*.027,.22+i*.045,.025+i*.003,'triangle',null,pitch*.52));
   }else if(name==='king'){
    [196,246.94,293.66,392].forEach((pitch,i)=>
     this._voice(pitch,now+i*.075,2.2,.042,'triangle'));
   }else if(name==='royal-horns'){
    // Dorian ceremonial brass flourish, synthesised offline, not sampled.
    [196,293.66,392,493.88,587.33,783.99].forEach((pitch,i)=>{
     const at=now+i*.115;
     this._voice(pitch,at,.68,.061,'sawtooth',null,pitch*.996);
     this._voice(pitch*2,at+.015,.42,.015,'triangle');
    });
   }else if(name==='royal-hooves'){
    for(let i=0;i<4;i++){
     const at=now+i*.10;
     this._noise(at,.085,.059,170,'lowpass');
     this._voice(i%2===0?112:145,at,.11,.051,'triangle',null,64);
    }
   }else if(name==='royal-mount'){
    this._noise(now,.31,.032,1250,'bandpass');
    [523.25,659.25,783.99,1046.5].forEach((pitch,i)=>
     this._voice(pitch,now+i*.055,.56,.031,'triangle'));
   }
  }
  dispose() {
   if(this.timer!==null)clearInterval(this.timer);
   this.timer=null;
   document.removeEventListener('visibilitychange',this.onVisibility);
   this.ctx?.close();
   this.ctx=null;this.noiseBuffer=null;
  }
 }
 window.AlfastaflSoundscape=Soundscape;
})();
