# First Light — Disney Edition
## Your Setup Guide (step by step)

Everything **you** need to do to get the app from GitHub onto your Unraid server and reachable through Cloudflare. The code side (server, modules, Docker, templates) is already built — these are the operator steps only.

**What you'll need before starting:**
- Your Unraid server with the **Community Applications** plugin installed
- Your GitHub account (repo: `Blackthoarne/Disney-Tracker`)
- A domain whose DNS is managed by Cloudflare (free plan is fine)
- ~45 minutes total

---

## Part 1 — Merge the code and get a Docker image built (~10 min)

The app publishes itself as a Docker image via GitHub Actions whenever `main` changes. One-time setup:

1. **Merge the branch.** On GitHub, open the repo → open a Pull Request from `claude/app-architecture-unraid-4h50gv` into `main` → review → **Merge**. (Or ask me to open the PR for you.)
2. **Watch the build.** Repo → **Actions** tab → the "docker" workflow should run automatically after the merge. Wait for the green check (~2–4 min). If Actions are disabled for the repo, the tab will show an "enable workflows" button — click it, then re-run.
3. **Make the image public** (one time — GHCR images are private by default and Unraid can't pull private images without extra auth):
   - Your GitHub profile → **Packages** → `disney-tracker`
   - **Package settings** (right side) → **Danger Zone** → **Change visibility** → **Public**
4. Note your image name: `ghcr.io/blackthoarne/disney-tracker:latest` (all lowercase).

> **Every future update** is just: change code on `main` (or merge a PR) → Actions rebuilds the image → on Unraid, Docker tab → *Check for Updates* → *Apply update*. That's your whole deploy pipeline.

---

## Part 2 — Install on Unraid (~10 min)

### Option A: Use the included template (recommended)

1. On your Unraid box, copy the template file from the repo (`unraid/first-light.xml`) to the flash drive:
   - Over SMB: copy it to `\\TOWER\flash\config\plugins\dockerMan\templates-user\`
   - Or via terminal: `wget -O /boot/config/plugins/dockerMan/templates-user/first-light.xml https://raw.githubusercontent.com/Blackthoarne/Disney-Tracker/main/unraid/first-light.xml`
2. Unraid web UI → **Docker** tab → **Add Container** → in the **Template** dropdown pick **FirstLight**.

### Option B: Manual Add Container

Docker tab → **Add Container** and fill in:

| Field | Value |
|---|---|
| Name | `FirstLight` |
| Repository | `ghcr.io/blackthoarne/disney-tracker:latest` |
| Network type | `bridge` |
| Port | Host `8080` → Container `8080` (pick another host port if 8080 is taken) |
| Path | Host `/mnt/user/appdata/first-light` → Container `/config` (read/write) |
| Variable | `TZ` = `America/New_York` |
| Variable | `ADMIN_TOKEN` = a long random string — this is your curation-editor password. Generate one: `openssl rand -hex 24`. **Save it in your password manager.** |
| WebUI | `http://[IP]:[PORT:8080]/` |

### Either way, then:

3. Click **Apply**. Unraid pulls the image and starts it.
4. Wait ~30 seconds, then click the container icon → **WebUI**. The dashboard should load with live wait times and weather.
5. Sanity checks:
   - `http://UNRAID_IP:8080/api/health` in a browser → should show `"ok": true`
   - Star a ride, open the app on a second device on your LAN → the favorite appears there too (favorites are now server-side)
   - The Docker tab should show the container **healthy** after a minute or two

---

## Part 3 — Expose it through Cloudflare Tunnel (~15 min)

No port forwarding — the tunnel dials **out** from your server.

1. **Create the tunnel:** [one.dash.cloudflare.com](https://one.dash.cloudflare.com) → **Networks → Tunnels** → **Create a tunnel** → type *Cloudflared* → name it (e.g. `unraid`). On the connector page, **copy the token** (long string in the install command).
2. **Run the connector on Unraid:** Apps tab → search **cloudflared** (Community Applications) → Install → paste the token into the *Tunnel Token* field → Apply. Back in the Cloudflare dashboard the tunnel should show **HEALTHY** within a minute.
3. **Add the public hostname:** in the tunnel's config → **Public Hostname** → **Add**:
   - Subdomain: `firstlight` (→ `firstlight.yourdomain.com`)
   - Service: **HTTP** → `UNRAID_IP:8080` (e.g. `192.168.1.50:8080`)
   - Save. Cloudflare creates the DNS record automatically.
4. **Test:** from your phone **on cellular** (not Wi-Fi), open `https://firstlight.yourdomain.com`. Full dashboard, valid HTTPS.
5. **Cache rule** (recommended): Cloudflare dashboard (main, not Zero Trust) → your domain → **Rules → Cache Rules** → Create:
   - *If* URI Path starts with `/api/` → **Bypass cache**.
   - Leave everything else default.

---

## Part 4 — Protect the admin editor with Cloudflare Access (~5 min)

Anyone with the URL can *view* the dashboard (handy in the parks); only you can reach the editor.

1. Zero Trust dashboard → **Access → Applications** → **Add an application** → *Self-hosted*
2. Application name: `First Light Admin`; domain: `firstlight.yourdomain.com`, path: `admin`
3. Add a policy: name `Household`, action **Allow**, include → **Emails** → your email(s) (e.g. `hoganjg@proton.me`)
4. Session duration: set to something long like **1 month** so it doesn't nag you
5. Save. Now visiting `/admin` prompts for an email one-time PIN before the page even reaches your server. The `ADMIN_TOKEN` you set in Part 2 is the second lock — the admin page asks for it when you hit Save.

> Optional: if you want the *whole* dashboard private, add a second Access application for the root domain with the same policy. Trade-off: you'll occasionally re-login on your phone in the park.

---

## Part 5 — Day-to-day use

### Editing curated content ("active curation")
1. Go to `https://firstlight.yourdomain.com/admin` (pass the email PIN)
2. Pick a section (Limited-Time Eats, Dole Whip, AP Perks, Adults Only, PhotoPass, Contacts)
3. Add/edit/remove cards, set the pill label (e.g. "Through Jul 31") and an **expires** date where relevant — expired items automatically dim on the dashboard
4. Preview → paste your `ADMIN_TOKEN` → **Save**. Changes are live on every device on the next refresh
5. Made a mess? Every save keeps a timestamped backup — use **Restore** on the module's backup list

### Phones: install it as an app
On iPhone: open the site in Safari → Share → **Add to Home Screen**. (Android: Chrome menu → *Install app*.) It opens full-screen like a native app.

### Updating the app
Code merged to `main` → GitHub Actions builds → Unraid **Docker** tab → *Check for Updates* → apply. Your favorites and curated edits live in `/mnt/user/appdata/first-light` and survive every update/reinstall.

### Backups
Install the **Appdata Backup** plugin (Apps tab) if you don't have it, and make sure `/mnt/user/appdata/first-light` is included. It's all small JSON files.

---

## Quick troubleshooting

| Symptom | Fix |
|---|---|
| Unraid can't pull the image ("unauthorized" / "manifest unknown") | Part 1 step 3 — the GHCR package is still private, or the Actions build hasn't finished |
| Container starts but WebUI is blank | Check container logs (Docker tab → logs). Wrong port mapping is the usual cause |
| Dashboard shows "stale" badge | Upstream API (themeparks.wiki / weather.gov) is having a moment — the app is serving its last good data on purpose. It self-heals |
| Waits/weather never load at all | Server can't reach the internet — check Unraid DNS, and container logs for fetch errors |
| `/admin` won't save (401) | Wrong/missing `ADMIN_TOKEN` — compare the container variable with what you're typing |
| Cloudflare hostname 502 | cloudflared container down, or the Public Hostname service points at the wrong IP:port |
| Favorites differ between devices | One device is still on a cached old page — hard-refresh / reinstall the home-screen app once |

---

## Checklist (print-friendly)

- [ ] Merge branch → `main`
- [ ] Actions build green
- [ ] GHCR package set to **Public**
- [ ] Container installed on Unraid (port, `/config` appdata path, `TZ`, `ADMIN_TOKEN` saved in password manager)
- [ ] WebUI loads; `/api/health` ok; favorite syncs across two devices
- [ ] cloudflared tunnel HEALTHY; `firstlight.yourdomain.com` works on cellular
- [ ] Cache rule: bypass `/api/*`
- [ ] Access app on `/admin` with email OTP
- [ ] Edited + saved one curated card end-to-end
- [ ] Added to phone home screen
- [ ] Appdata backup includes `first-light`
