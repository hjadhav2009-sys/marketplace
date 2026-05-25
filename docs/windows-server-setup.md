# Windows Server PC Setup

This app is meant to run on one dedicated Windows PC in the office. That PC is the server PC. Workers do not need the code, VS Code, terminal access, Prisma, npm, or the `.env` file.

Workers do not need the code. Workers only open the picker/packer browser URL and log in.

## First Setup

1. Install Node.js 22 LTS from `https://nodejs.org/`.
2. Install Git from `https://git-scm.com/`.
3. Clone this repository on the server PC.
4. Create `.env` from `.env.local.production.example` for Supabase PostgreSQL, or `.env.example` for local SQLite testing.
5. Fill `DATABASE_URL`, `SESSION_SECRET`, `NEXT_PUBLIC_APP_URL`, and `SESSION_COOKIE_SECURE`.
6. Run `npm install` once from the repository folder.
7. Double-click:

```text
scripts/windows/start-meesho-app.bat
```

The launcher loads `.env` with `dotenv`, validates required settings, masks `DATABASE_URL` in logs, selects the correct
Prisma schema, builds the app, and starts `npm start`.

## Daily Start

1. Double-click `scripts/windows/start-meesho-app.bat`.
2. Keep the window open while workers pick and pack.
3. Workers open only the browser URL printed by the launcher.

The launcher prints:

- Owner PC URL: `http://localhost:3000`
- Mobile Wi-Fi URL: `http://<LAN-IP>:3000`
- Cloudflare worker URL: `https://pack.personalizedgiftday.com`

## What Stays On The Server PC

- App source code
- `.env`
- Supabase database connection string
- Local image cache under `storage/product-images/`
- Build output and dependencies

Workers should only use their picker/packer browser login.
