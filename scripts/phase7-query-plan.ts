import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { createPhase7ScaleDatabase } from "./phase7-scale-data";

const seeded=await createPhase7ScaleDatabase("small");await seeded.db.$disconnect();const db=new DatabaseSync(seeded.file);
const queries: Array<[string,string,SQLInputValue[]]> = [
  ["Order AWB","SELECT id FROM \"Order\" WHERE awb=? AND accountId=? LIMIT 25",["P7-AWB-1","p7-account-1"]],
  ["Order tracking","SELECT id FROM \"Order\" WHERE trackingId=? AND accountId=? LIMIT 25",["P7-TRACK-GROUP","p7-account-0"]],
  ["Listing identifier","SELECT marketplaceListingId FROM MarketplaceListingIdentifier WHERE identifierType=? AND normalizedValue=? AND accountId=? LIMIT 25",["FNSKU","P7-FNSKU-4","p7-account-0"]],
  ["Task queue","SELECT id FROM WorkTask WHERE accountId=? AND sourceType=? AND stage=? AND status=? LIMIT 25",["p7-account-0","CONSIGNMENT","PICK","READY"]],
  ["Task assignment","SELECT id FROM WorkTask WHERE accountId=? AND assignedUserId=? AND stage=? AND status=? LIMIT 25",["p7-account-0","p7-owner","PICK","READY"]],
  ["Snapshot FNSKU","SELECT id FROM ConsignmentLine WHERE accountId=? AND fnskuSnapshot=? LIMIT 25",["p7-account-0","P7-FNSKU-1"]]
];
let failed=false;for(const [label,sql,params] of queries){const plan=db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as Array<{detail:string}>;const detail=plan.map((row)=>row.detail).join(" | ");if(/SCAN (?:TABLE )?(?:Order|MarketplaceListingIdentifier|WorkTask|ConsignmentLine)\b/i.test(detail)&&!/USING (?:COVERING )?INDEX/i.test(detail))failed=true;console.log(`${label}: ${detail}`);}db.close();if(failed)throw new Error("A Phase 7 exact-match query uses an unindexed table scan.");
