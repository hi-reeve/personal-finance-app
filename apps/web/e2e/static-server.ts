import { createServer } from "node:http";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, normalize, resolve, sep } from "node:path";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
};

/**
 * Serves a built site the way production hosting must: real files first, then the SPA shell for
 * client routes. A missing file with an extension is a 404, not the shell. Tests can swap the served
 * directory to simulate a new release going live.
 */
export function startStaticServer(initialDir: string, port: number) {
  const initialRoot = realpathSync(resolve(initialDir));
  let root = initialRoot;
  const tempRoot = realpathSync(tmpdir());
  /** Only the build output, or a `pfa-release-*` folder the tests made directly under the temp dir. */
  const isAllowed = (dir: string) =>
    dir === initialRoot || (dirname(dir) === tempRoot && basename(dir).startsWith("pfa-release-"));

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (url.pathname === "/__site") {
      // A custom header forces browsers to ask permission first, so other web pages cannot call this.
      if (req.method !== "POST" || req.headers["x-pfa-test"] !== "1") {
        res.writeHead(403).end();
        return;
      }
      try {
        const dir = realpathSync(resolve(url.searchParams.get("dir") ?? initialRoot));
        if (!isAllowed(dir)) throw new Error("outside allowed folders");
        root = dir;
        res.writeHead(204).end();
      } catch {
        res.writeHead(403).end();
      }
      return;
    }

    const requested = join(root, normalize(url.pathname));
    const isFile =
      requested.startsWith(root + sep) &&
      existsSync(requested) &&
      statSync(requested).isFile() &&
      realpathSync(requested).startsWith(root + sep);
    const ext = extname(url.pathname);
    if (!isFile && ext !== "" && ext !== ".html") {
      res.writeHead(404).end();
      return;
    }
    const file = isFile ? requested : join(root, "_shell.html");
    res.writeHead(200, {
      "content-type": TYPES[extname(file)] ?? "application/octet-stream",
      "cache-control": "no-cache",
    });
    res.end(readFileSync(file));
  });
  // Loopback only: this server is a test fixture and must not be reachable from the network.
  server.listen(port, "127.0.0.1");
  return server;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  startStaticServer(process.argv[2] ?? "dist/client", Number(process.argv[3] ?? 4173));
}
