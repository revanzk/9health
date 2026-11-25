import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../server/cli.js";

describe("parseCliArgs", () => {
  it("uses sensible defaults", () => {
    const opts = parseCliArgs([]);
    expect(opts.port).toBe(3099);
    expect(opts.host).toBe("127.0.0.1");
    expect(opts.openBrowser).toBe(true);
    expect(opts.demo).toBe(false);
    expect(opts.showHelp).toBe(false);
    expect(opts.showVersion).toBe(false);
  });

  it("parses port, host, router, data-dir, demo, and no-open flags", () => {
    const opts = parseCliArgs([
      "--port",
      "4100",
      "--host=0.0.0.0",
      "--router",
      "http://127.0.0.1:8080",
      "--data-dir=/tmp/9health",
      "--demo",
      "--no-open",
    ]);
    expect(opts.port).toBe(4100);
    expect(opts.host).toBe("0.0.0.0");
    expect(opts.routerUrl).toBe("http://127.0.0.1:8080");
    expect(opts.dataDir).toBe("/tmp/9health");
    expect(opts.demo).toBe(true);
    expect(opts.openBrowser).toBe(false);
  });

  it("parses help and version shorthands", () => {
    expect(parseCliArgs(["-h"]).showHelp).toBe(true);
    expect(parseCliArgs(["--version"]).showVersion).toBe(true);
  });
});
