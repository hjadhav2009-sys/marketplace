import { spawn } from "node:child_process";
const child=spawn(process.execPath,["scripts/start.mjs"],{cwd:process.cwd(),env:{...process.env,PORT:"3001"},stdio:"inherit"});child.on("exit",(code)=>process.exit(code??0));child.on("error",(error)=>{console.error(error.message);process.exit(1);});
