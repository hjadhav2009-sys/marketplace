# Cloudflare Tunnel For Local Production

This mode keeps the app running on the owner Windows PC and exposes it to workers through HTTPS.

1. Install `cloudflared` on Windows.
2. Sign in:

```powershell
cloudflared tunnel login
```

3. Create the tunnel:

```powershell
cloudflared tunnel create meesho-pick-pack
```

4. Route the worker domain:

```powershell
cloudflared tunnel route dns meesho-pick-pack pack.personalizedgiftday.com
```

5. Run the tunnel:

```powershell
cloudflared tunnel run meesho-pick-pack
```

Use `config.yml.example` as the starting point for a named tunnel config. The tunnel service should point at
`http://localhost:3000`, where the local Next.js production server runs.
