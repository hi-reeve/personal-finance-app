import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const TEMPLATE = join(dirname(fileURLToPath(import.meta.url)), "sw.template.js");
const SERVICE_WORKER = "sw.js";

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

/**
 * Lists the built site, derives a version from its content, and writes `sw.js` into it.
 * The version changes whenever any file changes, so each release produces a new service worker.
 */
export function buildPrecache(siteDir: string): { version: string; files: string[] } {
  const paths = listFiles(siteDir)
    .map((file) => ({ file, url: "/" + relative(siteDir, file).split(sep).join("/") }))
    .filter(({ url }) => url !== "/" + SERVICE_WORKER)
    .sort((a, b) => (a.url < b.url ? -1 : 1));

  const hash = createHash("sha256");
  for (const { file, url } of paths) {
    hash.update(url).update("\0").update(readFileSync(file)).update("\0");
  }
  const version = hash.digest("hex").slice(0, 12);
  const files = paths.map(({ url }) => url);

  const sw = readFileSync(TEMPLATE, "utf8")
    .replace("__VERSION__", JSON.stringify(version))
    .replace("__PRECACHE__", JSON.stringify(files, null, 2));
  writeFileSync(join(siteDir, SERVICE_WORKER), sw);
  return { version, files };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const siteDir = process.argv[2] ?? "dist/client";
  const { version, files } = buildPrecache(siteDir);
  console.log(`Precache ${version}: ${files.length} files -> ${siteDir}/${SERVICE_WORKER}`);
}
