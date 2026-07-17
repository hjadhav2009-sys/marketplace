import { DatabaseSync } from "node:sqlite";
import { mkdirSync,readFileSync,readdirSync,rmSync } from "node:fs";
import { join,resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
export function createTempWorkflowDb(name:string){const root=resolve(process.cwd(),".codex-tmp");mkdirSync(root,{recursive:true});const file=resolve(root,name+".db");rmSync(file,{force:true});const sqlite=new DatabaseSync(file);sqlite.exec("PRAGMA foreign_keys=ON;");for(const migration of readdirSync(resolve("prisma/migrations"),{withFileTypes:true}).filter(item=>item.isDirectory()).map(item=>item.name).sort())sqlite.exec(readFileSync(join("prisma/migrations",migration,"migration.sql"),"utf8"));sqlite.close();const db=new PrismaClient({datasourceUrl:"file:"+file.replace(/\\/g,"/")});return{db,file,cleanup:async()=>{await db.$disconnect();rmSync(file,{force:true});}};}
