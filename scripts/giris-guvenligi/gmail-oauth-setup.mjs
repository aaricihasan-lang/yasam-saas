#!/usr/bin/env node
/**
 * GİRİŞ GÜVENLİĞİ F2-D — Gmail API yenileme token'ı alma (OWNER çalıştırır; tek seferlik kurulum).
 *
 * Ne yapar: Google OAuth 2.0 "Masaüstü uygulaması" akışı (yerel geri dönüş adresi 127.0.0.1 + PKCE).
 * YALNIZ `gmail.send` kapsamı istenir; Google başka kapsam döndürürse token KAYDEDİLMEZ.
 * Yenileme token'ı EKRANA YAZILMAZ; Owner'ın seçtiği, REPO DIŞINDAKİ yeni bir dosyaya yazılır
 * (dosya varsa üzerine yazılmaz). Değer oradan Vercel'e (GMAIL_OAUTH_REFRESH_TOKEN, "Sensitive")
 * elle girilir, sonra dosya Owner tarafından güvenli şekilde silinir.
 *
 * Kullanım (Owner'ın kendi bilgisayarında, gönderici posta kutusuyla oturum açmış tarayıcıda):
 *   set GMAIL_OAUTH_CLIENT_ID=...            (PowerShell: $env:GMAIL_OAUTH_CLIENT_ID="...")
 *   set GMAIL_OAUTH_CLIENT_SECRET=...
 *   node scripts/giris-guvenligi/gmail-oauth-setup.mjs --out C:\Gizli\gmail-refresh.json
 *   node scripts/giris-guvenligi/gmail-oauth-setup.mjs --check C:\Gizli\gmail-refresh.json
 *     (--check: token yenilenebiliyor mu + kapsam yalnız gmail.send mi; e-posta GÖNDERMEZ)
 *
 * Ayrıntı: docs/giris-guvenligi/f2d-google-workspace-kurulum.md
 */
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCOPE = "https://www.googleapis.com/auth/gmail.send";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";

const args = process.argv.slice(2);
const arg = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const clientId = String(process.env.GMAIL_OAUTH_CLIENT_ID ?? "").trim();
const clientSecret = String(process.env.GMAIL_OAUTH_CLIENT_SECRET ?? "").trim();
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function die(msg) {
  console.error(`HATA: ${msg}`);
  process.exit(1);
}
function insideRepo(p) {
  const rel = path.relative(repoRoot, path.resolve(p));
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

if (!clientId || !clientSecret) die("GMAIL_OAUTH_CLIENT_ID ve GMAIL_OAUTH_CLIENT_SECRET ortam değişkenleri gerekli (değerleri ekrana yazmayın).");

async function check(file) {
  let saved;
  try { saved = JSON.parse(fs.readFileSync(file, "utf8")); } catch { die("token dosyası okunamadı."); }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: String(saved.refresh_token ?? ""), grant_type: "refresh_token" }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || typeof j.access_token !== "string") die(`yenileme başarısız (${j.error ?? res.status}). invalid_grant ise yeniden yetkilendirin.`);
  const info = await (await fetch(`${TOKENINFO_URL}?access_token=${encodeURIComponent(j.access_token)}`)).json().catch(() => ({}));
  const scopes = String(info.scope ?? j.scope ?? "").split(/\s+/).filter(Boolean);
  if (scopes.length !== 1 || scopes[0] !== SCOPE) die(`kapsam beklenenden farklı: ${scopes.join(" ")}`);
  console.log("TAMAM: yenileme token'ı çalışıyor; kapsam yalnız gmail.send. (E-posta gönderilmedi.)");
}

async function authorize(out) {
  if (!out) die("--out <repo dışında yeni dosya yolu> gerekli.");
  if (insideRepo(out)) die("token dosyası repo klasörünün İÇİNDE olamaz (yanlışlıkla commit riski).");
  if (fs.existsSync(out)) die("dosya zaten var; üzerine yazılmaz. Yeni bir dosya adı seçin.");

  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(24).toString("base64url");

  const server = http.createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
  const url = `${AUTH_URL}?${new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: SCOPE,
    access_type: "offline", prompt: "consent", include_granted_scopes: "false",
    code_challenge: challenge, code_challenge_method: "S256", state,
  })}`;
  console.log("1) Bu adresi, GÖNDERİCİ posta kutusuyla (ör. dogrulama@alan-adiniz) oturum açtığınız tarayıcıda açın:");
  console.log(`\n${url}\n`);
  console.log("2) Yalnız \"E-posta gönderme\" izni istendiğini görün ve onaylayın. (3 dk içinde)");

  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("süre doldu")), 3 * 60 * 1000);
    server.on("request", (req, res) => {
      const u = new URL(req.url ?? "/", redirectUri);
      if (u.pathname !== "/oauth2callback") { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      if (u.searchParams.get("state") !== state || !u.searchParams.get("code")) {
        res.end("<p>Geçersiz yanıt. Pencereyi kapatıp yeniden deneyin.</p>");
        clearTimeout(timer); reject(new Error(u.searchParams.get("error") ?? "state uyuşmadı")); return;
      }
      res.end("<p>Tamam. Bu pencereyi kapatabilirsiniz; terminale dönün.</p>");
      clearTimeout(timer); resolve(u.searchParams.get("code"));
    });
  }).finally(() => server.close());

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, code_verifier: verifier, grant_type: "authorization_code", redirect_uri: redirectUri }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || typeof j.refresh_token !== "string") die(`token alınamadı (${j.error ?? res.status}). "prompt=consent" ile yeniden deneyin.`);
  const scopes = String(j.scope ?? "").split(/\s+/).filter(Boolean);
  if (scopes.length !== 1 || scopes[0] !== SCOPE) die(`Google beklenmeyen kapsam döndürdü (${scopes.join(" ")}); token KAYDEDİLMEDİ.`);
  fs.writeFileSync(out, JSON.stringify({ refresh_token: j.refresh_token, scope: j.scope, obtained_at: new Date().toISOString() }, null, 2), { encoding: "utf8", flag: "wx", mode: 0o600 });
  console.log(`TAMAM: yenileme token'ı ${out} dosyasına yazıldı (ekrana YAZILMADI).`);
  console.log("Sonraki adım: değeri Vercel'de GMAIL_OAUTH_REFRESH_TOKEN (Sensitive) olarak girin, ardından bu dosyayı güvenli silin.");
}

try {
  if (arg("--check")) await check(arg("--check"));
  else await authorize(arg("--out"));
} catch (e) {
  die(e instanceof Error ? e.message : String(e));
}
