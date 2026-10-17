/**
 * HD BODYGRAPH 1. API ALAN TAMLIĞI (owner talimatı 2026-10-17) — POST /human-design/bodygraph
 *
 *   S — Şema tamlığı: resmî OpenAPI'den çıkarılmış 62 yaprak alanın (bodygraph-schema.snapshot.json) HER BİRİ
 *       için kapsam kaydı (COVERAGE) var mı; fixture alanları şemada mı; şema değişirse test kırılır.
 *       HD_SCHEMA_ONLINE=1 ile canlı resmî şema da (yalnız okuma, anahtar yok) anlık görüntüyle karşılaştırılır.
 *   P — Profesyonel içerik: her alanın İDDİA EDİLEN yerde GERÇEKTEN göründüğü işlevsel kanıt (DTO → Sistem
 *       Yorumu paneli, ana harita, Word v2 belgesi). Kanıtı olmayan alan FAIL.
 *   K — Kenar durumlar: eksik/kısmi/bozuk ham yanıt, eski şema, I Ching numara uyuşmazlığı, XSS, dil notu.
 *   R — Rota + güvenlik: gerçek route handler + gömülü Postgres + sahte Roxy (çağrılar SAYILIR): yetki
 *       (hd_system_reading), tenant izolasyonu, eski kayıt türleri, Word snapshot, Roxy çağrısı 0.
 *
 * Gizli değer YOK; tüm veri SENTETİK. Çalıştırma: npx tsx scripts/hd-bodygraph-complete/harness.ts
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TA, TB, BODYGRAPH, FIXTURE, callRoute, installFakeRoxy, mkUser, startHdFlowEnv, type Auth } from "../hd-analysis-word-flow/env";
import { boundBodygraphDataUrl } from "../hd-roxy/consistentFixture";
import { extractSystemReading, looksEnglishText, type SystemReadingDto } from "../../lib/human-design/providers/roxy/systemReading";
import { validateRoxyBodygraph } from "../../lib/human-design/providers/roxy/schema";
import { normalizeRoxyBodygraph } from "../../lib/human-design/providers/roxy/normalize";
import { buildRoxyRenderPayload } from "../../lib/human-design/providers/roxy/render";
import { HdSystemReadingView } from "../../app/human-design/kayitli-haritalar/components/HdSystemReadingPanel";
import { HdComputedChartView } from "../../app/human-design/kayitli-haritalar/components/HdComputedChartView";
import { buildReportSnapshotV2 } from "../../lib/human-design/reporting/reportSnapshotV2";
import { HD_SIGNATURE_HELP, HD_TERM_BI, hdBilingual, hdProfileBilingual, hdTypeKeynotes } from "../../lib/human-design/normalize/hdDisplayLabels";
import { renderHdReportV2Buffer } from "../../lib/human-design/reporting/wordReportV2";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 500)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
type Row = Record<string, unknown>;
const ROOT = path.resolve(__dirname, "../..");
const SNAP = JSON.parse(readFileSync(path.join(__dirname, "bodygraph-schema.snapshot.json"), "utf8")) as { fields: Array<{ path: string; type: string; required: boolean }> };

// ── Kapsam kaydı: her şema alanı NEREDE kullanılıyor (rapor envanterinin kaynağı) ─────────────────────
//   harita = ana profesyonel harita (Sistem Yorumu yetkisi gerekmez) · sy = Sistem Yorumu (hd_system_reading)
//   word = Word v2 (kimlik bölümü veya Sistem Yorumu bölümü) · cizim = resmî BodyGraph çizim yükü
//   teknik = yalnız doğrulama/eşleme (kullanıcıya ayrıca gösterilmez; gerekçe `note`)
type Use = "harita" | "sy" | "word" | "cizim" | "teknik";
type Cov = { use: Use[]; where: string; note?: string; added?: boolean };
const COVERAGE: Record<string, Cov> = {
  type: { use: ["harita", "sy", "word", "teknik"], where: "Bilgi bloğu 'Tip' (uygulama sözlüğü), Sistem Yorumu Genel, Word kimlik", note: "Kod eşleme anahtarı (hdAppCodes)" },
  typeLocalized: { use: ["sy", "word"], where: "Sistem Yorumu Tip değeri — uygulama sözlüğünde olmayan tipte yedek", note: "Bilinen tiplerde uygulama sözlüğü öncelikli (ekran/Word terim birliği)" },
  typeDescription: { use: ["sy", "word"], where: "Sistem Yorumu > Tip > Açıklama; Word Sistem Yorumu" },
  aura: { use: ["sy", "word"], where: "Sistem Yorumu > Tip > Aura; Word Sistem Yorumu" },
  strategy: { use: ["harita", "sy", "word", "teknik"], where: "Bilgi bloğu 'Strateji' (YENİ, kısa etiket); Sistem Yorumu; Word kimlik", added: true },
  strategyLocalized: { use: ["sy", "word"], where: "Sistem Yorumu Strateji değeri — bilinmeyen tipte yedek", note: "Bilinen tiplerde uygulama sözlüğü öncelikli" },
  strategyDescription: { use: ["sy", "word"], where: "Sistem Yorumu > Strateji > Açıklama; Word" },
  authority: { use: ["harita", "sy", "word", "teknik"], where: "Bilgi bloğu 'İç Otorite'; Sistem Yorumu; Word kimlik" },
  authorityLocalized: { use: ["sy", "word"], where: "Sistem Yorumu İç Otorite — bilinmeyen değerde yedek", note: "Bilinenlerde uygulama sözlüğü" },
  authorityDescription: { use: ["sy", "word"], where: "Sistem Yorumu > İç Otorite > Açıklama; Word" },
  signature: { use: ["harita", "sy", "word"], where: "Bilgi bloğu 'İmza' (YENİ); Sistem Yorumu; Word kimlik", added: true },
  signatureLocalized: { use: ["sy", "word"], where: "Sistem Yorumu İmza — bilinmeyen tipte yedek", note: "Sağlayıcı uzun İmza açıklaması VERMİYOR (şemada yok) → uydurulmaz" },
  notSelf: { use: ["harita", "sy", "word"], where: "Bilgi bloğu 'Kendilik Dışı Tema' (YENİ); Sistem Yorumu; Word kimlik", added: true },
  notSelfLocalized: { use: ["sy", "word"], where: "Sistem Yorumu Kendilik Dışı Tema — bilinmeyen tipte yedek", note: "Uzun açıklama şemada yok" },
  profile: { use: ["harita", "sy", "word", "teknik"], where: "Bilgi bloğu 'Profil'; Sistem Yorumu; Word kimlik", note: "Güneş çizgileriyle tutarlılık doğrulaması" },
  "profileKeynotes.personalityLine": { use: ["sy", "word", "teknik"], where: "Sistem Yorumu > Profil > 'Personality (bilinçli) — N. çizgi' (YENİ)", added: true },
  "profileKeynotes.designLine": { use: ["sy", "word", "teknik"], where: "Sistem Yorumu > Profil > 'Design (bilinçdışı) — N. çizgi' (YENİ)", added: true },
  "profileKeynotes.personality": { use: ["sy", "word"], where: "Sistem Yorumu > Profil; Word" },
  "profileKeynotes.design": { use: ["sy", "word"], where: "Sistem Yorumu > Profil; Word" },
  profileDescription: { use: ["sy", "word"], where: "Sistem Yorumu > Profil > Açıklama; Word" },
  definition: { use: ["harita", "sy", "word", "teknik"], where: "Bilgi bloğu 'Tanım'; Sistem Yorumu; Word kimlik" },
  definitionLocalized: { use: ["sy", "word"], where: "Sistem Yorumu Tanım — bilinmeyen değerde yedek", note: "Bilinenlerde uygulama sözlüğü" },
  definitionDescription: { use: ["sy", "word"], where: "Sistem Yorumu > Tanım > Açıklama; Word" },
  "sides.{*}": { use: ["sy", "word"], where: "Sistem Yorumu > Personality ve Design Tarafları (YENİ); Word (YENİ)", added: true },
  designInstantUtc: { use: ["sy", "word", "teknik"], where: "Sistem Yorumu > Taraflar > Design anı (YENİ); Word 'Design tarihi' (YENİ; rapor kuralı gereği UTC saati yazılmaz)", note: "Ayrıca computed_result.timing (88° Design anı tutarlılık denetimi)", added: true },
  "incarnationCross.gates[]": { use: ["harita", "sy", "word", "teknik"], where: "Bilgi bloğu haç alt satırı (56/60 | 3/50); Sistem Yorumu > Haç > Kapılar (YENİ); Word", note: "Güneş/Dünya kapılarıyla tutarlılık doğrulaması", added: true },
  "incarnationCross.angle": { use: ["harita", "sy", "word"], where: "Bilgi bloğu; Sistem Yorumu > Haç > Açı (uygulama terimi, YENİ); Word" },
  "incarnationCross.angleLocalized": { use: ["sy", "word"], where: "Bilinmeyen açıda yedek", note: "Bilinen açılarda uygulama terimi (Sağ Açı (Right Angle))" },
  "incarnationCross.angleCode": { use: ["sy", "word", "teknik"], where: "Sistem Yorumu > Haç > Açı '(RAX)' (YENİ)", added: true },
  "incarnationCross.name": { use: ["harita", "sy", "word"], where: "Bilgi bloğu Enkarnasyon Teması; Sistem Yorumu; Word" },
  "incarnationCross.description": { use: ["sy", "word"], where: "Sistem Yorumu > Haç > Açıklama; Word" },
  "centers[].id": { use: ["teknik", "harita"], where: "Merkez kodu eşlemesi (ana harita Merkezler listesi kodu)", note: "Kimlik; görünen ad uygulama sözlüğünden" },
  "centers[].name": { use: ["harita", "sy", "word"], where: "Merkez adı (uygulama sözlüğü: 'Baş Merkezi (Head)')" },
  "centers[].nameLocalized": { use: ["sy"], where: "Bilinmeyen merkezde yedek", note: "9 bilinen merkezde uygulama adı (terim birliği)" },
  "centers[].defined": { use: ["harita", "sy", "word", "teknik"], where: "Merkezler (Tanımlı/Açık) — her yerde" },
  "centers[].motor": { use: ["harita", "sy", "word", "cizim"], where: "Ana harita Merkezler '· Motor' (YENİ); Sistem Yorumu 'Motor merkez' (YENİ); Word (YENİ)", added: true },
  "centers[].awareness": { use: ["harita", "sy", "word", "cizim"], where: "Ana harita '· Farkındalık' (YENİ); Sistem Yorumu (YENİ); Word (YENİ)", added: true },
  "centers[].theme": { use: ["sy", "word"], where: "Sistem Yorumu > Merkez > Tema; Word" },
  "centers[].notSelfQuestion": { use: ["sy", "word"], where: "Sistem Yorumu > Merkez (YALNIZ açık merkezde); Word", note: "Şema: 'surface it the moment defined is false'" },
  "centers[].biology": { use: ["sy", "word"], where: "Sistem Yorumu > Merkez > Biyoloji (+ tıbbi teşhis değildir notu); Word" },
  "centers[].gates[]": { use: ["sy", "word", "cizim"], where: "Sistem Yorumu > Merkez > Aktif kapılar (YENİ); Word (YENİ)", added: true },
  "channels[].gateA": { use: ["harita", "sy", "word", "teknik"], where: "Kanal kimliği (ör. 20-34) her yerde; topoloji doğrulaması" },
  "channels[].gateB": { use: ["harita", "sy", "word", "teknik"], where: "Kanal kimliği; topoloji doğrulaması" },
  "channels[].name": { use: ["harita", "sy", "word"], where: "Kanal adı (uygulama sözlüğü öncelikli)" },
  "channels[].nameLocalized": { use: ["sy"], where: "Bilinmeyen kanalda yedek", note: "36 resmî kanalda uygulama adı" },
  "channels[].circuit": { use: ["sy", "word", "cizim"], where: "Sistem Yorumu > Kanal devresi; Word" },
  "channels[].circuitLocalized": { use: ["sy", "word"], where: "Sistem Yorumu devre adı (Türkçe)" },
  "channels[].centers[]": { use: ["sy", "word", "teknik"], where: "Sistem Yorumu > Kanal > Bağladığı merkezler (YENİ); Word (YENİ)", added: true },
  "channels[].description": { use: ["sy", "word"], where: "Sistem Yorumu > Kanal > Açıklama; Word" },
  "channels[].circuitDescription": { use: ["sy", "word"], where: "Sistem Yorumu > Kanal > Devre açıklaması; Word" },
  "gates[].planet": { use: ["harita", "sy", "word", "teknik"], where: "Design/Personality sütunları (gezegen); Sistem Yorumu; Word" },
  "gates[].planetLocalized": { use: ["sy"], where: "Sistem Yorumu gezegen adı (Türkçe); Word Türkçe uygulama adı" },
  "gates[].side": { use: ["harita", "sy", "word", "teknik"], where: "Design (kırmızı) / Personality (siyah) ayrımı her yerde" },
  "gates[].gate": { use: ["harita", "sy", "word", "teknik"], where: "Aktivasyon kapısı; aktif kapılar" },
  "gates[].line": { use: ["harita", "sy", "word", "teknik"], where: "Kapı.çizgi (ör. 56.2); profil doğrulaması" },
  "gates[].gateName": { use: ["cizim", "sy"], where: "Çizim yükü; Sistem Yorumu (Localized yoksa yedek)" },
  "gates[].gateNameLocalized": { use: ["sy", "word"], where: "Sistem Yorumu Kapılar/Aktivasyonlar kapı adı; Word" },
  "gates[].gateDescription": { use: ["sy", "word"], where: "Sistem Yorumu > Kapılar (kapı başına bir kez) + Aktivasyonlar; Word" },
  "gates[].lineMeaning": { use: ["sy", "word"], where: "Sistem Yorumu > Aktivasyon > Çizgi N; Word" },
  "gates[].planetDescription": { use: ["sy", "word"], where: "Sistem Yorumu > Aktivasyon > Gezegen; Word" },
  "gates[].ichingHexagram.number": { use: ["sy", "word", "teknik"], where: "Sistem Yorumu > Aktivasyon > I Ching (YENİ; numara=kapı doğrulanır); Word (YENİ)", added: true },
  "gates[].ichingHexagram.english": { use: ["sy", "word"], where: "Sistem Yorumu > Aktivasyon > I Ching adı (YENİ; 'İngilizce kaynak adı' — güvenilir Türkçe sözlük yok); Word (YENİ)", added: true },
};

// ── Tam (lang=tr biçimli) yanıt: gerçek fixture + şemadaki tüm *Localized alanlar (benzersiz işaretli) ──
const BASE = JSON.parse(FIXTURE) as Row;
/** Eski (tamamlama öncesi) DTO biçimi: yeni alanlar YOK. */
const omit = <T extends object>(o: T, keys: string[]): T => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k))) as T;
function fullTr(): Row {
  const r = JSON.parse(FIXTURE) as Row;
  Object.assign(r, {
    typeLocalized: "ZZTİPYEREL", strategyLocalized: "ZZSTRATEJİYEREL", authorityLocalized: "ZZOTORİTEYEREL",
    signatureLocalized: "ZZİMZAYEREL", notSelfLocalized: "ZZKENDİLİKYEREL", definitionLocalized: "ZZTANIMYEREL",
  });
  (r.incarnationCross as Row).angleLocalized = "ZZAÇIYEREL";
  (r.centers as Row[]).forEach((c) => { c.nameLocalized = `ZZMERKEZ-${c.id}`; });
  (r.channels as Row[]).forEach((c) => { c.nameLocalized = `ZZKANAL-${c.gateA}`; c.circuitLocalized = `ZZDEVRE-${c.gateA}`; });
  (r.gates as Row[]).forEach((g) => { g.planetLocalized = `ZZGEZEGEN-${g.side}-${g.planet}`; g.gateNameLocalized = `ZZKAPIADI-${g.gate}`; });
  return r;
}
const FULL = fullTr();
const docText = async (buf: Buffer) => {
  const zip = await JSZip.loadAsync(buf);
  const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  return xml.replace(/<w:tab\/>/g, "\t").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
};

