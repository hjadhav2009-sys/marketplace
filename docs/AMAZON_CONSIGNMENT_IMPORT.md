# Amazon Consignment Import

Select an active Amazon seller account, open **Owner > Consignments > New**, enter the shipment reference, and upload the shipment report plus optional All Listings/catalog files. ZIP archives may contain the same supported report types.

The importer classifies content from headers, stores files in ignored managed storage, synchronizes the selected account's listing master, and creates a draft preview. It never creates worker tasks during upload. If no shipment report or more than one shipment candidate is found, activation remains blocked for owner review.

Accepted formats: CSV, TSV, TXT, XLSX, XLSM, and ZIP. Legacy XLS, encrypted workbooks, executable entries, nested archives, unsafe paths, and files beyond configured limits are rejected. Never commit real reports, extracted catalogs, or managed import storage.
