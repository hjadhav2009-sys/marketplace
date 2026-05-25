# Meesho Pick & Pack

Production-ready foundation for a small ecommerce seller's daily Meesho warehouse workflow.

The app supports the daily local warehouse flow:

- Owner uploads Meesho label and/or supplier manifest PDFs for parser review.
- The parser extracts AWB, courier, SKU, quantity, color, size, order number, product description, payment type, and related invoice fields where available.
- Owner maps SKU to a Meesho product image URL. Product files are not stored.
- Picker sees SKU, color, and size grouped mobile-first product cards.
- Packer scans AWB with the mobile browser camera or enters AWB manually, verifies order details, confirms packed, or marks a problem order.

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Prisma ORM
- SQLite for local development
- Supabase PostgreSQL for production hosting
- Zod validation
- Server actions
- PWA-ready manifest and icon

## Setup

Create `.env` from the example:

```bash
cp .env.example .env
```

Install dependencies:

```bash
npm install
```

Create the local SQLite database:

```bash
npx prisma migrate dev
```

Seed sample data:

```bash
npm run db:seed
```

Start the app:

```bash
npm run dev -- --host 0.0.0.0
```

Open locally:

```text
http://localhost:3000
```

## Mobile Testing On The Same Wi-Fi

1. Keep the dev server running with `npm run dev -- --host 0.0.0.0`.
2. Find your PC's local IP address.
   - Windows: run `ipconfig` and use the IPv4 address for your Wi-Fi adapter.
   - Example: `192.168.1.25`.
3. On your phone, open:

```text
http://192.168.1.25:3000
```

Your phone and PC must be on the same network. If Windows Firewall prompts for Node.js, allow private network access.

## Free-first daily setup: Windows PC + Supabase + Cloudflare Tunnel

This is the recommended production workflow for the warehouse today.

- The app runs on the owner Windows PC.
- Supabase Free PostgreSQL stores the database.
- Workers open `https://pack.personalizedgiftday.com` in a browser.
- Cloudflare Tunnel forwards that HTTPS domain to `http://localhost:3000` on the owner PC.
- PDF parsing runs locally on the PC, which is more reliable than serverless for heavier Meesho PDFs.
- The browser camera barcode scanner works through HTTPS.
- The app code, terminal, Prisma, and npm stay on the owner PC. Workers only use the browser login.
- Product images are only external URLs stored in the database. Product image files are not uploaded or stored.
- Hostinger Node.js is not needed for this mode.
- Vercel is not needed for this mode.

The owner PC must stay powered on, connected to the internet, and running both the app and Cloudflare Tunnel during work.

Production URL:

```text
https://pack.personalizedgiftday.com
```

Create `.env` from `.env.local.production.example` on the owner PC:

```env
DATABASE_URL=<supabase postgres url>
SESSION_SECRET=<long secret>
NEXT_PUBLIC_APP_URL=https://pack.personalizedgiftday.com
NEXT_PUBLIC_APP_NAME=Meesho Pick & Pack
LOCAL_NETWORK_ONLY=false
NODE_ENV=production
```

Do not expose the Supabase database password in GitHub, browser code, screenshots, or worker devices.

Start local production on Windows:

```powershell
scripts\windows\start-local-prod.ps1
```

or double-click:

```text
scripts\windows\start-local-prod.bat
```

The script checks Node.js, checks `.env`, installs dependencies when `node_modules` is missing, builds the app, and starts
`npm start` on `http://localhost:3000`.

### Supabase setup

1. Create a Supabase project.
2. Open the project database settings and copy the PostgreSQL connection string.
3. Use the pooled connection string if connection limits or short-lived restarts become a problem.
4. Put the connection string only in the owner PC `.env` as `DATABASE_URL`.
5. Do not use Supabase Storage for product images. The app stores only external `imageUrl` values.

For a fresh Supabase database, open this once after the app starts:

```text
https://pack.personalizedgiftday.com/setup
```

Create the first owner user and first account there. The setup page only works while the `User` table is empty; after the
first user exists it redirects to `/login`.

### Cloudflare Tunnel setup

Install `cloudflared` on Windows, then run:

```powershell
cloudflared tunnel login
cloudflared tunnel create meesho-pick-pack
cloudflared tunnel route dns meesho-pick-pack pack.personalizedgiftday.com
cloudflared tunnel run meesho-pick-pack
```

