// CM-002 验证用静态服务器（零依赖）
// 用法：node tools/server.mjs [port]      默认 8899
// 服务目录：仓库根目录（脚本的上上级）
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.argv[2] || 8899);

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
};

http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split("?")[0]);
    if (rel === "/") rel = "/index.html";
    const fp = path.join(ROOT, rel);

    // 防目录穿越
    if (!fp.startsWith(ROOT)) {
        res.writeHead(403);
        res.end("forbidden");
        return;
    }

    fs.readFile(fp, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end("not found");
            return;
        }
        res.writeHead(200, {
            "Content-Type": MIME[path.extname(fp)] || "application/octet-stream",
            "Cache-Control": "no-store",
        });
        res.end(data);
    });
}).listen(PORT, "127.0.0.1", () => {
    console.log(`static server: http://127.0.0.1:${PORT}  root=${ROOT}`);
});
