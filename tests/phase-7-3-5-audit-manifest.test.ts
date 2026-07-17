import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const manifestPath="docs/audits/phase-7-3-5-file-review-manifest.jsonl",tracked=execFileSync("git",["ls-files","-z"],{encoding:"buffer"}).toString("utf8").split("\0").filter(Boolean).sort(),records=readFileSync(manifestPath,"utf8").trim().split("\n").map(line=>JSON.parse(line) as{path:string;sha256:string|null;hashPolicy?:string;finalStatus:string;reviewedRanges:string[]}),byPath=new Map(records.map(record=>[record.path,record]));
assert.equal(records.length,new Set(records.map(record=>record.path)).size,"Manifest paths are unique");for(const path of tracked){const record=byPath.get(path);assert.ok(record,`Missing audit receipt: ${path}`);assert.ok(record.finalStatus,"Every receipt has a completed status");if(path===manifestPath)assert.equal(record.hashPolicy,"SELF_REFERENTIAL_MANIFEST");else assert.match(record.sha256??"",/^[a-f0-9]{64}$/);}
assert.equal(records.filter(record=>tracked.includes(record.path)).length,tracked.length,"Manifest has one receipt for every tracked path");console.log(`Phase 7.3.5 audit manifest covers ${tracked.length}/${tracked.length} tracked files.`);