/** OpenAPI → /human-design/bodygraph 200 yanıtının yaprak alan yolları ($ref / allOf / anyOf / oneOf açılır). */
function openapiLeafPaths(spec: Row): string[] {
  const deref = (o: unknown): Row | null => {
    let cur = o as Row | null;
    for (let i = 0; cur && typeof cur.$ref === "string" && i < 20; i++) {
      let t: unknown = spec;
      for (const k of String(cur.$ref).replace(/^#\//, "").split("/")) t = (t as Row)[k];
      cur = t as Row;
    }
    return cur;
  };
  const out: string[] = [];
  const walk = (sch0: unknown, p: string) => {
    const sch = deref(sch0);
    if (!sch) return;
    for (const comb of ["allOf", "anyOf", "oneOf"]) if (Array.isArray(sch[comb])) (sch[comb] as unknown[]).forEach((x) => walk(x, p));
    if (sch.type === "object" || sch.properties) {
      for (const [k, v] of Object.entries((sch.properties as Row) ?? {})) walk(v, p ? `${p}.${k}` : k);
      if (sch.additionalProperties && typeof sch.additionalProperties === "object") walk(sch.additionalProperties, `${p}.{*}`);
    } else if (sch.type === "array") walk(sch.items, `${p}[]`);
    if (sch.type && sch.type !== "object" && sch.type !== "array") out.push(p);
  };
  const post = ((spec.paths as Row)["/human-design/bodygraph"] as Row).post as Row;
  walk((((post.responses as Row)["200"] as Row).content as Row)["application/json"] && ((((post.responses as Row)["200"] as Row).content as Row)["application/json"] as Row).schema, "");
  return [...new Set(out)];
}

async function main() {
  // ══ S — Şema tamlığı ═════════════════════════════════════════════════════════
  section("S — Şema tamlığı (62 yaprak alan)");
  const schemaPaths = SNAP.fields.map((f) => f.path);
  ok(schemaPaths.length === 62 && new Set(schemaPaths).size === 62, "S1 resmî şema anlık görüntüsü: 62 benzersiz yaprak alan", schemaPaths.length);
  const missingCov = schemaPaths.filter((p) => !COVERAGE[p]);
  const extraCov = Object.keys(COVERAGE).filter((p) => !schemaPaths.includes(p));
  ok(missingCov.length === 0, "S2 şemadaki HER alan için kapsam kaydı var (bakılmamış alan yok)", missingCov);
  ok(extraCov.length === 0, "S3 kapsam kaydında şemada olmayan (uydurma) alan yok", extraCov);
  const fxPaths = new Set<string>();
  const walk = (v: unknown, p: string) => {
    if (Array.isArray(v)) v.forEach((x) => walk(x, `${p}[]`));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, p === "sides" ? "sides.{*}" : p ? `${p}.${k}` : k);
    else fxPaths.add(p);
  };
  walk(FULL, "");
  ok([...fxPaths].every((p) => schemaPaths.includes(p)), "S4 fixture'daki her alan resmî şemada (şema dışı alan yok)", [...fxPaths].filter((p) => !schemaPaths.includes(p)));
  ok(schemaPaths.every((p) => fxPaths.has(p)), "S5 tam (tr biçimli) test yanıtı şemanın TÜM alanlarını içerir (isteğe bağlı *Localized dahil)", schemaPaths.filter((p) => !fxPaths.has(p)));
  const requiredMissingInBase = SNAP.fields.filter((f) => f.required).map((f) => f.path).filter((p) => { const s = new Set<string>(); const w = (v: unknown, q: string) => { if (Array.isArray(v)) v.forEach((x) => w(x, `${q}[]`)); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) w(x, q === "sides" ? "sides.{*}" : q ? `${q}.${k}` : k); else s.add(q); }; w(BASE, ""); return !s.has(p); });
  ok(requiredMissingInBase.length === 0, "S6 gerçek Roxy fixture'ı şemadaki tüm ZORUNLU alanları taşır (yalnız *Localized + sides isteğe bağlı)", requiredMissingInBase);
  if (process.env.HD_SCHEMA_ONLINE === "1") {
    try {
      const live = (await (await fetch("https://roxyapi.com/api/v2/openapi.json")).json()) as Row;
      const livePaths = openapiLeafPaths(live);
      const added = livePaths.filter((p) => !schemaPaths.includes(p));
      const removed = schemaPaths.filter((p) => !livePaths.includes(p));
      ok(added.length === 0 && removed.length === 0, "S7 (çevrimiçi) canlı resmî şema = anlık görüntü (şema değişikliği yok)", { added, removed });
    } catch (e) {
      ok(false, "S7 (çevrimiçi) resmî şema okunamadı", String(e));
    }
  }

  // ══ P — İşlevsel kanıt ═══════════════════════════════════════════════════════
  section("P — Her alan iddia edilen yerde GERÇEKTEN görünür");
  const D = extractSystemReading(FULL) as SystemReadingDto;
  const SR = renderToStaticMarkup(createElement(HdSystemReadingView, { data: D }));
  const v = validateRoxyBodygraph(FULL);
  if (!v.ok) throw new Error(`fixture geçersiz: ${v.errors.join(";")}`);
  const n = normalizeRoxyBodygraph(v.value, { date: "2018-07-20", time: "19:00:00", timezone: "Europe/Istanbul", latitude: 37.87, longitude: 32.48, nodeType: "true", lang: "tr", birthUtcIso: "2018-07-20T16:00:00.000Z" });
  if (!n.ok) throw new Error(`normalize: ${n.errors.join(";")}`);
  const render = buildRoxyRenderPayload(FULL)!;
  const MV = renderToStaticMarkup(createElement(HdComputedChartView, { result: n.chart, roxyRender: render }));
  const snap = buildReportSnapshotV2({
    generatedAt: "2026-10-17T09:00:00.000Z", chartId: "c4a00000-0000-4000-8000-0000000000b1", source: "computed", provider: "roxyapi",
    client: { name: "Elif Şahin Öztürk", birthDate: "2018-07-20", birthTime: "19:00:00", birthPlace: "Konya, Türkiye", timezone: "Europe/Istanbul" },
    codes: n.codes, computed: n.chart, requested: "system", systemReadingPermitted: true, systemReading: D, expertRecords: [],
    bodygraph: { status: "missing" }, chartImage: null,
  });
  const WT = await docText(await renderHdReportV2Buffer(snap, {}));
  const gen = (k: string) => D.general.find((g) => g.key === k)!;
  const det = (k: string, label: string | RegExp) => gen(k)?.details.find((d) => (typeof label === "string" ? d.label === label : label.test(d.label)))?.text ?? null;
  const xc = FULL.incarnationCross as Row;
  const pk = FULL.profileKeynotes as Row;
  const centersRaw = FULL.centers as Row[];
  const channelsRaw = FULL.channels as Row[];
  const gatesRaw = FULL.gates as Row[];
  const inW = (t: string) => WT.includes(t.slice(0, 60));
  const inSR = (t: string) => SR.includes(t.slice(0, 60).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;"));
  const motorIds = centersRaw.filter((c) => c.motor === true).map((c) => String(c.id));
  const awareIds = centersRaw.filter((c) => c.awareness === true).map((c) => String(c.id));
  const unknownType = extractSystemReading({ ...FULL, type: "ZZ-Bilinmeyen" })!;

  const PROBES: Record<string, () => boolean> = {
    type: () => MV.includes(">Tip (Type)<") && MV.includes("Jeneratör (Generator)") && gen("type").value === "Jeneratör (Generator)" && WT.includes("Tip (Type)") && WT.includes("Jeneratör (Generator)"),
    typeLocalized: () => unknownType.general.find((g) => g.key === "type")!.value === "ZZTİPYEREL",
    typeDescription: () => det("type", "Açıklama") === BASE.typeDescription && inSR(String(BASE.typeDescription)) && inW(String(BASE.typeDescription)),
    aura: () => det("type", "Aura") === BASE.aura && inSR(String(BASE.aura)) && inW(String(BASE.aura)),
    strategy: () => MV.includes(">Strateji (Strategy)<") && MV.includes(`Yanıt vermek için beklemek (${BASE.strategy})`) && gen("strategy").value === `Yanıt vermek için beklemek (${BASE.strategy})` && WT.includes(`Yanıt vermek için beklemek (${BASE.strategy})`),
    strategyLocalized: () => unknownType.general.find((g) => g.key === "strategy")!.value === "ZZSTRATEJİYEREL",
    strategyDescription: () => det("strategy", "Açıklama") === BASE.strategyDescription && inW(String(BASE.strategyDescription)),
    authority: () => MV.includes("Sakral Otorite (Sacral Authority)") && gen("authority").value === "Sakral Otorite (Sacral Authority)" && WT.includes("Sakral Otorite"),
    authorityLocalized: () => extractSystemReading({ ...FULL, authority: "ZZ" })!.general.find((g) => g.key === "authority")!.value === "ZZOTORİTEYEREL",
    authorityDescription: () => det("authority", "Açıklama") === BASE.authorityDescription && inW(String(BASE.authorityDescription)),
    signature: () => MV.includes(">İmza (Signature)<") && MV.includes(`Tatmin (${BASE.signature})`) && gen("signature").value === `Tatmin (${BASE.signature})` && WT.includes(`Tatmin (${BASE.signature})`),
    signatureLocalized: () => unknownType.general.find((g) => g.key === "signature")!.value === "ZZİMZAYEREL",
    notSelf: () => MV.includes(">Kendilik Dışı Tema (Not-Self Theme)<") && MV.includes(`Hayal kırıklığı (${BASE.notSelf})`) && gen("notSelf").value === `Hayal kırıklığı (${BASE.notSelf})` && WT.includes(`Hayal kırıklığı (${BASE.notSelf})`),
    notSelfLocalized: () => unknownType.general.find((g) => g.key === "notSelf")!.value === "ZZKENDİLİKYEREL",
    profile: () => MV.includes(">Profil (Profile)<") && MV.includes("2/4 — Münzevi / Fırsatçı (Hermit / Opportunist)") && gen("profile").value === "2/4" && WT.includes("2/4 — Münzevi / Fırsatçı (Hermit / Opportunist)"),
    "profileKeynotes.personalityLine": () => !!det("profile", "Personality (bilinçli) — 2. çizgi") && SR.includes("Personality (bilinçli) — 2. çizgi") && WT.includes("Personality (bilinçli) — 2. çizgi"),
    "profileKeynotes.designLine": () => !!det("profile", "Design (bilinçdışı) — 4. çizgi") && WT.includes("Design (bilinçdışı) — 4. çizgi"),
    "profileKeynotes.personality": () => det("profile", /^Personality/) === pk.personality && inW(String(pk.personality)),
    "profileKeynotes.design": () => det("profile", /^Design/) === pk.design && inW(String(pk.design)),
    profileDescription: () => det("profile", "Açıklama") === BASE.profileDescription && inW(String(BASE.profileDescription)),
    definition: () => MV.includes("İkili Tanım (Split)") && gen("definition").value === "İkili Tanım (Split)" && WT.includes("İkili Tanım"),
    definitionLocalized: () => extractSystemReading({ ...FULL, definition: "ZZ" })!.general.find((g) => g.key === "definition")!.value === "ZZTANIMYEREL",
    definitionDescription: () => det("definition", "Açıklama") === BASE.definitionDescription && inW(String(BASE.definitionDescription)),
    "sides.{*}": () => { const s = BASE.sides as Row; return D.sides?.personality === s.personality && D.sides?.design === s.design && SR.includes("data-hd-sr-sides") && inSR(String(s.design)) && inW(String(s.personality)) && inW(String(s.design)); },
    designInstantUtc: () => { const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(BASE.designInstantUtc))!; const lbl = `${m[3]}.${m[2]}.${m[1]} ${m[4]}:${m[5]} UTC`; return D.sides?.designUtc === lbl && SR.includes(lbl) && WT.includes(`Design tarihi`) && WT.includes(lbl.slice(0, 10)) && !WT.includes("UTC") && n.chart.timing.designUtcIso === new Date(String(BASE.designInstantUtc)).toISOString(); },
    "incarnationCross.gates[]": () => { const g = xc.gates as number[]; return MV.includes(`${g[0]}/${g[1]} | ${g[2]}/${g[3]}`) && det("cross", "Kapılar") === `Personality Güneş ${g[0]} · Personality Dünya ${g[1]} · Design Güneş ${g[2]} · Design Dünya ${g[3]}` && WT.includes(`Personality Güneş ${g[0]}`); },
    "incarnationCross.angle": () => MV.includes("Sağ Açı") && det("cross", "Açı")?.startsWith("Sağ Açı (Right Angle)") === true && WT.includes("Sağ Açı"),
    "incarnationCross.angleLocalized": () => extractSystemReading({ ...FULL, incarnationCross: { ...xc, angle: "ZZ Angle" } })!.general.find((g) => g.key === "cross")!.details.find((d) => d.label === "Açı")!.text.startsWith("ZZAÇIYEREL"),
    "incarnationCross.angleCode": () => det("cross", "Açı") === `Sağ Açı (Right Angle) (${xc.angleCode})` && WT.includes(`(${xc.angleCode})`),
    "incarnationCross.name": () => MV.includes(String(xc.name)) && gen("cross").value === xc.name && WT.includes(String(xc.name)),
    "incarnationCross.description": () => det("cross", "Açıklama") === xc.description && inW(String(xc.description)),
    "centers[].id": () => D.centers.length === 9 && centersRaw.every((c) => D.centers.some((x) => x.id === c.id)) && (MV.match(/data-hd-center="/g) ?? []).length === 9,
    "centers[].name": () => D.centers.find((c) => c.id === "head")!.name === "Baş Merkezi (Head)" && WT.includes("Baş Merkezi"),
    "centers[].nameLocalized": () => extractSystemReading({ ...FULL, centers: [...centersRaw.slice(0, 8), { ...centersRaw[8], id: "zz-yeni" }] })!.centers.some((c) => c.name === `ZZMERKEZ-${centersRaw[8].id}`),
    "centers[].defined": () => centersRaw.every((c) => D.centers.find((x) => x.id === c.id)!.defined === c.defined) && MV.includes('data-hd-center="sacral:defined"'),
    "centers[].motor": () => motorIds.length === 4 && D.centers.every((c) => c.motor === (centersRaw.find((r) => r.id === c.id)!.motor === true)) && (MV.match(/data-hd-center-motor/g) ?? []).length === 4 && (SR.match(/data-hd-sr-tag="motor"/g) ?? []).length === 4 && (WT.match(/Motor merkez/g) ?? []).length >= 4 && (render.centers as Row[]).every((c) => typeof c.motor === "boolean"),
    "centers[].awareness": () => awareIds.length === 3 && (MV.match(/data-hd-center-awareness/g) ?? []).length === 3 && (SR.match(/data-hd-sr-tag="awareness"/g) ?? []).length === 3 && (WT.match(/Farkındalık merkezi/g) ?? []).length >= 3,
    "centers[].theme": () => centersRaw.every((c) => D.centers.find((x) => x.id === c.id)!.theme === c.theme) && inW(String(centersRaw[0].theme)),
    "centers[].notSelfQuestion": () => centersRaw.every((c) => { const x = D.centers.find((y) => y.id === c.id)!; return c.defined ? x.notSelfQuestion === null : x.notSelfQuestion === c.notSelfQuestion; }) && inW(String(centersRaw.find((c) => !c.defined)!.notSelfQuestion)),
    "centers[].biology": () => centersRaw.every((c) => D.centers.find((x) => x.id === c.id)!.biology === c.biology) && SR.includes("data-hd-sr-health-note") === false && inW(String(centersRaw[0].biology)),
    "centers[].gates[]": () => centersRaw.every((c) => JSON.stringify(D.centers.find((x) => x.id === c.id)!.gates) === JSON.stringify([...(c.gates as number[])].sort((a, b) => a - b))) && (SR.match(/data-hd-sr-line="center-gates"/g) ?? []).length === 9 && WT.includes("Merkezdeki aktif kapılar"),
    "channels[].gateA": () => channelsRaw.every((c) => D.channels.some((x) => x.id === `${Math.min(Number(c.gateA), Number(c.gateB))}-${Math.max(Number(c.gateA), Number(c.gateB))}`)) && WT.includes(`Kanal ${D.channels[0].id}`),
    "channels[].gateB": () => (MV.match(/data-hd-channel="/g) ?? []).length === channelsRaw.length,
    "channels[].name": () => D.channels[0].name === "Mantık Kanalı" && WT.includes("Mantık"),
    "channels[].nameLocalized": () => extractSystemReading({ ...FULL, channels: [{ ...channelsRaw[0], gateA: 1, gateB: 2 }] })!.channels[0].name === `ZZKANAL-${channelsRaw[0].gateA}`,
    "channels[].circuit": () => (render.channels as Row[]).every((c) => typeof c.circuit === "string") && D.channels.every((c) => !!c.circuit),
    "channels[].circuitLocalized": () => D.channels[0].circuit === `ZZDEVRE-${channelsRaw[0].gateA}` && WT.includes(`ZZDEVRE-${channelsRaw[0].gateA}`),
    "channels[].centers[]": () => D.channels[0].centers?.join("|") === "Baş Merkezi (Head)|Ajna Merkezi (Ajna)" && (SR.match(/data-hd-sr-line="channel-centers"/g) ?? []).length === channelsRaw.length && WT.includes("Bağladığı merkezler"),
    "channels[].description": () => channelsRaw.every((c, i) => D.channels[i].description === c.description) && inW(String(channelsRaw[0].description)),
    "channels[].circuitDescription": () => channelsRaw.every((c, i) => D.channels[i].circuitDescription === c.circuitDescription) && inW(String(channelsRaw[0].circuitDescription)),
    "gates[].planet": () => n.chart.activations.length === 26 && MV.includes('data-hd-side="design"') && WT.includes("Güneş"),
    "gates[].planetLocalized": () => D.activations[0].planet === `ZZGEZEGEN-${gatesRaw[0].side}-${gatesRaw[0].planet}` && SR.includes(`ZZGEZEGEN-${gatesRaw[0].side}-${gatesRaw[0].planet}`),
    "gates[].side": () => D.activations.filter((a) => a.side === "design").length === 13 && SR.includes('data-hd-sr-side="design"') && SR.includes('data-hd-sr-side="personality"') && WT.includes("Design"),
    "gates[].gate": () => gatesRaw.every((g, i) => D.activations[i].gate === g.gate) && (MV.match(/data-hd-gate="/g) ?? []).length === n.codes.gates.length,
    "gates[].line": () => gatesRaw.every((g, i) => D.activations[i].line === g.line) && WT.includes(`${gatesRaw[0].gate}.${gatesRaw[0].line}`),
    "gates[].gateName": () => (render.gates as Row[]).every((g) => typeof g.gateName === "string") && extractSystemReading(BASE)!.activations[0].gateName === gatesRaw[0].gateName,
    "gates[].gateNameLocalized": () => D.activations[0].gateName === `ZZKAPIADI-${gatesRaw[0].gate}` && WT.includes(`ZZKAPIADI-${gatesRaw[0].gate}`),
    "gates[].gateDescription": () => gatesRaw.every((g, i) => D.activations[i].gateDescription === g.gateDescription) && SR.includes("data-hd-sr-gates") && inW(String(gatesRaw[0].gateDescription)),
    "gates[].lineMeaning": () => gatesRaw.every((g, i) => D.activations[i].lineMeaning === g.lineMeaning) && inW(String(gatesRaw[0].lineMeaning)),
    "gates[].planetDescription": () => gatesRaw.every((g, i) => D.activations[i].planetDescription === g.planetDescription) && inW(String(gatesRaw[0].planetDescription)),
    "gates[].ichingHexagram.number": () => gatesRaw.every((g, i) => D.activations[i].iching?.number === (g.ichingHexagram as Row).number && (g.ichingHexagram as Row).number === g.gate) && (SR.match(/data-hd-sr-line="iching"/g) ?? []).length === 26 && WT.includes(`${gatesRaw[0].gate}. heksagram`),
    "gates[].ichingHexagram.english": () => D.activations[0].iching?.name === (gatesRaw[0].ichingHexagram as Row).english && SR.includes(String((gatesRaw[0].ichingHexagram as Row).english)) && WT.includes(`${(gatesRaw[0].ichingHexagram as Row).english} (İngilizce kaynak adı)`),
  };
  const noProbe = schemaPaths.filter((p) => !PROBES[p]);
  ok(noProbe.length === 0, "P0 her şema alanının işlevsel kanıt testi var", noProbe);
  for (const p of schemaPaths) {
    let r = false;
    let err: unknown;
    try { r = !!PROBES[p]?.(); } catch (e) { err = String(e); }
    ok(r, `P ${p} — ${COVERAGE[p]?.where ?? "?"}`, err);
  }
  ok(SR.includes("data-hd-sr-language-note") === true && !!D.languageNote, "P-dil: İngilizce gelen metinler AÇIKÇA belirtilir (otomatik çeviri yok)");
  ok(WT.includes("kaynak dilinde (İngilizce)"), "P-dil: Word'de de kaynak dili notu");
  ok(!MV.includes(String(BASE.typeDescription).slice(0, 40)) && !MV.includes(String(centersRaw[0].theme).slice(0, 40)), "P-yetki: ana harita (yetkisiz uzman da görür) uzun sağlayıcı açıklaması İÇERMEZ — açıklamalar Sistem Yorumu yetkisinde");

  // ══ T — Türkçe + (İngilizce) terminoloji (owner 2026-10-17) ═════════════════
  section("T — Türkçe + (İngilizce) terimler");
  ok(JSON.stringify(Object.values(HD_TERM_BI)) === JSON.stringify(["Tip (Type)", "Strateji (Strategy)", "İç Otorite (Inner Authority)", "Profil (Profile)", "Tanım (Definition)", "İmza (Signature)", "Kendilik Dışı Tema (Not-Self Theme)", "Enkarnasyon Teması (Incarnation Cross)"]), "T1 owner'ın 8 başlığı birebir (Türkçe + İngilizce)", HD_TERM_BI);
  ok(hdBilingual("Hayal kırıklığı (Frustration)", "Frustration") === "Hayal kırıklığı (Frustration)" && hdBilingual("Generator", "generator") === "Generator" && hdBilingual("Tatmin", "") === "Tatmin" && hdBilingual("Tatmin", null) === "Tatmin", "T2 aynı İngilizce iki kez gösterilmez; İngilizce yoksa yalnız Türkçe");
  const kRaw = hdTypeKeynotes("generator", { canonical: { strategy: "Wait to respond", signature: "Satisfaction", notSelf: "Frustration" } })!;
  ok(kRaw.strategy === "Yanıt vermek için beklemek (Wait to respond)" && kRaw.signature === "Tatmin (Satisfaction)" && kRaw.notSelf === "Hayal kırıklığı (Frustration)", "T3 İngilizce: kaydın Roxy KANONİK değeri (gerçek veri öncelikli)", kRaw);
  const EXP: Record<string, [string, string, string]> = {
    generator: ["Yanıt vermek için beklemek (Wait to Respond)", "Tatmin (Satisfaction)", "Hayal kırıklığı (Frustration)"],
    manifesting_generator: ["Yanıt vermek için beklemek, sonra bilgilendirmek (Wait to Respond, then Inform)", "Tatmin (Satisfaction)", "Hayal kırıklığı (Frustration)"],
    manifestor: ["Harekete geçmeden önce bilgilendirmek (Inform)", "Huzur (Peace)", "Öfke (Anger)"],
    projector: ["Davet beklemek (Wait for the Invitation)", "Başarı (Success)", "Kırgınlık (Bitterness)"],
    reflector: ["Bir ay döngüsünü (~28 gün) beklemek (Wait a Lunar Cycle)", "Hayret (Surprise)", "Düş kırıklığı (Disappointment)"],
  };
  for (const [tc, [st, sg, ns]] of Object.entries(EXP)) {
    const k = hdTypeKeynotes(tc)!;
    ok(k.strategy === st && k.signature === sg && k.notSelf === ns, `T4 ${tc}: kanonik değer yoksa standart HD terimi (eski motor kaydı)`, k);
  }
  ok(hdTypeKeynotes("zz-bilinmeyen") === null && hdTypeKeynotes(null) === null, "T5 bilinmeyen tip → değer uydurulmaz (null)");
  const kOld = hdTypeKeynotes("projector", { bilingual: false })!;
  ok(kOld.strategy === "Davet beklemek" && kOld.signature === "Başarı" && kOld.notSelf === "Kırgınlık (Bitterness)", "T6 eski rapor modu: önceki tek dilli değerler birebir", kOld);
  ok(hdProfileBilingual("2_4") === "2/4 — Münzevi / Fırsatçı (Hermit / Opportunist)" && hdProfileBilingual("5_1") === "5/1 — Çözüm Getiren / Araştırmacı (Heretic / Investigator)" && hdProfileBilingual("x") === null, "T7 profil Türkçe + İngilizce çizgi adları");
  // Bilgi bloğunda açıklama varsayılan KAPALI; erişilebilir "i" düğmesiyle açılır (canlı görsel düzeltme 2026-10-17).
  ok(MV.includes("data-hd-signature-help-toggle") && MV.includes('aria-expanded="false"') && MV.includes("İmza (Signature) nedir?") && SR.includes(HD_SIGNATURE_HELP) && WT.includes(HD_SIGNATURE_HELP), "T8 'İmza (Signature)' kısa açıklaması: bilgi bloğunda 'i' düğmesi + Sistem Yorumu + yeni Word");
  ok(["type", "strategy", "authority", "definition", "signature", "notSelf"].every((k) => D.general.find((g) => g.key === k)!.title === HD_TERM_BI[k as keyof typeof HD_TERM_BI]) && D.general.find((g) => g.key === "cross")!.title === HD_TERM_BI.cross, "T9 Sistem Yorumu başlıkları bilgi bloğuyla aynı sözlük");
  const infoVals = ["strategy", "signature", "notSelf"].map((k) => gen(k).value!);
  ok(infoVals.every((v) => MV.includes(v) && WT.includes(v)), "T10 Strateji/İmza/Kendilik dışı: harita = Sistem Yorumu = Word (aynı değer)", infoVals);
  ok(["Tip (Type)", "Strateji (Strategy)", "İç Otorite (Inner Authority)", "Profil (Profile)", "Tanım (Definition)", "İmza (Signature)", "Kendilik Dışı Tema (Not-Self Theme)"].every((l) => WT.includes(`${l}:`) || WT.includes(l)), "T11 yeni Word kimlik bölümünde iki dilli başlıklar");
  ok(!WT.includes("Haç") && WT.includes("Enkarnasyon Teması (Yaşam Amacı)") && !SR.includes("Haç") && !MV.includes("Haç") && MV.includes("Enkarnasyon Teması (Incarnation Cross)"), "T15 10-10 kararı: Türkçe görünen başlıkta 'Haç' YOK (harita, Sistem Yorumu, yeni Word); Word özel bölüm başlığı korunur");
  ok(snap.termSet === "tr-en" && snap.identity.signature === `Tatmin (${BASE.signature})`, "T12 yeni snapshot terim setini dondurur (tr-en)");
  const oldTerms = { ...snap, termSet: undefined, identity: { ...snap.identity, strategy: "Yanıt vermek için beklemek", signature: "Tatmin", notSelf: "Hayal kırıklığı (Frustration)", profile: "2/4 — Münzevi / Fırsatçı" } };
  const WOT = await docText(await renderHdReportV2Buffer(oldTerms, {}));
  ok(!WOT.includes("(Type)") && !WOT.includes("(Strategy)") && !WOT.includes("(Signature)") && !WOT.includes(HD_SIGNATURE_HELP) && WOT.includes("Tatmin") && !WOT.includes("Tatmin (Satisfaction)"), "T13 ESKİ rapor (terim seti yok) eski tek dilli başlık/değerlerle basılır — sessiz değişiklik yok");
  const legacyMV = renderToStaticMarkup(createElement(HdComputedChartView, { result: { ...n.chart, strategy: undefined, signature: undefined, notSelf: undefined } }));
  ok(legacyMV.includes("Yanıt vermek için beklemek (Wait to Respond)") && legacyMV.includes("Tatmin (Satisfaction)"), "T14 eski (sağlayıcı değeri olmayan) kayıt: standart İngilizce terim, çökme yok");

  // ══ K — Kenar durumlar ═══════════════════════════════════════════════════════
  section("K — Eksik / kısmi / bozuk / eski yanıt, XSS");
  const old = JSON.parse(FIXTURE) as Row;
  delete old.sides;
  (old.centers as Row[]).forEach((c) => { delete c.motor; delete c.awareness; delete c.gates; });
  (old.channels as Row[]).forEach((c) => { delete c.centers; });
  (old.gates as Row[]).forEach((g) => { delete g.ichingHexagram; });
  delete (old.profileKeynotes as Row).personalityLine;
  const dOld = extractSystemReading(old)!;
  ok(!!dOld && dOld.centers.every((c) => c.motor === null && c.awareness === null && c.gates!.length === 0) && dOld.activations.every((a) => a.iching === null) && dOld.channels.every((c) => c.centers!.length === 0), "K1 eski şema (yeni alanlar yok): çökme yok, alanlar boş — UYDURMA yok");
  ok(dOld.general.find((g) => g.key === "profile")!.details.some((d) => d.label === "Personality (bilinçli)"), "K2 eksik çizgi numarası → etiket numarasız (tahmin yok)");
  const srOld = renderToStaticMarkup(createElement(HdSystemReadingView, { data: dOld }));
  ok(!srOld.includes('data-hd-sr-tag="motor"') && !srOld.includes("I Ching") && (srOld.match(/data-hd-sr-line="center-gates"/g) ?? []).length === 9, "K3 eski kayıtta motor/I Ching satırı görünmez; aktif kapı yoksa açıkça 'yok'");
  const mismatch = JSON.parse(FIXTURE) as Row;
  ((mismatch.gates as Row[])[0].ichingHexagram as Row).number = 7;
  ok(extractSystemReading(mismatch)!.activations[0].iching === null, "K4 I Ching numarası kapıyla eşleşmezse gösterilmez (yanlış eşleme yok)");
  for (const bad of [null, "çöp", 42, [], { centers: "x", gates: [{}], channels: [null] }, { sides: { personality: 5 } }]) {
    let crashed = false;
    try { extractSystemReading(bad); } catch { crashed = true; }
    ok(!crashed, `K5 bozuk ham yanıt (${JSON.stringify(bad).slice(0, 40)}) → çökme yok`);
  }
  const xss = JSON.parse(FIXTURE) as Row;
  (xss.sides as Row).personality = "<script>alert(1)</script><img src=x onerror=alert(2)> metin";
  ((xss.gates as Row[])[0].ichingHexagram as Row).english = "<b>Kalın</b>";
  const dx = extractSystemReading(xss)!;
  const sx = renderToStaticMarkup(createElement(HdSystemReadingView, { data: dx }));
  ok(!sx.includes("<script>") && sx.includes("&lt;script&gt;") && !sx.includes("<b>Kalın</b>"), "K6 HTML/XSS: sağlayıcı metni yalnız düz metin (kaçışlı)");
  ok(!looksEnglishText("Kişi kendi kararını duygusal dalga içinde verir ve zamanla netleşir; acele etmez.") && looksEnglishText(String(BASE.typeDescription)), "K7 dil algılama: Türkçe metin İngilizce sayılmaz, İngilizce metin işaretlenir");
  const trOnly = extractSystemReading({ ...FULL, typeDescription: "Yaşam gücü yüksek, yanıt vererek çalışan bir aura türüdür; doyurucu iş için bekler." })!;
  ok(trOnly.general.find((g) => g.key === "type")!.details[0].text.startsWith("Yaşam gücü"), "K8 Türkçe gelen açıklama aynen korunur");
  const oldSnap = buildReportSnapshotV2({
    generatedAt: "2026-10-01T09:00:00.000Z", chartId: "c4a00000-0000-4000-8000-0000000000b2", source: "computed", provider: "roxyapi",
    client: { name: "Eski Rapor", birthDate: "2018-07-20", birthTime: "19:00:00", birthPlace: "Konya", timezone: "Europe/Istanbul" },
    codes: n.codes, computed: n.chart, requested: "system", systemReadingPermitted: true,
    systemReading: { general: D.general, centers: D.centers.map((c) => omit(c, ["motor", "awareness", "gates"])), channels: D.channels.map((c) => omit(c, ["centers"])), activations: D.activations.map((a) => omit(a, ["iching"])) },
    expertRecords: [], bodygraph: { status: "missing" }, chartImage: null,
  });
  const WOld = await docText(await renderHdReportV2Buffer(oldSnap, {}));
  const oldHits = (WOld.replace("Bu rapor teşhis veya tedavi önerisi içermez.", "").match(/I Ching|Merkezdeki aktif kapılar|Bağladığı merkezler|Personality ve Design Tarafları|Motor merkez|tıbbi teşhis veya tedavi önerisi değildir\./g) ?? []);
  if (oldHits.length) console.log("    eski rapor eşleşmeleri:", [...new Set(oldHits)]);
  ok(!/I Ching|Merkezdeki aktif kapılar|Bağladığı merkezler|Personality ve Design Tarafları|Motor merkez|tıbbi teşhis veya tedavi önerisi değildir\./.test(WOld.replace("Bu rapor teşhis veya tedavi önerisi içermez.", "")) && WOld.includes(String(BASE.typeDescription).slice(0, 50)),
    "K9 ESKİ rapor snapshot'ı (yeni alanlar yok) Word'de eskisi gibi basılır — sessiz içerik değişikliği yok");

  // ══ R — Rota, yetki, tenant, eski kayıtlar, Roxy çağrısı ═════════════════════
  section("R — Rota + güvenlik (gömülü Postgres, sahte Roxy)");
  const env = await startHdFlowEnv({ port: 54451, dirName: "hd-bodygraph-complete-pgdata" });
  const su = env.su;
  const roxy = installFakeRoxy();
  try {
    const UA: Auth = await mkUser(su, "BGA", TA, { human_design: true, clients: true, hd_system_reading: true });
    const UN: Auth = await mkUser(su, "BGN", TA, { human_design: true, clients: true });
    const UB: Auth = await mkUser(su, "BGB", TB, { human_design: true, clients: true, hd_system_reading: true });
    const R = {
      journey: await import("../../app/api/hd/clients/journey/route"),
      roxy: await import("../../app/api/hd/charts/roxy/route"),
      charts: await import("../../app/api/hd/charts/route"),
      sr: await import("../../app/api/hd/charts/system-reading/route"),
      professional: await import("../../app/api/hd/reports/professional/route"),
      download: await import("../../app/api/hd/reports/professional/download/route"),
    };
    const sr = (u: Auth, id: string) => callRoute(R.sr.GET, "GET", u, undefined, `?id=${id}`);
    const c1 = await callRoute(R.journey.POST, "POST", UA, { action: "create_new", ad: "Tamlık", soyad: "Deneme", dogum: "2018-07-20", birth_time: "19:00", birth_location_ref: "trd-42-selcuklu", request_id: randomUUID() });
    const P = String(c1.json.hd_client_id);
    const comp = await callRoute(R.roxy.POST, "POST", UA, { client_id: P, location_id: "client" });
    const A = String(comp.json.id);
    ok(comp.json.ok === true && roxy.state.calls === 1, "R0 tohum: bilinçli tek hesap (1 Roxy çağrısı)", comp.json);
    const calls0 = roxy.state.calls;
    const raw = (await su.query(`select provider_raw from public.human_design_charts where id=$1`, [A])).rows[0].provider_raw as Row;
    ok(!!raw && Array.isArray(raw.gates) && !!(raw.gates as Row[])[0].ichingHexagram && !!raw.sides && typeof (raw.centers as Row[])[0].motor === "boolean", "R1 human_design_charts.provider_raw ham yanıtın tamamını saklar (I Ching, sides, motor dahil)");
    const g1 = await sr(UA, A);
    const data = g1.json.data as SystemReadingDto;
    ok(g1.status === 200 && !!data?.sides?.design && data.centers.some((c) => c.motor === true) && data.activations.every((a) => a.iching?.number === a.gate) && data.channels.every((c) => (c.centers ?? []).length === 2), "R2 yetkili uzman: Sistem Yorumu yeni alanlarla döner", { st: g1.status });
    ok(!JSON.stringify(g1.json).includes("provider_raw") && !JSON.stringify(g1.json).includes("ichingHexagram") && !JSON.stringify(g1.json).includes("2018-07-20"), "R3 yanıt whitelist DTO: ham yanıt / doğum tarihi sızmaz");
    ok((await sr(UN, A)).status === 403, "R4 hd_system_reading yetkisi OLMAYAN uzman → 403 (politika korunur)");
    ok((await sr(UB, A)).status === 404, "R5 başka tenant → 404 (varlık sızdırılmaz)");
    for (let i = 0; i < 3; i++) await sr(UA, A);
    await callRoute(R.charts.GET, "GET", UA, undefined, `?id=${A}`);
    ok(roxy.state.calls === calls0, "R6 kayıtlı harita / Sistem Yorumu / kapı-kanal-merkez açıklamaları açmak: Roxy çağrısı 0");
    const w = await callRoute(R.professional.POST, "POST", UA, { chartId: A, requestId: randomUUID(), commentary: "system", bodygraphPng: boundBodygraphDataUrl(BODYGRAPH, A, FIXTURE) });
    const rep = String(w.json.id);
    const snapRow = (await su.query(`select snapshot from public.human_design_reports where id=$1`, [rep])).rows[0]?.snapshot as Row;
    const reading = ((snapRow?.commentary as Row)?.system as Row)?.reading as SystemReadingDto;
    ok(w.json.ok === true && !!reading?.sides && reading.activations.every((a) => !!a.iching), "R7 yeni Word snapshot'ı tamamlanmış içerik modelini dondurur", w.json);
    const dl = await callRoute(R.download.POST, "POST", UA, { reportId: rep });
    const dlText = dl.buf ? await docText(dl.buf) : "";
    ok(dl.status === 200 && dlText.includes("heksagram") && dlText.includes("Bağladığı merkezler") && dlText.includes("Design tarihi"), "R8 Word indirme: yeni BodyGraph alanları belgede", dl.status);
    ok(roxy.state.calls === calls0, "R9 Word hazırlama + indirme: Roxy çağrısı 0");
    const dlN = await callRoute(R.download.POST, "POST", UN, { reportId: rep });
    const nText = dlN.buf ? await docText(dlN.buf) : "";
    ok(dlN.status !== 200 || !nText.includes("heksagram"), "R10 Sistem Yorumu yetkisi olmayan uzman indirdiğinde sistem içeriği çıkarılır (mevcut politika)", dlN.status);
    // Eski kayıt türleri
    const c2 = await callRoute(R.journey.POST, "POST", UA, { action: "create_new", ad: "Eski", soyad: "Roxy", dogum: "1985-05-05", birth_time: "05:05", birth_location_ref: "trd-42-selcuklu", request_id: randomUUID() });
    const P2 = String(c2.json.hd_client_id);
    const A2 = String((await callRoute(R.roxy.POST, "POST", UA, { client_id: P2, location_id: "client" })).json.id);
    await su.query(`update public.human_design_charts set provider_raw = (provider_raw - 'sides') where id=$1`, [A2]);
    await su.query(`update public.human_design_charts set provider_raw = jsonb_set(provider_raw, '{gates}', (select jsonb_agg(g - 'ichingHexagram') from jsonb_array_elements(provider_raw->'gates') g)) where id=$1`, [A2]);
    const callsOld = roxy.state.calls;
    const gOld = await sr(UA, A2);
    const dOld2 = gOld.json.data as SystemReadingDto;
    ok(gOld.status === 200 && dOld2.activations.every((a) => a.iching === null) && !dOld2.sides?.personality && !!dOld2.sides?.designUtc, "R11 eski Roxy kaydı (sides / I Ching yok): çökme yok, olmayan alan uydurulmaz", gOld.status);
    ok(!JSON.stringify(dOld2).includes(String((BASE.sides as Row).personality).slice(0, 30)), "R12 eksik alan başka analizden DOLDURULMAZ");
    await su.query(`update public.human_design_charts set provider_raw = '"bozuk"'::jsonb where id=$1`, [A2]);
    const gBad = await sr(UA, A2);
    ok(gBad.status === 200 && gBad.json.available === false, "R13 bozuk provider_raw → 'sistem yorumu yok' (500 / çökme yok)", gBad.json);
    await su.query(`update public.human_design_charts set provider_raw = null where id=$1`, [A2]);
    ok((await sr(UA, A2)).json.available === false, "R14 provider_raw olmayan kayıt → 'yok' (sağlayıcıya geri dönüş çağrısı yok)");
    const man = randomUUID();
    await su.query(`insert into public.human_design_charts(id, tenant_id, client_id, source, type_code, client_name) values ($1,$2,$3,'manual','generator','Eski Roxy')`, [man, TA, P2]);
    ok((await sr(UA, man)).json.available === false, "R15 manuel Human Design analizi → Sistem Yorumu yok (uydurma yok)");
    ok(roxy.state.calls === callsOld, "R16 eski/bozuk/manuel kayıt okumaları Roxy çağrısı üretmez");
    const multi = (await su.query(`select count(*)::int n from public.human_design_charts where client_id=$1`, [P2])).rows[0].n;
    const gA = await sr(UA, A);
    ok(multi === 2 && (gA.json.data as SystemReadingDto).sides?.personality === (BASE.sides as Row).personality, "R17 birden fazla analizli danışan: her analiz kendi kimliğiyle okunur (karışma yok)");
    ok(roxy.state.external.length === 0, "harici ağ isteği yok", roxy.state.external.slice(0, 3));
  } finally {
    roxy.restore();
    await env.stop();
  }

  // Envanter çıktısı (rapor için): alan · kullanım · yeni mi
  if (process.argv.includes("--inventory")) {
    console.log("\nALAN ENVANTERİ");
    for (const f of SNAP.fields) {
      const c = COVERAGE[f.path];
      console.log(`${f.path}\t${f.required ? "zorunlu" : "isteğe bağlı"}\t${c.use.join(",")}\t${c.added ? "YENİ" : "mevcut"}\t${c.where}${c.note ? ` — ${c.note}` : ""}`);
    }
  }
  console.log(`\nHD BODYGRAPH ALAN TAMLIĞI: ${pass} PASS / ${fail} FAIL`);
  if (fail) { for (const f of fails) console.log(" -", f); process.exit(1); }
  void ROOT;
}

main().catch((e) => { console.error(e); process.exit(1); });