Use `docs/cloudflare-tunnel/config.yml.example` for a named tunnel config:

```yaml
tunnel: meesho-pick-pack
credentials-file: path-to-credentials-json
ingress:
  - hostname: pack.personalizedgiftday.com
    service: http://localhost:3000
  - service: http_status:404
```

### Production checklist

- Change all demo passwords before real warehouse use.
- Use a strong `SESSION_SECRET`.
- Keep the owner PC awake during warehouse work.
- Confirm `npm start` is running locally on `http://localhost:3000`.
- Confirm Cloudflare Tunnel is running and `https://pack.personalizedgiftday.com` loads over HTTPS.
- On a fresh Supabase database, open `/setup` once to create the first owner and account.
- Test login, account selection, SKU image import, PDF upload, parse review, confirm import, manual AWB search, and scanner.
- Open **Owner -> System** and resolve production warnings.
- Export a test CSV from **Owner -> System**.

### Alternative deployment: VPS

A small VPS can also run this app with Supabase PostgreSQL. Use Node.js 22+, set the same environment variables, run
`npm run build`, and start with `npm start`. A VPS is usually a better hosted option than shared Node.js when PDF parsing
must stay reliable.

### Alternative deployment attempts

Hostinger shared Node.js and Vercel compatibility files are kept where useful, but they are not the recommended path for
this warehouse workflow.

- Hostinger shared Node.js caused deployment, domain, and runtime confusion in testing. Keep it only as a lower-priority
  experiment.
- Vercel is convenient for many Next.js apps, but it is not recommended here for heavy PDF parsing because serverless
  limits can make large text extraction less predictable.
- If using any hosted runtime, still use Supabase PostgreSQL through `prisma/schema.postgres.prisma`; keep SQLite for
  local development only.

The explicit production helpers still exist:

```bash
npm run build:prod
npm run start:prod
npm run db:migrate:prod
```

### Data retention guidance

The expected load of around 6 accounts and up to 600 orders per day is reasonable for a small Supabase PostgreSQL
deployment, but monitor database growth. Keep operational orders active for daily work and use CSV exports plus cleanup
tools to control temporary parser rows and operational logs.

Sprint 4 adds the first retention tools under **Owner -> Cleanup**:

- Upload preview rows: 30 days
- Import row issues: 60 days
- Scan logs: 90 days
- Audit logs: 180 days

Cleanup never deletes orders, SKU image mappings, accounts, or users. The owner must type `CLEANUP` before deleting old
temporary rows or logs, and every cleanup action is audited.

### Backup plan

- Export CSV backups weekly from **Owner -> System**.
- Keep the SKU image mapping CSV somewhere safe because it is operationally important.
- Export orders, packed orders, problem orders, scan logs, upload batches, and SKU mappings before major cleanup.
- Use Supabase database backup/export options for full database recovery.
- Do not store product image files; only external image URLs are exported.

### Daily startup checklist

1. Start the app on the owner PC with `scripts\windows\start-local-prod.ps1`.
2. Start Cloudflare Tunnel with `cloudflared tunnel run meesho-pick-pack`.
3. Confirm `http://localhost:3000` works on the owner PC.
4. Confirm `https://pack.personalizedgiftday.com` works from a worker phone.
5. Create real owner, picker, and packer users.
6. Change or deactivate all demo passwords/users.
7. Upload SKU image mappings.
8. Upload test Meesho label/manifest PDFs.
9. Confirm import and duplicate protection.
10. Test barcode scanning on HTTPS.
11. Export a test CSV.
12. Open **Owner -> System** and confirm production checks are OK.

### Production troubleshooting

- Prisma connection failed: confirm `DATABASE_URL`, database password, Supabase project status, and whether the pooled
  connection string is required.
- HTTPS domain not active: confirm Cloudflare Tunnel is running and the DNS route points to
  `pack.personalizedgiftday.com`.
- Local app not starting: check Node.js version, `.env`, `node_modules`, build output, and whether another process is
  already using port `3000`.
- Supabase connection pool issue: switch to the pooled connection string, keep connection limits conservative, and avoid
  opening database tools from many devices at once.

## Safe Local Usage

Run the app only on the shop/office PC. In the recommended daily setup, workers should use the HTTPS tunnel URL:

```text
https://pack.personalizedgiftday.com
```

For same-Wi-Fi development only, workers can use the PC IP address:

