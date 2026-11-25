# 9health (9router Health Dashboard)

Standalone web companion app + thin local proxy for **[9router](https://github.com/decolua/9router)**. Monitors active AI model health (especially volatile free-tier models), classifies errors granularly, manages Combos safely with Cascade Impact + Quick Swap, and exposes **Effective Context Window** bottlenecks in real time.

## Features (MVP v1.0)
- **Health Scanner (SSE Streaming):** `Scan All`, `By Provider`, `By Combo`, and `Single Model Scan` in either **Rapid Scan** (max 5 global + per-provider concurrency & pacing) or **Single Scan** (sequential). Includes live progress bar and `Stop Scan` that preserves partial completed results.
- **Direct Model Probe & Reasoning Model Support:** Sends lightweight `max_tokens: 1` probes directly to each `provider/model` slug without triggering combo fallback, and automatically retries with `max_completion_tokens` when reasoning models reject `max_tokens: 1`.
- **Granular 6-Status Classification:** `Healthy (200)`, `Rate Limited (429/503)`, `Auth / Quota (401/402/403)`, `Dead / Deprecated (404/410/invalid model)`, `Transient Error (5xx/400)`, and `Timeout / Network`.
- **Smart Safety Guard & Cascade Impact:** Bulk shortcut *"Select All Dead"* only checks `Dead` models (never `429 Rate Limited`). Deleting models checks every affected Combo and offers **Quick Swap** (to fastest Healthy model), **Clean from Combo**, or **Delete Combo** for single-model combos.
- **Combo Manager & Context Bottleneck Detection:** Reorder fallback priority (drag-and-drop or up/down arrows), calculate **Effective Context Window** (min across active models), surface `Unknown` metadata warnings, and highlight models `≤ 50%` of the Combo's max context.
- **3-Tier Metadata Fallback:** `Manual Override` → `9router API` → `Local Metadata Registry` (with 1-click OpenRouter catalog sync).
- **Demo Sandbox Mode:** Built-in offline sandbox inside Settings to test every workflow without running 9router.

## Quick Start

```bash
pnpm install
pnpm run build
pnpm run start
```

Open `http://127.0.0.1:3099` (default 9router target: `http://127.0.0.1:20128`).

### Development Mode
```bash
pnpm run dev
```
- Backend proxy & scanner: `http://127.0.0.1:3099`
- Vite dev server: `http://127.0.0.1:5173`

### Unified Launchers
- **Windows:** run `start-9health.bat`
- **macOS / Linux:** run `./start-9health.sh`
- **Docker:** `docker compose up --build` (set 9router Base URL to `http://host.docker.internal:20128` in Settings)

### Tests
```bash
pnpm test
```
