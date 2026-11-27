#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./index.js";

export interface CliOptions {
  port: number;
  host: string;
  routerUrl?: string;
  dataDir?: string;
  demo: boolean;
  openBrowser: boolean;
  showHelp: boolean;
  showVersion: boolean;
}

export function parseCliArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    port: Number(process.env.PORT || 3099),
    host: process.env.HOST || "127.0.0.1",
    routerUrl: process.env.NINESCOUT_ROUTER_URL || process.env.NINEHEALTH_ROUTER_URL,
    dataDir: process.env.NINESCOUT_DATA_DIR || process.env.NINEHEALTH_DATA_DIR,
    demo: false,
    openBrowser: true,
    showHelp: false,
    showVersion: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      opts.showHelp = true;
    } else if (arg === "-v" || arg === "--version") {
      opts.showVersion = true;
    } else if (arg === "--no-open") {
      opts.openBrowser = false;
    } else if (arg === "--demo") {
      opts.demo = true;
    } else if (arg === "-p" || arg === "--port") {
      const val = Number(argv[++i]);
      if (Number.isFinite(val) && val > 0 && val <= 65535) opts.port = val;
    } else if (arg.startsWith("--port=")) {
      const val = Number(arg.slice("--port=".length));
      if (Number.isFinite(val) && val > 0 && val <= 65535) opts.port = val;
    } else if (arg === "--host") {
      const val = argv[++i];
      if (val) opts.host = val;
    } else if (arg.startsWith("--host=")) {
      opts.host = arg.slice("--host=".length);
    } else if (arg === "--router") {
      const val = argv[++i];
      if (val) opts.routerUrl = val;
    } else if (arg.startsWith("--router=")) {
      opts.routerUrl = arg.slice("--router=".length);
    } else if (arg === "--data-dir") {
      const val = argv[++i];
      if (val) opts.dataDir = val;
    } else if (arg.startsWith("--data-dir=")) {
      opts.dataDir = arg.slice("--data-dir=".length);
    }
  }

  return opts;
}

function getPackageVersion(): string {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
      path.resolve(here, "..", "..", "package.json"),
      path.resolve(here, "..", "package.json"),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        const pkg = JSON.parse(fs.readFileSync(candidate, "utf8")) as { version?: string };
        if (pkg.version) return pkg.version;
      }
    }
  } catch {
    // ignore
  }
  return "1.0.0";
}

function openUrlInBrowser(url: string): void {
  try {
    if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    } else if (process.platform === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    }
  } catch {
    // Non-fatal if running in a headless environment
  }
}

function printHelp(version: string): void {
  console.log(`
9scout v${version} — 9router Health & Context Window Dashboard

Usage:
  9scout [options]

Options:
  -p, --port <number>     Port to run 9scout on (default: 3099)
  --host <address>        Host interface to bind (default: 127.0.0.1)
  --router <url>          9router base URL (default: http://127.0.0.1:20128)
  --data-dir <path>       Custom directory for local state storage (default: ~/.9scout)
  --demo                  Launch with Demo Sandbox Mode enabled
  --no-open               Do not automatically open the browser
  -v, --version           Print version number
  -h, --help              Show this help message

Examples:
  9scout
  9scout --port 4000 --router http://127.0.0.1:8080
  9scout --demo
`);
}

async function main(): Promise<void> {
  const version = getPackageVersion();
  const opts = parseCliArgs(process.argv.slice(2));

  if (opts.showVersion) {
    console.log(version);
    return;
  }

  if (opts.showHelp) {
    printHelp(version);
    return;
  }

  const storePath = opts.dataDir ? path.join(opts.dataDir, "store.json") : undefined;
  const app = createApp(storePath, {
    routerBaseUrl: opts.routerUrl,
    demoMode: opts.demo ? true : undefined,
  });

  const server = app.listen(opts.port, opts.host, () => {
    const displayHost = opts.host === "0.0.0.0" ? "127.0.0.1" : opts.host;
    const url = `http://${displayHost}:${opts.port}`;
    console.log("");
    console.log(`  9scout v${version} — 9router Health Dashboard`);
    console.log(`  ─────────────────────────────────────────────`);
    console.log(`  Dashboard : ${url}`);
    console.log(`  9router   : ${opts.routerUrl || "http://127.0.0.1:20128"}`);
    if (opts.demo) {
      console.log(`  Mode      : Demo Sandbox`);
    }
    console.log(`  Press Ctrl+C to stop`);
    console.log("");

    if (opts.openBrowser) {
      openUrlInBrowser(url);
    }
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `[9scout] Port ${opts.port} is already in use. Try running: 9scout --port ${opts.port + 1}`
      );
    } else {
      console.error(`[9scout] Failed to start server: ${err.message}`);
    }
    process.exit(1);
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

const isDirectCli =
  process.argv[1] &&
  (() => {
    try {
      return (
        fs.realpathSync(process.argv[1]).toLowerCase() ===
        fs.realpathSync(fileURLToPath(import.meta.url)).toLowerCase()
      );
    } catch {
      return false;
    }
  })();

if (isDirectCli) {
  void main();
}
