/**
 * Şifa Rehberi — PREMIUM UX V2 harness.
 * Kanonik konu ağacı + resolver değişmezlerini kilitler (create/detail/edit ortak gruplama).
 * Çalıştır: npx tsx scripts/sifa-rehberi-premium-v2-harness.ts
 */
import {
  TOPIC_GROUPS,
  TOPICS,
  resolveTopicId,
  groupIdOfTopic,
  topicById,
  LEGACY_KEY_TO_TOPIC_ID,
} from "@/lib/sifa-rehberi/topicTree";
import { MODALITIES, SECTION_TYPES } from "@/lib/sifa-rehberi/sectionModel";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, msg: string) {
  if (cond) pass += 1;
  else {
    fail += 1;
    fails.push(msg);
  }
}
function eq<T>(a: T, b: T, msg: string) {
  ok(a === b, `${msg} (beklenen=${String(b)}, gelen=${String(a)})`);
}

// ── Ağaç bütünlüğü ────────────────────────────────────────────────────────────
ok(TOPIC_GROUPS[0].id === "rahatsizlik" && TOPIC_GROUPS[0].kind === "rahatsizlik", "ağaç: ilk grup rahatsizlik (özel)");
const groupIds = TOPIC_GROUPS.map((g) => g.id);
for (const g of ["belirtiler", "uygulamalar", "dogaltas", "aromaterapi", "islami", "destekleyici"]) {
  ok(groupIds.includes(g), `ağaç: '${g}' grubu mevcut`);
}
ok(new Set(TOPICS.map((t) => t.id)).size === TOPICS.length, "ağaç: alt konu id'leri benzersiz");

// Aromaterapi AYRI ana bölüm (Destekleyici değil)
eq(groupIdOfTopic("aromaterapi"), "aromaterapi", "aromaterapi: AYRI ana bölüm");
eq(resolveTopicId({ section_type: "supportive", mode: "aromaterapi" }), "aromaterapi", "resolve: supportive+aromaterapi → aromaterapi (Destekleyici DEĞİL)");
eq(resolveTopicId({ section_type: "supportive", mode: "Aromaterapi" }), "aromaterapi", "resolve: mode büyük/küçük harf duyarsız");

// İridoloji / El Analizi — Belirtiler altında, reasons
const iri = topicById("iridoloji");
const el = topicById("el_analizi");
ok(iri?.section_type === "reasons" && groupIdOfTopic("iridoloji") === "belirtiler", "iridoloji: reasons + Belirtiler altında");
ok(el?.section_type === "reasons" && groupIdOfTopic("el_analizi") === "belirtiler", "el_analizi: reasons + Belirtiler altında");
eq(resolveTopicId({ section_type: "reasons", mode: "iridoloji" }), "iridoloji", "resolve: reasons+iridoloji");
eq(resolveTopicId({ section_type: "reasons", mode: "el_analizi" }), "el_analizi", "resolve: reasons+el_analizi");

// Destekleyici alt konuları
for (const m of ["nefes", "meditation", "bioenerji", "masaj", "gunluk_rutin", "uyku", "destekleyici"]) {
  eq(groupIdOfTopic(m), "destekleyici", `destekleyici alt konu: ${m}`);
  eq(resolveTopicId({ section_type: "supportive", mode: m }), m, `resolve: supportive+${m}`);
}

// Uygulamalar (bitkisel section_type=herbal)
eq(resolveTopicId({ section_type: "herbal", mode: "bitkisel" }), "bitkisel", "resolve: herbal+bitkisel → bitkisel (Uygulamalar)");
eq(groupIdOfTopic("bitkisel"), "uygulamalar", "bitkisel: Uygulamalar altında");
for (const m of ["hacamat_suluk", "refleksoloji", "diyet", "uygulama"]) {
  eq(resolveTopicId({ section_type: "applications", mode: m }), m, `resolve: applications+${m}`);
}

// ── KAYIPSIZLIK: bilinmeyen/legacy mode asla düşmez (fallback) ─────────────────
eq(resolveTopicId({ section_type: "supportive", mode: "bilinmeyen_mode_xyz" }), "destekleyici", "lossless: bilinmeyen supportive → Genel Destekleyici");
eq(resolveTopicId({ section_type: "reasons", mode: "eski_legacy_mode" }), "diger", "lossless: bilinmeyen reasons → Diğer");
eq(resolveTopicId({ section_type: "applications", mode: "" }), "uygulama", "lossless: boş applications mode → Genel Uygulama");
eq(resolveTopicId({ section_type: "reasons", mode: null }), "diger", "lossless: null mode → fallback");

// Her section_type için resolveTopicId bir topic döndürür ve topic o tipe ait
for (const st of SECTION_TYPES) {
  const tid = resolveTopicId({ section_type: st, mode: "___none___" });
  const t = topicById(tid);
  ok(Boolean(t), `resolve: ${st} fallback bir konuya çözülür`);
}

// ── legacy düz kolon → konu eşlemesi ───────────────────────────────────────────
eq(LEGACY_KEY_TO_TOPIC_ID["iridology_match"], "iridoloji", "legacy: iridology_match → iridoloji");
eq(LEGACY_KEY_TO_TOPIC_ID["hand_analysis_match"], "el_analizi", "legacy: hand_analysis_match → el_analizi");
eq(LEGACY_KEY_TO_TOPIC_ID["aromatherapy"], "aromaterapi", "legacy: aromatherapy → aromaterapi");
eq(LEGACY_KEY_TO_TOPIC_ID["breathwork"], "nefes", "legacy: breathwork → nefes");
eq(LEGACY_KEY_TO_TOPIC_ID["supportive_alternative_methods"], "destekleyici", "legacy: supportive_alternative_methods → destekleyici");
eq(LEGACY_KEY_TO_TOPIC_ID["general_summary"], "genel_ozet", "legacy: general_summary → genel_ozet");
// 21 düz kolonun tamamı bir konuya eşlenmeli (iridoloji/el_analizi dahil; "Genel Uygulama" hariç)
eq(Object.keys(LEGACY_KEY_TO_TOPIC_ID).length, 21, "legacy: 21 düz kolonun tamamı bir konuya eşlenir");

// ── MODALITIES ↔ topicTree tutarlılığı ─────────────────────────────────────────
for (const m of MODALITIES) {
  const t = topicById(m.id);
  if (t) eq(t.section_type, m.section_type, `tutarlılık: ${m.id} section_type MODALITIES ile aynı`);
}

console.log(`\nŞifa Rehberi PREMIUM V2 harness: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) {
  console.log("FAILURES:");
  for (const f of fails) console.log(" - " + f);
  process.exit(1);
}
console.log("OVERALL: PASS");
