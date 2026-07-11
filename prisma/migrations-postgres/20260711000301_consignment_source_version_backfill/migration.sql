INSERT INTO "ConsignmentImportFile" ("id","consignmentBatchId","fileType","originalFileName","managedRelativePath","fileSizeBytes","sha256","parsed","isCurrentSource","rowCount","notes","createdAt")
SELECT 'cif_source_' || "id","id",'SOURCE_UPLOAD',"sourceFileName","sourceUploadRelativePath",0,"sourceFileSha256",false,true,0,'Backfilled retained source upload',CURRENT_TIMESTAMP
FROM "ConsignmentBatch" WHERE "sourceUploadRelativePath" IS NOT NULL
ON CONFLICT DO NOTHING;
