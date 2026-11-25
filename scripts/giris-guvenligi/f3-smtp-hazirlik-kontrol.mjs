#!/usr/bin/env node
/**
 * GİRİŞ GÜVENLİĞİ F3 — Turhost SMTP etkinleştirme HAZIRLIK KONTROLÜ (SALT-OKUNUR).
 *
 * Ne yapar:
 *   1) `vercel env ls production` çıktısından YALNIZ değişken ADLARINI okur (değer okumaz / yazdırmaz / indirmez) ve ilk aşama
 *      planına göre VAR / YOK tablosu basar. "İlk aşamada OLMAMASI gereken" adları (ör. AUTH_MFA_METHOD_SCOPE) ayrıca işaretler.
 *   2) DNS: SPF, DMARC, bilinen DKIM seçicileri (TXT) — yalnız sorgu.
 *   3) TLS: SMTP sunucusuna 465'te el sıkışması (sertifika zinciri + ad doğrulaması + bitiş tarihi). SMTP OTURUMU AÇMAZ:
 *      EHLO / AUTH / MAIL komutu gönderilmez, kimlik bilgisi kullanılmaz, e-posta gönderilmez.
 *
 * Değiştirmez: Vercel, Supabase, Turhost, DNS — hiçbirine yazmaz.
 * Kullanım: node scripts/giris-guvenligi/f3-smtp-hazirlik-kontrol.mjs [--vercel-dizini <Vercel'e bağlı klasör>] [--env-dosyasi <vercel env ls çıktısı>]
 *           [--no-vercel] [--no-ag]
 * Çıkış kodu: 0 = engel yok · 1 = engel var (tabloda ENGEL satırları) · 2 = kontrol yapılamadı.
 */
import { spawnSync } from "node:child_process";
import { promises as dns } from "node:dns";
import fs from "node:fs";
import tls from "node:tls";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

const DOMAIN = "yasamsistemi.com";
const SMTP_HOST = "srvm06.trwww.com";
const SMTP_PORT = 465;

// İlk aşama (yalnız Owner) planı — docs/giris-guvenligi/f3-smtp-etkinlestirme.md ile aynı.
const REQUIRED = ["EMAIL_PROVIDER", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_SENDER", "SMTP_PASSWORD", "AUTH_OTP_PEPPER"];
const OPTIONAL = ["SMTP_SENDER_NAME", "SMTP_HOURLY_LIMIT", "EMAIL_DAILY_LIMIT", "EMAIL_WARN_AT"];
// İlk aşamada TANIMLANMAMALI (tanımlıysa kapsam / yöntem genişler veya giriş akışı değişir → Owner ayrıca onaylamalı).
const NOT_YET = ["AUTH_EMAIL_SELF_SERVICE_ROLES", "AUTH_MFA_METHODS", "AUTH_MFA_METHOD_SCOPE", "AUTH_MFA_EMAIL_ROLES", "ANDROID_APP_SESSION_TRANSPORT", "EMAIL_SYNTHETIC_ALLOW", "GMAIL_REFRESH_TOKEN"];

let blockers = 0;
let unknown = 0;
const row = (durum, ad, not = "") => console.log(`  ${durum.padEnd(14)} ${ad.padEnd(32)} ${not}`);

function vercelNames() {
  const file = opt("--env-dosyasi");
  let text;
  if (file) text = fs.readFileSync(file, "utf8");
  else {
    // Sabit komut (kullanıcı girdisi yok). Vercel CLI tabloyu stderr'e de yazabildiği için iki akış birlikte okunur.
    // Vercel projesine BAĞLI klasörde çalışmalı (.vercel/project.json); worktree'ler genelde bağlı değildir → --vercel-dizini.
    const cwd = opt("--vercel-dizini") ?? process.cwd();
    if (!fs.existsSync(`${cwd}/.vercel/project.json`)) return { error: `${cwd} Vercel projesine bağlı değil (--vercel-dizini <bağlı klasör>)` };
    const r = spawnSync("vercel env ls production", { cwd, encoding: "utf8", timeout: 90_000, shell: true });
    if (r.error || r.status !== 0) return { error: `vercel env ls çalıştırılamadı (${r.error ? r.error.code ?? "hata" : `çıkış ${r.status}`})` };
    text = `${r.stdout ?? ""}
${r.stderr ?? ""}`;
  }
  // Satır biçimi: "  AD   Encrypted   Production   12d ago" — yalnız ilk sütun (ad) alınır; değer sütunu ZATEN şifreli gösterilir
  // ve burada hiç saklanmaz.
  const names = new Set();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s+([A-Z][A-Z0-9_]{1,80})\s+\S/.exec(line);
    if (m) names.add(m[1]);
  }
  return { names };
}

// Sistem çözücüsü (Windows'ta c-ares) TXT sorgusunda başarısız olabildiği için açık genel çözücüler de denenir.
const resolvers = [null, ["8.8.8.8", "1.1.1.1"]].map((servers) => { const r = new dns.Resolver({ timeout: 5000, tries: 2 }); if (servers) r.setServers(servers); return r; });
async function txt(name) {
  let lastErr = null;
  for (const r of resolvers) {
    try { return (await r.resolveTxt(name)).map((x) => x.join("")); }
    catch (e) { if (e && (e.code === "ENOTFOUND" || e.code === "ENODATA")) return []; lastErr = e; }
  }
  return lastErr ? null : [];
}

