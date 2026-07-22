// Yaşam Hafızası™ — S2.05 extractFields izole harness (saf, DB'siz).
//
// extractFields(config, row) → { evidenceFields, topicTags, expertRelations }
// çıkarımını ADIM 0 test matrisi + kanonik kontrollerle doğrular.
// GERÇEK SourceConfig kayıtları (YH_INDEX_SOURCES) kullanılır; yalnız "bilinmeyen
// kaynak" testi için tip-güvenli minimal fixture kullanılır.
// DB / IO / env YOK. Saf fonksiyon → deterministik.
// Çalıştırma:  npx tsx scripts/yh-extract-fields-harness.ts

import { extractFields } from "../lib/yasam-hafizasi/indexer/extractFields";
import type { ExtractedFields } from "../lib/yasam-hafizasi/indexer/extractFields";
import { YH_INDEX_SOURCES } from "../lib/yasam-hafizasi/indexer/sources";
import type { SourceConfig } from "../lib/yasam-hafizasi/indexer/sources";
import type { EvidenceField, ExpertRelation } from "../lib/yasam-hafizasi/search/types";

const errors: string[] = [];
function check(cond: boolean, msg: string): void {
  if (!cond) errors.push(msg);
}

/** Gerçek config'i sourceKey ile getirir (harness kurulum). */
function cfg(key: string): SourceConfig {
  const c = YH_INDEX_SOURCES.find((s) => s.sourceKey === key);
  if (!c) throw new Error(`harness kurulum hatası: config yok → ${key}`);
  return c;
}

// ── Karşılaştırma yardımcıları ───────────────────────────────────────────────

