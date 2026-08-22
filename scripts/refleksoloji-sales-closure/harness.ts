/**
 * Refleksoloji satış-kapanış regresyon harness'i.
 * Çalıştır: npm run refleksoloji:harness   (tsx)
 *
 * Kapsar: çoklu-organ parser, diakritik arama, UUID doğrulama, mass-assignment
 * izin listesi, tombstone-farkında atlas birleştirme (zombie/rename/re-create).
 */
import { parseOrganList } from "@/lib/refleksoloji/organs";
import { foldSearchText } from "@/lib/refleksoloji/search";
import { isUuid } from "@/lib/refleksoloji/uuid";
import { pickProtocolContentFields } from "@/lib/refleksoloji/protocolDto";
import {
  markOrganDeleted,
  markOrganUpserted,
  mergeAtlasWithTombstones,
  type AtlasDocLike,
} from "@/lib/refleksoloji/atlasMerge";
import {
  normalizeSearchQuery,
  protocolMatchesSearch,
} from "@/app/refleksoloji/kayitli-protokoller/lib/protocolActions";
import type { ReflexologyProtocolRecord } from "@/app/refleksoloji/kayitli-protokoller/types";
import {
  isEditViewportWidth,
  REGION_EDIT_MIN_WIDTH,
} from "@/app/refleksoloji/bolge-haritasi/lib/editingViewport";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(name: string, cond: boolean) {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    failures.push(name);
    console.error(`  ✗ ${name}`);
  }
}
function eq(name: string, a: unknown, b: unknown) {
  ok(`${name} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`, JSON.stringify(a) === JSON.stringify(b));
}

function entry() {
  return { taban: { sol: [], sag: [] }, yan: { sol: [], sag: [] } };
}
function organKeys(doc: AtlasDocLike): string[] {
  return Object.keys(doc).filter((k) => k !== "_meta").sort();
}

const T1 = "2026-01-01T00:00:00.000Z";
const T2 = "2026-06-01T00:00:00.000Z";

// ─── 1. Çoklu-organ parser (BUG-1) ─────────────────────────────────────────────
eq("parser: tek organ", parseOrganList("Karaciğer"), ["Karaciğer"]);
eq("parser: pipe 2", parseOrganList("Karaciğer | Böbrek"), ["Karaciğer", "Böbrek"]);
eq("parser: virgül 2", parseOrganList("Karaciğer,Böbrek"), ["Karaciğer", "Böbrek"]);
eq("parser: karışık 3", parseOrganList("Karaciğer, Böbrek | Hipofiz"), ["Karaciğer", "Böbrek", "Hipofiz"]);
eq("parser: boşluklu ayraç", parseOrganList("  Karaciğer   |   Böbrek  "), ["Karaciğer", "Böbrek"]);
eq("parser: 5+ organ", parseOrganList("A|B|C|D|E|F").length, 6);
eq("parser: duplicate tekilleştir", parseOrganList("Karaciğer | karaciğer"), ["Karaciğer"]);
eq("parser: boş", parseOrganList(""), []);
eq("parser: null", parseOrganList(null), []);
eq("parser: sadece boşluk", parseOrganList("   "), []);
eq("parser: ardışık ayraç", parseOrganList("A || B ,, C"), ["A", "B", "C"]);

// ─── 2. Diakritik arama (BUG diacritic) ─────────────────────────────────────────
eq("search: böbrek==bobrek", foldSearchText("Böbrek"), foldSearchText("bobrek"));
eq("search: karaciğer==karaciger", foldSearchText("Karaciğer"), foldSearchText("karaciger"));
const rec: ReflexologyProtocolRecord = {
  id: "x",
  tenant_id: "t",
  source_uid: "s",
  title: "Sindirim",
  target_problem: null,
  organs: "Böbrek | Karaciğer",
  application_notes: null,
  raw_json: null,
  created_at: T1,
} as ReflexologyProtocolRecord;
ok("search: 'bobrek' → Böbrek eşleşir", protocolMatchesSearch(rec, normalizeSearchQuery("bobrek")));
ok("search: 'karaciger' → Karaciğer eşleşir", protocolMatchesSearch(rec, normalizeSearchQuery("karaciger")));
ok("search: 'BÖBREK' → eşleşir", protocolMatchesSearch(rec, normalizeSearchQuery("BÖBREK")));
ok("search: alakasız → eşleşmez", !protocolMatchesSearch(rec, normalizeSearchQuery("akciğer")));

// ─── 3. UUID doğrulama (malformed → 400) ────────────────────────────────────────
ok("uuid: abc geçersiz", !isUuid("abc"));
ok("uuid: not-a-uuid geçersiz", !isUuid("not-a-uuid"));
ok("uuid: boş geçersiz", !isUuid(""));
ok("uuid: geçerli", isUuid("123e4567-e89b-12d3-a456-426614174000"));
ok("uuid: geçerli (büyük harf)", isUuid("123E4567-E89B-12D3-A456-426614174000"));