```text
http://YOUR_PC_IP:3000
```

Workers do not need the codebase, VS Code, terminal, Prisma, or npm. Keep those on the owner PC only.

## Same Wi-Fi Security

Every app page except the login screen requires an active login. Use strong passwords, keep the owner password private,
and deactivate worker users from **Owner -> Users** if an unknown phone or browser appears.

Owners can create picker/packer users, assign an account, edit names/usernames/roles, reset passwords, reactivate users,
deactivate users, and close sessions for unknown devices. Workers can change their own password from the app header.

Optional local network protection:

```env
LOCAL_NETWORK_ONLY=true
ALLOWED_IP_RANGES="192.168.0.0/16,10.0.0.0/8,172.16.0.0/12"
```

Localhost is always allowed for owner testing on the PC. The app also reads `x-forwarded-for` / `x-real-ip` so it can
work behind a reverse proxy later.

## Seed Login

All seed users use password `demo1234`.

| Username | Role |
| --- | --- |
| `owner` | OWNER |
| `picker` | PICKER |
| `packer` | PACKER |

Seed account and order:

| Field | Value |
| --- | --- |
| Account | Sullery |
| AWB | 1490834915493571 |
| Courier | Delhivery |
| SKU | 1202919298_6 |
| Qty | 1 |
| Color | Silver |
| Order No | 290010756104090432_1 |
| Product | Sports Jersey Number Personalized Pendant |
| Image URL | https://images-r.meesho.com/images/products/576264463/z71on.avif |

## SKU Image Import

Owners can import persistent SKU-to-image mappings from:

```text
/owner/sku-mappings/import
```

CSV or `.xlsx` columns:

```csv
sku,image_url,product_name,notes
1202919298_6,https://images-r.meesho.com/images/products/576264463/z71on.avif,Sports Jersey Number Personalized Pendant,Seed mapping
```

Required columns:

- `sku`
- `image_url`

Optional columns:

- `account`
- `product_name`
- `notes`
- `active`

Common alternate names are accepted, including `SKU`, `sku_code`, `supplier_sku`, `image`, `imageUrl`,
`meesho_image_url`, `product_image_url`, `name`, `product_title`, and `account_name`.

Existing mappings are upserted by `accountId + sku`. Same URL/data is counted as unchanged; changed rows update the
stored URL and metadata. Product image files are never stored.

## Supported Meesho PDFs

The owner upload page supports text-based Meesho seller PDFs:

- Meesho Sub Order Labels, usually named `Sub_Order_Labels_*.pdf`
- Meesho Supplier Manifest / Picklist, usually named `Supplier_Manifest_*.pdf`

Upload a label PDF, a manifest/picklist PDF, or both. The app parses the file on the server, stores review rows, and
does not persist the original PDF.

## Parser Design

Sprint 6 uses local server-side text extraction, page diagnostics, and layout-tolerant reconstruction:

- PDF text is extracted page by page with an open-source Node parser.
- Every upload stores parser diagnostics in `UploadBatch.notes`, including page count, pages with/without text, missing
  AWB/SKU counts, duplicate AWBs inside the file, low confidence rows, unknown layout pages, and parser warnings.
- Page diagnostics record text length, detected sections, and page-level issues.
- Label pages are anchored around invoice, AWB, courier, and Product Details text.
- AWB candidates are scored so order numbers, invoice numbers, GSTIN values, and PIN codes are ignored.
- Manifest courier tables are reconstructed from line groups so wrapped sub order numbers and wrapped SKUs can be fixed.
- Hidden/control separators in SKUs are normalized, for example `SUL-PN-BC-SS-BL...Allah40` becomes `SUL-PN-BC-SS-BL-Allah40`.
- Unknown manifest row blocks are marked for review instead of being silently ignored.
- Each parsed row gets a confidence score and issue badges.
- Rows with missing AWB or SKU are held for review and are not imported as normal orders.
- Uploading both labels and manifest enables cross-checks for missing AWBs, SKU mismatches, quantity mismatches, courier warnings, and picklist total mismatches.

If text extraction is empty or almost empty, the review screen shows: `This looks like a scanned/image PDF. OCR is required.`
The OCR-ready interface lives in `lib/parsers/ocr`, but heavy OCR is not implemented yet. If parser confidence is low,
the owner should review the row before confirming import.

## Daily Workflow

