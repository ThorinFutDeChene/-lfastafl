#!/usr/bin/env node
'use strict';
/* Run the real offline sound engine with a small WebAudio test double.
 * No browser, downloaded music, audio device or production sound file needed. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {test}=require('node:test');

const source=fs.readFileSync(path.join(__dirname,'..','web','soundscape.js'),'utf8');
function harness(audioAvailable=true){
 const values=new Map(),callbacks=new Map(),timers=new Map();
 let intervalId=0;
 const document={hidden:false,
  addEventListener:(n,cb)=>callbacks.set(n,cb),
  removeEventListener:n=>callbacks.delete(n)};
 const stats={oscillators:0,noiseSources:0,filters:0,buffers:0,closed:false};
 class Param {
  constructor(){this.value=0;}
  setValueAtTime(value){this.value=value;}
  exponentialRampToValueAtTime(value){this.value=value;}
  setTargetAtTime(value){this.value=value;}
 }
 class Node {
  constructor(){this.gain=new Param();this.frequency=new Param();this.Q=new Param();}
  connect(target){return target;}
  disconnect(){}
  start(){}
  stop(){}
 }
 class Ctx {
  constructor(){this.state='suspended';this.sampleRate=44100;this.currentTime=1;this.destination=new Node();}
  createGain(){return new Node();}
  createOscillator(){stats.oscillators++;return new Node();}
  createBiquadFilter(){stats.filters++;return new Node();}
  createBufferSource(){stats.noiseSources++;return new Node();}
  createBuffer(_channels,length){stats.buffers++;const data=new Float32Array(length);
   return {getChannelData:()=>data};}
  async resume(){this.state='running';}
  close(){this.state='closed';stats.closed=true;return Promise.resolve();}
 }
 const window=audioAvailable?{AudioContext:Ctx}:{};
 const context=vm.createContext({window,document,localStorage:{
  getItem:key=>values.get(key)??null,setItem:(key,val)=>values.set(key,String(val))
 },setInterval:(callback)=>{const id=++intervalId;timers.set(id,callback);return id;},
 clearInterval:id=>timers.delete(id),fetch:()=>{throw Error('Audio must never request network resources');}});
 vm.runInContext(source,context,{filename:'soundscape.js'});
 const Soundscape=window.AlfastaflSoundscape;
 assert.equal(typeof Soundscape,'function');
 return {Soundscape,document,callbacks,timers,stats,values};
}

test('No WebAudio support leaves game playable and reports sound unavailable',async()=>{
 const h=harness(false),audio=new h.Soundscape();
 assert.equal(audio.status().available,false);
 assert.equal(await audio.unlock(),false);
 audio.setGame({status:'active',history:[]});
 assert.equal(h.timers.size,0);
 audio.dispose();
});

test('Game score starts after user unlock, includes drum and wind, and pauses when inactive',async()=>{
 const h=harness(),audio=new h.Soundscape();
 audio.setGame({status:'active',history:[]});
 assert.equal(h.timers.size,0,'Never start autoplay without a user gesture');
 assert.equal(await audio.unlock(),true);
 assert.equal(audio.status().ready,true);
 assert.equal(h.timers.size,1);
 assert(h.stats.oscillators>0,'A Dorian musical phrase must be generated');
 assert(h.stats.noiseSources>0,'Nordic score must contain percussion or ambient wind');
 assert.equal(h.stats.buffers,1,'Noise sample is generated and cached offline');
 const prev=h.stats.oscillators;
 for(const callback of h.timers.values())callback();
 assert(h.stats.oscillators>prev,'Following beat must produce new musical tones');
 audio.setGame({status:'paused',history:[]});
 assert.equal(h.timers.size,0,'Music must stop on pause');
 audio.setGame({status:'active',history:Array(15).fill(null)});
 assert.equal(audio.tension,true);
 assert.equal(h.timers.size,1);
 h.document.hidden=true;
 h.callbacks.get('visibilitychange')();
 assert.equal(h.timers.size,0,'No background music timers in sleeping mobile tabs');
 h.document.hidden=false;h.callbacks.get('visibilitychange')();
 assert.equal(h.timers.size,1,'Return to foreground resumes music');
 audio.dispose();
 assert.equal(h.timers.size,0);
 assert(h.stats.closed);
 assert.equal(h.callbacks.has('visibilitychange'),false);
});

test('Music and effect levels have independent immediate controls and persist across sessions',async()=>{
 const h=harness(),audio=new h.Soundscape();
 await audio.unlock();audio.setGame({status:'active',history:[]});
 audio.setVolume('music',0);
 assert.equal(h.timers.size,0);
 assert.equal(audio.musicBus.gain.value,0);
 assert.equal(audio.effectsBus.gain.value,.74);
 audio.setVolume('effects',.32);
 assert.equal(audio.effectsBus.gain.value,.32);
 audio.setVolume('music',.47);
 assert.equal(audio.musicBus.gain.value,.47);
 assert.equal(h.timers.size,1);
 assert.equal(h.values.get('alfastafl.music-volume'),'0.47');
 assert.equal(h.values.get('alfastafl.effects-volume'),'0.32');
 const before=h.stats.oscillators;
 audio.effect('move');
 audio.effect('arrow');
 audio.effect('guard');
 audio.effect('shield');
 audio.effect('counter');
 audio.effect('strike');
 audio.effect('shatter');
 assert(h.stats.oscillators>before,'Confirmed moves/captures generate effects');
 const last=h.stats.oscillators;
 audio.setEnabled(false);
 assert.equal(audio.master.gain.value,0);
 assert.equal(h.timers.size,0);
 audio.effect('move');
 assert.equal(h.stats.oscillators,last,'Mute silences effects');
 assert.equal(h.values.get('alfastafl.audio-enabled'),'off');
 audio.setEnabled(true);
 assert.equal(audio.master.gain.value,.78);
 assert.equal(h.timers.size,1);
 audio.dispose();
});

test('Sound engine rejects invalid controls and never fetches external music',async()=>{
 const h=harness(),audio=new h.Soundscape();
 await audio.unlock();audio.setGame({status:'active'});
 audio.setVolume('effects',5);
 assert.equal(audio.effectsVolume,1);
 audio.setVolume('effects',-5);
 assert.equal(audio.effectsVolume,0);
 const voices=h.stats.oscillators;
 audio.effect('move');
 assert.equal(h.stats.oscillators,voices);
 audio.setVolume('unknown',.5);
 assert.equal(h.values.has('alfastafl.unknown-volume'),false);
 audio.dispose();
});