function strArrEq(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function evidenceEq(a: EvidenceField[], b: EvidenceField[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((e, i) => {
    const o = b[i];
    return (
      e.origin === o.origin &&
      e.kind === o.kind &&
      e.text === o.text &&
      e.sectionRef === o.sectionRef
    );
  });
}

function relEq(a: ExpertRelation[], b: ExpertRelation[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((r, i) => r.kind === b[i].kind && r.targetLabel === b[i].targetLabel);
}

function j(v: unknown): string {
  return JSON.stringify(v);
}

// ── Senaryolar (ADIM 0 matrisi) ──────────────────────────────────────────────

function main(): void {
  console.log("S2.05 extractFields harness — saf/DB'siz, ADIM 0 matrisi.\n");

  // 1) Düz string title/paragraph (protocols)
  {
    const r = extractFields(cfg("refleksoloji:protocols"), {
      title: "Karaciğer Protokolü",
      target_problem: "Sindirim",
      application_notes: "Notlar",
      organs: null,
    });
    check(
      evidenceEq(r.evidenceFields, [
        { origin: "title", kind: "title", text: "Karaciğer Protokolü" },
        { origin: "target_problem", kind: "paragraph", text: "Sindirim" },
        { origin: "application_notes", kind: "paragraph", text: "Notlar" },
      ]),
      `#1 title/paragraph evidence beklenenle uyuşmadı: ${j(r.evidenceFields)}`,
    );
    check(strArrEq(r.topicTags, []), `#1 topicTags boş olmalı: ${j(r.topicTags)}`);
  }

  // 2) pipe/comma tag (protocols.organs)
  {
    const r = extractFields(cfg("refleksoloji:protocols"), {
      title: "x",
      organs: "Karaciğer | Böbrek, Mide",
    });
    check(
      strArrEq(r.topicTags, ["Karaciğer", "Böbrek", "Mide"]),
      `#2 pipe/comma split hatası: ${j(r.topicTags)}`,
    );
  }

  // 3) Gerçek string[] tag (stones.chakras + warning_tags)
  {
    const r = extractFields(cfg("dogaltas:stones"), {
      stone_name: "Ametist",
      chakras: ["Kök", "Kalp"],
      warning_tags: ["Hamilelik"],
      assignments: null,
    });
    check(
      strArrEq(r.topicTags, ["Kök", "Kalp", "Hamilelik"]),
      `#3 string[] tag hatası: ${j(r.topicTags)}`,
    );
    check(
      evidenceEq(r.evidenceFields, [{ origin: "stone_name", kind: "title", text: "Ametist" }]),
      `#3 title evidence hatası: ${j(r.evidenceFields)}`,
    );
  }

  // 4) string[] relation (minerals.iceren_taslar)
  {
    const r = extractFields(cfg("dogaltas:minerals"), {
      name: "Demir",
      iceren_taslar: ["Kuvars", "Ametist"],
      organ_etkileri: null,
    });
    check(
      relEq(r.expertRelations, [
        { kind: "iceren_taslar", targetLabel: "Kuvars" },
        { kind: "iceren_taslar", targetLabel: "Ametist" },
      ]),
      `#4 string[] relation hatası: ${j(r.expertRelations)}`,
    );
  }

  // 5) Yapısal JSONB assignments (stones)
  {
    const r = extractFields(cfg("dogaltas:stones"), {
      stone_name: "x",
      assignments: { Mineraller: [["Kuvars", "25"], ["Roselit", "15"]], "Etkili Organlar": [["Karaciğer"]] },
    });
    check(
      relEq(r.expertRelations, [
        { kind: "Mineraller", targetLabel: "Kuvars" },
        { kind: "Mineraller", targetLabel: "Roselit" },
        { kind: "Etkili Organlar", targetLabel: "Karaciğer" },
      ]),
      `#5 assignments çıkarımı hatası (oran atılmalı): ${j(r.expertRelations)}`,
    );
  }

  // 6) blends items (obje array → oil_name)
  {
    const r = extractFields(cfg("aromaterapi:blends"), {
      name: "Blend",
      carrier_oil_name: "Jojoba",
      items: [{ oil_name: "Lavanta", drops: 6 }, { oil_name: "Neroli" }],
    });
    check(
      relEq(r.expertRelations, [
        { kind: "carrier_oil_name", targetLabel: "Jojoba" },
        { kind: "items", targetLabel: "Lavanta" },
        { kind: "items", targetLabel: "Neroli" },
      ]),
      `#6 blends items çıkarımı hatası: ${j(r.expertRelations)}`,
    );
  }

  // 7) reference-rows cells (obje map) → sectionRef UNDEFINED, header eşlemesi YOK
  {
    const r = extractFields(cfg("aromaterapi:reference-rows"), {
      cells: { "0": "Terpen", "1": "Antimikrobiyal" },
    });
    check(
      evidenceEq(r.evidenceFields, [
        { origin: "cells[0]", kind: "paragraph", text: "Terpen", sectionRef: undefined },
        { origin: "cells[1]", kind: "paragraph", text: "Antimikrobiyal", sectionRef: undefined },
      ]),
      `#7 cells evidence hatası: ${j(r.evidenceFields)}`,
    );
    check(
      r.evidenceFields.every((e) => e.sectionRef === undefined),
      `#7 cells sectionRef undefined olmalı: ${j(r.evidenceFields)}`,
    );
  }

  // 8) null alanlar
  {
    const r = extractFields(cfg("dogaltas:stones"), {
      stone_name: null,
      chakras: null,
      warning_tags: null,
      assignments: null,
    });
    check(
      r.evidenceFields.length === 0 && r.topicTags.length === 0 && r.expertRelations.length === 0,
      `#8 null alanlar tümü atlanmalı: ${j(r)}`,
    );
  }

  // 9) undefined alan (kolon hiç yok)
  {
    const r = extractFields(cfg("dogaltas:stones"), {});
    check(
      r.evidenceFields.length === 0 && r.topicTags.length === 0 && r.expertRelations.length === 0,
      `#9 boş row → boş çıktı: ${j(r)}`,
    );
  }

  // 10) boş string (title + tag)
  {
    const r = extractFields(cfg("refleksoloji:protocols"), {
      title: "",
      organs: "   ",
    });
    check(
      r.evidenceFields.length === 0 && r.topicTags.length === 0,
      `#10 boş string title/tag atlanmalı: ${j(r)}`,
    );
  }

  // 11) boş array
  {
    const r = extractFields(cfg("dogaltas:minerals"), {
      cakralar: [],
      iceren_taslar: [],
    });
    check(
      r.topicTags.length === 0 && r.expertRelations.length === 0,
      `#11 boş array → boş: ${j(r)}`,
    );
  }

  // 12) yanlış primitive (array/tag beklenen yerde number/bool)
  {
    const r = extractFields(cfg("dogaltas:stones"), {
      stone_name: "x",
      chakras: 42,
      warning_tags: true,
    });
    check(strArrEq(r.topicTags, []), `#12 yanlış primitive tag atlanmalı: ${j(r.topicTags)}`);
  }

  // 13) yanlış obje (string[] beklenen yerde obje)
  {
    const r = extractFields(cfg("dogaltas:stones"), {
      stone_name: "x",
      warning_tags: { a: 1 },
    });
    check(strArrEq(r.topicTags, []), `#13 obje tag atlanmalı: ${j(r.topicTags)}`);
  }

  // 14) karışık array (string + non-string)
  {
    const r = extractFields(cfg("dogaltas:minerals"), {
      name: "x",
      iceren_taslar: ["Demir", 5, null, "Çinko"],
    });
    check(
      relEq(r.expertRelations, [
        { kind: "iceren_taslar", targetLabel: "Demir" },
        { kind: "iceren_taslar", targetLabel: "Çinko" },
      ]),
      `#14 karışık array yalnız string almalı: ${j(r.expertRelations)}`,
    );
  }

  // 15) eksik alt-alan (assignments boş row)
  {
    const r = extractFields(cfg("dogaltas:stones"), {
      stone_name: "x",
      assignments: { Mineraller: [[], ["Kuvars"]] },
    });
    check(
      relEq(r.expertRelations, [{ kind: "Mineraller", targetLabel: "Kuvars" }]),
      `#15 boş assignment row atlanmalı: ${j(r.expertRelations)}`,
    );
  }

  // 16) S5 guides related_stones string[] (kabul)
  {
    const r = extractFields(cfg("sifa_rehberi:guides"), {
      name: "x",
      related_stones: ["Ametist"],
      related_reflexology: null,
    });
    check(
      relEq(r.expertRelations, [{ kind: "related_stones", targetLabel: "Ametist" }]),
      `#16 guides string[] relation kabul edilmeli: ${j(r.expertRelations)}`,
    );
  }

  // 17) S5 guides related_stones obje array (fail-safe atla)
  {
    const r = extractFields(cfg("sifa_rehberi:guides"), {
      name: "x",
      related_stones: [{ id: "x", name: "Ametist" }],
    });
    check(
      r.expertRelations.length === 0,
      `#17 guides obje relation atlanmalı (fail-safe): ${j(r.expertRelations)}`,
    );
    // "[object Object]" ÜRETİLMEMELİ
    check(
      !r.expertRelations.some((rel) => rel.targetLabel.includes("[object")),
      `#17 obje coercion ("[object Object]") üretilmemeli: ${j(r.expertRelations)}`,
    );
  }

  // 18) bilinmeyen kaynak (tip-güvenli minimal fixture; yapısal dal yok)
  {
    const fakeConfig: SourceConfig = {
      sourceKey: "unknown:source",
      sourceFamily: "kisisel_arsiv",
      tableName: "unknown_table",
      primaryKey: "id",
      unit: "record",
      tenant: { mode: "column", column: "tenant_id" },
      titleColumns: ["title"],
      searchTextColumns: ["body"],
      snippetColumns: [],
      topicTagsColumns: ["tags"],
      relationColumns: ["rel"],
      updatedAtColumn: null,
      activeColumn: null,
      classification: "safe-non-pii", // BF-0 zorunlu alan (test config)
      enabled: true,
    };
    const r = extractFields(fakeConfig, {
      title: "Başlık",
      body: "Gövde",
      tags: ["a", "b"],
      rel: ["r1"],
    });
    check(
      evidenceEq(r.evidenceFields, [
        { origin: "title", kind: "title", text: "Başlık" },
        { origin: "body", kind: "paragraph", text: "Gövde" },
      ]) &&
        strArrEq(r.topicTags, ["a", "b"]) &&
        relEq(r.expertRelations, [{ kind: "rel", targetLabel: "r1" }]),
      `#18 bilinmeyen kaynak generic çıkarım hatası: ${j(r)}`,
    );
  }

  // 19) duplicate tag (exact dedupe, ilk sıra)
  {
    const r = extractFields(cfg("dogaltas:knowledge"), {
      title: "x",
      tags: ["Uyku", "uyku", "Uyku"],
    });
    check(
      strArrEq(r.topicTags, ["Uyku", "uyku"]),
      `#19 exact dedupe (case-sensitive) hatası: ${j(r.topicTags)}`,
    );
  }

  // 20) sıra korunumu
  {
    const r = extractFields(cfg("dogaltas:stones"), {
      stone_name: "x",
      chakras: ["C", "A", "B"],
    });
    check(strArrEq(r.topicTags, ["C", "A", "B"]), `#20 sıra korunmadı: ${j(r.topicTags)}`);
  }

  // 21) aynı metin çok origin (evidence dedupe YOK)
  {
    const r = extractFields(cfg("dogaltas:stones"), {
      stone_name: "kalp",
      short_description: "kalp",
      warning_text: "kalp",
    });
    check(
      evidenceEq(r.evidenceFields, [
        { origin: "stone_name", kind: "title", text: "kalp" },
        { origin: "short_description", kind: "paragraph", text: "kalp" },
        { origin: "warning_text", kind: "paragraph", text: "kalp" },
      ]),
      `#21 aynı metin farklı origin ayrı korunmalı: ${j(r.evidenceFields)}`,
    );
  }

  // 22) crash olmama (tüm alanlar bozuk)
  {
    let threw = false;
    let r: ExtractedFields | null = null;
    try {
      r = extractFields(cfg("dogaltas:stones"), {
        stone_name: { bad: 1 },
        chakras: 999,
        warning_tags: "geçerli, etiket",
        assignments: "bozuk-string-degil-obje",
      });
    } catch {
      threw = true;
    }
    check(!threw, "#22 bozuk row'da exception fırlatıldı (fail-safe ihlali)");
    check(
      r !== null && strArrEq(r.topicTags, ["geçerli", "etiket"]),
      `#22 bozuk alanlar arasında geçerli tag korunmalı: ${j(r?.topicTags)}`,
    );
  }

  // ── Kanonik açık kontroller (talimattaki 7 madde) ────────────────────────

  // (K1) Evidence text boşluklarıyla BİREBİR korunuyor (trim YOK).
  {
    const raw = "  başta ve sonda boşluk  \n  ikinci satır  ";
    const r = extractFields(cfg("refleksoloji:notes"), { title: "t", content: raw });
    const ev = r.evidenceFields.find((e) => e.origin === "content");
    check(ev?.text === raw, `(K1) evidence text birebir korunmadı: ${j(ev?.text)}`);
    check(ev?.kind === "note", `(K1) content kind 'note' olmalı: ${j(ev?.kind)}`);
  }

  // (K2) Tag ve relation trim ediliyor.
  {
    const r = extractFields(cfg("dogaltas:minerals"), {
      cakralar: ["  Kalp  "],
      iceren_taslar: ["  Kuvars  "],
    });
    check(strArrEq(r.topicTags, ["Kalp"]), `(K2) tag trim edilmedi: ${j(r.topicTags)}`);
    check(
      relEq(r.expertRelations, [{ kind: "iceren_taslar", targetLabel: "Kuvars" }]),
      `(K2) relation targetLabel trim edilmedi: ${j(r.expertRelations)}`,
    );
  }

  // (K3) cells evidence sectionRef undefined — #7'de doğrulandı (tekrar teyit).
  {
    const r = extractFields(cfg("aromaterapi:reference-rows"), { cells: { "0": "X" } });
    check(
      r.evidenceFields.length === 1 && r.evidenceFields[0].sectionRef === undefined,
      `(K3) cells sectionRef undefined değil: ${j(r.evidenceFields)}`,
    );
  }

  // (K4) Bilinmeyen object "[object Object]" üretmiyor (tag + relation + evidence).
  {
    const r = extractFields(cfg("dogaltas:stones"), {
      stone_name: { toString: () => "SHOULD_NOT_APPEAR" },
      chakras: [{ x: 1 }, "Geçerli"],
      assignments: { K: [[{ nested: true }], ["Doğru"]] },
    });
    const flat = [
      ...r.evidenceFields.map((e) => e.text),
      ...r.topicTags,
      ...r.expertRelations.map((rel) => rel.targetLabel),
    ].join(" | ");
    check(!flat.includes("[object"), `(K4) coercion sızıntısı: ${flat}`);
    check(!flat.includes("SHOULD_NOT_APPEAR"), `(K4) toString sızıntısı: ${flat}`);
    check(strArrEq(r.topicTags, ["Geçerli"]), `(K4) obje eleman atlanmadı: ${j(r.topicTags)}`);
    check(
      relEq(r.expertRelations, [{ kind: "K", targetLabel: "Doğru" }]),
      `(K4) obje assignment satırı atlanmadı: ${j(r.expertRelations)}`,
    );
  }

  // (K5) Bozuk kolon diğer geçerli kolonların sonucunu engellemiyor.
  {
    const r = extractFields(cfg("dogaltas:stones"), {
      stone_name: "Geçerli Başlık",
      chakras: 123, // bozuk
      warning_tags: ["Hamilelik"], // geçerli
      assignments: 42, // bozuk
    });
    check(
      r.evidenceFields.length === 1 &&
        r.evidenceFields[0].text === "Geçerli Başlık" &&
        strArrEq(r.topicTags, ["Hamilelik"]),
      `(K5) bozuk kolon geçerli sonucu engelledi: ${j(r)}`,
    );
  }

  // (K7) Fonksiyon row veya config üzerinde MUTATION yapmıyor.
  {
    const config = cfg("dogaltas:stones");
    const configSnapshot = j(config);
    const row = {
      stone_name: "x",
      chakras: ["A", "B"],
      assignments: { M: [["Kuvars", "25"]] },
    };
    const rowSnapshot = j(row);
    extractFields(config, row);
    check(j(config) === configSnapshot, "(K7) config mutate edildi");
    check(j(row) === rowSnapshot, "(K7) row mutate edildi");
  }

  // ── R1–R8: Evidence kind kaynak-bağlamı sınıflandırma regresyonu ─────────
  // "note" niteliği KAYNAĞA bağlıdır (kolon adına değil). Yalnız NOTE_SOURCES
  // ("refleksoloji:notes", "kisisel_arsiv:archives") → note; diğer hepsi → paragraph.

  /** Verilen kaynak+row için tüm searchText evidence kind'larının kümesini döndürür. */
  function searchKinds(sourceKey: string, row: Record<string, unknown>): Set<string> {
    const r = extractFields(cfg(sourceKey), row);
    return new Set(r.evidenceFields.filter((e) => e.kind === "note" || e.kind === "paragraph").map((e) => e.kind));
  }
  function onlyKind(kinds: Set<string>, expected: "note" | "paragraph"): boolean {
    return kinds.size === 1 && kinds.has(expected);
  }

  // R1 — dogaltas:knowledge content + notes → paragraph (makale gövdesi)
  {
    const k = searchKinds("dogaltas:knowledge", {
      title: "t",
      content: "makale gövdesi",
      notes: "ek not",
      keyword: "anahtar",
    });
    check(onlyKind(k, "paragraph"), `R1 knowledge content/notes paragraph olmalı: ${j([...k])}`);
  }

  // R2 — biyoenerji:subconscious-causes content + note_text → paragraph
  {
    const k = searchKinds("biyoenerji:subconscious-causes", {
      title: "t",
      content: "kütüphane gövdesi",
      note_text: "ek metin",
    });
    check(onlyKind(k, "paragraph"), `R2 subconscious content/note_text paragraph olmalı: ${j([...k])}`);
  }

  // R3 — sifa_rehberi:guide-sections note → paragraph (rehber paragrafı)
  {
    const k = searchKinds("sifa_rehberi:guide-sections", {
      title: "t",
      note: "rehber bölümü paragrafı",
      mode: "mizac",
      source: "kaynak",
    });
    check(onlyKind(k, "paragraph"), `R3 guide-sections note paragraph olmalı: ${j([...k])}`);
  }

  // R4 — biyoenerji:chakras notes → paragraph
  {
    const k = searchKinds("biyoenerji:chakras", {
      name: "Kök Çakra",
      causes: "sebepler",
      notes: "ek bilgiler",
    });
    check(onlyKind(k, "paragraph"), `R4 chakras notes paragraph olmalı: ${j([...k])}`);
  }

  // R5 — biyoenerji:imaginations notes → paragraph
  {
    const k = searchKinds("biyoenerji:imaginations", {
      title: "t",
      text: "imajinasyon metni",
      notes: "ek not",
      source: "kaynak",
    });
    check(onlyKind(k, "paragraph"), `R5 imaginations notes paragraph olmalı: ${j([...k])}`);
  }

  // R6 — aromaterapi:blends notes → paragraph (yapısal tarif kaydı)
  {
    const k = searchKinds("aromaterapi:blends", { name: "Blend", notes: "tarif notu" });
    check(onlyKind(k, "paragraph"), `R6 blends notes paragraph olmalı: ${j([...k])}`);
  }

  // R7 — refleksoloji:notes content → note (değişmez; uzman notu)
  {
    const k = searchKinds("refleksoloji:notes", { title: "t", content: "uzman notu" });
    check(onlyKind(k, "note"), `R7 refleksoloji:notes content note olmalı: ${j([...k])}`);
  }

  // R8 — kisisel_arsiv:archives note → note (değişmez; kullanıcı notu)
  {
    const k = searchKinds("kisisel_arsiv:archives", { title: "t", note: "kişisel not" });
    check(onlyKind(k, "note"), `R8 kisisel_arsiv:archives note note olmalı: ${j([...k])}`);
  }

  // R9 — cells sıra determinizmi: karışık ekleme sırası → artan indeks sırası
  // (builder'a sort EKLEMEDEN mevcut Object.entries determinizmini kilitler.)
  {
    const r = extractFields(cfg("aromaterapi:reference-rows"), { cells: { "1": "İkinci", "0": "Birinci" } });
    check(
      evidenceEq(r.evidenceFields, [
        { origin: "cells[0]", kind: "paragraph", text: "Birinci", sectionRef: undefined },
        { origin: "cells[1]", kind: "paragraph", text: "İkinci", sectionRef: undefined },
      ]),
      `R9 cells karışık-insertion artan sıraya çözülmeli: ${j(r.evidenceFields)}`,
    );
  }

  // ── Sonuç ─────────────────────────────────────────────────────────────────
  if (errors.length > 0) {
    console.error(`CHECK BAŞARISIZ (${errors.length}):`);
    for (const e of errors) console.error("  - " + e);
    process.exit(1);
  }
  console.log(
    "CHECK: 22 matris senaryosu + 6 kanonik kontrol + R1-R9 regresyon OK.\n" +
      "- evidence text birebir (trim/normalize/coercion YOK)\n" +
      "- kind: note yalnız NOTE_SOURCES (refleksoloji:notes, kisisel_arsiv:archives); diğer hepsi paragraph\n" +
      "- tag/relation trim + exact dedupe + sıra korunumu\n" +
      "- cells sectionRef=undefined (header eşlemesi yok) + karışık-insertion artan sıra deterministik\n" +
      "- fail-safe: null/undefined/primitive/obje/karışık array atlanır, crash yok\n" +
      "- S5 guides: yalnız string/string[] kabul, obje elemanları düşer\n" +
      "- row/config mutation YOK",
  );
}

main();