1. Upload label PDF and/or manifest PDF from **Owner -> Upload labels**.
2. Review parsed rows, confidence, duplicates, missing AWBs/SKUs, missing image mappings, and cross-check issues.
3. Fix missing SKU image mappings when needed.
4. Confirm import. Orders flow through the duplicate-safe `accountId + AWB` importer.
5. Pickers pick by SKU/color/size groups.
6. Packers scan or type AWB, verify product details, and confirm packed.
7. Owner exports weekly CSV backups and runs cleanup when old temporary rows are eligible.

## Daily Picker Workflow

1. Log in as a picker and choose the assigned seller account.
2. Open **Pick**.
3. Search or filter pending SKU groups.
4. Match the product image, SKU, color, size, and total quantity.
5. Open a SKU group to see AWBs and courier split.
6. Mark the group picked, or mark a pick problem if stock/color/size is wrong.

## Daily Packer Workflow

1. Log in as a packer and choose the assigned seller account.
2. Open **Pack**.
3. Scan the AWB barcode from the shipping label with the browser camera, or type the AWB manually.
4. Verify the product image, SKU, quantity, color, courier, account, order number, and AWB.
5. Confirm packed. Repeating the same confirmation is safe and will not duplicate updates.
6. Mark problem if the item is missing, wrong, or unclear.
7. Use **Scan next** for the next label.

## Barcode Scanner

The AWB scanner runs in the browser with an open-source barcode reader. No APK is required.

- Camera permission is requested by the packing page.
- Rear/environment camera is preferred on phones.
- Manual AWB entry is always visible and should be used if camera access fails.
- Camera scanning usually requires HTTPS on phones. Localhost works for PC testing, but phone access over plain HTTP may be blocked by the browser.
- Production should use `https://pack.personalizedgiftday.com` before relying on camera scanning.

## Owner User Management

Before daily use, open **Owner -> Users**:

1. Create worker users for pickers and packers.
2. Assign each worker to the correct Meesho seller account.
3. Change all demo passwords.
4. Use at least 8 characters and avoid `demo1234`.
5. Close sessions if an unknown phone/browser appears.
6. Deactivate users who should no longer access the app.

Before each real packing day:

1. Confirm worker users exist and can log in.
2. Upload or update SKU image mappings.
3. Upload Meesho PDFs and confirm import.
4. Test one scanner read and one manual AWB lookup.
5. Test one packing confirm on a known order.

## Duplicate Protection

Orders are protected by the unique key `accountId + awb`. Re-uploading old + new Meesho picklist/label files will not
duplicate work:

- Missing AWB rows are rejected.
- Existing AWBs are skipped when unchanged.
- Existing AWBs can update safe fields such as courier, order number, SKU, quantity, color, and product description.
- Batch review pages show created, updated, duplicate, skipped, and error counts.

## Image Handling

Only image URLs are stored. Images are loaded directly from their source URL in the browser; the app does not proxy,
download, or store image files.

If an image URL is missing or fails in the browser, product cards show a clean fallback with a "Check URL" prompt. Broken
mapping health is recorded for owner reports when the browser detects a load failure.

## Useful Scripts

```bash
npm run dev
npm run build
npm run build:prod
npm run typecheck
npm run lint
npm run test:validators
npm run validate
npm run db:seed
npm run db:migrate:prod
npm run start:prod
scripts\windows\start-local-prod.ps1
```

## Database Notes

Local development uses `prisma/schema.prisma` with SQLite:

```env
DATABASE_URL="file:./dev.db"
```

SQLite is for local development only. Supabase PostgreSQL is for production hosting.

Production uses the mirrored PostgreSQL schema:

```bash
npx prisma migrate deploy --schema prisma/schema.postgres.prisma
```

When `DATABASE_URL` starts with `postgres://` or `postgresql://`, Prisma uses the production migration path
`prisma/migrations-postgres`.

## Privacy And Data Handling

- The foundation stores only operational order fields needed for picking and packing.
- Product image files are not stored. Only `imageUrl` is stored for SKU mapping.
- Customer personal data is intentionally minimal. City/state are optional parser outputs.
- Upload actions do not persist raw PDF files.
- The app does not scrape Meesho.

## Scanner Notes

- `/packing` submits camera scans and manual searches through the same backend AWB action.
- The scanner does not store photos or video.
- Barcode scanner support depends on the phone browser, camera permission, and HTTPS.
