/**
 * HD Hazır Eğitim Haritaları — ÖZEL TASLAK İÇE AKTARIM SQL'i üretici (FAZ 2-B1).
 *
 * Gerçek kişi verisi REPO'YA GİRMEZ: girdi (_43_envanter.json) ve çıktı (SQL) repo DIŞINDA olmalıdır.
 * Bu betik hiçbir veritabanına BAĞLANMAZ; yalnız dosya üretir. Üretilen SQL:
 *   • yalnız `SET yasam.hd_edu_import = 'local-private-draft'` ile açılmış oturumda çalışır (aksi hâlde EXCEPTION);
 *   • tüm yayın kayıtlarını 'draft' yazar (yayın YOK); düşük riskli ama avukat görmemiş kayıtlar LOW_UNREVIEWED +
 *     AVUKAT-GÖRMEDİ engeli alır; UTC teyidi olmayanlar PENDING_VERIFICATION kalır (gizli saat düzeltmesi YOK).
 * Preview / production'a UYGULANMAZ (owner onayı yok).
 *
 * HUKUK: güncel statü FAZ 2-A uzlaştırma tablosundan (04_HUKUK_VE_YAYIN_ENGELLERI.md §3 "Geçerli hukuk") okunur; ham
 *   araştırma CSV'si (_43_envanter.json hukuk_statusu / _matris) TARİHSEL kaynak olarak değiştirilmez. Uzlaştırma
 *   YALNIZ daha kısıtlayıcı yönde uygulanabilir (DÜŞÜK → E); E'yi gevşeten satır içe aktarımı DURDURUR.
 *   "DÜŞÜK (L1 teyitli)" = araştırma raporunda düşük risk — AVUKAT ONAYI DEĞİLDİR → LOW_UNREVIEWED + AVUKAT-GÖRMEDİ.
 *   Hiçbir kişi LOW_REVIEWED (avukat onaylı) yazılmaz.
 *
 * Kullanım: npx tsx scripts/hd-education/build-private-import.ts --input <repo-dışı>/_43_envanter.json
 *             --legal <repo-dışı>/04_HUKUK_VE_YAYIN_ENGELLERI.md --out <repo-dışı>/import.sql [--owner <uuid>]
 *   Çıktının yanına <out>.ozet.json (yalnız sayımlar + uzlaştırılan kişi anahtarları) yazılır.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EDU_CATEGORIES, EDU_UUID_RE } from "../../lib/human-design/education/educationContract";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const EXPECTED = { total: 43, matrix: { "UTC doğrulandı + hukuk düşük": 10, "UTC belirsiz + hukuk düşük": 17, "UTC doğrulandı + hukuk E": 9, "UTC belirsiz + hukuk E": 7 } };
const KNOWN_BLOCKERS = new Set(["UTC-TEYİT", "HUKUK-E", "YAŞAYAN KİŞİ", "KRALİYET", "TANINIRLIK", "LİSANS", "TAKVİM", "KAYNAK", "AVUKAT-GÖRMEDİ"]);

function die(msg: string): never {
  console.error(`DUR: ${msg}`);
  process.exit(1);
}
const arg = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i > 0 ? process.argv[i + 1] : undefined;
};

/** Yol bir git çalışma ağacının (bu repo veya başka worktree) içinde mi? */
function insideGitTree(p: string): boolean {
  const abs = path.resolve(p);
  const rel = path.relative(REPO_ROOT, abs);
  if (!rel.startsWith("..") && !path.isAbsolute(rel)) return true;
  let dir = path.dirname(abs);
  for (;;) {
    if (existsSync(path.join(dir, ".git"))) return true;
    const up = path.dirname(dir);
    if (up === dir) return false;
    dir = up;
  }
}

/** 04_HUKUK_VE_YAYIN_ENGELLERI.md §3 tablosu → Map(kısa ad → "Geçerli hukuk"). Başlık sütunları birebir doğrulanır. */
function parseLegalTable(md: string): Map<string, string> {
  const lines = md.split(/\r?\n/);
  const hi = lines.findIndex((l) => /^\|\s*Kişi\s*\|\s*Yaşıyor\s*\|\s*CSV hukuk\s*\|\s*L1 risk\s*\|\s*Geçerli hukuk\s*\|/.test(l));
  if (hi < 0) die("hukuk tablosu başlığı bulunamadı (Kişi | Yaşıyor | CSV hukuk | L1 risk | Geçerli hukuk …)");
  const out = new Map<string, string>();
  for (let i = hi + 2; i < lines.length && lines[i].startsWith("|"); i++) {
    const cells = lines[i].split("|").map((x) => x.trim());
    const name = cells[1];
    if (!name) continue;
    if (out.has(name)) die(`hukuk tablosunda mükerrer kişi: ${name}`);
    out.set(name, cells[5]);
  }
  return out;
}

