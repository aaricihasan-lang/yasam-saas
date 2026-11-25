/**
 * I18N-F1 — HESAPLAMA DEĞİŞMEZLİĞİ (dil değişimi hiçbir matematiksel sonucu değiştirmez; Owner bölüm D).
 *
 * Üç katman:
 *   S  STATİK: hesaplama dizinleri çeviri / dil çözümleme katmanını İÇE AKTARMAZ (next-intl, lib/i18n/gate,
 *      setLocale, localePreference, output, catalog) ve NEXT_LOCALE okumaz → hesap kodu dil bilemez.
 *   R  ÇALIŞMA ANI: aynı kanonik girdiler iki AYRI süreçte hesaplanır — (A) dil kapısı açık + NEXT_LOCALE=en +
 *      LANG/LC_ALL=en_GB + süreç varsayılan yerel ayarı en-GB, (B) kapı kapalı + tr_TR + varsayılan tr-TR.
 *      Varsayılan yerel ayar scripts/i18n/locale-shim.mjs ile işletim sisteminden BAĞIMSIZ zorlanır (Windows'ta
 *      LANG Intl'i değiştirmiyor); iki sürecin gerçekten farklı dilde çalıştığı sondalarla KANITLANIR
 *      ("i".toLocaleUpperCase(): tr → "İ", en → "I"; tarih/sayı biçimi). Karşılaştırma yerelleştirilmiş metin
 *      üzerinden DEĞİL, kanonik sonuç nesnesi (JSON) üzerinden yapılır ve birebir eşit olmalıdır.
 *      Kapsam: Human Design (yerel motor), astroloji (Batı Horary yerel motoru: gök çerçevesi, Regiomontanus
 *      evleri, gezegen konum/hızları, Lilly saygınlıkları), numeroloji (motor + temel sayılar + gelecek yılları
 *      gizleme kuralı), burç, ay evresi / ay burcu.
 *   G  ALTIN DEĞER: deterministik alt küme (HD haritası, burç, ay evresi kimliği, numeroloji temel sayıları)
 *      scripts/i18n/baseline/calc-golden.json ile aynı olmalı → F2 kanonik ayrıştırma refaktörleri sonucu
 *      değiştiremez. Altın değer ilk kez origin/main hesap koduyla üretildi.
 *
 * Kullanım: npx tsx scripts/i18n/calc-invariance.harness.ts [--update-golden]
 * (iç: --worker → yalnız hesaplar ve JSON basar)
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const GOLDEN = path.join(here, "baseline", "calc-golden.json");

async function worker() {
  const { hesaplaNumeroloji } = await import("../../lib/numeroloji/numerolojiMotor");
  const { calcIfadeSayisi } = await import("../../lib/numeroloji/ifadeSayisi");
  const { calcHayatYolu } = await import("../../lib/numeroloji/hayatYolu");
  const { computeHumanDesignChart } = await import("../../lib/human-design/engine/compute");
  const { computeBurc } = await import("../../lib/danisan/burc");
  const { getMoonPhase, getMoonSign, getMoonIllumination } = await import("../../lib/cosmic/moon");
  const { buildWesternHoraryChart } = await import("../../lib/astrology/horary/western/chart");
  const { PROFILE_LILLY_1647 } = await import("../../lib/astrology/horary/western/calc");
  const { redactAnalysisDataForFutureYears } = await import("../../app/numeroloji/utils/futureYearsRedaction");

  // Sentetik kişiler (gerçek danışan verisi YOK). Türkçe harfler (İ/ı/ş/ğ/ç/ö/ü) bilerek kullanıldı: Türkçe
  // alfabe hesabı dil arayüzünden bağımsız kalmalı.
  const people = [
    { firstName: "Ayşe", lastName: "Yılmaz", birthDate: "1985-07-14" },
    { firstName: "İsmail Çağrı", lastName: "Öztürk", birthDate: "1972-12-31" },
    { firstName: "Gülşen", lastName: "Işık", birthDate: "2001-02-28" },
  ];
  const hdInputs = [
    { date: "1990-04-01", time: "14:30", timezone: "Europe/Istanbul", location: { lat: 41.0082, lon: 28.9784 } },
    { date: "1979-11-23", time: "03:05", timezone: "Europe/Berlin", location: { lat: 52.52, lon: 13.405 } },
  ];
  const moonDates = ["2026-01-03T12:00:00Z", "2026-06-15T00:00:00Z", "2027-03-20T18:30:00Z"].map((s) => new Date(s));

  const deterministic = {
    hd: hdInputs.map((i) => computeHumanDesignChart(i)),
    burc: ["1990-03-21", "1990-04-19", "1990-04-20", "1991-12-22", "2000-02-29", "1985-07-23"].map((d) => computeBurc(d)),
    ifade: people.map((p) => calcIfadeSayisi(p.firstName, p.lastName)),
    hayatYolu: people.map((p) => calcHayatYolu(p.birthDate)),
    moon: moonDates.map((d) => ({ phase: getMoonPhase(d), sign: getMoonSign(d), illum: getMoonIllumination(d) })),
    // Astroloji — Batı Horary yerel motoru (astronomy-engine; ağ / sağlayıcı / sır yok).
    horary: [
      { questionUtc: "2026-03-14T09:30:00Z", latitude: 41.0082, longitude: 28.9784 },
      { questionUtc: "2025-10-02T21:15:00Z", latitude: 51.5072, longitude: -0.1276 },
    ].map((q) => buildWesternHoraryChart({ ...q, profile: PROFILE_LILLY_1647 })),
  };
  const motor = people.map((p) => hesaplaNumeroloji(p));
  const full = {
    numeroloji: motor,
    // Gizlilik kuralı: "Gelecek Yılları Göster" yetkisi olmayan uzmana giden kopya (sunucu tarafı gizleme).
    gelecekGizleme: motor.map((m) => redactAnalysisDataForFutureYears({ motor: m }, { futureYears: false, currentYear: 2026 })),
  };
  const intl = new Intl.DateTimeFormat().resolvedOptions().locale;
  // Dil koşulunun GERÇEKTEN farklı olduğunu gösteren sondalar (hesap girdisi değildir).
  const probes = {
    upper: "i".toLocaleUpperCase(),
    date: new Date(Date.UTC(2026, 0, 2, 12)).toLocaleDateString(),
    number: (1234.5).toLocaleString(),
  };
  process.stdout.write(JSON.stringify({ deterministic, full, intl, probes }));
}

const sha = (v: unknown) => crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");

function staticGuard(): string[] {
  const dirs = ["lib/astrology/engine", "lib/astrology/pro", "lib/astrology/model", "lib/human-design/engine", "lib/numeroloji", "lib/cosmic"];
  const files = ["lib/danisan/burc.ts"];
  const banned = [/from\s+["']next-intl/, /["']@\/lib\/i18n\/(gate|setLocale|localePreference\w*|output|catalog|localeCookie)["']/, /NEXT_LOCALE/, /\buseLocale\(|\bgetLocale\(/];
  const walk = (d: string, out: string[] = []) => {
    const abs = path.join(root, d);
    if (!fs.existsSync(abs)) return out;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const rel = `${d}/${e.name}`;
      if (e.isDirectory()) walk(rel, out);
      else if (/\.tsx?$/.test(e.name)) out.push(rel);
    }
    return out;
  };
  const all = [...dirs.flatMap((d) => walk(d)), ...files];
  const hits: string[] = [];
  for (const f of all) {
    const src = fs.readFileSync(path.join(root, f), "utf8");
    for (const re of banned) if (re.test(src)) hits.push(`${f} ~ ${re}`);
  }
  console.log(`  S: ${all.length} hesaplama dosyası tarandı`);
  return hits;
}

async function main() {
  if (process.argv.includes("--worker")) return worker();
  let pass = 0, fail = 0;
  const ok = (c: unknown, n: string, d?: unknown) => { if (c) { pass++; console.log(`  PASS ${n}`); } else { fail++; console.error(`  FAIL ${n}${d ? " — " + JSON.stringify(d).slice(0, 400) : ""}`); } };

  console.log("\n[S] statik: hesap kodu dil katmanını bilmez");
  const hits = staticGuard();
  ok(hits.length === 0, "hesaplama dizinlerinde dil/çeviri bağımlılığı yok", hits);

  console.log("\n[R] çalışma anı: TR ↔ EN ortamında aynı kanonik sonuç");
  const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
  const run = (env: Record<string, string>) => {
    const shim = pathToFileURL(path.join(here, "locale-shim.mjs")).href;
    // tsx işi kendi alt sürecinde koşar → ön yükleme NODE_OPTIONS ile aktarılır (her iki sürece de yüklenir).
    const r = spawnSync(process.execPath, [tsx, fileURLToPath(import.meta.url), "--worker"], {
      cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, TZ: "UTC", ...env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import ${shim}`.trim() },
    });
    if (r.status !== 0) throw new Error(`worker çıkışı ${r.status}: ${r.stderr.slice(0, 800)}`);
    return JSON.parse(r.stdout) as { deterministic: unknown; full: unknown; intl: string; probes: { upper: string; date: string; number: string } };
  };
  const A = run({ NEXT_PUBLIC_I18N_LOCALE_SWITCHING: "on", NEXT_LOCALE: "en", LANG: "en_GB.UTF-8", LC_ALL: "en_GB.UTF-8", I18N_PSEUDO: "on", I18N_TEST_DEFAULT_LOCALE: "en-GB" });
  const B = run({ NEXT_PUBLIC_I18N_LOCALE_SWITCHING: "off", NEXT_LOCALE: "tr", LANG: "tr_TR.UTF-8", LC_ALL: "tr_TR.UTF-8", I18N_TEST_DEFAULT_LOCALE: "tr-TR" });
  console.log(`  bilgi: süreç Intl varsayılanı A=${A.intl} B=${B.intl}`);
  console.log(`  bilgi: sondalar A=${JSON.stringify(A.probes)} B=${JSON.stringify(B.probes)}`);
  ok(A.intl.startsWith("en") && B.intl.startsWith("tr"), "iki süreç GERÇEKTEN farklı varsayılan yerel ayarda (en-GB / tr-TR)", [A.intl, B.intl]);
  ok(A.probes.upper === "I" && B.probes.upper === "İ" && A.probes.number !== B.probes.number, "dile duyarlı davranış sondaları farklı (i→I / i→İ, 1,234.5 / 1.234,5)", [A.probes, B.probes]);
  ok(sha(A.deterministic) === sha(B.deterministic), "deterministik hesaplar (HD, burç, numeroloji temel, ay) birebir eşit");
  ok(sha(A.full) === sha(B.full), "tam numeroloji motoru çıktısı birebir eşit");

  console.log("\n[G] altın değer: origin/main hesap sonuçları");
  if (process.argv.includes("--update-golden")) {
    fs.writeFileSync(GOLDEN, JSON.stringify({ aciklama: "I18N-F1 hesaplama altın değerleri (sentetik girdiler). Yalnız Owner onaylı hesap değişikliğinde --update-golden ile yenilenir.", sha256: sha(B.deterministic), sample: B.deterministic }, null, 1) + "\n");
    console.log("  altın değer yazıldı");
  }
  const golden = JSON.parse(fs.readFileSync(GOLDEN, "utf8"));
  ok(golden.sha256 === sha(A.deterministic) && golden.sha256 === sha(B.deterministic), "TR ve EN ortamı altın değerle aynı");

  console.log(`\n=== hesaplama değişmezliği: ${pass} PASS / ${fail} FAIL ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
