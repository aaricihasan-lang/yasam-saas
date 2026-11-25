// AYLIK EFEMERİS — YEREL e2e için sahte HTTPS sağlayıcı (YALNIZ 127.0.0.1; gerçek sağlayıcıya / ağa çıkış YOK).
// Yalnız iki aylık ucu yanıtlar ve yalnız "local-fake-roxy-key" başlığını kabul eder (gerçek anahtar burada KULLANILMAZ).
// Yanıtlar QA kanıt klasöründeki GERÇEK kayıtlı yanıtlardır (w-YYYY-MM.json / v-YYYY-MM.json); kaydı olmayan ay 502 döner.
// İstek sayacı: GET /__count → { western, vedic, total, byMonth } (e2e, ücretli çağrı sayısını bu sayaçla doğrular).
// Çalıştırma: node scripts/astrology/monthly-ephemeris-fake-provider.mjs <port> <cert.pem> <key.pem> [kanıt-klasörü]
import fs from "node:fs";
import https from "node:https";
import path from "node:path";

const [PORT = "54400", CERT, KEY, DIR = "C:/YasamSistemi-QA/ATLAS-AYLIK-EFEMERIS-2026-11-24/yanit"] = process.argv.slice(2);
const counts = { western: 0, vedic: 0, total: 0, byMonth: {} };
const send = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};
https
  .createServer({ cert: fs.readFileSync(CERT), key: fs.readFileSync(KEY) }, (req, res) => {
    const url = new URL(req.url ?? "/", "https://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/__count") return send(res, 200, counts);
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      if (req.headers["x-api-key"] !== "local-fake-roxy-key") return send(res, 401, { error: "unauthorized" });
      const kind = url.pathname === "/api/v2/astrology/planets/monthly" ? "western" : url.pathname === "/api/v2/vedic-astrology/planetary-positions/monthly" ? "vedic" : null;
      if (!kind) return send(res, 404, { error: "not found" });
      let body = {};
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      } catch {
        return send(res, 400, { error: "bad json" });
      }
      counts[kind] += 1;
      counts.total += 1;
      const ym = `${body.year}-${String(body.month).padStart(2, "0")}`;
      counts.byMonth[`${kind}:${ym}`] = (counts.byMonth[`${kind}:${ym}`] ?? 0) + 1;
      if (kind === "vedic" && body.coordinateSystem !== "sidereal") return send(res, 400, { error: "e2e: Vedik gövde sidereal olmalı" });
      const f = path.join(DIR, `${kind === "western" ? "w" : "v"}-${ym}.json`);
      if (!fs.existsSync(f)) return send(res, 502, { error: "kayıtlı yanıt yok" });
      console.log(`fake-monthly ${kind} ${ym} (#${counts.total})`);
      return send(res, 200, JSON.parse(fs.readFileSync(f, "utf8")).response);
    });
  })
  .listen(Number(PORT), "127.0.0.1", () => console.log(`fake monthly provider https :${PORT}`));
