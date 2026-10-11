/**
 * HD Word v2 — profesyonel tasarım ÖNİZLEME üreticisi (SAF; DB / ağ / Roxy YOK).
 *
 * Gerçek Roxy fixture'ı (repoda kayıtlı, yeni çağrı YOK) normalize edilir; danışan bilgileri ve
 * Bilgi Bankası kayıtları SENTETİKTİR. Gerçek tarayıcı renderer'ından yakalanmış BodyGraph PNG'si
 * (varsa `--bodygraph <png>`) kullanılır. Çıktı: <out>/hd-eski.docx (eski düzen, layout yok) ve
 * <out>/hd-yeni-*.docx (layout "pro-1"; içerik seçimi kombinasyonları + hazırlayan boş/dolu).
 *
 * Çalıştır: npx tsx scripts/hd-word-report/pro-preview.ts --out <klasör> [--bodygraph <png>]
 */
import Module from "node:module";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(ROOT, "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}
const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const OUT = arg("--out") ?? path.join(ROOT, ".hd-word-pro-preview");
const BG = arg("--bodygraph");
mkdirSync(OUT, { recursive: true });

async function main() {
  const { normalizeRoxyBodygraph } = await import("../../lib/human-design/providers/roxy/normalize");
  const { validateRoxyBodygraph } = await import("../../lib/human-design/providers/roxy/schema");
  const { extractSystemReading } = await import("../../lib/human-design/providers/roxy/systemReading");
  const V2 = await import("../../lib/human-design/reporting/reportSnapshotV2");
  const { renderHdReportV2Buffer } = await import("../../lib/human-design/reporting/wordReportV2");
  const { buildExpertKnowledgeCodes } = await import("../../lib/human-design/normalize/hdAppCodes");

  const FIXTURE = JSON.parse(readFileSync(path.join(ROOT, "scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json"), "utf8")) as Record<string, unknown>;
  const v = validateRoxyBodygraph(FIXTURE);
  if (!v.ok) throw new Error("fixture geçersiz");
  const n = normalizeRoxyBodygraph(v.value, {
    date: "2018-07-20", time: "19:00:00", timezone: "Europe/Istanbul", latitude: 37.87, longitude: 32.48,
    nodeType: "true", lang: "tr", birthUtcIso: "2018-07-20T16:00:00.000Z",
  });
  if (!n.ok) throw new Error("normalize başarısız");
  const codes = buildExpertKnowledgeCodes(n.codes);
  const LONG = "Bu açıklama sentetik örnek metnidir; uzmanın kendi eğitim ve çalışmalarından edindiği bilgiyi temsil eder. " +
    "Türkçe karakterler (İ ı Ş ş Ğ ğ Ü ü Ö ö Ç ç) ve uzun paragrafların düzgün kırıldığı, sayfa sonlarında başlıkların içerikten kopmadığı kontrol edilir.";
  const cat = (c: string) => (c.startsWith("tip_") ? "Tipler" : c.startsWith("profil_") ? "Profiller" : c.startsWith("otorite_") ? "Otoriteler"
    : c.startsWith("tanim_") ? "Tanımlar" : c.startsWith("merkez_") ? "Merkezler" : c.startsWith("kanal_") ? "Kanallar" : "Kapılar");
  const expertRecords = codes.slice(0, 9).map((code, i) => ({
    category: cat(code), title: `Örnek başlık ${i + 1} (${code})`, code, content: `${LONG}\n\n${i + 1}. paragraf: ${LONG}`, is_active: true,
    expert_notes: "OZEL-NOT-ASLA-RAPORDA-OLMAMALI",
  }));
  const client = { name: "Deneme Danışan Örnekoğlu", birthDate: "2018-07-20", birthTime: "19:00:00", birthPlace: "Selçuklu, Konya, Türkiye", timezone: "Europe/Istanbul" };
  const bodygraph = BG && existsSync(BG) ? readFileSync(BG) : null;
  const { loadHdReportLogo } = await import("../../lib/human-design/reporting/reportBrandAssets");
  const logo = await loadHdReportLogo();

  const build = (requested: "none" | "expert" | "system" | "both", extra: Record<string, unknown> = {}) =>
    ({
      ...V2.buildReportSnapshotV2({
        generatedAt: "2026-10-09T09:00:00.000Z", chartId: "ch-ornek", source: "computed", provider: "roxyapi", client,
        codes: n.codes, computed: n.chart, requested, systemReadingPermitted: true, systemReading: extractSystemReading(FIXTURE),
        expertRecords: expertRecords as never, bodygraph: { status: bodygraph ? "roxy_render" : "missing" }, chartImage: null,
        ...extra,
      }),
    }) as Parameters<typeof renderHdReportV2Buffer>[0];

  const outputs: Array<[string, Parameters<typeof renderHdReportV2Buffer>[0], Parameters<typeof renderHdReportV2Buffer>[1]]> = [];
  // Eski düzen: layout alanı olmayan snapshot (bugünkü kayıtlı raporlar gibi) + eski "Hazırlayan".
  const old = build("both") as Record<string, unknown>;
  delete old.layout;
  delete old.preparedBy;
  outputs.push(["hd-eski", old as never, { bodygraphImage: bodygraph, logo, expertName: "Hasan Admin" }]);
  if ("layout" in build("none")) {
    outputs.push(["hd-yeni-ikisi-hazirlayan", build("both", { preparedBy: "Human Design Uzmanı Ayşe Örnek" }), { bodygraphImage: bodygraph, logo, expertName: "Hasan Admin" }]);
    outputs.push(["hd-yeni-hicbiri-hazirlayansiz", build("none", { preparedBy: null }), { bodygraphImage: bodygraph, logo, expertName: "Hasan Admin" }]);
    outputs.push(["hd-yeni-bilgi", build("expert", { preparedBy: "Hasan Hoca" }), { bodygraphImage: bodygraph, logo }]);
    outputs.push(["hd-yeni-sistem", build("system", { preparedBy: null }), { bodygraphImage: bodygraph, logo }]);
    // Taşma / uç değer: çok uzun ad, doğum yeri, haç adı ve 120 karakterlik hazırlayan.
    const long = build("expert", { preparedBy: "Human Design Uzmanı ve Bütüncül Yaşam Danışmanı Prof. Dr. Ayşegül Çağlayan-Öztürkmenoğlu (Uluslararası Sertifikalı)" }) as Record<string, unknown>;
    (long.client as Record<string, unknown>).name = "Şükriye Gülçiçek Özdemir-Karaağaçlıoğlu İçtenlikçi";
    (long.client as Record<string, unknown>).birthPlace = "Kızılcahamam, Ankara İli, Türkiye Cumhuriyeti (İç Anadolu Bölgesi)";
    const cross = (long.identity as Record<string, unknown>).cross as Record<string, unknown> | null;
    if (cross) cross.name = "Right Angle Cross of the Sleeping Phoenix 2";
    outputs.push(["hd-yeni-uzun-degerler", long as never, { bodygraphImage: bodygraph, logo }]);
  }
  for (const [name, snap, opts] of outputs) {
    const buf = await renderHdReportV2Buffer(snap, opts);
    writeFileSync(path.join(OUT, `${name}.docx`), buf);
    console.log(`yazıldı: ${name}.docx (${buf.length} B)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
