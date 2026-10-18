import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { buildPrecache } from "./precache";

const dirs: string[] = [];
function site(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "pfa-site-"));
  dirs.push(dir);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const base = {
  "_shell.html": "<html>v1</html>",
  "assets/app-abc.js": "console.log(1)",
  "assets/app-abc.css": "body{}",
  "manifest.webmanifest": "{}",
};

describe("buildPrecache", () => {
  it("lists every built file by URL and writes a service worker that precaches them", () => {
    const dir = site(base);
    const { files } = buildPrecache(dir);

    expect(files).toEqual([
      "/_shell.html",
      "/assets/app-abc.css",
      "/assets/app-abc.js",
      "/manifest.webmanifest",
    ]);
    const sw = readFileSync(join(dir, "sw.js"), "utf8");
    for (const url of files) expect(sw).toContain(JSON.stringify(url));
  });

  it("never precaches the service worker itself", () => {
    const dir = site({ ...base, "sw.js": "old" });
    expect(buildPrecache(dir).files).not.toContain("/sw.js");
  });

  it("gives the same version for the same content and a new one when anything changes", () => {
    const a = buildPrecache(site(base)).version;
    const b = buildPrecache(site(base)).version;
    const changed = buildPrecache(site({ ...base, "assets/app-abc.js": "console.log(2)" })).version;
    expect(a).toBe(b);
    expect(changed).not.toBe(a);
  });

  it("changes the service worker file when the content changes, so browsers see an update", () => {
    const one = site(base);
    const two = site({ ...base, "_shell.html": "<html>v2</html>" });
    buildPrecache(one);
    buildPrecache(two);
    expect(readFileSync(join(one, "sw.js"), "utf8")).not.toBe(
      readFileSync(join(two, "sw.js"), "utf8"),
    );
  });
});
