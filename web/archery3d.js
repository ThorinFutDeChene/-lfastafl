/* Real bow-mounted arrows for Álfastafl's articulated elven sculptures.
 * The origin is the normalized sculptor's bowstring anchor, a child of
 * combat-left-arm, never a generic vertical offset from the chest.
 *
 * Arrow geometry in cinematic3d points along local +Y. Its tail is at
 * -0.205 local Y; place its center 0.205 forward of the nock so that the
 * tail physically touches the moving string at release.
 *
 * Functions operate on visual Three.js objects only, no Tafl rules.
 */
import * as THREE from 'three';
import {smooth} from './combat-motion.js';

const UP=new THREE.Vector3(0,1,0);
const HALF_SHAFT=.205;
const clamp=t=>Math.max(0,Math.min(1,Number(t)||0));

export function bowNockWorld(archer){
 if(archer?.userData?.kind!=='E')return null;
 const anchor=archer.getObjectByName('combat-bow-nock');
 if(!anchor||anchor.parent?.name!=='combat-left-arm')return null;
 // The bow arm has already been posed for this exact animation frame.
 archer.updateWorldMatrix(true,true);
 return anchor.getWorldPosition(new THREE.Vector3());
}

export function nockArrow(arrow,archer,target){
 const origin=bowNockWorld(archer);
 if(!origin||!target?.isVector3||!arrow)return null;
 const direction=target.clone().sub(origin);
 if(direction.lengthSq()<.0001)return null;
 direction.normalize();
 // The arrow's rear end sits on the real bowstring, not in the torso.
 arrow.position.copy(origin).addScaledVector(direction,HALF_SHAFT);
 arrow.quaternion.setFromUnitVectors(UP,direction);
 arrow.userData.bowOrigin=origin.toArray();
 arrow.userData.bowDirection=direction.toArray();
 arrow.userData.bowStage='nocked';
 return {origin,direction};
}

export function flightArrow(arrow,archer,target,fraction){
 const nocked=nockArrow(arrow,archer,target);
 if(!nocked)return false;
 const {origin,direction}=nocked;
 // Stop the arrow at the shield surface, not through the bronze chest.
 const destination=target.clone().addScaledVector(direction,-.26);
 const release=origin.clone().addScaledVector(direction,HALF_SHAFT);
 arrow.position.copy(release).lerp(destination,clamp(fraction));
 arrow.userData.bowStage='flight';
 return true;
}

export function deflectArrow(arrow,archer,shield,ricochet,fraction){
 const nocked=nockArrow(arrow,archer,shield);
 if(!nocked)return false;
 const inbound=nocked.direction;
 const outbound=ricochet.clone().sub(shield).normalize();
 if(outbound.lengthSq()<.0001)return false;
 const start=shield.clone().addScaledVector(inbound,-.26);
 const end=ricochet.clone().addScaledVector(outbound,-.20);
 arrow.position.copy(start).lerp(end,clamp(fraction));
 arrow.quaternion.setFromUnitVectors(UP,outbound);
 arrow.userData.bowStage='deflection';
 return true;
}

/** Generic (non-flank, non-throne) elf duels: real nocking on both volleys. */
export function poseDuelArrow(arrow,archer,target,duelProgress) {
 const p=clamp(duelProgress);
 if(!arrow)return false;
 arrow.visible=(p>=.035&&p<.29)||(p>=.50&&p<.78);
 if(!arrow.visible)return false;
 if(p<.11)return Boolean(nockArrow(arrow,archer,target));
 if(p<.22)return flightArrow(arrow,archer,target,smooth(p,.11,.22));
 if(p<.29){
  const bounce=target.clone().add(new THREE.Vector3(.31,.24,-.24));
  return deflectArrow(arrow,archer,target,bounce,smooth(p,.22,.29));
 }
 if(p<.65)return Boolean(nockArrow(arrow,archer,target));
 return flightArrow(arrow,archer,target,smooth(p,.65,.78));
}
