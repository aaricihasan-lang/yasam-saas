/**
 * Klasik Numeroloji · Doğaltaş eşleştirici harness'i (SENTETİK fikstür; ağ / DB / sağlayıcı çağrısı YOK).
 *
 * Çalıştır: npx tsx scripts/numeroloji-klasik/stones/matcher.harness.ts
 */
import { foldStoneLibraryText } from "../../../lib/stone-library/fold";
import { hasHealthClaim } from "../../../lib/stone-library/import/healthLexicon";
import { matchStonesForNumbers, reduceToDigit, STONE_MATCH_DISCLAIMER_TR } from "../../../lib/numeroloji-klasik/stones/matcher";
import { buildStoneNameIndex, compactStoneName, foldStoneName, resolveStoneName } from "../../../lib/numeroloji-klasik/stones/nameIndex";
import { elementKeys, planetKeys } from "../../../lib/numeroloji-klasik/stones/vocab";
import { buildClassicStockIndex, classicStockBadge } from "../../../lib/numeroloji-klasik/stones/stock";
import {
  clearClassicStoneIndexCache,
  loadClassicStoneIndex,
  lookupClassicStockBadges,
  stoneDocToCandidate,
  type ClassicStoneDb,
} from "../../../lib/numeroloji-klasik/stones/libraryAdapter";
import type { StoneCandidate, StoneMatchResult } from "../../../lib/numeroloji-klasik/stones/types";

