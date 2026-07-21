/**
 * Minimal HTTP server for the browser example. No framework, no bundler — just
 * `node:http` + the repo's existing `tsx`. Generation runs here in Node (the
 * server-driven-UI model DynUI is built for); the browser only renders the
 * validated UITree it receives.
 *
 *   npm run demo:web   →   http://localhost:3000
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { buildScreen, PRESETS, SIGNALS, type GenerateInput } from "./pipeline.js";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, "public");
const PORT = Number(process.env.PORT ?? 3000);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const readBody = (req: import("node:http").IncomingMessage) =>
  new Promise<string>((resolve, reject) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 1_000_000) reject(new Error("payload too large"));
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

    // Config for the client: presets + editable signals.
    if (url.pathname === "/api/config") {
      res.writeHead(200, { "content-type": MIME[".json"] });
      res.end(JSON.stringify({ presets: PRESETS, signals: SIGNALS }));
      return;
    }

    // Run the deterministic pipeline for the posted edits.
    if (url.pathname === "/api/generate" && req.method === "POST") {
      const input = JSON.parse(await readBody(req)) as GenerateInput;
      const result = await buildScreen({
        behavior: input.behavior ?? {},
        personalization: input.personalization !== false,
        priorityOverrides: input.priorityOverrides,
      });
      res.writeHead(200, { "content-type": MIME[".json"] });
      res.end(JSON.stringify(result));
      return;
    }

    // Static files.
    const rel = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = normalize(join(publicDir, rel));
    if (!filePath.startsWith(publicDir)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    const info = await stat(filePath).catch(() => null);
    if (!info?.isFile()) {
      res.writeHead(404).end("Not found");
      return;
    }
    res.writeHead(200, {
      "content-type": MIME[extname(filePath)] ?? "application/octet-stream",
    });
    createReadStream(filePath).pipe(res);
  } catch (err) {
    res.writeHead(500, { "content-type": MIME[".json"] });
    res.end(JSON.stringify({ error: (err as Error).message }));
  }
});

server.listen(PORT, () => {
  console.log(`\n  DynUI browser example → http://localhost:${PORT}\n`);
});
