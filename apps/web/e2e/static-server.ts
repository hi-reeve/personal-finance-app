import { createServer } from "node:http";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve, sep } from "node:path";

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
 * every other path. Tests can swap the served directory to simulate a new release going live.
 */
export function startStaticServer(initialDir: string, port: number) {
  let root = realpathSync(resolve(initialDir));
  const allowed = [root, realpathSync(tmpdir())];
  /** Only the build output or a folder under the OS temp dir may be served; anything else is refused. */
  const isAllowed = (dir: string) =>
    allowed.some((base) => dir === base || dir.startsWith(base + sep));
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/__site" && req.method === "POST") {
      try {
        const dir = realpathSync(resolve(url.searchParams.get("dir") ?? root));
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
      requested.startsWith(root + sep) && existsSync(requested) && statSync(requested).isFile();
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