function tlsProbe() {
  return new Promise((resolve) => {
    const s = tls.connect({ host: SMTP_HOST, port: SMTP_PORT, servername: SMTP_HOST, rejectUnauthorized: true, minVersion: "TLSv1.2", timeout: 15_000 }, () => {
      const c = s.getPeerCertificate();
      const out = { ok: s.authorized, protocol: s.getProtocol(), subject: c && c.subject && c.subject.CN, validTo: c && c.valid_to, san: c && c.subjectaltname };
      s.end(); // SMTP karşılamasına yanıt verilmez; komut gönderilmez.
      resolve(out);
    });
    s.on("error", (e) => resolve({ ok: false, error: e && (e.code || e.message) }));
    s.on("timeout", () => { s.destroy(); resolve({ ok: false, error: "zaman aşımı" }); });
  });
}

async function main() {
  console.log("F3 — Turhost SMTP hazırlık kontrolü (salt-okunur; değer okunmaz / yazdırılmaz)\n");

  if (!flag("--no-vercel")) {
    console.log("1) Vercel Production ortam değişkeni ADLARI");
    const v = vercelNames();
    if (v.error) { unknown++; row("DOĞRULANMADI", "vercel env ls", v.error); }
    else {
      for (const n of REQUIRED) { const has = v.names.has(n); if (!has) blockers++; row(has ? "VAR" : "YOK — ENGEL", n, n === "SMTP_PASSWORD" || n === "AUTH_OTP_PEPPER" ? "(gizli; Sensitive olmalı)" : ""); }
      for (const n of OPTIONAL) row(v.names.has(n) ? "VAR" : "yok (varsayılan)", n, n === "SMTP_HOURLY_LIMIT" ? "(kod tavanı 50; yalnız düşürülebilir)" : "");
      for (const n of NOT_YET) { const has = v.names.has(n); if (has) blockers++; row(has ? "VAR — İNCELE" : "yok (doğru)", n, has ? "ilk aşamada tanımsız olmalı (ayrı Owner onayı)" : ""); }
    }
    console.log("   NOT: Değerler (ör. SMTP_HOST=srvm06.trwww.com, SMTP_PORT=465, SMTP_USER=SMTP_SENDER) bu betikle GÖRÜLMEZ;");
    console.log("   yayından sonra Owner › E-posta Durumu ekranındaki 'SMTP ayarı eksik / geçersiz' satırı boş olmalıdır.\n");
  }

  if (!flag("--no-ag")) {
    console.log("2) DNS (yalnız sorgu)");
    const spf = await txt(DOMAIN);
    const spfRec = spf && spf.find((r) => r.startsWith("v=spf1"));
    if (spf === null) { unknown++; row("DOĞRULANMADI", "SPF", "DNS sorgusu başarısız"); }
    else row(spfRec && /include:_spf\.trwww\.com/.test(spfRec) ? "VAR" : "YOK — ENGEL", "SPF", spfRec ?? "kayıt yok");
    if (!(spfRec && /include:_spf\.trwww\.com/.test(spfRec))) blockers++;
    const dmarc = await txt(`_dmarc.${DOMAIN}`);
    const dm = dmarc && dmarc.find((r) => r.startsWith("v=DMARC1"));
    row(dm ? (/p=none/.test(dm) ? "VAR (p=none)" : "VAR") : "YOK", "DMARC", dm ?? "kayıt yok — teslim edilebilirlik riski");
    let dkim = null;
    for (const sel of ["default", "dkim", "mail", "x", "s1", "selector1", "turhost", "trwww"]) {
      const r = await txt(`${sel}._domainkey.${DOMAIN}`);
      if (r && r.some((x) => /v=DKIM1|k=rsa|p=/.test(x))) { dkim = sel; break; }
    }
    row(dkim ? "VAR" : "DOĞRULANMADI", "DKIM", dkim ? `seçici: ${dkim}` : "bilinen seçicilerde kayıt yok — gerçek iletinin DKIM-Signature başlığı ile doğrulanmalı");
    if (!dkim) unknown++;
    console.log("");

    console.log(`3) TLS el sıkışması ${SMTP_HOST}:${SMTP_PORT} (SMTP komutu / kimlik bilgisi YOK)`);
    const t = await tlsProbe();
    if (t.ok) {
      const days = Math.floor((Date.parse(t.validTo) - Date.now()) / 86_400_000);
      row("PASS", "sertifika + ad doğrulaması", `${t.protocol} · CN=${t.subject} · bitiş ${t.validTo} (${days} gün)`);
      if (days < 21) { blockers++; row("ENGEL", "sertifika süresi", "21 günden az kaldı"); }
    } else { blockers++; row("FAIL — ENGEL", "TLS", String(t.error ?? "doğrulanamadı")); }
    console.log("");
  }

  console.log(blockers ? `SONUÇ: ${blockers} ENGEL${unknown ? ` · ${unknown} DOĞRULANMADI` : ""}` : `SONUÇ: engel yok${unknown ? ` · ${unknown} DOĞRULANMADI (elle doğrulanacak)` : ""}`);
  process.exit(blockers ? 1 : 0);
}

main().catch((e) => { console.error("kontrol yapılamadı:", e && e.message ? e.message : e); process.exit(2); });
