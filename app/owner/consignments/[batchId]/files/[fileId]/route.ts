import { getCurrentUser, getSelectedAccount } from "@/lib/auth";
import { hasWorkPermission } from "@/lib/work-permissions";
import { prisma } from "@/lib/prisma";
import { openConsignmentReadStream } from "@/src/lib/consignments/storage";
import { privateStreamResponse } from "@/src/lib/files/private-stream-response";

export async function GET(_request: Request, context: { params: Promise<{ batchId: string; fileId: string }> }) {
 const user=await getCurrentUser(); if(!user) return Response.json({error:"Authentication required."},{status:401});
 if(!(hasWorkPermission(user,"canViewConsignments")||hasWorkPermission(user,"canImportConsignments")||hasWorkPermission(user,"canManageConsignments"))) return Response.json({error:"Forbidden."},{status:403});
 const account=await getSelectedAccount(user); if(!account) return Response.json({error:"Account required."},{status:403});
 const {batchId,fileId}=await context.params;
 const file=await prisma.consignmentImportFile.findFirst({where:{id:fileId,consignmentBatchId:batchId,consignmentBatch:{accountId:account.id}},select:{originalFileName:true,managedRelativePath:true}});
 if(!file?.managedRelativePath) return Response.json({error:"File not found."},{status:404});
 try { const stream=await openConsignmentReadStream(file.managedRelativePath); return privateStreamResponse(stream,{fileName:file.originalFileName}); } catch { return Response.json({error:"File unavailable."},{status:404}); }
}
