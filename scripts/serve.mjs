import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const requestedPortIndex = process.argv.indexOf("--port");
const requestedPort = requestedPortIndex >= 0 ? process.argv[requestedPortIndex + 1] : null;
const PORT = Number(requestedPort || process.env.PORT || 8787);
const HOST = "127.0.0.1";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function safePath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const relative = decoded === "/" ? "index.html" : "." + decoded;
  const target = resolve(ROOT, relative);
  if (target !== ROOT && !target.startsWith(ROOT + sep)) return null;
  return target;
}

const server = createServer(async function (request, response) {
  try {
    const url = new URL(request.url || "/", "http://" + HOST);
    const target = safePath(url.pathname);
    if (!target) {
      response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      response.end("Forbidden");
      return;
    }

    const info = await stat(target);
    if (!info.isFile()) throw new Error("Not a file");
    const body = await readFile(target);
    const extension = extname(target).toLowerCase();
    const cacheControl = extension === ".jpg"
      ? "public, max-age=3600"
      : "no-cache";
    response.writeHead(200, {
      "content-type": contentTypes[extension] || "application/octet-stream",
      "cache-control": cacheControl,
      "x-content-type-options": "nosniff",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not Found");
  }
});

server.listen(PORT, HOST, function () {
  console.log("DISC UP 2 Reach Mission");
  console.log("http://" + HOST + ":" + PORT);
  console.log("Ctrl+C で終了");
});
