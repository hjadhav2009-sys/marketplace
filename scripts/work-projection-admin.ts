import { prisma } from "../lib/prisma";
import { rebuildWorkGroupProjection } from "../src/lib/workflow/work-group-projection";

const mode=process.argv[2]??"inspect",accountArg=process.argv.find(value=>value.startsWith("--account="))?.slice(10),confirmed=process.argv.includes("--confirm-projection-rebuild");
const where=accountArg?{accountId:accountArg}:{};

async function main(){
 if(mode==="inspect"){
  const states=await prisma.workProjectionState.findMany({where,orderBy:[{accountId:"asc"},{sourceType:"asc"},{stage:"asc"}]});
  const active=await prisma.workTask.groupBy({by:["accountId","sourceType","stage"],where:{...where,status:{in:["READY","IN_PROGRESS","PROBLEM"]}},_count:{_all:true}});
  console.log(JSON.stringify({states,active},null,2));return;
 }
 if(mode==="rebuild"&&!confirmed)throw new Error("Explicit rebuild requires --confirm-projection-rebuild.");
 let targets;
 if(mode==="repair"){
  const [states,active]=await Promise.all([
   prisma.workProjectionState.findMany({where,select:{accountId:true,sourceType:true,stage:true,state:true}}),
   prisma.workTask.groupBy({by:["accountId","sourceType","stage"],where:{...where,status:{in:["READY","IN_PROGRESS","PROBLEM"]}},_count:{_all:true}})
  ]);
  const stateByKey=new Map(states.map(item=>[`${item.accountId}:${item.sourceType}:${item.stage}`,item]));
  targets=[];
  for(const cohort of active){
   const target={accountId:cohort.accountId,sourceType:cohort.sourceType,stage:cohort.stage};
   const state=stateByKey.get(`${target.accountId}:${target.sourceType}:${target.stage}`);
   const [groups,projected]=await Promise.all([
    prisma.workGroupProjection.count({where:target}),
    prisma.workGroupMember.count({where:{projection:target,task:{status:{in:["READY","IN_PROGRESS","PROBLEM"]}}}})
   ]);
   if(!state||["DIRTY","FAILED","UNINITIALIZED"].includes(state.state)||groups===0||projected!==cohort._count._all)targets.push(target);
  }
 }else targets=await prisma.workTask.groupBy({by:["accountId","sourceType","stage"],where:{...where,status:{in:["READY","IN_PROGRESS","PROBLEM"]}}});
 const results=[];for(const target of targets)results.push({...target,...await rebuildWorkGroupProjection(target)});console.log(JSON.stringify({mode,results},null,2));
}

main().finally(()=>prisma.$disconnect());
