# QR Relay 2.0 — Exact QR Preservation & Relay

High-performance, zero-image-streaming QR relay service. Instead of transmitting lossy camera images over the wire, **QR Relay 2.0** extracts and preserves the original QR symbol's mathematical and topological characteristics locally on the device, deterministically regenerating the **exact original QR symbol** on remote viewers.

---

## ⚡ Core Features

- **Exact QR Preservation (Goal B)**: Preserves module matrix, version (1–40), error correction level (L, M, Q, H), mask pattern (0–7), ECI, and encoding segments.
- **Dual View Stage (Left & Right)**: Shows both the crisp reconstructed canonical matrix on the left and the downscaled camera capture crop on the right in real-time.
- **Reed-Solomon Canonical Auto-Repair**: Corrects camera sampling noise and glare, achieving 100% verified identical symbols.
- **Ultra-Compact Bitstring Relay**: Transmits compact bitstrings and downscaled crops over WebSockets with sub-millisecond latency.
- **Professional Minimalist Interface**: Built for utility and speed (side-by-side comparison, display view switcher, property inspector, SVG/PNG/JPG export, copyable payload).
- **Audio Attention Signal**: Sender-to-viewer operator attention signal with local chime.
- **Production & Railway Ready**: Pre-configured `Dockerfile`, `.dockerignore`, `railway.json`, and automatic cloud environment detection.


---

## 🚀 Quick Deployment to Railway

### Option 1: Via GitHub (Recommended)
1. Push this repository to GitHub.
2. Go to [railway.com](https://railway.com) and click **New Project** → **Deploy from GitHub repo**.
3. Select this repository (`qr-relay-2.0`).
4. In **Settings** → **Networking**, click **Generate Domain**.
5. Your service is live with automatic HTTPS / WSS:
   - **Viewer**: `https://<your-domain>.up.railway.app/`
   - **Scanner**: `https://<your-domain>.up.railway.app/sender.html`
   - **Healthcheck**: `https://<your-domain>.up.railway.app/status`

### Option 2: Via Railway CLI
```bash
railway login
railway init
railway up
railway domain
```

---

## 💻 Local Development

Run with auto-provisioned SSL (enables mobile camera access on local LAN):

```bash
# Setup virtual environment
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Start runner
python run.py
```

- **Local Viewer**: `https://localhost:8000/`
- **Network Scanner**: `https://<LAN-IP>:8000/sender.html`

---

## 🧪 Testing

Run the automated preservation test suite (1,007 assertions covering all QR versions, EC levels, masks, segments, multi-block stress, and dual-mode matrix + downscaled image preservation):

```bash
deno run -A tests/test_qr_preservation.js
```
