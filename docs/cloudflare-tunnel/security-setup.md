# Cloudflare Tunnel Safety Setup

Cloudflare Tunnel is optional. It gives workers an HTTPS/domain URL without opening router ports.

## How It Works

- Cloudflare Tunnel runs on the owner/server PC.
- The tunnel points to `http://localhost:3000`.
- Workers open `https://pack.personalizedgiftday.com`.
- App login is still required for every picker, packer, and owner page.
- Cached product images are protected by the app session and account checks.

## Daily Tunnel Flow

1. Start the app with `scripts/windows/start-meesho-app.bat`.
2. Start the tunnel:

```powershell
cloudflared tunnel run meesho-pick-pack
```

3. Workers open:

```text
https://pack.personalizedgiftday.com
```

## Local Wi-Fi Testing

Cloudflare is not required for same-Wi-Fi testing.

Use:

```text
http://<PC-IP>:3000
```

For local HTTP, set:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
SESSION_COOKIE_SECURE=false
```

## Cloudflare HTTPS Mode

For the production tunnel URL, set:

```env
NEXT_PUBLIC_APP_URL=https://pack.personalizedgiftday.com
SESSION_COOKIE_SECURE=true
```

## Owner Security Checklist

- Use strong owner, picker, and packer passwords.
- Remove or change all demo users/passwords.
- Owner can deactivate/reactivate users from **Owner -> Users**.
- Owner can reset passwords without seeing plaintext passwords.
- Owner can force password change on next login.
- Owner can close active sessions for unknown devices.
- Rotate `SESSION_SECRET` if it was exposed in a screenshot, chat, GitHub, or a worker device.

Recommended future hardening:

- Enable Cloudflare Access for allowed owner/worker emails.
- Keep Cloudflare and Windows updated.
- Review **Owner -> System** and audit logs regularly.
