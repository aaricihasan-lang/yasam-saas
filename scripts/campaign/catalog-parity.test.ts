// KAMPANYA MERKEZİ KM-1 — katalog bütünlüğü + GERÇEK teknik kayıtlarıyla eşlik (salt okunur; DB/ağ yok).
// Gerçek kayıtta olup katalogda olmayan (veya tersi) her teknik bu testi kırar → yeni teknik eklendiğinde katalog güncellenmeden
// CI geçmez. Çalıştırma: npx tsx scripts/campaign/catalog-parity.test.ts
import fs from "node:fs";
import path from "node:path";
import { TECHNIQUE_IDS } from "@/lib/astrology/engine/techniques";
import { CLASSIC_TECHNIQUES } from "@/lib/numeroloji-klasik/input";
import { CAMPAIGN_CATALOG, CAMPAIGN_CATALOG_VERSION, TECHNIQUE_KEY_RE, getCatalogEntry, type CommentSource } from "@/lib/campaign/catalog";

const ROOT = process.cwd();
let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
};
const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel));
const of = (m: string) => CAMPAIGN_CATALOG.filter((x) => x.module === m);

// ── Bütünlük ──
const keys = CAMPAIGN_CATALOG.map((x) => x.key);
check("B01 katalog sürümü pozitif tam sayı", Number.isInteger(CAMPAIGN_CATALOG_VERSION) && CAMPAIGN_CATALOG_VERSION >= 1);
check("B02 kimlikler tekil", new Set(keys).size === keys.length);
check("B03 kimlikler DB biçimine uyar", keys.every((k) => TECHNIQUE_KEY_RE.test(k)), keys.filter((k) => !TECHNIQUE_KEY_RE.test(k)).join(","));
check("B04 kredi aralığı geçerli (0 ≤ en az ≤ en çok ≤ 50)", CAMPAIGN_CATALOG.every((x) => x.credit[0] >= 0 && x.credit[0] <= x.credit[1] && x.credit[1] <= 50));
const SOURCES: readonly CommentSource[] = ["hd.system", "hd.relation", "numk.meaning", "numb.book", "atlas.auto", "atlas.events", "atlas.system", "atlas.tech", "atlas.en", "kozmik.static"];
check("B05 yorum kaynakları yalnız tanımlı kaynaklardan", CAMPAIGN_CATALOG.every((x) => x.comments.every((c) => SOURCES.includes(c))));
check("B06 getCatalogEntry kimlikle bulur, bilinmeyeni null döner", getCatalogEntry("atlas:western.natal")?.title === "Natal" && getCatalogEntry("atlas:yok") === null);

// ── Gökyüzü Atlası ↔ TECHNIQUE_IDS ──
const atlasEngine = of("atlas").map((x) => x.technique).filter((t) => t !== "horary.lilly");
const engineIds = [...TECHNIQUE_IDS] as string[];
check("A01 Atlas motor kayıtlarının hepsi katalogda (42)", engineIds.length === 42 && engineIds.every((id) => atlasEngine.includes(id)), engineIds.filter((id) => !atlasEngine.includes(id)).join(","));
check("A02 katalogdaki Atlas motor teknikleri gerçek kayıtta var (uydurma yok)", atlasEngine.every((id) => engineIds.includes(id)), atlasEngine.filter((id) => !engineIds.includes(id)).join(","));
check("A03 Lilly horary yerel route'u var", exists("app/api/admin/astroloji/horary/western/route.ts") && !!getCatalogEntry("atlas:horary.lilly"));
check("A04 Lilly 0 kredi; iki kişilik 5 teknik ilk sürümde uygun değil", getCatalogEntry("atlas:horary.lilly")!.credit[1] === 0 &&
  ["western.synastry", "western.composite", "vedic.gun_milan", "vedic.dashakoot", "vedic.papasamyam"].every((t) => getCatalogEntry(`atlas:${t}`)!.readiness === "uygun_degil"));

