'use strict';
// Gera apenas calendário e classificação inicial. Resultados entram pelo motor de partidas.
function createTournament(input, seed) {
 const teams=input.map(t=>({id:String(t.id),name:String(t.name),lineup:t.lineup.map(p=>[String(p[0]),String(p[1]),Number(p[2])])}));
 const entrants=teams.map((t,i)=>({...t,slot:i}));
 const rotation=entrants.slice();if(rotation.length%2)rotation.push(null);
 const rounds=[],matches=[];const total=rotation.length-1;
 for(let r=0;r<total;r++){
  const ids=[];for(let i=0;i<rotation.length/2;i++){
   const a=rotation[i],b=rotation[rotation.length-1-i];if(!a||!b)continue;
   const home=r%2===0?a:b,away=r%2===0?b:a,id='R'+(r+1)+'-'+(i+1);
   matches.push({id,round:r+1,homeId:home.id,awayId:away.id,homeName:home.name,awayName:away.name,status:'scheduled',homeGoals:null,awayGoals:null});ids.push(id);
  }
  rounds.push(ids);const fixed=rotation[0];const tail=rotation.slice(1);tail.unshift(tail.pop());rotation.splice(0,rotation.length,fixed,...tail);
 }
 const standings=teams.map(t=>({id:t.id,name:t.name,pts:0,j:0,v:0,e:0,d:0,gp:0, gc:0,sg:0}));
 return {id:'league-'+String(seed),stage:'league',teams,matches,rounds,standings,playoff:{status:'locked',qualifiers:4,semifinals:[],final:null}};
}
module.exports={createTournament};