type Rec = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
const q = (v: unknown): string => {
  const t = s(v);
  if (!t) return "NULL";
  if (t.includes("\u0000")) die("NUL karakteri");
  return `'${t.replace(/'/g, "''")}'`;
};
const qReq = (v: unknown, field: string, max: number, who: string): string => {
  const t = s(v);
  if (!t) die(`${who}: zorunlu alan boş (${field})`);
  if (t.length > max) die(`${who}: ${field} ${t.length} > ${max} — sessiz kırpma YAPILMAZ`);
  return q(t);
};
const num = (v: unknown, lo: number, hi: number): string => {
  const n = Number(s(v));
  return s(v) && Number.isFinite(n) && n >= lo && n <= hi ? String(n) : "NULL";
};
const isoDate = (v: unknown): string => (/^\d{4}-\d{2}-\d{2}$/.test(s(v)) ? q(s(v)) : "NULL");
const offsetSeconds = (v: unknown): string => {
  const m = /^([+-])(\d{2}):(\d{2})(?::(\d{2}))?/.exec(s(v));
  if (!m) return "NULL";
  const sec = Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4] ?? 0);
  return String(m[1] === "-" ? -sec : sec);
};
const leadingUtc = (v: unknown): string | null => {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?Z)/.exec(s(v));
  return m ? m[1] : null;
};
const urls = (v: unknown, sep: RegExp) => s(v).split(sep).map((x) => x.trim()).filter((x) => /^https?:\/\/\S{4,}$/.test(x) && x.length <= 2000);

