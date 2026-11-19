/* Audio original et hors ligne : musique nordique minimale et bruitages WebAudio.
 * Aucun fichier sous licence ni requête réseau. Déblocage après geste utilisateur. */
(() => {
 'use strict';
 const settings = key => { try { return localStorage.getItem('alfastafl.' + key); } catch (_) { return null; } };
 const remember = (key, value) => { try { localStorage.setItem('alfastafl.' + key, value); } catch (_) {} };
 const clamp = (x) => Math.min(1, Math.max(0, Number(x) || 0));
 class Soundscape {
  constructor() {
   this.AudioContext = window.AudioContext || window.webkitAudioContext;
   this.ctx = null;
   this.enabled = settings('audio-enabled') !== 'off';
   this.musicVolume = clamp(settings('music-volume') ?? '0.38');
   this.effectsVolume = clamp(settings('effects-volume') ?? '0.74');
   this.active = false;
   this.tension = false;
   this.beat = 0;
   this.timer = null;
  }
  status() { return {available: Boolean(this.AudioContext), enabled: this.enabled,
   ready: Boolean(this.ctx && this.ctx.state === 'running'),
   music: this.musicVolume, effects: this.effectsVolume}; }
  async unlock() {
   if (!this.AudioContext) return false;
   try {
    if (!this.ctx) {
     this.ctx = new this.AudioContext();
     this.master = this.ctx.createGain();
     this.master.gain.value = 0.78;
     this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
    this._ensureMusic();
    return this.ctx.state === 'running';
   } catch (_) { return false; }
  }
  setEnabled(on) {
   this.enabled=Boolean(on);remember('audio-enabled',this.enabled?'on':'off');
   if(this.master && this.ctx) {
    this.master.gain.setTargetAtTime(this.enabled?.78:0,this.ctx.currentTime,.025);
   }
   this._ensureMusic();
  }
  setVolume(channel, value) {
   if (!['music', 'effects'].includes(channel)) return;
   const normalized = clamp(value);
   if (channel === 'music') this.musicVolume = normalized; else this.effectsVolume = normalized;
   remember(channel + '-volume', String(normalized));
  }
  setGame(game) {
   this.active = Boolean(game && game.status === 'active');
   this.tension = Boolean(game && (game.history?.length || 0) >= 12);
   this._ensureMusic();
  }
  _ensureMusic() {
   if (!this.timer) this.timer = setInterval(() => this._beat(), 1500);
  }
  _voice(freq, start, duration, gain, type = 'triangle', destination = null, endFreq = null) {
   if (!this.ctx || gain <= 0) return;
   const osc = this.ctx.createOscillator();
   const amp = this.ctx.createGain();
   const end = start + duration;
   osc.type = type;
   osc.frequency.setValueAtTime(freq, start);
   if (endFreq && endFreq > 0) osc.frequency.exponentialRampToValueAtTime(endFreq, Math.max(start + .01, end - .02));
   amp.gain.setValueAtTime(.0001, start);
   amp.gain.exponentialRampToValueAtTime(Math.max(.0002, gain), start + Math.min(.05, duration / 4));
   amp.gain.exponentialRampToValueAtTime(.0001, end);
   osc.connect(amp).connect(destination || this.master);
   osc.start(start);osc.stop(end + .02);
   osc.onended = () => { osc.disconnect(); amp.disconnect(); };
  }
  _beat() {
   if (!this.enabled || !this.active || document.hidden || !this.ctx ||
       this.ctx.state !== 'running' || this.musicVolume === 0) return;
   // Original modal phrase (Dorian), alternating drone, harp and slow drum.
   const melody = this.tension
    ? [146.83,174.61,220,196,146.83,261.63,220,174.61]
    : [146.83,196,174.61,146.83,220,196,164.81,146.83];
   const now=this.ctx.currentTime+.02, level=this.musicVolume;
   const note=melody[this.beat % melody.length];
   this._voice(note, now, 1.9, .033*level, 'triangle');
   this._voice(note*2, now+.07, 1.2, .009*level, 'sine');
   if (this.beat % 4===0) {
    this._voice(73.42, now, 4.9, .022*level, 'sine');
    this._voice(98, now+.15, 3.6, .012*level, 'triangle');
   }
   if (this.tension && this.beat % 2===0) this._voice(85, now, .14, .022*level, 'sine', null, 48);
   this.beat++;
  }
  effect(name, delay = 0) {
   if (!this.enabled || !this.ctx || this.ctx.state !== 'running' ||
       this.effectsVolume===0 || document.hidden) return;
   const now=this.ctx.currentTime + Math.max(0,delay);
   const vol=this.effectsVolume;
   if (name==='select') this._voice(400,now,.11,.034*vol,'triangle',null,610);
   else if (name==='move') {
    this._voice(170,now,.30,.075*vol,'triangle',null,115);
    this._voice(440,now+.1,.22,.032*vol,'sine',null,240);
   } else if (name==='swing') {
    this._voice(620,now,.43,.095*vol,'sawtooth',null,90);
    this._voice(370,now+.02,.35,.055*vol,'triangle',null,95);
   } else if (name==='strike') {
    this._voice(88,now,.72,.19*vol,'triangle',null,42);
    this._voice(810,now,.33,.057*vol,'square',null,190);
   } else if (name==='shatter') {
    [440,710,1040,1470,1930].forEach((pitch,i) =>
     this._voice(pitch,now+i*.028,.24+i*.045,(.030+i*.004)*vol,'triangle',null,pitch*.54));
   } else if (name==='king') {
    [196,246.94,293.66,392].forEach((pitch,i) =>
     this._voice(pitch,now+i*.07,2.2,.04*vol,'triangle'));
   }
  }
  dispose() { if (this.timer) clearInterval(this.timer);this.timer=null;this.ctx?.close();this.ctx=null; }
 }
 window.AlfastaflSoundscape = Soundscape;
})();