// ── Klasik Numeroloji ↔ CLASSIC_TECHNIQUES ──
const numk = of("numk").map((x) => x.technique);
check("N01 kişi teknikleri (core/bridge/personal_day/daily/chaldean/dual) katalogda", CLASSIC_TECHNIQUES.person.every((t) => numk.includes(t)), CLASSIC_TECHNIQUES.person.join(","));
check("N02 ilişki / işletme / isim türleri katalogda", CLASSIC_TECHNIQUES.relationship.every((t) => numk.includes(t)) && CLASSIC_TECHNIQUES.business.every((t) => numk.includes(t)) && numk.includes("names"));
check("N03 İki Sistem 2 kredi, Tümü 5 kredi", getCatalogEntry("numk:dual")!.credit[1] === 2 && getCatalogEntry("numk:person_all")!.credit[1] === 5);
const knownNumk = new Set([...CLASSIC_TECHNIQUES.person, ...CLASSIC_TECHNIQUES.relationship, ...CLASSIC_TECHNIQUES.business, "names", "person_all"]);
check("N04 katalogda gerçek kayıtta olmayan numeroloji tekniği yok", numk.every((t) => knownNumk.has(t)), numk.filter((t) => !knownNumk.has(t)).join(","));

// ── Bütüncül Numeroloji (yerel) ──
check("U01 Bütüncül motor modülleri var (zamanlama/gelişim, ilişki, mekân)", exists("lib/numeroloji/timing") && exists("lib/numeroloji/relationship") && exists("lib/numeroloji/place"));
check("U02 Bütüncül teknikler 0 kredi; ana analizde yorum kaynağı yok (uzman Bilgi Bankası asla)", of("numb").every((x) => x.credit[1] === 0) && getCatalogEntry("numb:analysis")!.comments.length === 0);

// ── Human Design ──
check("H01 HD route'ları var (harita, değişkenler, transit, kişisel transit, ilişkiler)", ["app/api/hd/charts/roxy/route.ts", "app/api/hd/charts/variables/route.ts", "app/api/hd/transit/route.ts", "app/api/hd/transit/personal/route.ts", "app/api/hd/relations/route.ts"].every(exists));
check("H02 Dört Ok / PHS Owner onayı ister; yerel motor uygun değil", getCatalogEntry("hd:variables")!.requiresOwnerConfirmation === true && getCatalogEntry("hd:local_engine")!.readiness === "uygun_degil");
check("H03 BodyGraph yorum kaynağı yalnız Sistem Yorumu", JSON.stringify(getCatalogEntry("hd:bodygraph")!.comments) === JSON.stringify(["hd.system"]));

// ── Kozmik Takvim tek paket ↔ app/cosmic-calendar alt sayfaları ──
const kozmik = of("kozmik");
const pkg = kozmik[0]?.package;
const subdirs = fs.readdirSync(path.join(ROOT, "app/cosmic-calendar"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
check("K01 Kozmik Takvim katalogda TEK kayıt (paket)", kozmik.length === 1 && kozmik[0].key === "kozmik:paket");
check("K02 paket 6 özellik: Ay Fazları, Retro, Gezegen Saatleri, Güçlü Günler, Transitler, Hacamat", pkg?.features.length === 6 && ["moon", "retro", "hours", "power", "transits", "hacamat"].every((id) => pkg.features.some((f) => f.id === id)));
check("K03 paket özellikleri app/cosmic-calendar alt sayfalarıyla birebir (harita özelliği yok)", JSON.stringify(pkg!.features.map((f) => f.route).sort()) === JSON.stringify(subdirs), subdirs.join(","));
check("K04 paket 0 kredi, Hacamat yalnız tarafsız içerik, paket uygunluğu 'dogrulama' (hukuk incelemesi)", kozmik[0].credit[1] === 0 && pkg!.features.find((f) => f.id === "hacamat")!.neutralOnly === true && kozmik[0].readiness === "dogrulama");

// ── Kapsam kontrolü: kampanya kodu istemciye girmez, route yok ──
const libFiles = fs.readdirSync(path.join(ROOT, "lib/campaign")).filter((f) => f.endsWith(".ts"));
check("S01 lib/campaign dosyalarında 'use client' yok", libFiles.every((f) => !/^\s*["']use client["']/m.test(fs.readFileSync(path.join(ROOT, "lib/campaign", f), "utf8"))));
const serverMods = ["quotaService.ts", "adminService.ts", "subject.ts"];
check("S02 sunucu modülleri assertServerOnly çağırır", serverMods.every((f) => /assertServerOnly\("lib\/campaign\//.test(fs.readFileSync(path.join(ROOT, "lib/campaign", f), "utf8"))));
check("S03 KM-1'de kampanya API route'u yok (public endpoint yok)", !exists("app/api/campaign") && !exists("app/api/kampanya"));

console.log(`\ncatalog-parity: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
