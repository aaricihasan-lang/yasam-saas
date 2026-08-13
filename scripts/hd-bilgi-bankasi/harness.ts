/**
 * HD Bilgi Bankası — modül entegrasyonu harness (DB'siz, server'sız).
 * ==================================================================
 *
 * Doğrular:
 *   A. Rights resolver (default-deny, override-wins) — birim testler.
 *   B. Read service davranışı (mock db): taslak SIZMAZ, published projeksiyon,
 *      hak-filtreli tam metin (expert_delivery), override reddi.
 *   C. Statik güvenlik değişmezleri: expert API GET-only + requireModuleAccess;
 *      canonical→legacy kopya YOK; client'ta service_role YOK; legacy korunuyor;
 *      route çakışması yok.
 *
 * Çalıştır: npm run hd:bilgi:harness
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { expertMaySeeFullText, resolveEffectiveRights } from "@/lib/human-design/knowledge/rights";
import {
  getPublishedEntityDetail,
  listPublishedGroup,
} from "@/lib/human-design/knowledge/canonicalReadService";
import { listEvidence } from "@/lib/human-design/admin/centralContentPersistence";
import type { SupabaseClient } from "@supabase/supabase-js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}`);
  }
}

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

/** Yorumları çıkar (blok + satır) → güvenlik taraması yalnız GERÇEK kodu görür. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

// ── Mock Supabase query builder (yeterli alt küme) ──────────────────────────
type Row = Record<string, unknown>;
class Q {
  rows: Row[];
  constructor(rows: Row[]) { this.rows = rows.slice(); }
  select(): this { return this; }
  eq(col: string, val: unknown): this {
    this.rows = this.rows.filter((r) => String(r[col]) === String(val));
    return this;
  }
  in(col: string, vals: unknown[]): this {
    const set = new Set(vals.map((v) => String(v)));
    this.rows = this.rows.filter((r) => set.has(String(r[col])));
    return this;
  }
  order(): Promise<{ data: Row[]; error: null }> {
    return Promise.resolve({ data: this.rows, error: null });
  }
  maybeSingle(): Promise<{ data: Row | null; error: null }> {
    return Promise.resolve({ data: this.rows[0] ?? null, error: null });
  }
  then<T>(resolve: (v: { data: Row[]; error: null }) => T): Promise<T> {
    return Promise.resolve({ data: this.rows, error: null as null }).then(resolve);
  }
}
function makeDb(tables: Record<string, Row[]>): SupabaseClient {
  return { from: (name: string) => new Q(tables[name] ?? []) } as unknown as SupabaseClient;
}

async function main(): Promise<void> {
  console.log("HD Bilgi Bankası harness\n");

  // ── A. Rights resolver ────────────────────────────────────────────────────
  console.log("A. Rights resolver (default-deny / override-wins)");
  ok("boş kaynak → tüm haklar false (fail-closed)", resolveEffectiveRights(null).expertDelivery === false);
  ok("expert_delivery=false → görülemez", expertMaySeeFullText({ expert_delivery_allowed: false }) === false);
  ok("expert_delivery=true → görülebilir", expertMaySeeFullText({ expert_delivery_allowed: true }) === true);
  ok("eksik alan → false (default-deny)", expertMaySeeFullText({}) === false);
  ok(
    "pasaj override=true kaynağı EZER (kaynak false)",
    expertMaySeeFullText({ expert_delivery_allowed: false }, { expert_delivery_allowed_override: true }) === true,
  );
  ok(
    "pasaj override=false kaynağı EZER (kaynak true)",
    expertMaySeeFullText({ expert_delivery_allowed: true }, { expert_delivery_allowed_override: false }) === false,
  );
  ok(
    "override=null → kaynaktan miras (true)",
    expertMaySeeFullText({ expert_delivery_allowed: true }, { expert_delivery_allowed_override: null }) === true,
  );
  ok(
    "public_display bağımsız eksen (expert_delivery'yi etkilemez)",
    resolveEffectiveRights({ public_display_allowed: true }).expertDelivery === false,
  );

  // ── B. Read service davranışı (mock db) ───────────────────────────────────
  console.log("\nB. Read service (taslak sızmaz · hak-filtreli · published projeksiyon)");

  // B1: TASLAK içerik → normal uzmana content=null, evidence yok.
  {
    const db = makeDb({
      hd_canonical_entities: [
        { id: "e-draft", entity_kind: "tip", canonical_key: "tip_taslak", name_tr: "Taslak Tip", name_original: null },
      ],
      hd_canonical_content: [
        { id: "c-draft", entity_id: "e-draft", entity_kind: "tip", canonical_key: "tip_taslak", status: "draft", general_description: "x", report_text: "y" },
      ],
    });
    const r = await getPublishedEntityDetail(db, "tip_taslak");
    ok("B1 taslak: sonuç ok", r.ok === true);
    ok("B1 taslak: content=null (taslak SIZMAZ)", r.ok && r.data.content === null);
    ok("B1 taslak: evidence boş", r.ok && r.data.evidence.length === 0);
  }

  // B2: PUBLISHED + kaynak expert_delivery=false → tam metin KISITLI.
  {
    const db = makeDb({
      hd_canonical_entities: [
        { id: "e2", entity_kind: "tip", canonical_key: "tip_kisitli", name_tr: "Kısıtlı", name_original: null },
      ],
      hd_canonical_content: [
        { id: "c2", entity_id: "e2", entity_kind: "tip", canonical_key: "tip_kisitli", status: "published", general_description: "genel", report_text: "rapor" },
      ],
      hd_content_evidence: [
        { id: "ev2", content_id: "c2", passage_id: "p2", relation_type: "supports", is_primary: true, is_single_source: false, editorial_note: null, sort_order: 0 },
      ],
      hd_source_passages: [
        { id: "p2", source_id: "s2", locator_kind: "page", locator_label: "s.", locator_value: "10", passage_kind: "excerpt", source_specific_note: null },
      ],
      hd_sources: [
        { id: "s2", source_type: "book", title: "Kısıtlı Kaynak", authors: ["A. Yazar"], organization: null, expert_delivery_allowed: false },
      ],
      hd_original_texts: [
        { id: "ot2", passage_id: "p2", language_tag: "en", original_text: "SECRET", content_hash: "h", status: "verified", revision: 1 },
      ],
    });
    const r = await getPublishedEntityDetail(db, "tip_kisitli");
    ok("B2 published: content dolu", r.ok && r.data.content !== null);
    ok("B2 published: 1 evidence", r.ok && r.data.evidence.length === 1);
    ok("B2 kısıtlı: full_text_restricted=true", r.ok && r.data.evidence[0]?.full_text_restricted === true);
    ok("B2 kısıtlı: original_text=null (metin SIZMAZ)", r.ok && r.data.evidence[0]?.original_text === null);
    ok("B2 kısıtlı: bibliyografik başlık görünür", r.ok && r.data.evidence[0]?.source.title === "Kısıtlı Kaynak");
    ok("B2 kaynaklar sekmesi: 1 kaynak", r.ok && r.data.sources.length === 1);
  }

  // B3: PUBLISHED + kaynak expert_delivery=true → tam metin (verified) görünür.
  {
    const db = makeDb({
      hd_canonical_entities: [
        { id: "e3", entity_kind: "otorite", canonical_key: "otorite_acik", name_tr: "Açık", name_original: null },
      ],
      hd_canonical_content: [
        { id: "c3", entity_id: "e3", entity_kind: "otorite", canonical_key: "otorite_acik", status: "published", general_description: "g", report_text: "r" },
      ],
      hd_content_evidence: [
        { id: "ev3", content_id: "c3", passage_id: "p3", relation_type: "supports", is_primary: false, is_single_source: false, editorial_note: null, sort_order: 0 },
      ],
      hd_source_passages: [
        { id: "p3", source_id: "s3", locator_kind: "page", locator_label: "s.", locator_value: "5", passage_kind: "excerpt", source_specific_note: null },
      ],
      hd_sources: [
        { id: "s3", source_type: "book", title: "Açık Kaynak", authors: [], organization: null, expert_delivery_allowed: true },
      ],
      hd_original_texts: [
        { id: "ot3", passage_id: "p3", language_tag: "en", original_text: "ORIG", content_hash: "h", status: "verified", revision: 1 },
      ],
      hd_faithful_translations: [
        { id: "tr3", original_text_id: "ot3", translation_text: "CEVIRI", target_language_tag: "tr", status: "verified", revision: 1 },
      ],
    });
    const r = await getPublishedEntityDetail(db, "otorite_acik");
    ok("B3 açık: full_text_restricted=false", r.ok && r.data.evidence[0]?.full_text_restricted === false);
    ok("B3 açık: original_text görünür", r.ok && r.data.evidence[0]?.original_text === "ORIG");
    ok("B3 açık: sadık çeviri görünür", r.ok && r.data.evidence[0]?.faithful_translation === "CEVIRI");
  }

  // B4: kaynak true ama pasaj override=false → override REDDEDER.
  {
    const db = makeDb({
      hd_canonical_entities: [
        { id: "e4", entity_kind: "tip", canonical_key: "tip_override", name_tr: "Override", name_original: null },
      ],
      hd_canonical_content: [
        { id: "c4", entity_id: "e4", entity_kind: "tip", canonical_key: "tip_override", status: "published", general_description: "g", report_text: "r" },
      ],
      hd_content_evidence: [
        { id: "ev4", content_id: "c4", passage_id: "p4", relation_type: "supports", is_primary: false, is_single_source: false, editorial_note: null, sort_order: 0 },
      ],
      hd_source_passages: [
        { id: "p4", source_id: "s4", locator_kind: "page", locator_label: "s.", locator_value: "1", passage_kind: "excerpt", source_specific_note: null, expert_delivery_allowed_override: false },
      ],
      hd_sources: [
        { id: "s4", source_type: "book", title: "Kaynak", authors: [], organization: null, expert_delivery_allowed: true },
      ],
      hd_original_texts: [
        { id: "ot4", passage_id: "p4", language_tag: "en", original_text: "X", content_hash: "h", status: "verified", revision: 1 },
      ],
    });
    const r = await getPublishedEntityDetail(db, "tip_override");
    ok("B4 override=false: kısıtlı (override kaynağı ezer)", r.ok && r.data.evidence[0]?.full_text_restricted === true);
    ok("B4 override=false: original_text=null", r.ok && r.data.evidence[0]?.original_text === null);
  }

  // B5: grup listesi yalnız YAYINLANMIŞ içeriği olan kimlikleri döndürür.
  {
    const db = makeDb({
      hd_canonical_content: [
        { id: "cp", entity_id: "e-pub", entity_kind: "tip", canonical_key: "tip_pub", status: "published" },
        { id: "cd", entity_id: "e-drf", entity_kind: "tip", canonical_key: "tip_drf", status: "draft" },
      ],
      hd_canonical_entities: [
        { id: "e-pub", entity_kind: "tip", canonical_key: "tip_pub", name_tr: "Yayınlı", name_original: null },
        { id: "e-drf", entity_kind: "tip", canonical_key: "tip_drf", name_tr: "Taslak", name_original: null },
      ],
    });
    const r = await listPublishedGroup(db, "tip");
    ok("B5 grup: yalnız 1 (yayınlı) kimlik", r.ok && r.data.length === 1);
    ok("B5 grup: taslak kimlik listede YOK", r.ok && !r.data.some((i) => i.canonical_key === "tip_drf"));
  }

  // ── C. Statik güvenlik değişmezleri ───────────────────────────────────────
  console.log("\nC. Statik güvenlik değişmezleri");

  const routeSrc = stripComments(read("app/api/hd/bilgi-bankasi/route.ts"));
  ok("C1 expert API: requireModuleAccess(human_design)", /requireModuleAccess\(\s*req\s*,\s*"human_design"\s*\)/.test(routeSrc));
  ok("C2 expert API: GET export var", /export async function GET/.test(routeSrc));
  ok("C3 expert API: MUTATION yok (POST/PUT/PATCH/DELETE export YOK)", !/export async function (POST|PUT|PATCH|DELETE)/.test(routeSrc));
  ok("C4 expert API: no-store", /no-store/i.test(routeSrc));

  const serviceSrc = stripComments(read("lib/human-design/knowledge/canonicalReadService.ts"));
  ok("C5 read service: published gate var", /status["']?\s*[:=)]|"published"/.test(serviceSrc) && serviceSrc.includes("published"));
  ok("C6 read service: legacy tabloya REFERANS YOK (canonical→legacy kopya yok)",
    !/human_design_knowledge_records|human_design_knowledge_sources/.test(serviceSrc));
  ok("C7 read service: MUTATION yok (.insert/.update/.delete/.upsert yok)",
    !/\.(insert|update|delete|upsert)\s*\(/.test(serviceSrc));

  // Client dosyalarında service_role / server db SIZMAZ.
  const clientFiles = [
    "app/human-design/bilgi-bankasi/page.tsx",
    "app/human-design/bilgi-bankasi/canonical/[entityKey]/CanonicalEntityView.tsx",
    "app/human-design/bilgi-bankasi/helpers/hdCanonicalRead.ts",
    "components/human-design/knowledge/CanonicalDetail.tsx",
    "components/human-design/knowledge/CanonicalGroupList.tsx",
  ];
  let clientLeak = false;
  for (const f of clientFiles) {
    const s = stripComments(read(f));
    if (/supabase-server|getServerDb|SERVICE_ROLE|service_role/i.test(s)) clientLeak = true;
  }
  ok("C8 client: service_role/server-db SIZMAZ", !clientLeak);

  // Legacy korunuyor (rollback).
  ok("C9 legacy API korunuyor", existsSync(join(ROOT, "app/api/hd/knowledge/route.ts")));
  ok("C10 legacy liste bileşeni korunuyor", existsSync(join(ROOT, "app/human-design/bilgi-bankasi/components/HdBilgiKayitListesi.tsx")));
  ok("C11 legacy detay route korunuyor", existsSync(join(ROOT, "app/human-design/bilgi-bankasi/[recordId]/page.tsx")));
  ok("C12 legacy rollback route var", existsSync(join(ROOT, "app/human-design/bilgi-bankasi/legacy/page.tsx")));

  // Yeni route'lar mevcut + çakışma yok.
  ok("C13 canonical liste route var", existsSync(join(ROOT, "app/human-design/bilgi-bankasi/page.tsx")));
  ok("C14 canonical detay route var", existsSync(join(ROOT, "app/human-design/bilgi-bankasi/canonical/[entityKey]/page.tsx")));
  // bilgi-bankasi seviyesinde tek dinamik slug ([recordId]); canonical/legacy statik → çakışma yok.
  ok("C15 route çakışması yok (canonical/legacy statik, tek [recordId] dinamik)",
    existsSync(join(ROOT, "app/human-design/bilgi-bankasi/canonical")) &&
    existsSync(join(ROOT, "app/human-design/bilgi-bankasi/legacy")) &&
    existsSync(join(ROOT, "app/human-design/bilgi-bankasi/[recordId]")));

  // Admin yazma yalnız admin API (yeni expert route admin endpoint çağırmaz).
  ok("C16 expert API admin endpoint çağırmaz", !/\/api\/admin\/hd/.test(routeSrc));

  // ── D. Admin persisted evidence read (UAT bugfix: PR #145) ────────────────
  console.log("\nD. Admin persisted evidence read (module Kaynak Bağlantıları)");

  // D-behavioral: listEvidence content_id-scope; cross-content leakage yok.
  {
    const db = makeDb({
      hd_content_evidence: [
        { id: "e-a1", content_id: "A", passage_id: "pa1", relation_type: "supports", is_primary: true, is_single_source: false, sort_order: 0, editorial_note: null },
        { id: "e-a2", content_id: "A", passage_id: "pa2", relation_type: "background", is_primary: false, is_single_source: false, sort_order: 1, editorial_note: null },
        { id: "e-b1", content_id: "B", passage_id: "pb1", relation_type: "supports", is_primary: false, is_single_source: false, sort_order: 0, editorial_note: null },
      ],
    });
    const rA = await listEvidence(db, "A");
    ok("D1 content A: 2 persisted evidence okunur", rA.ok && rA.data.length === 2);
    ok("D2 cross-content leakage yok (B satırı gelmez)", rA.ok && !rA.data.some((e) => e.content_id === "B"));
    const rEmpty = await listEvidence(db, "C");
    ok("D3 gerçekten boş content → 0 satır", rEmpty.ok && rEmpty.data.length === 0);
  }

  // D-static: admin evidence route GET sözleşmesi + POST/DELETE korunuyor.
  const evSrc = stripComments(read("app/api/admin/hd/evidence/route.ts"));
  ok("D4 evidence route: GET export eklendi", /export async function GET/.test(evSrc));
  ok("D5 evidence GET: verifyAdminRequest ile korunur", /verifyAdminRequest/.test(evSrc));
  ok("D6 evidence GET: content_id scope zorunlu", /content_id/.test(evSrc));
  ok("D7 evidence GET: listEvidence reuse (kopya sorgu yok)", /listEvidence/.test(evSrc));
  ok("D8 evidence GET: no-store", /no-store|NO_STORE/.test(evSrc));
  ok("D9 evidence POST+DELETE semantiği korunuyor", /export async function POST/.test(evSrc) && /export async function DELETE/.test(evSrc));
  ok("D10 evidence GET read-only (create/deleteEvidence yalnız POST/DELETE'te)",
    (evSrc.match(/createEvidence\(/g) || []).length === 1 && (evSrc.match(/deleteEvidence\(/g) || []).length === 1);

  // D-static: admin evidence editor artık DB'den hydrate ediyor (session-local değil).
  const edSrc = stripComments(read("app/admin/human-design/components/HdAdminEvidenceEditor.tsx"));
  ok("D11 editor: mount'ta persisted evidence GET (hdGet + content_id)", /hdGet/.test(edSrc) && /content_id/.test(edSrc));
  ok("D12 editor: useEffect ile hydrate", /useEffect/.test(edSrc));
  ok("D13 editor: yazma sonrası DB reload (await load)", /await load\(\)/.test(edSrc));
  ok("D14 editor: browser'da service_role yok", !/supabase-server|getServerDb|service_role/i.test(edSrc));

  console.log(`\nToplam: ${pass} geçti, ${fail} başarısız.`);
  if (fail > 0) process.exit(1);
}

void main();
