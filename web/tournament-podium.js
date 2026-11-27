/* Cinematic three-place podium, one WebGL renderer for all awards. */
(()=>{
'use strict';
let active=null;
const element=(tag,cls,text)=>{const e=document.createElement(tag);e.className=cls;e.textContent=text||'';return e;};
function close(){if(active){active.close();active=null;}}
async function show({id,name,rankings,organizer,onDismiss}){
 if(active?.id===id)return;
 close();
 const root=element('section','');root.id='tournament-final-podium';
 root.dataset.organizer=String(organizer);root.setAttribute('aria-label','Podium final du tournoi');
 const gl=element('div','podium-gl');
 const header=element('header','podium-heading');
 header.append(element('p','','TOURNOI TERMINÉ'),element('h2','',name));
 const names=element('div','podium-names');
 for(const [place,label] of [[2,'MÉDAILLE D’ARGENT'],[1,'COUPE D’OR'],[3,'MÉDAILLE DE BRONZE']]){
  const item=element('div','');
  item.append(element('span','',label),element('strong','',rankings[place-1]||''));
  item.hidden=!rankings[place-1];names.append(item);
 }
 const dismiss=element('button','podium-dismiss','Terminer la cérémonie');
 dismiss.hidden=!organizer;
 root.append(gl,header,names,dismiss);document.body.append(root);
 let stopped=false,raf=0,scene,renderer,observer;
 const cleanup=()=>{stopped=true;cancelAnimationFrame(raf);observer?.disconnect();
  if(scene)scene.traverse(o=>{o.geometry?.dispose();if(o.material){
   for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});
  if(renderer){renderer.dispose();renderer.forceContextLoss();}root.remove();};
 active={id,close:cleanup};
 if(organizer){
  let submitting=false;
  const finish=async()=>{if(submitting)return;submitting=true;dismiss.disabled=true;
   try{await onDismiss();if(active?.close===cleanup)close();}
   catch(error){dismiss.title=String(error);dismiss.disabled=false;submitting=false;}};
  root.addEventListener('click',finish);
 }
 try{
  const T=await import('three');if(stopped)return;
  scene=new T.Scene();scene.fog=new T.FogExp2(0x152519,.027);
  const camera=new T.PerspectiveCamera(48,1,.1,100);
  scene.add(new T.HemisphereLight(0xffebce,0x273d37,3));
  const light=new T.DirectionalLight(0xffdba0,4);light.position.set(-4,9,5);scene.add(light);
  const spot=new T.PointLight(0xbfdcff,65,25);spot.position.set(5,6,-3);scene.add(spot);
  const green=new T.MeshStandardMaterial({color:0x344636,roughness:.32,metalness:.55});
  const gold=new T.MeshStandardMaterial({color:0xf4c05b,metalness:.96,roughness:.14});
  const silver=new T.MeshStandardMaterial({color:0xcdd7df,metalness:.9,roughness:.22});
  const bronze=new T.MeshStandardMaterial({color:0xb78257,metalness:.9,roughness:.23});
  const objects=[];
  function cup(){
   const group=new T.Group();
   const mesh=(shape,y,x=0)=>{const m=new T.Mesh(shape,gold);m.position.set(x,y,0);group.add(m);return m;};
   mesh(new T.CylinderGeometry(.56,.7,.2,48),-.95);
   mesh(new T.CylinderGeometry(.14,.2,.72,32),-.5);
   const points=[[.08,-.22],[.38,-.18],[.62,.03],[.81,.48],[.88,.9],[.72,1.01],[.52,.66],[.1,.19]].map(([x,y])=>new T.Vector2(x,y));
   mesh(new T.LatheGeometry(points,60),.2);
   for(const side of [-1,1]){const h=mesh(new T.TorusGeometry(.4,.075,12,44,Math.PI*1.45),.65,side*.9);h.rotation.z=side>0?-.7:2.35;}
   return group;
  }
  function medal(mat){
   const group=new T.Group();
   const disk=new T.Mesh(new T.CylinderGeometry(.72,.72,.14,64),mat);
   disk.rotation.x=Math.PI/2;group.add(disk);
   const rim=new T.Mesh(new T.TorusGeometry(.72,.08,12,64),mat);
   rim.position.z=.09;group.add(rim);
   const ribbon=new T.Mesh(new T.BoxGeometry(.24,.95,.05),green);
   ribbon.position.set(-.2,.89,-.2);ribbon.rotation.z=.16;group.add(ribbon);
   const counterpart=ribbon.clone();counterpart.position.x=.2;counterpart.rotation.z=-.16;group.add(counterpart);
   return group;
  }
  for(const [rank,x,h] of [[2,-3.5,2.15],[1,0,3.4],[3,3.5,1.5]]){
   if(!rankings[rank-1])continue;
   const step=new T.Mesh(new T.CylinderGeometry(1.35,1.5,h,8),green);
   step.position.set(x,h/2-2.7,0);scene.add(step);
   const figure=rank===1?cup():medal(rank===2?silver:bronze);
   figure.position.set(x,h-1.05,0);figure.userData.base=h-1.05;figure.userData.rank=rank;
   scene.add(figure);objects.push(figure);
   const ring=new T.Mesh(new T.TorusGeometry(1.34,.065,12,60),rank===1?gold:rank===2?silver:bronze);
   ring.rotation.x=Math.PI/2;ring.position.set(x,h-2.68,0);scene.add(ring);
  }
  renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));gl.append(renderer.domElement);
  const resize=()=>{if(stopped)return;const w=Math.max(1,gl.clientWidth),h=Math.max(1,gl.clientHeight);
   renderer.setSize(w,h,false);camera.aspect=w/h;camera.fov=w<h?66:48;camera.updateProjectionMatrix();};
  observer=new ResizeObserver(resize);observer.observe(gl);resize();
  const start=performance.now();
  const frame=now=>{if(stopped)return;const t=(now-start)/1000,p=Math.min(1,t/4);
   const mobile=gl.clientWidth<gl.clientHeight;
   camera.position.set(Math.sin(t*.09)*.55,5.0-p*.6,(18.1-p*4)*(mobile?1.55:1));
   camera.lookAt(0,.1,0);
   for(const o of objects){const emergence=Math.max(0,Math.min(1,(t-.5-o.userData.rank*.2)/1.35));
    o.scale.setScalar(1-Math.pow(1-emergence,3));
    o.rotation.y=t*(o.userData.rank===1?.36:-.20);
    o.position.y=o.userData.base+Math.sin(t+.8*o.userData.rank)*.08;}
   renderer.render(scene,camera);raf=requestAnimationFrame(frame);};
  raf=requestAnimationFrame(frame);
 }catch(_){root.dataset.webgl='unavailable';}
}
window.AlfastaflTournamentPodium={show,close};
})();