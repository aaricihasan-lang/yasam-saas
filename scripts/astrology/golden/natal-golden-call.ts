/**
 * ASTROLOJİ — GOLDEN DOĞRULAMA: TEK gerçek Roxy natal çağrısı (owner onayı 2026-10-07).
 *
 * Kurallar:
 *   • SENTETİK kişi (gerçek kişi DEĞİL): 1990-07-15 14:30 İstanbul (Europe/Istanbul, +03:00),
 *     Placidus, true node — fixture ile aynı girdi.
 *   • TEK istek: yeniden deneme KAPALI (maxRetries 0). Çıktı dosyası varsa çağrı YAPILMAZ
 *     (yanlışlıkla ikinci ücretli çağrı engellenir).
 *   • ROXY_API_KEY yalnız ortamdan okunur; ekrana/loga/dosyaya YAZILMAZ. Yanıt kaydedilmeden önce
 *     anahtar metni içerip içermediği kontrol edilir.
 *   • Ekrana yalnız yapı özeti basılır (alan adları/sayılar), değer basılmaz.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/golden/natal-golden-call.ts
 */
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readAstroRoxyConfig } from "@/lib/astrology/config";
import { callRoxy } from "@/lib/astrology/providers/roxy/client";
import { buildNatalRequestBody, ROXY_NATAL_ENDPOINT } from "@/lib/astrology/providers/roxy/natal";
import { resolveAstroBirthTime } from "@/lib/astrology/birth/timeResolution";

const OUT = join(__dirname, "..", "fixtures", "roxy-natal-golden-2026-10-07.json");

async function main() {
  if (existsSync(OUT)) {
    console.log("golden yanıt zaten kayıtlı — gerçek çağrı YAPILMADI (0 istek).");
    return;
  }
  const cfg = readAstroRoxyConfig();
  if (!cfg) {
    console.log("ROXY_API_KEY yok/geçersiz — çağrı yapılmadı.");
    process.exit(2);
  }
  const t = resolveAstroBirthTime("1990-07-15", "14:30", "Europe/Istanbul");
  if (t.kind !== "ok") throw new Error("sentetik zaman çözülemedi");
  const body = buildNatalRequestBody(
    { birthDate: "1990-07-15", birthTime: "14:30:00", utcOffsetSeconds: t.offsetSeconds, latitude: 41.0082, longitude: 28.9784 },
    { houseSystem: "placidus", nodeType: "true" },
  );
  console.log("istek gövdesi (sentetik):", JSON.stringify(body));

  const r = await callRoxy(cfg, ROXY_NATAL_ENDPOINT, body, { maxRetries: 0 });
  console.log(`gerçek Roxy istek sayısı (deneme): ${r.attempts}`);
  if (!r.ok) {
    console.log(`çağrı başarısız: kind=${r.kind} status=${r.status ?? "-"}`);
    process.exit(1);
  }
  const text = JSON.stringify(r.raw, null, 2);
  if (text.includes(cfg.apiKey)) {
    console.log("UYARI: yanıt anahtar metnini içeriyor — DOSYAYA YAZILMADI.");
    process.exit(1);
  }
  writeFileSync(OUT, text + "\n");
  const raw = r.raw as Record<string, unknown>;
  console.log("üst düzey alanlar:", Object.keys(raw).join(", "));
  for (const k of ["planets", "houses", "aspects", "patterns"]) {
    const v = raw[k];
    console.log(`  ${k}: ${Array.isArray(v) ? `${v.length} öğe` : typeof v}`);
  }
  console.log("kaydedildi:", OUT.replace(/\\/g, "/").split("/scripts/")[1] ? `scripts/${OUT.replace(/\\/g, "/").split("/scripts/")[1]}` : "fixtures");
}

void main().catch((e) => {
  console.error("golden çağrı hatası:", (e as Error).message);
  process.exit(1);
});
