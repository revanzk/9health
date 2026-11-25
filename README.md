# 9health (9router Health Dashboard)

Standalone CLI + web companion app for **[9router](https://github.com/decolua/9router)**. Monitors active AI model health (especially volatile free-tier models), classifies errors granularly, manages Combos safely with Cascade Impact + Quick Swap, and exposes **Effective Context Window** bottlenecks in real time.

## Install & Run (One Command)

### Option 1: Install globally from npm *(once published)*
```bash
npm install -g 9health
9health
```
Or run without installing:
```bash
npx 9health
```

### Option 2: Install globally directly from GitHub
```bash
npm install -g github:revanzk/9health
9health
```

### Option 3: Local link from this repo
```bash
pnpm install
pnpm run build
npm link
9health
```

Typing `9health` starts the local dashboard on `http://127.0.0.1:3099`, connects to `9router` at `http://127.0.0.1:20128`, and automatically opens your browser. Local settings, manual metadata overrides, and scan results are persisted in `~/.9health/store.json`.

### CLI Options
```text
9health [options]

  -p, --port <number>     Port to run 9health on (default: 3099)
  --host <address>        Host interface to bind (default: 127.0.0.1)
  --router <url>          9router base URL (default: http://127.0.0.1:20128)
  --data-dir <path>       Custom directory for local state storage (default: ~/.9health)
  --demo                  Launch with Demo Sandbox Mode enabled
  --no-open               Do not automatically open the browser
  -v, --version           Print version number
  -h, --help              Show help message
```

## Features (MVP v1.0)
- **Health Scanner (SSE Streaming):** `Scan All`, `By Provider`, `By Combo`, and `Single Model Scan` in either **Rapid Scan** (max 5 global + per-provider concurrency & pacing) or **Single Scan** (sequential). Includes live progress bar and `Stop Scan` that preserves partial completed results.
- **Direct Model Probe & Reasoning Model Support:** Sends lightweight `max_tokens: 1` probes directly to each `provider/model` slug without triggering combo fallback, and automatically retries with `max_completion_tokens` when reasoning models reject `max_tokens: 1`.
- **Granular 6-Status Classification:** `Healthy (200)`, `Rate Limited (429/503)`, `Auth / Quota (401/402/403)`, `Dead / Deprecated (404/410/invalid model)`, `Transient Error (5xx/400)`, and `Timeout / Network`.
- **Smart Safety Guard & Cascade Impact:** Bulk shortcut *"Select All Dead"* only checks `Dead` models (never `429 Rate Limited`). Deleting models checks every affected Combo and offers **Quick Swap** (to fastest Healthy model), **Clean from Combo**, or **Delete Combo** for single-model combos.
- **Combo Manager & Context Bottleneck Detection:** Reorder fallback priority (drag-and-drop or up/down arrows), calculate **Effective Context Window** (min across active models), surface `Unknown` metadata warnings, and highlight models `≤ 50%` of the Combo's max context.
- **3-Tier Metadata Fallback:** `Manual Override` → `9router API` → `Local Metadata Registry` (with 1-click OpenRouter catalog sync).
- **Demo Sandbox Mode:** Built-in offline sandbox (`9health --demo` or Settings) to test every workflow without running 9router.

## Development & Publishing

```bash
# Development (hot-reload API + Vite)
pnpm run dev

# Run tests & build both frontend + CLI server
pnpm test
pnpm run build

# Publish to npm (after `npm login`)
npm publish
```

### Unified Launchers & Docker
- **Windows:** `start-9health.bat`
- **macOS / Linux:** `./start-9health.sh`
- **Docker:** `docker compose up --build` (set 9router Base URL to `http://host.docker.internal:20128` in Settings)