function main() {
  const input = arg("--input");
  const legalPath = arg("--legal");
  const out = arg("--out");
  const owner = arg("--owner");
  if (!input || !out || !legalPath) die("--input, --legal ve --out zorunlu");
  if (insideGitTree(input) || insideGitTree(legalPath)) die("girdi bir git çalışma ağacının içinde — gerçek kişi verisi repo dışında tutulmalı");
  if (insideGitTree(out)) die("çıktı bir git çalışma ağacının içinde — SQL yalnız repo DIŞINA yazılır");
  if (existsSync(out) || existsSync(`${out}.ozet.json`)) die(`çıktı zaten var, üzerine YAZILMAZ: ${out}`);
  if (!existsSync(path.dirname(path.resolve(out))) || !statSync(path.dirname(path.resolve(out))).isDirectory()) die("çıktı klasörü yok");
  if (owner && !EDU_UUID_RE.test(owner)) die("--owner geçerli uuid değil");

  const data = JSON.parse(readFileSync(input, "utf8")) as Rec[];
  if (!Array.isArray(data)) die("girdi dizi değil");
  if (data.length !== EXPECTED.total) die(`kişi sayısı ${data.length} ≠ ${EXPECTED.total}`);
  const slugs = new Set<string>();
  const ids = new Set<string>();
  const matrix: Record<string, number> = {};
  for (const r of data) {
    const slug = s(r._slug);
    const id = s(r._uuid);
    if (slugs.has(slug) || ids.has(id)) die(`mükerrer kayıt: ${slug}`);
    slugs.add(slug);
    ids.add(id);
    matrix[s(r._matris)] = (matrix[s(r._matris)] ?? 0) + 1;
  }
  for (const [k, v] of Object.entries(EXPECTED.matrix)) if (matrix[k] !== v) die(`ham matris uyuşmazlığı: ${k} = ${matrix[k] ?? 0} (beklenen ${v})`);
  if (Object.keys(matrix).length !== 4) die(`beklenmeyen matris hücresi: ${Object.keys(matrix).join(", ")}`);

  // Güncel hukuk (FAZ 2-A uzlaştırma) — kişi başına "Geçerli hukuk"; _ad_kisa ile birebir eşleşmeli.
  const legal = parseLegalTable(readFileSync(legalPath, "utf8"));
  const byShort = new Map(data.map((r) => [s(r._ad_kisa), r]));
  if (legal.size !== data.length) die(`hukuk tablosu ${legal.size} satır ≠ ${data.length}`);
  for (const k of legal.keys()) if (!byShort.has(k)) die(`hukuk tablosunda envanterde olmayan kişi: ${k}`);
  type Tier = "E" | "LOW_NO_LAWYER" | "LOW_RESEARCH_REPORT";
  const tierOf = new Map<string, Tier>();
  const reconciledToE: string[] = [];
  for (const r of data) {
    const short = s(r._ad_kisa);
    const g = legal.get(short);
    if (!g) die(`${s(r._slug)}: hukuk tablosunda yok`);
    const csvE = s(r.hukuk_statusu) === "E";
    const tier: Tier = g === "E" ? "E" : g === "DÜŞÜK (avukat teyidi yok)" ? "LOW_NO_LAWYER" : g === "DÜŞÜK (L1 teyitli)" ? "LOW_RESEARCH_REPORT" : die(`${short}: bilinmeyen geçerli hukuk "${g}"`);
    if (csvE && tier !== "E") die(`${short}: uzlaştırma E'yi gevşetiyor — durduruldu`);
    if (!csvE && tier === "E") reconciledToE.push(s(r._slug));
    tierOf.set(s(r._slug), tier);
  }
  const current: Record<string, number> = {};
  for (const r of data) {
    const cell = `UTC ${s(r.utc_durumu) === "DOĞRULANDI" ? "doğrulandı" : "belirsiz"} + hukuk ${tierOf.get(s(r._slug)) === "E" ? "E" : "düşük"}`;
    current[cell] = (current[cell] ?? 0) + 1;
  }
  const tiers = { E: 0, LOW_NO_LAWYER: 0, LOW_RESEARCH_REPORT: 0 };
  for (const t of tierOf.values()) tiers[t]++;

  const lines: string[] = [
    "-- HD Hazır Eğitim Haritaları — ÖZEL TASLAK içe aktarım (GERÇEK KİŞİ VERİSİ; REPO'YA EKLENMEZ).",
    "-- Yalnız yerel/özel test DB'sinde, açık oturum anahtarıyla uygulanır. Preview / production'a UYGULANMAZ.",
    `-- Üretim: ${new Date().toISOString()} · kayıt: ${data.length} · tüm yayın durumları: draft`,
    "BEGIN;",
    "DO $g$ BEGIN",
    "  IF current_setting('yasam.hd_edu_import', true) IS DISTINCT FROM 'local-private-draft' THEN",
    "    RAISE EXCEPTION 'HD eğitim taslak içe aktarımı yalnız yerel/özel ortamda açık anahtarla uygulanır';",
    "  END IF;",
    "END $g$;",
  ];
  const created = owner ? q(owner) : "NULL";
  for (const r of data) {
    const who = s(r._slug);
    const id = s(r._uuid);
    if (!EDU_UUID_RE.test(id)) die(`${who}: _uuid geçersiz`);
    if (!/^[a-z0-9][a-z0-9-]{1,118}-[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(who)) die(`${who}: slug biçimi`);
    const category = s(r.alan);
    if (!(EDU_CATEGORIES as readonly string[]).includes(category)) die(`${who}: kategori ${category}`);
    if (s(r.veri_statusu) !== "A") die(`${who}: veri statüsü A değil`);
    const verified = s(r.utc_durumu) === "DOĞRULANDI";
    const utc = leadingUtc(r.nihai_utc);
    if (verified && !utc) die(`${who}: DOĞRULANDI ama UTC anı okunamadı`);
    if (s(r.hukuk_statusu) !== "E" && s(r.hukuk_statusu) !== "DÜŞÜK RİSK") die(`${who}: hukuk statüsü ${s(r.hukuk_statusu)}`);
    const tier = tierOf.get(who)!;
    const legalE = tier === "E";
    const blockers = (Array.isArray(r._engeller) ? r._engeller : []).map((b) => s(String(b).split(":")[0]));
    for (const b of blockers) if (!KNOWN_BLOCKERS.has(b)) die(`${who}: bilinmeyen engel ${b}`);
    if (legalE) blockers.push("HUKUK-E"); // uzlaştırmayla E'ye çıkan kişi de hukuk engeli taşır
    else blockers.push("AVUKAT-GÖRMEDİ"); // avukat incelemesi kayda geçmeden "düşük risk" yayına açılmaz
    const legalNote = `${reconciledToE.includes(who) ? "[FAZ 2-A hukuk uzlaştırması: araştırma CSV'si DÜŞÜK RİSK, L1 ORTA → E] "
      : tier === "LOW_RESEARCH_REPORT" ? "[Araştırma raporu (L1): düşük risk — AVUKAT ONAYI DEĞİL] "
      : tier === "LOW_NO_LAWYER" ? "[Hukuk incelemesi eksik — avukat teyidi yok] " : ""}${s(r.hukuk_notu)}`;
    const blockerSql = `ARRAY[${[...new Set(blockers)].map((b) => q(b)).join(",")}]::text[]`;
    lines.push(
      `INSERT INTO public.hd_education_subjects (id, natural_key, source_ref, display_name, category, is_living, birth_date, calendar_note, birth_place, latitude, longitude, coord_source_url, documented_local_time, document_quote, time_standard, utc_offset_seconds, iana_zone, birth_utc, utc_status, utc_evidence_url, data_status, legal_status, legal_note, blockers, created_by) VALUES (` +
        [
          q(id), q(who), qReq(r.no, "no", 40, who), qReq(r.ad, "ad", 200, who), q(category), s(r.yasiyor) === "evet" ? "true" : "false",
          qReq(r.dogum_tarihi, "dogum_tarihi", 10, who), s(r.takvim_notu).length > 2000 ? die(`${who}: takvim_notu uzun`) : q(r.takvim_notu),
          qReq(r.dogum_yeri, "dogum_yeri", 500, who), num(r.enlem, -90, 90), num(r.boylam, -180, 180), q(r.koordinat_kaynak_url),
          qReq(r.belgedeki_yerel_saat, "belgedeki_yerel_saat", 500, who), qReq(r.saat_kaynagi_alinti, "saat_kaynagi_alinti", 4000, who),
          q(r.fiili_saat_standardi), offsetSeconds(r.utc_ofseti), q(r.iana), utc ? q(utc) : "NULL", verified ? "'VERIFIED'" : "'PENDING_VERIFICATION'",
          q(r.utc_kaniti_url), "'A'", legalE ? "'E'" : "'LOW_UNREVIEWED'", q(legalNote), blockerSql, created,
        ].join(", ") + ");",
    );
    const timeUrl = s(r.saat_kaynagi_url);
    if (!/^https?:\/\//.test(timeUrl)) die(`${who}: saat kaynağı URL'si yok`);
    lines.push(
      `INSERT INTO public.hd_education_sources (subject_id, subject_revision, role, url, institution, document_title, archive_ref, document_date, accessed_on, verifies, time_explicit, primary_secondary, quote, usage_restriction) VALUES (` +
        [q(id), "1", "'birth_time'", q(timeUrl), q(r.saat_kaynagi_kurum), q(r.saat_kaynagi_belge), q(r.saat_kaynagi_arsiv_no), q(r.saat_kaynagi_belge_tarihi),
          isoDate(r.saat_kaynagi_erisim), q(r.saat_kaynagi_dogruladigi), s(r.saat_kaynagi_saat_acik) === "EVET" ? "true" : "false",
          ["birincil", "ikincil"].includes(s(r.saat_kaynagi_birincil_ikincil)) ? q(r.saat_kaynagi_birincil_ikincil) : "NULL",
          q(r.saat_kaynagi_alinti), q(r.saat_kaynagi_kullanim_kisiti)].join(", ") + ");",
    );
    const dp = s(r.tarih_yer_kaynagi_url);
    if (/^https?:\/\//.test(dp)) {
      lines.push(`INSERT INTO public.hd_education_sources (subject_id, subject_revision, role, url, institution, document_title, accessed_on) VALUES (${[q(id), "1", "'date_place'", q(dp), q(r.tarih_yer_kaynagi_kurum), q(r.tarih_yer_kaynagi_belge), isoDate(r.tarih_yer_kaynagi_erisim)].join(", ")});`);
    }
    for (const u of urls(r.utc_kaniti_url, /\s;\s/)) lines.push(`INSERT INTO public.hd_education_sources (subject_id, subject_revision, role, url) VALUES (${q(id)}, 1, 'utc_standard', ${q(u)});`);
    for (const u of urls(r.ek_kaynak_urller, /\s\|\s/)) lines.push(`INSERT INTO public.hd_education_sources (subject_id, subject_revision, role, url) VALUES (${q(id)}, 1, 'extra', ${q(u)});`);
    lines.push(`INSERT INTO public.hd_education_publications (subject_id) VALUES (${q(id)});`);
  }
  lines.push("COMMIT;", "");
  writeFileSync(out, lines.join("\n"), { encoding: "utf8", flag: "wx" }); // wx: var olan dosyanın üzerine ASLA yazmaz
  const ozet = {
    kisi: data.length,
    ham_arastirma_matrisi: matrix,
    guncel_matris: current,
    guncel_hukuk: { E: tiers.E, LOW_UNREVIEWED: tiers.LOW_NO_LAWYER + tiers.LOW_RESEARCH_REPORT, LOW_REVIEWED: 0 },
    low_unreviewed_ayrimi: { avukat_teyidi_yok: tiers.LOW_NO_LAWYER, arastirma_raporu_dusuk_risk_avukat_onayi_degil: tiers.LOW_RESEARCH_REPORT },
    uzlastirmayla_E_olan: reconciledToE,
    yayinlanabilir: 0,
  };
  writeFileSync(`${out}.ozet.json`, JSON.stringify(ozet, null, 2), { encoding: "utf8", flag: "wx" });
  console.log(`yazıldı: ${path.resolve(out)} · ${JSON.stringify(ozet)}`);
}

main();
