// Yaşam Hafızası™ — S2.07 buildIndexUnit izole harness (saf, DB'siz).
//
// buildIndexUnit(config, row, tenant, extracted) → BuiltIndexUnit | null
// yazma-yanı indeks birimi kompozisyonunu + content_hash (SHA-256) determinizmini
// doğrular. GERÇEK builder import edilir (kopya/taklit YOK). GERÇEK SourceConfig
// kayıtları (YH_INDEX_SOURCES) + kontrollü minimal fixture'lar kullanılır.
// DB / IO / env / network YOK. Saf fonksiyon → deterministik.
// Çalıştırma:  npx tsx scripts/yh-build-candidate-harness.ts

import { buildIndexUnit } from "../lib/yasam-hafizasi/indexer/buildCandidate";
import type { BuiltIndexUnit } from "../lib/yasam-hafizasi/indexer/buildCandidate";
import type { ExtractedFields } from "../lib/yasam-hafizasi/indexer/extractFields";
import { YH_INDEX_SOURCES } from "../lib/yasam-hafizasi/indexer/sources";
import type { SourceConfig } from "../lib/yasam-hafizasi/indexer/sources";
import type { EvidenceField, ExpertRelation } from "../lib/yasam-hafizasi/search/types";
import type { TenantResolveResult } from "../lib/yasam-hafizasi/indexer/tenantResolve";

const errors: string[] = [];
function check(cond: boolean, msg: string): void {
  if (!cond) errors.push(msg);
}
function j(v: unknown): string {
  return JSON.stringify(v);
}

// ── Kurulum yardımcıları ─────────────────────────────────────────────────────

function cfg(key: string): SourceConfig {
  const c = YH_INDEX_SOURCES.find((s) => s.sourceKey === key);
  if (!c) throw new Error(`harness kurulum hatası: config yok → ${key}`);
  return c;
}

function okTenant(tenantId: string | null): TenantResolveResult {
  return { ok: true, tenantId, isShared: tenantId === null };
}
function failTenant(): TenantResolveResult {
  return { ok: false, reason: "invalid-tenant" };
}

function ef(
  evidenceFields: EvidenceField[],
  topicTags: string[],
  expertRelations: ExpertRelation[],
): ExtractedFields {
  return { evidenceFields, topicTags, expertRelations };
}

const HEX64 = /^[0-9a-f]{64}$/;

// Kontrollü fixture config'i (çok kolonlu title/snippet seçimini test etmek için).
const fakeRecord: SourceConfig = {
  sourceKey: "test:record",
  sourceFamily: "kisisel_arsiv",
  tableName: "test_table",
  primaryKey: "id",
  unit: "record",
  tenant: { mode: "column", column: "tenant_id" },
  titleColumns: ["t1", "t2", "t3"],
  searchTextColumns: ["body"],
  snippetColumns: ["s1", "s2"],
  topicTagsColumns: ["tags"],
  relationColumns: ["rel"],
  updatedAtColumn: "updated_at",
  activeColumn: null,
  classification: "safe-non-pii", // BF-0 zorunlu alan (test config)
  enabled: true,
};

// Column-tenant'lı sahte "section" (join OLMAYAN) — parent kimliği kaynağı yok →
// group_key null → builder null (pk degrade YAPILMAZ) kuralını test eder.
const fakeSectionNoJoin: SourceConfig = {
  ...fakeRecord,
  sourceKey: "test:section-nojoin",
  tableName: "test_sections",
  unit: "section",
};

const baseEvidence: EvidenceField[] = [{ origin: "stone_name", kind: "title", text: "Ametist" }];
const baseExtracted = (): ExtractedFields =>
  ef([...baseEvidence.map((e) => ({ ...e }))], ["Kök"], [{ kind: "assignments", targetLabel: "Kuvars" }]);

// ── Senaryolar ────────────────────────────────────────────────────────────────

