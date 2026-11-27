/**
 * HD Bilgi Bankası — 9 "Genel — {merkez}" başlığı harness'i (SAF; gerçek DB / ağ / Roxy YOK).
 *
 *   A) Katalog — 9/9 genel başlık, 27/27 mevcut başlık aynen, 36/36 benzersiz kod, sıra (genel önce)
 *   B) Kalıcılık — 9/9 genel kayıt oluştur / kaydet / yeniden aç / düzenle; aktif + taslak; mükerrer kod
 *   C) Otomatik eşleştirme — genel kod hiçbir haritadan üretilmez; istek genel kodu açıkça istese bile
 *      sunucu okuma katmanı (listKnowledgeByCodes / listKnowledgeForReport) genel kaydı döndürmez
 *   D) Word — danışan raporu (DOCX) genel kayıt içermez; pozitif kontrol: kesin kayıt içerir
 *   E) Regresyon — Tanımlı / Tanımsız / Açık + eski genel acik_* eşleşmesi değişmedi
 *   F) Kullanıcılar arası izolasyon — tenant-scoped okuma/yazma
 *   G) Ağ çağrısı 0 (Roxy kredisi harcanmaz)
 *
 * Çalıştır: npx tsx scripts/hd-genel-merkez/harness.ts
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

let fetchCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
  fetchCalls++;
  void args;
  throw new Error("harness: ağ çağrısı YASAK");
}) as typeof fetch;

import { HUMAN_DESIGN_CENTERS } from "../../lib/human-design/constants";
import {
  buildKnowledgeCodeFromValue,
  deriveStructuredValue,
  getStructuredCategoryOptions,
  getStructuredCategoryOptionsForEdit,
} from "../../lib/human-design/codeHelpers";
import { buildExpertKnowledgeCodes, centerKnowledgeCodes } from "../../lib/human-design/normalize/hdAppCodes";
import {
  dedupeCenterKnowledge,
  excludeGeneralCenterKnowledge,
  HD_GENERAL_CENTER_NOTE,
  isGeneralCenterKnowledgeCode,
  isLegacyCenterKnowledgeCode,
} from "../../lib/human-design/knowledge/centerKnowledge";
import { sortHdKnowledgeRecords } from "../../lib/human-design/knowledge/hdKnowledgeSort";
import {
  getKnowledgeById,
  insertKnowledge,
  listKnowledge,
  listKnowledgeByCodes,
  listKnowledgeForReport,
  updateKnowledge,
} from "../../lib/human-design/api/knowledgePersistence";
import { isHdCanonicalKey } from "../../lib/human-design/knowledge-system/canonicalKeys";
import { centerStateMap, classifyChartRowCenters, classifyComputedChartCenters, HD_CENTER_CODES } from "../../lib/human-design/chart/centerStates";
import { validateRoxyBodygraph } from "../../lib/human-design/providers/roxy/schema";
import { normalizeRoxyBodygraph, type RoxyNormalizeInput } from "../../lib/human-design/providers/roxy/normalize";
import { buildReportSnapshotV2 } from "../../lib/human-design/reporting/reportSnapshotV2";
import { renderHdReportV2Buffer } from "../../lib/human-design/reporting/wordReportV2";
import { buildCodesFromChart } from "../../app/human-design/rapor-olustur/helpers/hdRapor";
import { createFakeDb } from "../hd-roxy/fakeDb";
import type { HdCenterCode, HumanDesignChart } from "../../lib/human-design/types";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const FIXTURE = JSON.parse(read("scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json")) as Record<string, unknown>;

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    fails.push(name);
    console.log(`  ✗ FAIL: ${name}${detail !== undefined ? ` → ${JSON.stringify(detail).slice(0, 400)}` : ""}`);
  }
}
const section = (t: string) => console.log(`\n[${t}]`);

const NORM_INPUT: RoxyNormalizeInput = {
  date: "2018-07-20", time: "19:00:00", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784,
  nodeType: "true", lang: "tr", birthUtcIso: "2018-07-20T16:00:00.000Z",
};

const T_A = "11111111-1111-4111-8111-111111111111";
const T_B = "22222222-2222-4222-8222-222222222222";
const U_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const U_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

/** Owner talimatındaki 9 başlık — mevcut sistem merkez adlarıyla (bağımsız beklenen liste). */
const EXPECTED_GENERAL: Array<[HdCenterCode, string]> = [
  ["head", "Genel — Baş Merkezi (Head)"],
  ["ajna", "Genel — Ajna Merkezi (Ajna)"],
  ["throat", "Genel — Boğaz Merkezi (Throat)"],
  ["g_identity", "Genel — G / Kimlik Merkezi (G Center)"],
  ["heart_ego", "Genel — Kalp / Ego Merkezi (Heart)"],
  ["solar_plexus", "Genel — Solar Pleksus Merkezi (Solar Plexus)"],
  ["sacral", "Genel — Sakral Merkez (Sacral)"],
  ["spleen", "Genel — Dalak Merkezi (Spleen)"],
  ["root", "Genel — Kök Merkezi (Root)"],
];