let failures = 0;
let checks = 0;
function check(ok: boolean, label: string, detail?: unknown): void {
  checks++;
  if (ok) console.log(`✓ ${label}`);
  else {
    failures++;
    console.log(`✗ ${label}${detail !== undefined ? `\n    ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  }
}

// ── Sentetik dizin (gerçek taş verisi DEĞİL; yalnız yapı) ──────────────────────────────────────
const S = (o: Partial<StoneCandidate> & { stoneKey: string; nameTr: string }): StoneCandidate => ({
  nameEn: null, aliases: [], numericalVibration: null, planets: [], chakras: [], elements: [], pairsWith: [], ...o,
});
const INDEX: StoneCandidate[] = [
  S({ stoneKey: "tas-alfa", nameTr: "Alfa Taşı", nameEn: "Alpha Stone", numericalVibration: 2, planets: ["moon"], elements: ["water"], pairsWith: ["tas-beta", "tas-yok"] }),
  S({ stoneKey: "tas-beta", nameTr: "Beta Kuvars", nameEn: "Beta Quartz", numericalVibration: 11, planets: ["Venus & Neptune"], elements: ["air"] }),
  S({ stoneKey: "tas-gama", nameTr: "Gama", nameEn: "Gamma", numericalVibration: 0, planets: ["mercury"], elements: ["Earth/Air/Fire"] }),
  S({ stoneKey: "tas-delta", nameTr: "Işıltı Şeridi", nameEn: "Glow Band", numericalVibration: 5, planets: ["Mercury"], elements: ["All (Earth, Water)"] }),
  S({ stoneKey: "tas-epsilon", nameTr: "İğde Göğü", nameEn: "Oleaster Sky", numericalVibration: [4, 7], planets: ["saturn"] }),
  S({ stoneKey: "tas-zeta", nameTr: "Yosun Akik", nameEn: "Moss Agate", numericalVibration: 2, planets: ["earth"] }),
  S({ stoneKey: "tas-eta", nameTr: "Mavi Dantel Akik", nameEn: "Blue Lace Agate", numericalVibration: 5, planets: ["mercury"] }),
  S({ stoneKey: "tas-teta", nameTr: "Kaplan Gözü", nameEn: "Tigers Eye", numericalVibration: 6, planets: ["sun"] }),
  S({ stoneKey: "tas-iota", nameTr: "Elmas", nameEn: "Diamond", numericalVibration: 3, planets: ["venus"] }),
  S({ stoneKey: "tas-kappa", nameTr: "Ortak Ad", nameEn: "Shared A", numericalVibration: 1 }),
  S({ stoneKey: "tas-lambda", nameTr: "Başka", nameEn: "Other", aliases: ["Ortak Ad"], numericalVibration: 1 }),
];
const deep = (x: unknown) => JSON.parse(JSON.stringify(x));
const strings = (r: StoneMatchResult): string[] => {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk({ ...r, disclaimer: null });
  return out;
};

// ── 1) Katlama / ad dizini ────────────────────────────────────────────────────────────────────
check(foldStoneName === foldStoneLibraryText, "nameIndex katlaması kütüphane katlamasının KENDİSİ (parity)");
check(foldStoneName("IŞILTI ŞERİDİ") === "isilti seridi", "fold: büyük I/Ş/İ", foldStoneName("IŞILTI ŞERİDİ"));
check(foldStoneName("iğde göğü") === "igde gogu" && foldStoneName("İĞDE GÖĞÜ") === "igde gogu", "fold: ğ/Ğ/ö/ü");
check(foldStoneName("  Kaplan-Gözü! ") === "kaplan gozu", "fold: noktalama/boşluk");
check(compactStoneName("Kaplangözü") === compactStoneName("Kaplan Gözü"), "compact: boşluksuz yazım eşit");
const NI = buildStoneNameIndex(INDEX);
const r1 = resolveStoneName(NI, "ışıltı şerİdİ");
check(r1.status === "matched" && r1.entry.stoneKey === "tas-delta", "çözüm: küçük ı + büyük İ karışık", r1);
const r2 = resolveStoneName(NI, "GLOW BAND");
check(r2.status === "matched" && r2.entry.stoneKey === "tas-delta", "çözüm: İngilizce ad");
const r3 = resolveStoneName(NI, "KaplanGözü");
check(r3.status === "matched" && r3.via === "compact", "çözüm: compact yolu", r3);
const r4 = resolveStoneName(NI, "Akik");
check(r4.status === "ambiguous" && r4.candidates.length === 2 && r4.candidates.every((c) => c.via === "partial"), "çözüm: 'Akik' kelime içerme → ambiguous (otomatik seçim yok)", r4);
const r5 = resolveStoneName(NI, "Ortak Ad");
check(r5.status === "ambiguous" && r5.candidates.map((c) => c.stoneKey).sort().join() === "tas-kappa,tas-lambda", "çözüm: aynı ad iki taşta → ambiguous", r5);
check(NI.collisions.some((c) => c.key === "ortak ad"), "çakışma raporu üretilir");
const r6 = resolveStoneName(NI, "Pırlanta");
check(r6.status === "matched" && r6.via === "alias" && r6.entry.stoneKey === "tas-iota", "çözüm: yerel takma ad (Pırlanta → Elmas)", r6);
check(resolveStoneName(NI, "Bilinmeyen Kristal").status === "unmatched", "çözüm: bilinmeyen → unmatched");
check(resolveStoneName(NI, "").status === "unmatched", "çözüm: boş → unmatched");

// ── 2) Sözlük ────────────────────────────────────────────────────────────────────────────────
check(planetKeys("Venus & Neptune").join() === "venus,neptune", "gezegen: bileşik &");
check(planetKeys("Venüs ve Neptün").join() === "venus,neptune", "gezegen: Türkçe bileşik 've'");
check(planetKeys("MERKÜR").join() === "mercury" && planetKeys("Merkur").join() === "mercury", "gezegen: TR büyük harf / şapkasız");
check(planetKeys("Zühal").join() === "saturn", "gezegen: geleneksel Türkçe ad");
check(planetKeys("Vulkan").length === 0, "gezegen: bilinmeyen boş");
check(elementKeys("All (Earth, Water)").join() === "earth,water", "element: 'All' açılmaz, açık yazılanlar alınır");
check(elementKeys("Hava").join() === "air" && elementKeys("ATEŞ").join() === "fire", "element: Türkçe");
check(reduceToDigit(23) === 5 && reduceToDigit(29) === 2 && reduceToDigit(7) === 7, "indirgeme");

// ── 3) Eşleştirici ana senaryo ──────────────────────────────────────────────────────────────
const person = {
  lifePath: { value: 11, type: "master" as const },
  expression: { value: 5, type: "single" as const },
  soulUrge: { value: 2, type: "single" as const },
  personality: { value: 22 },
  birthDay: { value: 23 },
  karmicDebt: [14],
};
const lucky = { gemstones: ["Elmas", "Akik", "Bilinmeyen Kristal", "Kaplangözü"], gemstonesAlt: ["Diamond", "Agate", "Glow Band", "Tigers Eye"], rulingPlanet: "Neptün", element: "Hava" };
const personSnap = deep(person);
const luckySnap = deep(lucky);
const indexSnap = deep(INDEX);
const res = matchStonesForNumbers(person, lucky, INDEX);
check(JSON.stringify(person) === JSON.stringify(personSnap) && JSON.stringify(lucky) === JSON.stringify(luckySnap) && JSON.stringify(INDEX) === JSON.stringify(indexSnap), "girdiler değiştirilmez");
check(res.libraryAvailable === true, "kütüphane var");
const pd = res.providerDirect;
check(pd[0].status === "matched" && pd[0].stoneKey === "tas-iota", "doğrudan: Elmas matched");
check(pd[1].status === "ambiguous" && (pd[1].candidates ?? []).length === 2 && !pd[1].stoneKey, "doğrudan: Akik ambiguous, otomatik seçilmedi", pd[1]);
check(pd[2].status === "matched" && pd[2].via === "alt_lang" && pd[2].stoneKey === "tas-delta", "doğrudan: TR çözülmedi → diğer dil adıyla çözüldü (alt_lang)", pd[2]);
check(pd[3].status === "matched" && pd[3].stoneKey === "tas-teta", "doğrudan: Kaplangözü compact");
const sugg = (k: string) => res.suggestions.find((s) => s.stoneKey === k);
// Usta 11: titreşimi 11 olan taş EXACT; titreşimi 2 olan taş ROOT; asla exact değil.
const beta = sugg("tas-beta");
check(!!beta && beta.reasons.some((r) => r.method === "vibration_exact" && r.numberKey === "lifePath" && r.numberValue === 11), "usta 11: titreşim 11 olan taş exact");
const alfa = sugg("tas-alfa");
const alfaLp = alfa?.reasons.filter((r) => r.numberKey === "lifePath" && r.method.startsWith("vibration"));
check(!!alfaLp && alfaLp.length === 1 && alfaLp[0].method === "vibration_root" && alfaLp[0].root === 2 && alfaLp[0].rootKind === "master", "usta 11 → titreşim 2: YALNIZ vibration_root (exact değil)", alfaLp);
check(!!alfa && alfa.reasons.some((r) => r.method === "vibration_exact" && r.numberKey === "soulUrge" && r.numberValue === 2), "tek basamak 2 (ruh güdüsü) → titreşim 2 exact (ayrı gerekçe)");
check(res.suggestions.every((s) => s.reasons.every((r) => !(r.method === "vibration_exact" && r.numberValue === 11 && r.matched === 2))), "11 hiçbir yerde sessizce 2'ye eşitlenmez");
check(!!alfaLp && /usta sayı/.test(alfaLp[0].explanation) && /birebir eşleşme değildir/.test(alfaLp[0].explanation), "kök açıklaması açıkça türetilmiş olduğunu söyler");
const eps = sugg("tas-epsilon");
check(!!eps && eps.reasons.some((r) => r.method === "vibration_root" && r.numberKey === "personality" && r.root === 4), "usta 22 → kök 4 (çok değerli titreşim [4,7])");
const delta = sugg("tas-delta");
check(!!delta && delta.reasons.some((r) => r.method === "vibration_root" && r.numberKey === "birthDay" && r.rootKind === "compound" && r.root === 5), "bileşik doğum günü 23 → kök 5 (compound etiketiyle)");
check(!!delta && delta.reasons.some((r) => r.method === "vibration_exact" && r.numberKey === "expression"), "ifade 5 → titreşim 5 exact");
check(!res.suggestions.some((s) => s.stoneKey === "tas-gama" && s.reasons.some((r) => r.method.startsWith("vibration"))), "titreşim 0 = bilinmiyor → titreşim eşleşmesine girmez");
check(res.notes.some((n) => /titreşimi bilinmiyor/.test(n)), "bilinmeyen titreşim notu");
check(!!beta && beta.reasons.some((r) => r.method === "planet" && r.matched === "neptune" && /bileşik/.test(r.explanation)), "gezegen: bileşik 'Venus & Neptune' Neptün ile eşleşir ve açıklanır");
check(!!alfa && alfa.reasons.some((r) => r.method === "pairs_with" && r.matched === "tas-iota") === false, "eşlikçi: yalnız doğrudan önerilerin listesinden");
// Elmas'ın eşlikçisi yok; tas-alfa doğrudan değil → beta'ya pairs_with gelmemeli
check(!beta?.reasons.some((r) => r.method === "pairs_with"), "eşlikçi: doğrudan olmayan taşın listesi kullanılmaz");
// Tekilleştirme
const keys = res.suggestions.map((s) => s.stoneKey);
check(new Set(keys).size === keys.length, "tekilleştirme: her taş bir kez");
const groupKeys = res.groups.flatMap((g) => g.items.map((i) => i.stoneKey));
check(new Set(groupKeys).size === groupKeys.length, "tekilleştirme: gruplar arası tekrar yok");
const iota = sugg("tas-iota");
check(iota?.primary === "provider_direct" && res.groups[0].items.some((i) => i.stoneKey === "tas-iota"), "doğrudan eşleşen taş doğrudan grubunda");
check(res.groups.every((g) => g.items.every((i) => i.primary === g.method)), "her öğe kendi birincil grubunda");
check(!res.groups.some((g) => g.method === "element"), "element grubu varsayılan KAPALI");
check(res.notes.some((n) => /Karmik/.test(n)), "karmik sayı notu (eşleşmede kullanılmaz)");
check(res.suggestions.every((s) => s.symbolic === true) && res.disclaimer.symbolic === true && res.disclaimer.text === STONE_MATCH_DISCLAIMER_TR, "sembolik bayrak + uyarı metni");
// Kararlılık
const res2 = matchStonesForNumbers(deep(person), deep(lucky), deep(INDEX));
check(JSON.stringify(res2) === JSON.stringify(res), "kararlı çıktı (aynı girdi → aynı sıra)");
const resRev = matchStonesForNumbers(person, lucky, [...INDEX].reverse());
check(JSON.stringify(resRev.groups.slice(1).map((g) => g.items.map((i) => i.stoneKey))) === JSON.stringify(res.groups.slice(1).map((g) => g.items.map((i) => i.stoneKey))), "türetilmiş gruplar dizin sırasından bağımsız");
// Tavan
const capped = matchStonesForNumbers(person, lucky, INDEX, { perGroupCap: 1, totalCap: 5 });
check(capped.groups.filter((g) => g.method !== "provider_direct").every((g) => g.items.length <= 1) && capped.suggestions.length <= 5 + capped.groups[0].items.length, "tavan: grup ve toplam");
check(capped.groups.some((g) => g.total > g.items.length), "tavan: kesilmeden önceki toplam raporlanır");
// 30.10.2026: Taşlar sekmesi `uncapped` — hiçbir gerçek sonuç kesilmez; tavanlı sonuçla aynı taşlar, aynı sırada, çoğaltma yok.
{
  const full = matchStonesForNumbers(person, lucky, INDEX, { uncapped: true });
  const def = matchStonesForNumbers(person, lucky, INDEX);
  const capped2 = matchStonesForNumbers(person, lucky, INDEX, { perGroupCap: 1, totalCap: 5 });
  check(capped2.groups.some((g) => g.total > g.items.length) && full.groups.some((g) => g.items.length > 1), "senaryo gerçekten kesilen gruplar içerir (test anlamlı)");
  check(full.groups.every((g) => g.total === g.items.length), "uncapped: her grupta total = items (gizli taş yok)", full.groups.map((g) => [g.method, g.items.length, g.total]));
  check(full.groups.every((g) => g.total === (def.groups.find((x) => x.method === g.method)?.total ?? -1)), "uncapped: grup toplamları tavanlı sonuçla aynı (yeni taş uydurulmaz)");
  check(def.groups.every((g) => { const f = full.groups.find((x) => x.method === g.method); return !!f && g.items.every((s, i) => f.items[i]?.stoneKey === s.stoneKey); }), "uncapped: tavanlı liste, tam listenin baş kısmıyla birebir (sıra korunur)");
  const keys = full.suggestions.map((s) => s.stoneKey);
  check(new Set(keys).size === keys.length, "uncapped: aynı taş iki kez yok (her taş tek grupta, gerekçeleri birleşik)");
  check(full.suggestions.length === full.groups.reduce((n, g) => n + g.items.length, 0), "uncapped: öneri sayısı grup toplamlarına eşit");
  check(JSON.stringify(full.providerDirect) === JSON.stringify(def.providerDirect), "uncapped: doğrudan öneriler / belirsiz eşleşmeler aynı (kesinleştirme yok)");
}
// Element isteğe bağlı
const withEl = matchStonesForNumbers(person, lucky, INDEX, { includeElement: true });
const elGroup = withEl.groups.find((g) => g.method === "element");
check(!!elGroup && withEl.suggestions.some((s) => s.reasons.some((r) => r.method === "element" && r.matched === "air")), "element: açıldığında Hava → air eşleşir");
check(!withEl.suggestions.some((s) => s.stoneKey === "tas-delta" && s.reasons.some((r) => r.method === "element")), "element: 'All (Earth, Water)' havaya genişletilmez");

// ── 3b) Varyant / diğer dil önceliği / Ay düğümü / niteleme ─────────────────────────────────
const rv = resolveStoneName(NI, "Sarı Elmas");
check(rv.status === "ambiguous" && rv.candidates.length === 1 && rv.candidates[0].via === "variant", "çözüm: 'Sarı Elmas' → variant adayı (otomatik seçim yok)", rv);
const altWins = matchStonesForNumbers({ lifePath: { value: 5 } }, { gemstones: ["Akik"], gemstonesAlt: ["Glow Band"] }, INDEX);
check(altWins.providerDirect[0].status === "matched" && altWins.providerDirect[0].via === "alt_lang" && altWins.providerDirect[0].stoneKey === "tas-delta", "belirsiz birincil + kesin diğer dil → diğer dil kazanır", altWins.providerDirect[0]);
const node = matchStonesForNumbers({ lifePath: { value: 7 } }, { gemstones: [], rulingPlanet: "Ketu (Güney Düğüm)" }, INDEX);
check(node.notes.some((n) => /Ay düğümü/.test(n)) && !node.suggestions.some((s) => s.reasons.some((r) => r.method === "planet")), "Rahu/Ketu: gezegen eşleşmesi yok + açık not");
const octave = matchStonesForNumbers({ lifePath: { value: 33 } }, { gemstones: [], rulingPlanet: "Venüs (üst oktav)" }, INDEX);
check(octave.suggestions.some((s) => s.stoneKey === "tas-iota" && s.reasons.some((r) => r.method === "planet" && r.matched === "venus")) && octave.notes.some((n) => /niteleme/.test(n)), "niteleme ('üst oktav'): gezegen kullanılır + not");
check(octave.suggestions.some((s) => s.stoneKey === "tas-beta" && s.reasons.some((r) => r.method === "vibration_root" && r.root === 6)) === false && octave.suggestions.some((s) => s.stoneKey === "tas-teta" && s.reasons.some((r) => r.method === "vibration_root" && r.root === 6)), "usta 33 → kök 6");

// ── 4) Kütüphane kapalı (yedek mod)─────────────────────────────────────────────────────────
const off = matchStonesForNumbers(person, lucky, null);
check(off.libraryAvailable === false && off.providerDirect.length === 4 && off.providerDirect.every((p) => p.status === "text_only" && !p.stoneKey), "yedek: doğrudan adlar yalnız metin (bağlantı yok)");
check(off.suggestions.length === 0 && off.groups.every((g) => g.items.length === 0), "yedek: türetilmiş grup yok");
check(off.notes.some((n) => /erişilebilir değil/.test(n)), "yedek: açıklama notu");
const offEmpty = matchStonesForNumbers(person, null, []);
check(offEmpty.providerDirect.length === 0 && offEmpty.suggestions.length === 0, "yedek: lucky yok + dizin boş → çökmez");

// ── 5) Metin güvenliği ──────────────────────────────────────────────────────────────────────
const evil = matchStonesForNumbers(person, { gemstones: ["RoxyAPI Kristali", "Elmas", "https://example.invalid/x"], rulingPlanet: "Venüs" }, INDEX);
const all = [...strings(res), ...strings(withEl), ...strings(off), ...strings(evil)];
check(!all.some((s) => /\broxy/i.test(s) || /astrology-?api/i.test(s)), "çıktıda sağlayıcı adı yok", all.filter((s) => /roxy/i.test(s)));
check(evil.providerDirect.length === 1 && evil.notes.some((n) => /güvenlik/.test(n)), "sağlayıcı adı / URL içeren girdi düşürülür");
const textOut = [...res.groups.flatMap((g) => [g.label, g.description]), ...res.suggestions.flatMap((s) => s.reasons.map((r) => r.explanation)), ...res.notes, ...withEl.suggestions.flatMap((s) => s.reasons.map((r) => r.explanation)), ...off.notes];
const medical = textOut.filter((t) => hasHealthClaim(t) || /\b(tedavi|şifa|iyileştir|hastalık|heal|cure)/i.test(t));
check(medical.length === 0, "üretilen metinlerde tıbbi iddia yok", medical);
check(/tıbbi tanı, tedavi/.test(res.disclaimer.text), "uyarı metni tıbbi olmadığını söyler");

// ── 6) Geçersiz sayılar ─────────────────────────────────────────────────────────────────────
const bad = matchStonesForNumbers({ lifePath: { value: 0 }, birthDay: { value: 40 }, expression: { value: 7, type: "master" } }, null, INDEX);
check(bad.notes.filter((n) => /geçersiz/.test(n)).length === 2, "geçersiz sayılar not edilir ve atlanır");
check(bad.notes.some((n) => /usta sayı değil/.test(n)), "yanlış 'master' işareti not edilir");
const elevenSingle = matchStonesForNumbers({ lifePath: { value: 11, type: "single" } }, null, INDEX);
check(!elevenSingle.suggestions.some((s) => s.reasons.some((r) => r.method === "vibration_exact" && r.matched === 2)) &&
  elevenSingle.suggestions.some((s) => s.reasons.some((r) => r.method === "vibration_root" && r.root === 2)), "11 'single' işaretli gelse bile kök olarak etiketlenir");

// ── 7) Stok rozeti ──────────────────────────────────────────────────────────────────────────
const sidx = buildClassicStockIndex([{ name: "Elmas", adet: 2 }, { name: " ELMAS ", adet: 3 }, { name: "Mor Akik", adet: 1 }, { name: "İğde Göğü", adet: 0 }]);
check(classicStockBadge("elmas", sidx).adet === 5 && classicStockBadge("elmas", sidx).label === "Stokta · 5 adet", "stok: normalize + toplama");
check(!classicStockBadge("Akik", sidx).stocked, "stok: içerme yok (Akik ≠ Mor Akik)");
check(classicStockBadge("iğde göğü", sidx).label === "Stokta", "stok: adet 0 → 'Stokta'");

// ── 8) Adaptör (sahte DB; ağ yok) ───────────────────────────────────────────────────────────
const VIEWER = "00000000-0000-4000-8000-000000000001";
type Call = { fn: string; args: Record<string, unknown> };
function fakeDb(opts: { allowed: boolean; docs: Record<string, unknown>; rpcError?: string; inv?: unknown[]; invError?: boolean }) {
  const calls: Call[] = [];
  const tableOps: string[] = [];
  const db: ClassicStoneDb = {
    rpc(fn, args) {
      calls.push({ fn, args });
      if (opts.rpcError === fn) return Promise.resolve({ data: null, error: { message: "x" } });
      if (fn === "stone_library_viewer_allowed") return Promise.resolve({ data: opts.allowed, error: null });
      if (fn === "stone_library_expert_search") {
        const slugs = Object.keys(opts.docs).sort();
        const off = Number(args.p_offset);
        const lim = Number(args.p_limit);
        const items = slugs.slice(off, off + lim).map((slug) => ({ slug, name_tr: (opts.docs[slug] as { name_tr: string }).name_tr, name_en: null, facets: {} }));
        return Promise.resolve({ data: { total: slugs.length, limit: lim, offset: off, items }, error: null });
      }
      if (fn === "stone_library_expert_stone") return Promise.resolve({ data: [{ stone_library_expert_stone: opts.docs[String(args.p_slug)] ?? null }], error: null });
      return Promise.resolve({ data: null, error: { message: "unknown" } });
    },
    from(table) {
      tableOps.push(`from:${table}`);
      return {
        select(cols) {
          tableOps.push(`select:${cols}`);
          return {
            eq(col, val) {
              tableOps.push(`eq:${col}=${String(val)}`);
              return {
                order() {
                  return { range: (f: number, t: number) => Promise.resolve(opts.invError ? { data: null, error: { m: 1 } } : { data: (opts.inv ?? []).slice(f, t + 1), error: null }) };
                },
              };
            },
          };
        },
      };
    },
  };
  return { db, calls, tableOps };
}
const doc = (slug: string, name_tr: string, extra: Record<string, unknown> = {}) => ({
  slug, name_tr, name_en: null, aliases: [], facets: {}, pairings: [], sections: [], health_notice: {}, medical_notice: {}, display: {}, updated_at: "", ...extra,
});
const DOCS: Record<string, unknown> = {
  "alfa-tasi": doc("alfa-tasi", "Alfa Taşı", {
    name_en: "Alpha Stone",
    aliases: [{ lang: "tr", name: "Alfacık" }],
    facets: { planet: [{ key: "moon", label_tr: "Ay", label_en: "Moon" }], numerical_vibration: [2], element: [{ key: "water", label_tr: "Su", label_en: "Water" }] },
    pairings: [{ slug: "beta-kuvars", name_tr: "Beta Kuvars", name_en: null }],
    // iç alan sızdırma denemesi: beyaz liste düşürür
    source_key: "gizli", id: "11111111-1111-4111-8111-111111111111",
  }),
  "beta-kuvars": doc("beta-kuvars", "Beta Kuvars", { facets: { numerical_vibration: [11] } }),
  "sizinti-tasi": doc("sizinti-tasi", "Sızıntı RoxyAPI Taşı"),
};
async function adapterTests(): Promise<void> {
  clearClassicStoneIndexCache();
  const offFlag = fakeDb({ allowed: true, docs: DOCS });
  const a = await loadClassicStoneIndex({ db: offFlag.db, viewerId: VIEWER, env: {} });
  check(!a.available && a.reason === "library_disabled" && offFlag.calls.length === 0, "adaptör: bayrak kapalı → DB'ye gitmeden library_disabled");
  const a2 = await loadClassicStoneIndex({ db: offFlag.db, viewerId: VIEWER, env: { STONE_LIBRARY_ENABLED: "TRUE" } });
  check(!a2.available && a2.reason === "library_disabled", "adaptör: bayrak yalnız tam 'true'");
  const noAcc = fakeDb({ allowed: false, docs: DOCS });
  const b = await loadClassicStoneIndex({ db: noAcc.db, viewerId: VIEWER, env: { STONE_LIBRARY_ENABLED: "true" } });
  check(!b.available && b.reason === "no_access" && noAcc.calls.length === 1, "adaptör: yetki yok → no_access (başka RPC yok)");
  const badId = await loadClassicStoneIndex({ db: noAcc.db, viewerId: "x", env: { STONE_LIBRARY_ENABLED: "true" } });
  check(!badId.available && badId.reason === "no_access", "adaptör: geçersiz kullanıcı kimliği");
  const err = fakeDb({ allowed: true, docs: DOCS, rpcError: "stone_library_expert_stone" });
  const c = await loadClassicStoneIndex({ db: err.db, viewerId: VIEWER, env: { STONE_LIBRARY_ENABLED: "true" }, useCache: false });
  check(!c.available && c.reason === "unavailable", "adaptör: RPC hatası → unavailable (yarım dizin yok)");
  const ok = fakeDb({ allowed: true, docs: DOCS });
  const d = await loadClassicStoneIndex({ db: ok.db, viewerId: VIEWER, env: { STONE_LIBRARY_ENABLED: "true" } });
  check(d.available === true, "adaptör: dizin kuruldu");
  if (d.available) {
    check(d.index.length === 2 && d.skipped === 1, "adaptör: sızıntılı kart dizine alınmaz", d.index.map((x) => x.stoneKey));
    const alfaC = d.index.find((x) => x.stoneKey === "alfa-tasi");
    check(!!alfaC && alfaC.planets.join() === "moon" && JSON.stringify(alfaC.numericalVibration) === "[2]" && alfaC.pairsWith?.join() === "beta-kuvars" && alfaC.aliases.join() === "Alfacık", "adaptör: facet → aday", alfaC);
    const ser = JSON.stringify(d.index);
    check(!/source_key|gizli|11111111-1111/.test(ser), "adaptör: iç alan / uuid dizine geçmez");
    const m = matchStonesForNumbers({ lifePath: { value: 11 } }, { gemstones: ["Alfacık"], rulingPlanet: "Ay" }, d.index);
    check(m.providerDirect[0].status === "matched" && m.suggestions.some((s) => s.stoneKey === "beta-kuvars" && s.reasons.some((r) => r.method === "pairs_with")), "adaptör dizini → eşleştirici: takma ad + eşlikçi");
  }
  check(ok.calls.every((c) => c.fn.startsWith("stone_library_viewer_allowed") || c.fn === "stone_library_expert_search" || c.fn === "stone_library_expert_stone"), "adaptör: yalnız uzman okuma RPC'leri");
  const cached = fakeDb({ allowed: true, docs: {} });
  const e = await loadClassicStoneIndex({ db: cached.db, viewerId: VIEWER, env: { STONE_LIBRARY_ENABLED: "true" } });
  check(e.available === true && cached.calls.length === 1, "adaptör: önbellek (erişim yine her çağrıda doğrulanır)");
  const revoked = fakeDb({ allowed: false, docs: {} });
  const f = await loadClassicStoneIndex({ db: revoked.db, viewerId: VIEWER, env: { STONE_LIBRARY_ENABLED: "true" } });
  check(!f.available && f.reason === "no_access", "adaptör: önbellek varken yetki iptali → no_access");
  clearClassicStoneIndexCache();
  check(stoneDocToCandidate({ slug: "Geçersiz Slug", name_tr: "x" }) === null, "adaptör: geçersiz slug reddedilir");

  // Stok: yalnız select + tenant filtresi
  const inv = fakeDb({ allowed: true, docs: {}, inv: [{ name: "Alfa Taşı", adet: 4 }, { name: "Elmas", adet: 0 }] });
  const badges = await lookupClassicStockBadges(inv.db, "tenant-1", ["alfa taşı", "Elmas", "Yok"]);
  check(badges[0].label === "Stokta · 4 adet" && badges[1].label === "Stokta" && !badges[2].stocked, "stok adaptörü: rozetler", badges);
  check(inv.tableOps.join("|") === "from:dogaltas_inventory|select:name, adet|eq:tenant_id=tenant-1", "stok adaptörü: yalnız SELECT + tenant eşitliği", inv.tableOps);
  const invErr = fakeDb({ allowed: true, docs: {}, invError: true });
  const eb = await lookupClassicStockBadges(invErr.db, "tenant-1", ["Elmas"]);
  check(eb.length === 1 && !eb[0].stocked, "stok adaptörü: okuma hatası → rozet yok");
}

adapterTests()
  .catch((e) => check(false, "adaptör testleri istisnasız tamamlanır", String(e)))
  .finally(() => {
    console.log(`\n${checks - failures}/${checks} ✓ · ${failures} ✗`);
    if (failures > 0) process.exit(1);
  });
