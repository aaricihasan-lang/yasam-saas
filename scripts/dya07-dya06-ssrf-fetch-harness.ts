/**
 * DYA-06 — SSRF SAFE-FETCH MECHANICS INTEGRATION HARNESS
 *
 * `fetchValidatedImage` (lib/clients/profileImageFetch) indirme mekaniklerini GERÇEK bir
 * yerel mock HTTP sunucusuna karşı çalıştırır (redirect izleme, gerçek byte-cap, timeout,
 * bozuk stream, format doğrulama). DIŞ AĞA veya production Supabase'e İSTEK GÖNDERMEZ —
 * yalnız 127.0.0.1 üzerinde geçici bir sunucu.
 *
 * NOT: `fetchValidatedImage` URL host doğrulaması YAPMAZ (o `isTrustedStorageImageUrl` ile
 * saf-fonksiyon harness'inde test edilir). Burada indirme davranışı test edilir; host gate
 * localhost'u zaten reddettiği için mekanikleri izole etmek üzere doğrudan bu fonksiyon çağrılır.
 *
 * Çalıştır: npx tsx scripts/dya07-dya06-ssrf-fetch-harness.ts
 */
import http from "node:http";
import { fetchValidatedImage, MAX_PROFILE_IMAGE_BYTES } from "../lib/clients/profileImageFetch";

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) pass++;
  else {
    fail++;
    console.error("FAIL  " + name);
  }
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const GIF = Buffer.from("GIF89a______", "latin1");
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBP")]);

const server = http.createServer((req, res) => {
  const url = req.url || "/";
  if (url === "/png") { res.writeHead(200, { "Content-Type": "image/png" }); res.end(PNG); return; }
  if (url === "/jpeg") { res.writeHead(200, { "Content-Type": "image/jpeg" }); res.end(JPEG); return; }
  if (url === "/gif") { res.writeHead(200, { "Content-Type": "image/gif" }); res.end(GIF); return; }
  if (url === "/webp") { res.writeHead(200, { "Content-Type": "image/webp" }); res.end(WEBP); return; }
  if (url === "/redirect") { res.writeHead(302, { Location: "/png" }); res.end(); return; }
  if (url === "/redirect-host") { res.writeHead(301, { Location: "http://169.254.169.254/latest/" }); res.end(); return; }
  if (url === "/html") { res.writeHead(200, { "Content-Type": "text/html" }); res.end("<!DOCTYPE html><html>x</html>"); return; }
  if (url === "/json") { res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"token":"secret"}'); return; }
  if (url === "/404") { res.writeHead(404); res.end("nope"); return; }
  if (url === "/oversized") {
    // Geçerli PNG imzasıyla başla, sonra cap'i (10MB) aşacak kadar chunked veri gönder.
    // Content-Length YOK (chunked) → header'a güvenilmediği + gerçek byte cap kanıtlanır.
    res.writeHead(200, { "Content-Type": "image/png" });
    res.write(PNG);
    const chunk = Buffer.alloc(1024 * 1024, 0x41); // 1MB
    let sent = 0;
    const target = MAX_PROFILE_IMAGE_BYTES + 2 * 1024 * 1024; // cap + 2MB
    const pump = () => {
      while (sent < target) {
        sent += chunk.length;
        if (!res.write(chunk)) { res.once("drain", pump); return; }
      }
      res.end();
    };
    pump();
    return;
  }
  if (url === "/misleading-length") {
    // Küçük Content-Length beyanı ama gövde büyük → kod Content-Length'e güvenmez, gerçek
    // byte'ları sayar. (Node header uyumsuzluğuna karışmasın diye chunked kullanıyoruz;
    // amaç: kod header-only kontrol YAPMADIĞI için cap gerçek byte'a göre çalışır.)
    res.writeHead(200, { "Content-Type": "image/png" });
    res.write(PNG);
    const big = Buffer.alloc(MAX_PROFILE_IMAGE_BYTES + 1024 * 1024, 0x42);
    res.end(big);
    return;
  }
  if (url === "/slow") {
    // Yanıtı hiç tamamlama → client 5s'de abort etmeli (timeout).
    res.writeHead(200, { "Content-Type": "image/png" });
    res.write(PNG);
    // kasıtlı olarak end() çağrılmaz
    return;
  }
  if (url === "/broken") {
    res.writeHead(200, { "Content-Type": "image/png" });
    res.write(PNG);
    // socket'i aniden kopar → stream error
    req.socket.destroy();
    return;
  }
  res.writeHead(200, { "Content-Type": "image/png" });
  res.end(PNG);
});

async function run(base: string) {
  // Geçerli formatlar kabul edilir
  ok("FETCH-01 png accepted", (await fetchValidatedImage(`${base}/png`)) !== null);
  ok("FETCH-02 jpeg accepted", (await fetchValidatedImage(`${base}/jpeg`)) !== null);
  ok("FETCH-03 gif accepted", (await fetchValidatedImage(`${base}/gif`)) !== null);
  ok("FETCH-04 webp accepted", (await fetchValidatedImage(`${base}/webp`)) !== null);

  // Redirect izlenmez (redirect:"manual" → 3xx null)
  ok("FETCH-05 302 redirect blocked (not followed)", (await fetchValidatedImage(`${base}/redirect`)) === null);
  ok("FETCH-06 301 redirect to link-local blocked", (await fetchValidatedImage(`${base}/redirect-host`)) === null);

  // Format doğrulaması (magic-byte)
  ok("FETCH-07 html body rejected", (await fetchValidatedImage(`${base}/html`)) === null);
  ok("FETCH-08 json body rejected", (await fetchValidatedImage(`${base}/json`)) === null);

  // HTTP hata
  ok("FETCH-09 404 rejected", (await fetchValidatedImage(`${base}/404`)) === null);

  // Gerçek byte-cap (Content-Length YOK, chunked; valid magic prefix ama > 10MB)
  ok("FETCH-10 oversized stream capped (real bytes)", (await fetchValidatedImage(`${base}/oversized`)) === null);
  ok("FETCH-11 misleading length large body capped", (await fetchValidatedImage(`${base}/misleading-length`)) === null);

  // Bozuk stream
  ok("FETCH-12 broken stream rejected", (await fetchValidatedImage(`${base}/broken`)) === null);

  // Timeout (~5s) — hiç tamamlanmayan yanıt abort edilir
  const t0 = Date.now();
  const slow = await fetchValidatedImage(`${base}/slow`);
  const dt = Date.now() - t0;
  ok("FETCH-13 timeout aborts hanging response", slow === null && dt >= 4500 && dt < 8000);
}

async function main() {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }

  console.log(`\nDYA-06 SSRF fetch-mechanics harness: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

void main();