/** Değişiklik ÖNCESİ (origin/main a716b7fb) 27 seçeneğin birebir listesi — sıra dahil. */
const BASELINE_27: Array<{ code: string; label: string }> = HUMAN_DESIGN_CENTERS.flatMap(({ code, label }) => [
  { code: `tanimli_${code}`, label: `Tanımlı — ${label}` },
  { code: `tanimsiz_${code}`, label: `Tanımsız — ${label}` },
  { code: `tam_acik_${code}`, label: `Açık — ${label}` },
]);

async function docxText(buf: Buffer): Promise<string> {
  const z = await JSZip.loadAsync(buf);
  return (await z.file("word/document.xml")!.async("string")).replace(/<[^>]+>/g, " ");
}

async function main() {
  // ─────────────────────────────────────────────────────────────────────────
  section("A — Katalog: 9 genel + 27 mevcut = 36");
  const opts = getStructuredCategoryOptions("Merkezler")!;
  const general = opts.filter((o) => o.code.startsWith("genel_"));
  const precise = opts.filter((o) => !o.code.startsWith("genel_"));
  ok("A1 toplam 36 merkez başlığı", opts.length === 36, opts.length);
  ok("A2 9/9 genel başlık listelenir (etiket birebir)", general.length === 9 && EXPECTED_GENERAL.every(([c, l]) => general.some((o) => o.code === `genel_${c}` && o.label === l)), general);
  ok("A3 27/27 mevcut başlık AYNEN korunur (kod + etiket + sıra)", JSON.stringify(precise) === JSON.stringify(BASELINE_27));
  const fullCodes = opts.map((o) => buildKnowledgeCodeFromValue("Merkezler", o.code));
  ok("A4 36/36 benzersiz teknik kod", new Set(fullCodes).size === 36);
  ok("A5 36/36 benzersiz görünen başlık", new Set(opts.map((o) => o.label)).size === 36);
  ok("A6 genel kodlar eski genel merkez_acik_* / kesin kodlarla ÇAKIŞMAZ", general.every((o) => {
    const full = buildKnowledgeCodeFromValue("Merkezler", o.code);
    return /^merkez_genel_[a-z_]+$/.test(full) && !isLegacyCenterKnowledgeCode(full) && !/^merkez_(tanimli|tanimsiz|tam_acik|acik)_/.test(full);
  }));
  ok("A7 her merkezde Genel başlık Tanımlı/Tanımsız/Açık'tan ÖNCE", HD_CENTER_CODES.every((c) => {
    const i = (p: string) => opts.findIndex((o) => o.code === `${p}_${c}`);
    return i("genel") >= 0 && i("genel") < i("tanimli") && i("tanimli") < i("tanimsiz") && i("tanimsiz") < i("tam_acik");
  }));
  ok("A8 gruplar merkez sırasıyla: [genel, tanımlı, tanımsız, açık] × 9", opts.map((o) => o.code).join() === HUMAN_DESIGN_CENTERS.flatMap(({ code }) => [`genel_${code}`, `tanimli_${code}`, `tanimsiz_${code}`, `tam_acik_${code}`]).join());
  ok("A9 genel kodlar admin canonical anahtarı DEĞİL", general.every((o) => !isHdCanonicalKey(buildKnowledgeCodeFromValue("Merkezler", o.code))));
  ok("A10 yeniden açma: genel kod düzenleyicide seçili görünür (round-trip)", general.every((o) => deriveStructuredValue("Merkezler", buildKnowledgeCodeFromValue("Merkezler", o.code)) === o.code));
  ok("A11 genel kaydı düzenleme seçenekleri = 36 (eski seçenek eklenmez)", getStructuredCategoryOptionsForEdit("Merkezler", "genel_head")!.length === 36);
  ok("A12 eski acik_* kaydı düzenleme = 36 + kendi eski seçeneği", getStructuredCategoryOptionsForEdit("Merkezler", "acik_head")!.length === 37);
  ok("A13 diğer kategoriler değişmedi", ["Tipler", "Otoriteler", "Profiller", "Tanımlar", "Kanallar", "Kapılar"].map((c) => getStructuredCategoryOptions(c)!.length).join() === "5,7,12,4,36,64");
  const sorted = sortHdKnowledgeRecords([
    { id: "4", category: "Merkezler", code: "merkez_tam_acik_head", title: "Açık — Baş" },
    { id: "6", category: "Merkezler", code: "merkez_genel_ajna", title: "Genel — Ajna" },
    { id: "3", category: "Merkezler", code: "merkez_tanimsiz_head", title: "Tanımsız — Baş" },
    { id: "5", category: "Merkezler", code: "merkez_acik_head", title: "Eski" },
    { id: "2", category: "Merkezler", code: "merkez_tanimli_head", title: "Tanımlı — Baş" },
    { id: "1", category: "Merkezler", code: "merkez_genel_head", title: "Genel — Baş" },
  ]);
  ok("A15 bilgilendirme metni Owner metniyle birebir", HD_GENERAL_CENTER_NOTE === "Bu kayıt genel bilgi ve eğitim notları içindir. Danışan haritasıyla otomatik eşleşmez ve otomatik raporlara dahil edilmez.");
  ok("A16 editör + Yeni Kayıt formu bilgilendirmeyi yalnız genel kodda gösterir; üst açıklamalar istisnayı belirtir",
    /isGeneralCenterKnowledgeCode\(computeCode\(/.test(read("app/human-design/bilgi-bankasi/[recordId]/HdKayitEditor.tsx")) &&
    /isGeneralCenterKnowledgeCode\(computeCode\(/.test(read("app/human-design/bilgi-bankasi/components/HdBilgiKayitForm.tsx")) &&
    read("app/human-design/bilgi-bankasi/page.tsx").includes("Genel merkez kayıtları bu eşleşmeye ve otomatik raporlara dahil edilmez.") &&
    read("app/human-design/bilgi-bankasi/legacy/page.tsx").includes("Genel merkez kayıtları bu eşleşmeye ve"));
  ok("A14 liste sıralaması: Genel → Tanımlı → Tanımsız → Açık → eski genel; sonra sonraki merkez", sorted.map((r) => r.id).join() === "1,2,3,4,5,6", sorted.map((r) => r.id));

  // ─────────────────────────────────────────────────────────────────────────
  section("B — Kalıcılık: 9/9 oluştur / kaydet / yeniden aç / düzenle (sahte DB, tenant-scoped)");
  const seedPrecise = [
    { id: "P1", tenant_id: T_A, user_id: U_A, category: "Merkezler", code: "merkez_tanimli_head", title: "Tanımlı — Baş Merkezi (Head)", content: "KESIN-TANIMLI-BAS", is_active: true, sort_order: 0, created_at: "2026-01-01T00:00:00Z" },
    { id: "P2", tenant_id: T_A, user_id: U_A, category: "Merkezler", code: "merkez_tanimsiz_g_identity", title: "Tanımsız — G", content: "KESIN-TANIMSIZ-G", is_active: true, sort_order: 0, created_at: "2026-01-01T00:00:00Z" },
    { id: "P3", tenant_id: T_A, user_id: U_A, category: "Merkezler", code: "merkez_tam_acik_heart_ego", title: "Açık — Kalp", content: "KESIN-ACIK-KALP", is_active: true, sort_order: 0, created_at: "2026-01-01T00:00:00Z" },
    { id: "L1", tenant_id: T_A, user_id: U_A, category: "Merkezler", code: "merkez_acik_solar_plexus", title: "Açık — Solar Pleksus", content: "ESKI-GENEL-SP", is_active: true, sort_order: 0, created_at: "2026-01-01T00:00:00Z" },
    { id: "K1", tenant_id: T_A, user_id: U_A, category: "Tipler", code: "tip_generator", title: "Generator", content: "TIP-GENERATOR", is_active: true, sort_order: 0, created_at: "2026-01-01T00:00:00Z" },
  ];
  const kb = createFakeDb({ human_design_knowledge_records: seedPrecise });
  const beforeExisting = JSON.stringify(kb.tables.human_design_knowledge_records);
  const ids: Record<string, string> = {};
  let created = 0;
  for (const [i, [c, label]] of EXPECTED_GENERAL.entries()) {
    const code = buildKnowledgeCodeFromValue("Merkezler", `genel_${c}`);
    // 5 aktif (içerikli) + 4 taslak (boş içerikle de kaydedilebilir)
    const active = i < 5;
    const r = await insertKnowledge(kb.db, T_A, U_A, { category: "Merkezler", title: label, code, content: active ? `GENEL-ICERIK-${c}` : "", expert_notes: `GENEL-NOT-${c}`, is_active: active });
    if (r.id && !r.error) { created++; ids[c] = r.id; }
  }
  ok("B1 9/9 genel kayıt oluşturuldu (5 içerikli + 4 boş içerikli)", created === 9, ids);
  let reopened = 0;
  for (const [c, label] of EXPECTED_GENERAL) {
    const { row } = await getKnowledgeById(kb.db, T_A, ids[c]);
    if (row && row.code === `merkez_genel_${c}` && row.title === label && row.category === "Merkezler" && row.is_active === true && row.expert_notes === `GENEL-NOT-${c}`) reopened++;
  }
  ok("B2 9/9 yeniden açılır: kod / başlık / kategori / özel not aynen; kaydedilen kayıt otomatik AKTİF (Owner 28.11)", reopened === 9);
  ok("B3 yeniden açılan kaydın yapısal değeri düzenleyicide seçili", EXPECTED_GENERAL.every(([c]) => deriveStructuredValue("Merkezler", `merkez_genel_${c}`) === `genel_${c}`));
  let edited = 0;
  for (const [c] of EXPECTED_GENERAL) {
    const u = await updateKnowledge(kb.db, T_A, ids[c], { content: `GENEL-ICERIK-${c} — düzenlendi`, expert_notes: `GENEL-NOT-${c} — düzenlendi`, is_active: true });
    const { row } = await getKnowledgeById(kb.db, T_A, ids[c]);
    if (u.ok && row?.content === `GENEL-ICERIK-${c} — düzenlendi` && row.is_active === true && row.code === `merkez_genel_${c}`) edited++;
  }
  ok("B4 9/9 düzenlenir ve kaydedilir (taslak → aktif dahil; kod değişmez)", edited === 9);
  const toDraft = await updateKnowledge(kb.db, T_A, ids.root, { is_active: false });
  ok("B5 istemci is_active=false gönderse de kayıt AKTİF kalır (aktif/pasif seçimi yok)", toDraft.ok && (await getKnowledgeById(kb.db, T_A, ids.root)).row?.is_active === true);
  await updateKnowledge(kb.db, T_A, ids.root, { is_active: true });
  const blankActive = await insertKnowledge(kb.db, T_B, U_B, { category: "Tipler", title: "Generator", code: "tip_generator", content: "  ", is_active: true });
  const blankMatch = await listKnowledgeForReport(kb.db, T_B, ["tip_generator"]);
  ok("B6 içeriği boş kayıt kaydedilir ama otomatik rapor okumasına GİRMEZ", !!blankActive.id && blankMatch.rows.length === 0 && !blankMatch.error);
  const dup = await insertKnowledge(kb.db, T_A, U_A, { category: "Merkezler", title: "x", code: "merkez_genel_head", content: "y", is_active: true });
  ok("B7 mükerrer genel kod (aynı kullanıcı) → red + mevcut kayıt id", !dup.id && dup.existingId === ids.head);
  const existingAfter = JSON.stringify(kb.tables.human_design_knowledge_records.filter((r) => seedPrecise.some((s) => s.id === r.id)));
  ok("B8 mevcut kayıtlar (kesin + eski genel + tip) DEĞİŞMEDİ / SİLİNMEDİ", existingAfter === beforeExisting);

  // ─────────────────────────────────────────────────────────────────────────
  section("C — Otomatik eşleştirme: aktif genel kayıt haritayla EŞLEŞMEZ");
  const v = validateRoxyBodygraph(FIXTURE);
  const n = v.ok ? normalizeRoxyBodygraph(v.value, NORM_INPUT) : null;
  if (!n || !n.ok) throw new Error("fixture normalize edilemedi");
  const fx = centerStateMap(classifyComputedChartCenters(n.chart));
  const codesFx = buildExpertKnowledgeCodes(n.codes, fx);
  ok("C1 hesaplanmış haritanın kodlarında merkez_genel_* YOK", !codesFx.some(isGeneralCenterKnowledgeCode), codesFx);
  // Tüm merkez durum kombinasyonları (9 merkez × tanımlı / tanımsız / açık / doğrulanamadı)
  let genInAny = 0;
  for (const c of HD_CENTER_CODES) {
    for (const st of ["undefined", "open", "unverified"] as const) {
      genInAny += centerKnowledgeCodes([], [c], { [c]: st }).filter(isGeneralCenterKnowledgeCode).length;
    }
    genInAny += centerKnowledgeCodes([c], [], {}).filter(isGeneralCenterKnowledgeCode).length;
  }
  genInAny += centerKnowledgeCodes([...HD_CENTER_CODES], [...HD_CENTER_CODES]).filter(isGeneralCenterKnowledgeCode).length;
  ok("C2 9 merkez × 4 durumun HİÇBİRİ genel kod üretmez", genInAny === 0);
  const manualRow = { type_code: "generator", authority_code: "sacral", profile_code: "2_4", definition_code: "split", active_centers: n.codes.active_centers, open_centers: n.codes.open_centers, gates: n.codes.gates, channels: n.codes.channels } as unknown as HumanDesignChart;
  ok("C3 manuel harita / istemci rapor kodları (buildCodesFromChart) genel kod içermez", !buildCodesFromChart(manualRow).some(isGeneralCenterKnowledgeCode));
  const m1 = await listKnowledgeByCodes(kb.db, T_A, codesFx);
  ok("C4 harita eşleşmesi (Bilgi Bankası paneli): 9 aktif genel kaydın HİÇBİRİ dönmez", !m1.rows.some((r) => isGeneralCenterKnowledgeCode(r.code)), m1.rows.map((r) => r.code));
  ok("C5 aynı eşleşmede kesin kayıtlar döner (Tanımlı Baş, Tanımsız G, Açık Kalp, tip)", ["P1", "P2", "P3", "K1"].every((id) => m1.rows.some((r) => r.id === id)), m1.rows.map((r) => r.id));
  const allGeneral = EXPECTED_GENERAL.map(([c]) => `merkez_genel_${c}`);
  const forced = await listKnowledgeByCodes(kb.db, T_A, [...codesFx, ...allGeneral]);
  ok("C6 istek genel kodları AÇIKÇA istese bile (/api/hd/knowledge?codes=) sunucu döndürmez", !forced.rows.some((r) => isGeneralCenterKnowledgeCode(r.code)) && forced.rows.length === m1.rows.length);
  const forcedOnly = await listKnowledgeByCodes(kb.db, T_A, allGeneral);
  ok("C7 yalnız genel kodlar istenirse sonuç boş", forcedOnly.rows.length === 0 && !forcedOnly.error);
  const r1 = await listKnowledgeForReport(kb.db, T_A, [...codesFx, ...allGeneral]);
  ok("C8 rapor okuması (listKnowledgeForReport) genel kayıt döndürmez", !r1.rows.some((r) => isGeneralCenterKnowledgeCode(r.code)) && ["P1", "P2", "P3", "K1"].every((id) => r1.rows.some((r) => r.id === id)));
  const all = await listKnowledge(kb.db, T_A);
  ok("C9 Bilgi Bankası LİSTESİNDE 9 genel kayıt görünür (yalnız otomatik eşleşmeden hariç)", all.rows.filter((r) => isGeneralCenterKnowledgeCode(r.code)).length === 9);
  ok("C10 saf filtre: excludeGeneralCenterKnowledge yalnız merkez_genel_* eler, sırayı korur", JSON.stringify(excludeGeneralCenterKnowledge([{ code: "merkez_tanimli_head" }, { code: "merkez_genel_head" }, { code: "merkez_acik_ajna" }, { code: "not_genel_head" }, { code: null }])) === JSON.stringify([{ code: "merkez_tanimli_head" }, { code: "merkez_acik_ajna" }, { code: "not_genel_head" }, { code: null }]));
  const persistence = read("lib/human-design/api/knowledgePersistence.ts");
  ok("C11 iki eşleşme okuyucusunun ikisi de genel filtreyi uygular", (persistence.match(/dedupeCenterKnowledge\(excludeGeneralCenterKnowledge\(/g) ?? []).length === 2);
  const svc = read("lib/human-design/reporting/reportSnapshotV2Service.ts");
  const km = read("app/api/hd/reports/professional/knowledge-match/route.ts");
  const rel = read("lib/human-design/relations/relationExtras.ts");
  const kroute = read("app/api/hd/knowledge/route.ts");
  ok("C12 tüm otomatik yüzeyler bu iki okuyucudan geçer (Word servisi, eşleşme sayısı, ilişki raporu, ?codes=)", /listKnowledgeForReport\(db, tenantId, buildExpertKnowledgeCodes/.test(svc) && /listKnowledgeForReport\(guard\.db/.test(km) && /listKnowledgeForReport\(ctx\.db[\s\S]*listKnowledgeByCodes\(ctx\.db/.test(rel) && /listKnowledgeByCodes\(guard\.db, guard\.tenantId, codes\)/.test(kroute));

  // ─────────────────────────────────────────────────────────────────────────
  section("D — Danışan Word raporu (DOCX) genel kayıt içermez");
  const snapFor = (rows: unknown[]) => buildReportSnapshotV2({
    generatedAt: "2026-11-27T00:00:00.000Z", chartId: "c", source: "computed", provider: "roxyapi",
    client: { name: "ZZ Sentetik Danışan", birthDate: "2018-07-20", birthTime: "19:00", birthPlace: "Konya", timezone: "Europe/Istanbul" },
    codes: n.codes, computed: n.chart, requested: "expert", systemReadingPermitted: false, systemReading: null,
    expertRecords: rows as never, bodygraph: { status: "missing" }, chartImage: null,
    centerStates: centerStateMap(classifyChartRowCenters({ source: "computed", computed_result: n.chart })),
  });
  const snap = snapFor(r1.rows);
  ok("D1 snapshot uzman kayıtlarında genel kayıt YOK", !snap.commentary.expert.entries.some((e) => isGeneralCenterKnowledgeCode(e.code)) && !JSON.stringify(snap).includes("GENEL-ICERIK-"));
  const text = await docxText(await renderHdReportV2Buffer(snap, {}));
  ok("D2 Word (DOCX) metninde genel içerik / başlık YOK", !text.includes("GENEL-ICERIK-") && !text.includes("Genel — "), text.match(/GENEL-ICERIK-[a-z_]+/g));
  ok("D3 Word'de kesin merkez + tip açıklamaları VAR (regresyon)", ["KESIN-TANIMLI-BAS", "KESIN-TANIMSIZ-G", "KESIN-ACIK-KALP", "TIP-GENERATOR"].every((m) => text.includes(m)));
  ok("D4 Word'de özel notlar YOK", !text.includes("GENEL-NOT-"));
  // Pozitif kontrol: kayıt okuyucu atlanıp genel kayıt zorla verilseydi test bunu YAKALARDI.
  const leaked = await docxText(await renderHdReportV2Buffer(snapFor([...r1.rows, { id: "x", category: "Merkezler", code: "merkez_genel_head", title: "Genel — Baş Merkezi (Head)", content: "GENEL-ICERIK-head", is_active: true }]), {}));
  ok("D5 pozitif kontrol: test sızıntıyı tespit edebiliyor (filtre olmasaydı görünürdü)", leaked.includes("GENEL-ICERIK-head"));
  ok("D6 HD modülünde ayrı PDF üretici yok — danışan çıktısı yalnız Word (kaynak denetimi)", !/pdf/i.test(read("lib/human-design/reporting/wordReportV2.ts")) && !/pdf/i.test(svc));

  // ─────────────────────────────────────────────────────────────────────────
  section("E — Regresyon: Tanımlı / Tanımsız / Açık + eski genel acik_*");
  ok("E1 Tanımsız G → tanimsiz_g (+ eski genel), Açık Kalp → tam_acik_heart_ego", codesFx.includes("merkez_tanimsiz_g_identity") && codesFx.includes("merkez_acik_g_identity") && codesFx.includes("merkez_tam_acik_heart_ego") && !codesFx.includes("merkez_tanimsiz_heart_ego"));
  ok("E2 kesin kayıt yokken eski genel acik_* eşleşir (Solar Pleksus)", m1.rows.some((r) => r.id === "L1"));
  ok("E3 dedupe davranışı aynen (kesin varsa eski genel elenir)", dedupeCenterKnowledge([{ code: "merkez_tanimsiz_head" }, { code: "merkez_acik_head" }]).length === 1 && dedupeCenterKnowledge([{ code: "merkez_acik_head" }]).length === 1);
  ok("E4 dedupe genel kaydı kesin kayıt saymaz (eski genel kaybolmaz)", dedupeCenterKnowledge([{ code: "merkez_genel_head" }, { code: "merkez_acik_head" }]).length === 2);

  // ─────────────────────────────────────────────────────────────────────────
  section("F — Kullanıcılar arası veri izolasyonu");
  const insB = await insertKnowledge(kb.db, T_B, U_B, { category: "Merkezler", title: "Genel — Baş Merkezi (Head)", code: "merkez_genel_head", content: "B-GENEL-BAS", is_active: true });
  ok("F1 başka kullanıcı aynı genel kodu bağımsız oluşturabilir", !!insB.id && !insB.error);
  ok("F2 A'nın listesinde B'nin kaydı YOK; B'nin listesinde A'nın kayıtları YOK", !(await listKnowledge(kb.db, T_A)).rows.some((r) => r.id === insB.id) && (await listKnowledge(kb.db, T_B)).rows.every((r) => r.tenant_id === T_B));
  ok("F3 A, B'nin genel kaydını açamaz", (await getKnowledgeById(kb.db, T_A, insB.id!)).row === null);
  const crossUpd = await updateKnowledge(kb.db, T_A, insB.id!, { content: "SALDIRI" });
  ok("F4 A, B'nin genel kaydını değiştiremez", kb.tables.human_design_knowledge_records.find((r) => r.id === insB.id)?.content === "B-GENEL-BAS", crossUpd);
  const bMatch = await listKnowledgeByCodes(kb.db, T_B, [...codesFx, ...allGeneral]);
  ok("F5 B'nin eşleşmesinde ne kendi genel kaydı ne A'nın kayıtları var", bMatch.rows.length === 0);

  // ─────────────────────────────────────────────────────────────────────────
  section("G — Roxy kredisi");
  ok("G1 ağ çağrısı 0", fetchCalls === 0, fetchCalls);

  globalThis.fetch = realFetch;
  console.log(`\nHD GENEL MERKEZ BAŞLIKLARI: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) {
    console.log("FAIL listesi:\n" + fails.map((f) => ` - ${f}`).join("\n"));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