function main(): void {
  console.log("S2.07 buildIndexUnit harness — saf/DB'siz.\n");

  // 1) record tam ve geçerli girdi
  {
    const u = buildIndexUnit(
      cfg("dogaltas:stones"),
      { id: "stone-1", stone_name: "Ametist", short_description: "kısa açıklama", updated_at: "2026-01-01T00:00:00Z" },
      okTenant("tenant-A"),
      baseExtracted(),
    );
    check(u !== null, "#1 record geçerli girdi null döndü");
    if (u) {
      check(u.tenantId === "tenant-A", `#1 tenantId: ${j(u.tenantId)}`);
      check(u.sourceModule === "dogaltas", `#1 sourceModule: ${j(u.sourceModule)}`);
      check(u.sourceTable === "stones", `#1 sourceTable: ${j(u.sourceTable)}`);
      check(u.sourceId === "stone-1", `#1 sourceId: ${j(u.sourceId)}`);
      check(u.unitType === "record", `#1 unitType: ${j(u.unitType)}`);
      check(u.sectionRef === null, `#1 sectionRef null olmalı: ${j(u.sectionRef)}`);
      check(u.groupKey === "dogaltas:stones:stone-1", `#1 groupKey: ${j(u.groupKey)}`);
      check(u.title === "Ametist" && u.titleSource === "stone_name", `#1 title/source: ${j([u.title, u.titleSource])}`);
      check(u.snippet === "kısa açıklama" && u.snippetOrigin === "short_description", `#1 snippet: ${j([u.snippet, u.snippetOrigin])}`);
      check(u.sourceUpdatedAt === "2026-01-01T00:00:00Z", `#1 sourceUpdatedAt: ${j(u.sourceUpdatedAt)}`);
      check(HEX64.test(u.contentHash), `#1 contentHash hex64 değil: ${j(u.contentHash)}`);
    }
  }

  // 2) section parent group key (join → guide_id)
  {
    const u = buildIndexUnit(
      cfg("sifa_rehberi:guide-sections"),
      { id: "sec-9", guide_id: "guide-1", title: "Bölüm", note: "paragraf" },
      okTenant("tenant-A"),
      baseExtracted(),
    );
    check(u !== null, "#2 section null döndü");
    if (u) {
      check(u.unitType === "section", `#2 unitType: ${j(u.unitType)}`);
      check(u.groupKey === "sifa_rehberi:guide-sections:guide-1", `#2 groupKey parent(guide_id) olmalı: ${j(u.groupKey)}`);
      check(u.sourceId === "sec-9", `#2 sourceId section id olmalı: ${j(u.sourceId)}`);
      check(u.sectionRef === null, `#2 sectionRef null: ${j(u.sectionRef)}`);
    }
  }

  // 3) row parent group key (join → sheet_id)
  {
    const u = buildIndexUnit(
      cfg("aromaterapi:reference-rows"),
      { id: "row-3", sheet_id: "sheet-1", cells: { "0": "Hücre" } },
      okTenant(null), // shared
      ef([{ origin: "cells[0]", kind: "paragraph", text: "Hücre" }], [], []),
    );
    check(u !== null, "#3 row null döndü");
    if (u) {
      check(u.unitType === "row", `#3 unitType: ${j(u.unitType)}`);
      check(u.groupKey === "aromaterapi:reference-rows:sheet-1", `#3 groupKey parent(sheet_id) olmalı: ${j(u.groupKey)}`);
      check(u.tenantId === null, `#3 shared tenantId null olmalı: ${j(u.tenantId)}`);
    }
  }

  // 4) title ilk geçerli kolon (t1 boş, t2 whitespace, t3 geçerli)
  {
    const u = buildIndexUnit(
      fakeRecord,
      { id: "r1", t1: "", t2: "   ", t3: "Gerçek Başlık", s1: "snip" },
      okTenant("t"),
      baseExtracted(),
    );
    check(u !== null && u.title === "Gerçek Başlık" && u.titleSource === "t3", `#4 title ilk-geçerli: ${j([u?.title, u?.titleSource])}`);
  }

  // 5) snippet ilk geçerli kolon (s1 boş → s2)
  {
    const u = buildIndexUnit(
      fakeRecord,
      { id: "r1", t1: "Başlık", s1: "  ", s2: "İkinci snippet" },
      okTenant("t"),
      baseExtracted(),
    );
    check(u !== null && u.snippet === "İkinci snippet" && u.snippetOrigin === "s2", `#5 snippet ilk-geçerli: ${j([u?.snippet, u?.snippetOrigin])}`);
  }

  // 6) whitespace ve non-string atlanır (title/snippet)
  {
    const u = buildIndexUnit(
      fakeRecord,
      { id: "r1", t1: "   ", t2: 42, t3: "OK", s1: null, s2: "snip" },
      okTenant("t"),
      baseExtracted(),
    );
    check(u !== null && u.title === "OK" && u.snippet === "snip", `#6 whitespace/non-string atlanmadı: ${j([u?.title, u?.snippet])}`);
  }

  // 7) title/snippet bulunamadı → null (fabrikasyon yok)
  {
    const u = buildIndexUnit(
      fakeRecord,
      { id: "r1", t1: "", t2: "  ", t3: "", s1: "", s2: "   " },
      okTenant("t"),
      baseExtracted(), // kanıt var → birim üretilir, sadece title/snippet null
    );
    check(u !== null, "#7 birim null döndü (kanıt varken)");
    if (u) {
      check(u.title === null && u.titleSource === null, `#7 title null olmalı: ${j([u.title, u.titleSource])}`);
      check(u.snippet === null && u.snippetOrigin === null, `#7 snippet null olmalı: ${j([u.snippet, u.snippetOrigin])}`);
    }
  }

  // 8) tenant ok:false → null
  {
    const u = buildIndexUnit(cfg("dogaltas:stones"), { id: "s1", stone_name: "x" }, failTenant(), baseExtracted());
    check(u === null, `#8 tenant fail → null olmalı: ${j(u)}`);
  }

  // 9) eksik primary key → null
  {
    const u1 = buildIndexUnit(cfg("dogaltas:stones"), { stone_name: "x" }, okTenant("t"), baseExtracted());
    check(u1 === null, `#9a primaryKey yok → null: ${j(u1)}`);
    const u2 = buildIndexUnit(cfg("dogaltas:stones"), { id: "   ", stone_name: "x" }, okTenant("t"), baseExtracted());
    check(u2 === null, `#9b primaryKey whitespace → null: ${j(u2)}`);
    const u3 = buildIndexUnit(cfg("dogaltas:stones"), { id: 123, stone_name: "x" }, okTenant("t"), baseExtracted());
    check(u3 === null, `#9c primaryKey non-string → null: ${j(u3)}`);
  }

  // 10) section/row eksik parent kimliği → null (pk degrade yok)
  {
    const u1 = buildIndexUnit(
      cfg("sifa_rehberi:guide-sections"),
      { id: "sec-1", title: "Bölüm" }, // guide_id yok
      okTenant("t"),
      baseExtracted(),
    );
    check(u1 === null, `#10a section fk yok → null: ${j(u1)}`);
    // column-tenant'lı sahte section: yapısal parent kaynağı yok → null (pk'ye düşmez)
    const u2 = buildIndexUnit(fakeSectionNoJoin, { id: "x1", t1: "Başlık" }, okTenant("t"), baseExtracted());
    check(u2 === null, `#10b join olmayan section → null (pk degrade yok): ${j(u2 && u2.groupKey)}`);
  }

  // 11) sıfır kanıt → null
  {
    const u = buildIndexUnit(cfg("dogaltas:stones"), { id: "s1", stone_name: "x" }, okTenant("t"), ef([], [], []));
    check(u === null, `#11 sıfır-kanıt → null: ${j(u)}`);
  }

  // 12) yalnız evidence ile üretim
  {
    const u = buildIndexUnit(cfg("dogaltas:stones"), { id: "s1", stone_name: "x" }, okTenant("t"),
      ef([{ origin: "stone_name", kind: "title", text: "x" }], [], []));
    check(u !== null, `#12 yalnız evidence → üretilmeli: ${j(u)}`);
  }

  // 13) yalnız topicTag ile üretim
  {
    const u = buildIndexUnit(cfg("dogaltas:stones"), { id: "s1" }, okTenant("t"), ef([], ["Kök"], []));
    check(u !== null && u.topicTags.length === 1, `#13 yalnız tag → üretilmeli: ${j(u)}`);
  }

  // 14) yalnız expertRelation ile üretim
  {
    const u = buildIndexUnit(cfg("dogaltas:stones"), { id: "s1" }, okTenant("t"), ef([], [], [{ kind: "k", targetLabel: "v" }]));
    check(u !== null && u.expertRelations.length === 1, `#14 yalnız relation → üretilmeli: ${j(u)}`);
  }

  // 15) aynı girdi → aynı çıktı ve aynı hash
  {
    const row = { id: "s1", stone_name: "Ametist", short_description: "açık" };
    const a = buildIndexUnit(cfg("dogaltas:stones"), row, okTenant("t"), baseExtracted());
    const b = buildIndexUnit(cfg("dogaltas:stones"), { ...row }, okTenant("t"), baseExtracted());
    check(a !== null && b !== null && a.contentHash === b.contentHash, `#15 aynı girdi aynı hash değil: ${j([a?.contentHash, b?.contentHash])}`);
    check(a !== null && b !== null && j(a) === j(b), "#15 aynı girdi aynı çıktı değil");
  }

  // Hash duyarlılığı için ortak taban
  const hashRow = { id: "s1", stone_name: "Başlık", short_description: "snippet" };
  const baseHash = ((): string => {
    const u = buildIndexUnit(cfg("dogaltas:stones"), hashRow, okTenant("t1"), baseExtracted());
    return u ? u.contentHash : "";
  })();

  function hashOf(row: Record<string, unknown>, tenant: TenantResolveResult, extracted: ExtractedFields): string {
    const u = buildIndexUnit(cfg("dogaltas:stones"), row, tenant, extracted);
    return u ? u.contentHash : "";
  }

  // 16) title değişimi → hash değişimi
  check(hashOf({ ...hashRow, stone_name: "Farklı Başlık" }, okTenant("t1"), baseExtracted()) !== baseHash, "#16 title değişince hash değişmeli");

  // 17) snippet değişimi → hash değişimi
  check(hashOf({ ...hashRow, short_description: "farklı snippet" }, okTenant("t1"), baseExtracted()) !== baseHash, "#17 snippet değişince hash değişmeli");

  // 18) evidence değişimi → hash değişimi
  check(hashOf(hashRow, okTenant("t1"), ef([{ origin: "stone_name", kind: "title", text: "DEĞİŞTİ" }], ["Kök"], [{ kind: "assignments", targetLabel: "Kuvars" }])) !== baseHash, "#18 evidence değişince hash değişmeli");

  // 19) topicTag değişimi → hash değişimi
  check(hashOf(hashRow, okTenant("t1"), ef(baseEvidence.map((e) => ({ ...e })), ["Kalp"], [{ kind: "assignments", targetLabel: "Kuvars" }])) !== baseHash, "#19 tag değişince hash değişmeli");

  // 20) expertRelation değişimi → hash değişimi
  check(hashOf(hashRow, okTenant("t1"), ef(baseEvidence.map((e) => ({ ...e })), ["Kök"], [{ kind: "assignments", targetLabel: "Roselit" }])) !== baseHash, "#20 relation değişince hash değişmeli");

  // 21) tenantId değişimi → hash DEĞİŞMEMELİ
  check(hashOf(hashRow, okTenant("BAŞKA-tenant"), baseExtracted()) === baseHash, "#21 tenant değişince hash değişMEMELİ");
  check(hashOf(hashRow, okTenant(null), baseExtracted()) === baseHash, "#21b shared(null) tenant → hash aynı olmalı");

  // 22) sourceId değişimi → hash DEĞİŞMEMELİ
  check(hashOf({ ...hashRow, id: "BAŞKA-id" }, okTenant("t1"), baseExtracted()) === baseHash, "#22 sourceId değişince hash değişMEMELİ");

  // 23) sourceUpdatedAt değişimi → hash DEĞİŞMEMELİ
  check(hashOf({ ...hashRow, updated_at: "2099-12-31T00:00:00Z" }, okTenant("t1"), baseExtracted()) === baseHash, "#23 sourceUpdatedAt değişince hash değişMEMELİ");

  // 24) girdilerin mutate edilmemesi
  {
    const row = { id: "s1", stone_name: "Ametist", short_description: "açık", updated_at: "2026-01-01" };
    const extracted = baseExtracted();
    const rowSnap = j(row);
    const evSnap = j(extracted.evidenceFields);
    const tagSnap = j(extracted.topicTags);
    const relSnap = j(extracted.expertRelations);
    buildIndexUnit(cfg("dogaltas:stones"), row, okTenant("t"), extracted);
    check(j(row) === rowSnap, "#24 row mutate edildi");
    check(j(extracted.evidenceFields) === evSnap, "#24 evidenceFields mutate edildi");
    check(j(extracted.topicTags) === tagSnap, "#24 topicTags mutate edildi");
    check(j(extracted.expertRelations) === relSnap, "#24 expertRelations mutate edildi");
  }

  // 25) bozuk/unknown değerlerde exception olmaması
  {
    let threw = false;
    let u: BuiltIndexUnit | null = null;
    try {
      u = buildIndexUnit(
        cfg("dogaltas:stones"),
        { id: "s1", stone_name: { bad: 1 }, short_description: 42, updated_at: {} },
        okTenant("t"),
        ef([{ origin: "x", kind: "paragraph", text: "geçerli" }], [], []),
      );
    } catch {
      threw = true;
    }
    check(!threw, "#25 bozuk row'da exception fırlatıldı (fail-safe ihlali)");
    check(u !== null && u.title === null && u.snippet === null, `#25 bozuk title/snippet null olmalı: ${j([u?.title, u?.snippet])}`);
    check(u !== null && u.sourceUpdatedAt === null, `#25 bozuk updated_at null olmalı: ${j(u?.sourceUpdatedAt)}`);
  }

  // 26) reference-rows title/snippet null davranışı (titleColumns=[]/snippetColumns=[])
  {
    const u = buildIndexUnit(
      cfg("aromaterapi:reference-rows"),
      { id: "row-1", sheet_id: "sheet-1", cells: { "0": "Hücre" } },
      okTenant(null),
      ef([{ origin: "cells[0]", kind: "paragraph", text: "Hücre" }], [], []),
    );
    check(u !== null, "#26 reference-rows null döndü");
    if (u) {
      check(u.title === null && u.titleSource === null, `#26 title null olmalı: ${j([u.title, u.titleSource])}`);
      check(u.snippet === null && u.snippetOrigin === null, `#26 snippet null olmalı: ${j([u.snippet, u.snippetOrigin])}`);
    }
  }

  // 27) extracted dizilerinin sırası ve içeriği korunuyor (shallow copy; identity ayrı)
  {
    const evIn: EvidenceField[] = [
      { origin: "a", kind: "title", text: "1" },
      { origin: "b", kind: "paragraph", text: "2" },
    ];
    const tagIn = ["x", "y", "z"];
    const relIn: ExpertRelation[] = [{ kind: "k", targetLabel: "v" }];
    const extracted = ef(evIn, tagIn, relIn);
    const u = buildIndexUnit(cfg("dogaltas:stones"), { id: "s1" }, okTenant("t"), extracted);
    check(u !== null, "#27 null döndü");
    if (u) {
      check(u.evidenceFields.length === 2 && u.evidenceFields[0].origin === "a" && u.evidenceFields[1].origin === "b", `#27 evidence sırası/içeriği bozuldu: ${j(u.evidenceFields)}`);
      check(u.topicTags.length === 3 && u.topicTags[0] === "x" && u.topicTags[2] === "z", `#27 tag sırası bozuldu: ${j(u.topicTags)}`);
      check(u.expertRelations.length === 1 && u.expertRelations[0].kind === "k", `#27 relation bozuldu: ${j(u.expertRelations)}`);
      check(u.evidenceFields !== evIn && u.topicTags !== tagIn && u.expertRelations !== relIn, "#27 shallow copy yapılmadı (dizi kimliği aynı)");
    }
  }

  // 28) contentHash 64 karakter lowercase hex
  {
    const u = buildIndexUnit(cfg("dogaltas:stones"), { id: "s1", stone_name: "x" }, okTenant("t"), baseExtracted());
    check(u !== null && HEX64.test(u.contentHash), `#28 contentHash 64-hex-lowercase değil: ${j(u?.contentHash)}`);
  }

  // ── Sonuç ─────────────────────────────────────────────────────────────────
  if (errors.length > 0) {
    console.error(`CHECK BAŞARISIZ (${errors.length}):`);
    for (const e of errors) console.error("  - " + e);
    process.exit(1);
  }
  console.log(
    "CHECK: 28 senaryo OK.\n" +
      "- record/section/row + group_key (record→pk, section/row→parent FK, degrade yok)\n" +
      "- title/snippet ilk-geçerli seçim; yoksa null (fabrikasyon yok)\n" +
      "- null: tenant fail · eksik pk · eksik parent · sıfır-kanıt\n" +
      "- content_hash: title/snippet/evidence/tag/relation değişince değişir; tenant/sourceId/updatedAt değişince DEĞİŞMEZ\n" +
      "- contentHash 64-hex-lowercase; girdi mutasyonu yok; extracted sırası korunur (shallow copy)\n" +
      "- bozuk/unknown değerde exception yok (fail-safe)",
  );
}

main();
