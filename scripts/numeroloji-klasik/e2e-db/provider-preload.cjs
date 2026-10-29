/**
 * Klasik Numeroloji E2E — sağlayıcı fetch ön yüklemesi (Next sunucu süreci: NODE_OPTIONS="--require <bu dosya>").
 *
 * Mod (NUMK_E2E_PROVIDER):
 *   • "replay" (varsayılan): https://roxyapi.com/api/v2/numerology/... istekleri KAYITLI ham yanıtlardan
 *     (NUMK_E2E_RAW_DIR, varsayılan C:/YasamSistemi-QA/NUMEROLOJI-KLASIK-2026-10-29/raw) yanıtlanır.
 *     Eşleşme: istek yolu + kanonik JSON gövde (anahtarlar sıralı); ?lang= yok sayılır (aynı gövdeli birden çok
 *     kayıtta istenen dil tercih edilir). Kaydedilmiş x-ratelimit-* başlıkları yanıta eklenir.
 *     Iska → HTTP 599 hata JSON'u + iska kaydı. /daily ıskası (opak HMAC tohumu kaydedilemez) → kayıtlı bir
 *     /daily gövdesinden türetilen DETERMİNİSTİK SENTETİK yanıt (log'da "synthetic_daily" olarak işaretli).
 *   • "real": sağlayıcıya gerçek istek (ÜCRETLİ). Her denemeden ÖNCE deftere "attempt" (fsync), sonra "result"
 *     yazılır (scripts/numeroloji-klasik/live/runner.ts ile aynı biçim); defterdeki attempt ≥ 500 → istek REDDEDİLİR.
 *     Bu E2E'yi yazan oturum gerçek modu ÇALIŞTIRMADI.
 * Ağ kilidi (her iki mod): 127.0.0.1 / localhost dışındaki her host → hata fırlatılır + kayıt.
 * Olay kaydı: NUMK_E2E_LOG (jsonl) — her sağlayıcı isteği / ıska / kilit olayı bir satır (anahtar YAZILMAZ).
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const MODE = (process.env.NUMK_E2E_PROVIDER || "replay").trim();
const RAW_DIR = process.env.NUMK_E2E_RAW_DIR || "C:/YasamSistemi-QA/NUMEROLOJI-KLASIK-2026-10-29/raw";
const QA_DIR = process.env.NUMK_E2E_QA_DIR || "C:/YasamSistemi-QA/NUMEROLOJI-KLASIK-2026-10-29";
const LEDGER = path.join(QA_DIR, "ledger.jsonl");
const LOG = process.env.NUMK_E2E_LOG || "";
const CAP = 500;
const PROVIDER_PREFIX = "https://roxyapi.com/api/v2/numerology/";

function log(row) {
  if (!LOG) return;
  try {
    fs.appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), pid: process.pid, ...row }) + "\n");
  } catch {
    /* kayıt en iyi çaba */
  }
}

/** Anahtarları sıralı kanonik JSON. */
function canon(v) {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
}

let INDEX = null;
function index() {
  if (INDEX) return INDEX;
  INDEX = new Map();
  let files = [];
  try {
    files = fs.readdirSync(RAW_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    files = [];
  }
  for (const f of files.sort()) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(RAW_DIR, f), "utf8"));
      const c = j && j.case;
      if (!c || typeof c.path !== "string") continue;
      const key = `${c.method || "POST"} ${c.path} ${c.method === "GET" ? "" : canon(c.body || {})}`;
      const arr = INDEX.get(key) || [];
      arr.push({ file: f, lang: c.lang || "tr", http: j.http, rl: j.rl || {}, body: j.body });
      INDEX.set(key, arr);
    } catch {
      /* bozuk kayıt atlanır */
    }
  }
  return INDEX;
}

function pickDailyTemplate() {
  for (const f of ["m02-daily-a-1.json", "m02-daily-noseed.json"]) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(RAW_DIR, f), "utf8"));
      if (j && j.body && typeof j.body === "object") return j;
    } catch {
      /* sonraki */
    }
  }
  return null;
}

function jsonResponse(status, body, headers) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...(headers || {}) } });
}

