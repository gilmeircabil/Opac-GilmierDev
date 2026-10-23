# OPAC Library System v2.0 — Complete MongoDB & Work-From-Anywhere Guide ($0 Cost)

This guide explains how your **OPAC Library System (MongoDB Edition)** works and how to run it **100% free ($0)** so that:
- Your **Database** runs on your **Home Computer** (or MongoDB Atlas Free Cloud),
- You (**Admin**) can manage books, covers, categories, and borrowings from **anywhere** (e.g., a coffee shop on your laptop), and
- **Users / Students** can browse and search the catalog from **anywhere** (school, home, or another city).

---

## 1. How the System Architecture Works

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        HOME PC (or Cloud Atlas)                         │
│                                                                         │
│  ┌─────────────────────────┐        ┌────────────────────────────────┐  │
│  │  MongoDB Database       │◄──────►│  OPAC Backend API Server       │  │
│  │  (Port 27017 or Atlas)  │        │  (Fastify HTTP on Port 47821)  │  │
│  │  • books, authors       │        │  • /api/v1/books (Public)      │  │
│  │  • categories, borrows  │        │  • /api/v1/covers/:filename    │  │
│  │  • images (Base64)      │        │  • /api/v1/admin/* (Admin RPC) │  │
│  └─────────────────────────┘        └───────────────┬────────────────┘  │
└─────────────────────────────────────────────────────┼───────────────────┘
                                                      │
                     Exposed for $0 via Cloudflare Tunnel / Tailscale / LAN
                                                      │
                    ┌─────────────────────────────────┴─────────────────────────────────┐
                    ▼                                                                   ▼
┌───────────────────────────────────────────┐               ┌───────────────────────────────────────────┐
│   ADMIN LAPTOP (e.g., at a Coffee Shop)   │               │     USER / STUDENT PC (Anywhere)          │
│   • Sign in / Setup / Recover Password    │               │     • Browse & Search Books               │
│   • Add/Edit Books & Upload Cover Images  │               │     • Filter by Category / Author / Year  │
│   • Manage Borrowings & Backups           │               │     • View Live Copy Availability         │
└───────────────────────────────────────────┘               └───────────────────────────────────────────┘
```

### Why Cover Images & Logos Work Remotely
Whenever an Admin uploads a book cover or library logo from a remote laptop (e.g., at a coffee shop), the image is read on the Admin's laptop, uploaded over HTTP to the server, and stored inside MongoDB's `images` collection (as well as cached on disk). Every User and Admin anywhere immediately sees the cover image via `/api/v1/covers/:filename`.

---

## 2. Option A: Database on Your Home PC + Free Tunnel ($0 Forever, Unlimited Local Storage)

Use this setup when you want your **Home Computer** to hold the MongoDB database and act as the live server while it is turned on and connected to the internet.

### Step 1: Install MongoDB Community Server on Your Home PC (Free)
1. Download **MongoDB Community Server** (Windows x64 `.msi` installer):
   - https://www.mongodb.com/try/download/community
2. Run the installer and keep **"Install MongoDB as a Service"** checked (default port `27017`).
3. MongoDB will now run automatically in the background at:
   ```text
   mongodb://127.0.0.1:27017/opac
   ```

### Step 2: Launch OPAC Admin on Your Home PC
1. Start the OPAC Admin app (or run `npm run dev` / `OPAC Library System Admin.exe`).
2. The app automatically connects to `mongodb://127.0.0.1:27017/opac` and starts the OPAC API Server on port **`47821`**.
3. Create your Administrator account on first launch.

### Step 3: Put Your Home PC Online for $0 (Choose Cloudflare Tunnel OR Tailscale)

#### Method 1: Cloudflare Quick Tunnel ($0, No Account Needed, Public `https://` URL)
1. On your **Home PC**, open PowerShell and install `cloudflared`:
   ```powershell
   winget install --id Cloudflare.cloudflared
   ```
2. Run this command to expose your OPAC Server (`47821`) to the internet over HTTPS:
   ```powershell
   cloudflared tunnel --url http://127.0.0.1:47821
   ```
3. Cloudflare will print a free public HTTPS URL in the terminal, for example:
   ```text
   https://random-words-here.trycloudflare.com
   ```
4. Copy that `https://....trycloudflare.com` URL!
   *(Tip: If you have a free Cloudflare account, you can also create a Named Tunnel so the URL never changes when you restart.)*

#### Method 2: Tailscale ($0 Personal VPN, Permanent `100.x.y.z` IP That Never Changes)
1. Download and install **Tailscale** (https://tailscale.com) on your Home PC and on your Admin Laptop / User PCs.
2. Copy your Home PC's Tailscale IP (e.g., `100.85.20.15`).
3. Your permanent server address from any coffee shop or network is `100.85.20.15` (Port `47821`).

---

## 3. Option B: MongoDB Atlas Free Cloud ($0 M0 Cluster — Works Even if Home PC is Turned Off!)

If you want your MongoDB database hosted in the cloud for **$0** so your Admin laptop can connect directly to MongoDB from a coffee shop even when your Home PC is off:

1. Go to **MongoDB Atlas** (https://www.mongodb.com/cloud/atlas/register) and create a free account.
2. Create a **Free Shared Cluster (`M0` — $0/month forever)**.
3. Under **Database Access**, create a database user (username + password).
4. Under **Network Access**, click **Add IP Address** → **Allow Access from Anywhere (`0.0.0.0/0`)** so you can connect from any coffee shop Wi-Fi.
5. Click **Connect** → **Drivers** and copy your connection string:
   ```text
   mongodb+srv://YOUR_USER:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/opac?retryWrites=true&w=majority
   ```
6. Open the **OPAC Admin App** → on the **Login screen** (click **"MongoDB / Remote Server"** at the bottom) or in **Settings → Configure Connection**:
   - Select the **MongoDB Database** tab.
   - Paste your `mongodb+srv://...` URI.
   - Click **Test MongoDB** to verify, then click **Save & Connect**.

---

## 4. How to Connect from a Coffee Shop (Admin) or Anywhere (Users)

### Connecting the Admin App from a Coffee Shop
1. Open the **OPAC Admin App** on your laptop at the coffee shop.
2. On the Login screen, click **"MongoDB / Remote Server"** at the bottom:
   - **If your Home PC is running the server + Cloudflare Tunnel / Tailscale**:
     - Switch to the **"Remote OPAC Server"** tab.
     - Enter your Home PC's Tunnel URL (e.g. `https://your-name.trycloudflare.com`) or Tailscale IP (`100.x.y.z` with port `47821`).
     - Click **Test Server**, then **Save Server**.
   - **If you are using MongoDB Atlas (`mongodb+srv://`)**:
     - Stay on the **"MongoDB Database"** tab, paste your `mongodb+srv://...` URI, and click **Save & Connect**.
3. Sign in with your Admin username and password. You can now add books, upload cover images from your laptop, record borrowings, and manage settings from the coffee shop!

### Connecting the User / Student App from Anywhere
1. Open the **OPAC User App** on any student or public computer.
2. Click the **"Server"** button in the top-right header (or **"Configure Server URL"** on the connecting screen).
3. Enter:
   - **Same Wi-Fi / LAN**: Your Home/Server PC's LAN IP (shown in Admin → Settings, e.g. `192.168.1.50` and port `47821`).
   - **Anywhere on the Internet**: Your Cloudflare Tunnel URL (`https://your-name.trycloudflare.com`) or Tailscale IP (`100.x.y.z` and port `47821`).
4. Click **Test Server** → **Save Server**. The catalog loads immediately!

---

## 5. Building Installers & Commands Reference

```powershell
# Run in development mode
npm run dev

# Typecheck & build production bundles
npm run typecheck
npm run build

# Build Windows Installers (.exe)
npm run dist:admin   # Builds Admin Installer
npm run dist:user    # Builds User (Public Catalog) Installer
npm run dist:all     # Builds both Admin and User Installers
```

---

## 6. Version Checkpoints (Git Tags)

Your repository has two saved version checkpoints so you can always inspect or switch between versions:
- **`v1.0.0-postgres-save`**: Original PostgreSQL version checkpoint before the MongoDB migration.
- **`v2.0.0-mongodb`**: Full MongoDB + Remote Work-From-Anywhere version.

To view your saved versions at any time:
```powershell
git tag -l
```