// ─── 4. Mass-assignment izin listesi ────────────────────────────────────────────
const picked = pickProtocolContentFields({
  title: "T",
  organs: "a|b",
  target_problem: "tp",
  application_notes: "n",
  raw_json: { organs: ["a", "b"] },
  tenant_id: "EVIL",
  id: "EVIL",
  created_at: "EVIL",
  updated_at: "EVIL",
  source_uid: "EVIL",
  origin_type: "admin_transfer",
  origin_label: "Admin Kütüphanesi",
  transferred_at: "EVIL",
  evil: "x",
} as Record<string, unknown>);
ok("dto: title korunur", (picked as Record<string, unknown>).title === "T");
ok("dto: organs korunur", (picked as Record<string, unknown>).organs === "a|b");
ok("dto: tenant_id düşer", !("tenant_id" in picked));
ok("dto: id düşer", !("id" in picked));
ok("dto: created_at düşer", !("created_at" in picked));
ok("dto: origin_type düşer", !("origin_type" in picked));
ok("dto: origin_label düşer", !("origin_label" in picked));
ok("dto: transferred_at düşer", !("transferred_at" in picked));
ok("dto: source_uid düşer (ayrıca ele alınır)", !("source_uid" in picked));
ok("dto: bilinmeyen alan düşer", !("evil" in picked));

// ─── 5. Tombstone-farkında atlas birleştirme ───────────────────────────────────
// Zombie: A sildi (server'da mezar taşı), B'nin bayat kopyası DİRİLMEMELİ.
{
  const server: AtlasDocLike = { _meta: { tombstones: { "karaciğer": T2 } } };
  const local: AtlasDocLike = { "Karaciğer": entry(), _meta: {} };
  const merged = mergeAtlasWithTombstones(server, local, T2);
  eq("zombie: silinen organ dirilmez", organKeys(merged), []);
}
// Rename: A "Böbrek"→"Böbrek Bölgesi"; B'nin bayat "Böbrek"i dirilmemeli, duplicate olmamalı.
{
  const server: AtlasDocLike = {
    "Böbrek Bölgesi": entry(),
    _meta: { tombstones: { "böbrek": T2 }, organUpdatedAt: { "böbrek bölgesi": T2 } },
  };
  const local: AtlasDocLike = { "Böbrek": entry(), _meta: {} };
  const merged = mergeAtlasWithTombstones(server, local, T2);
  eq("rename: yeni ad kalır + eski ad dirilmez", organKeys(merged), ["Böbrek Bölgesi"]);
}
// Re-create: silindikten SONRA yeniden oluşturulan organ hayatta kalmalı.
{
  const server: AtlasDocLike = { "Karaciğer": entry(), _meta: { organUpdatedAt: { "karaciğer": T2 } } };
  const local: AtlasDocLike = { _meta: { tombstones: { "karaciğer": T1 } } };
  const merged = mergeAtlasWithTombstones(server, local, T2);
  eq("re-create: silme sonrası yeniden oluşturma korunur", organKeys(merged), ["Karaciğer"]);
}
// Additive: mezar taşı yoksa yalnız-yerel organ korunur.
{
  const server: AtlasDocLike = { "A": entry(), _meta: {} };
  const local: AtlasDocLike = { "B": entry(), _meta: {} };
  const merged = mergeAtlasWithTombstones(server, local, T2);
  eq("additive: yalnız-yerel organ korunur", organKeys(merged), ["A", "B"]);
}
// mark helpers
{
  const doc: AtlasDocLike = { "X": entry(), _meta: {} };
  markOrganUpserted(doc, "X", T1);
  ok("mark: upsert damgası yazılır", doc._meta?.organUpdatedAt?.["x"] === T1);
  markOrganDeleted(doc, "X", T2);
  ok("mark: delete mezar taşı yazılır", doc._meta?.tombstones?.["x"] === T2);
  ok("mark: delete damgayı kaldırır", !doc._meta?.organUpdatedAt?.["x"]);
  markOrganUpserted(doc, "X", T2);
  ok("mark: yeniden upsert mezar taşını kaldırır", !doc._meta?.tombstones?.["x"]);
}

// ─── 6. Mobil salt-okuma viewport eşiği (capability contract) ───────────────────
eq("viewport: eşik = lg 1024", REGION_EDIT_MIN_WIDTH, 1024);
ok("viewport: 390px telefon → düzenleme KAPALI", !isEditViewportWidth(390));
ok("viewport: 375px telefon → düzenleme KAPALI", !isEditViewportWidth(375));
ok("viewport: 768px tablet-portre → düzenleme KAPALI", !isEditViewportWidth(768));
ok("viewport: 1023px → düzenleme KAPALI", !isEditViewportWidth(1023));
ok("viewport: 1024px → düzenleme AÇIK", isEditViewportWidth(1024));
ok("viewport: 1366px laptop → düzenleme AÇIK", isEditViewportWidth(1366));
ok("viewport: 1920px desktop → düzenleme AÇIK", isEditViewportWidth(1920));

// ─── Özet ───────────────────────────────────────────────────────────────────────
console.log(`\nRefleksoloji harness: ${passed} PASS, ${failed} FAIL`);
if (failed > 0) {
  console.error("FAILURES:\n" + failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
console.log("✓ Tüm testler geçti.");