function attemptsSoFar() {
  try {
    return fs.readFileSync(LEDGER, "utf8").split("\n").filter((l) => l.includes('"event":"attempt"')).length;
  } catch {
    return 0;
  }
}
function appendDurable(row) {
  const fd = fs.openSync(LEDGER, "a");
  try {
    fs.writeSync(fd, JSON.stringify(row) + "\n");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

if (typeof globalThis.fetch === "function" && !globalThis.__numkE2ePreload) {
  globalThis.__numkE2ePreload = true;
  const realFetch = globalThis.fetch;
  log({ event: "preload", mode: MODE });

  async function replay(url, init) {
    const u = new URL(url);
    const method = String((init && init.method) || "GET").toUpperCase();
    const p = u.pathname.replace(/^\/api\/v2/, "");
    const lang = u.searchParams.get("lang") || "tr";
    let bodyObj = {};
    if (method !== "GET" && init && typeof init.body === "string") {
      try {
        bodyObj = JSON.parse(init.body);
      } catch {
        bodyObj = { __unparsable: true };
      }
    }
    const key = `${method} ${p} ${method === "GET" ? "" : canon(bodyObj)}`;
    const hits = index().get(key);
    if (hits && hits.length) {
      const h = hits.find((x) => x.lang === lang) || hits[0];
      log({ event: "replay_hit", endpoint: `${method} ${p}`, file: h.file, http: h.http });
      return jsonResponse(h.http || 200, h.body, h.rl);
    }
    if (p === "/numerology/daily" && method === "POST") {
      const t = pickDailyTemplate();
      if (t) {
        const date = typeof bodyObj.date === "string" ? bodyObj.date : t.body.date;
        const seed = typeof bodyObj.seed === "string" ? bodyObj.seed : null;
        const b = { ...t.body, date, seed: seed ? `${seed}-${date}` : null };
        if (typeof b.dailyMessage === "string") b.dailyMessage = b.dailyMessage.replace(/\d{4}-\d{2}-\d{2}/g, date);
        log({ event: "synthetic_daily", endpoint: `${method} ${p}`, template: "m02-daily-a-1.json" });
        return jsonResponse(200, b, t.rl || {});
      }
    }
    log({ event: "replay_miss", endpoint: `${method} ${p}`, key });
    return jsonResponse(599, { error: "e2e replay: kayıtta yok", endpoint: `${method} ${p}` });
  }

  async function real(url, init) {
    const n = attemptsSoFar();
    const u = new URL(url);
    const method = String((init && init.method) || "GET").toUpperCase();
    const endpoint = `${method} ${u.pathname.replace(/^\/api\/v2/, "").replace(/\/\d+$/, "/{n}")}`;
    if (n >= CAP) {
      log({ event: "real_refused_cap", endpoint, attempts: n });
      throw new Error(`TAVAN DOLDU ${n}/${CAP}`);
    }
    const id = `e2e-db-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    appendDurable({ at: new Date().toISOString(), event: "attempt", id, endpoint, purpose: "e2e-db gerçek mod (tarayıcı uçtan uca)", credit: 1, totalAttempts: n + 1, remainingSession: CAP - n - 1 });
    log({ event: "real_attempt", endpoint, id });
    const t0 = Date.now();
    let http = null;
    let kind = "ok";
    const rl = {};
    try {
      const res = await realFetch(url, init);
      http = res.status;
      for (const h of ["x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-used", "x-ratelimit-reset", "retry-after"]) {
        const v = res.headers.get(h);
        if (v !== null) rl[h] = v;
      }
      if (!res.ok) kind = `http_${res.status}`;
      return res;
    } catch (e) {
      kind = e && e.name === "AbortError" ? "timeout" : "network";
      throw e;
    } finally {
      appendDurable({ at: new Date().toISOString(), event: "result", id, endpoint, http, kind, credit: 1, totalAttempts: n + 1, remainingSession: CAP - n - 1, rl, ms: Date.now() - t0 });
      log({ event: "real_result", endpoint, id, http, kind });
    }
  }

  globalThis.fetch = async function numkE2eFetch(input, init) {
    let url;
    if (typeof input === "string") url = input;
    else if (input instanceof URL) url = input.href;
    else url = String((input && input.url) || input);
    if (/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?([/?#]|$)/.test(url) || url.startsWith("data:") || url.startsWith("blob:")) {
      return realFetch(input, init);
    }
    if (url.startsWith(PROVIDER_PREFIX)) {
      const i = init || (input && typeof input === "object" && "method" in input ? { method: input.method } : {});
      if (MODE === "real") return real(url, i);
      return replay(url, i);
    }
    log({ event: "blocked", host: (() => { try { return new URL(url).host; } catch { return "?"; } })() });
    throw new Error(`e2e ağ kilidi: ${url.replace(/[?#].*$/, "")}`);
  };
}
