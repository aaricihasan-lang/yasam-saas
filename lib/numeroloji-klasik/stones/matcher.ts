// Klasik Numeroloji · Numeroloji → Doğaltaş öneri eşleştiricisi (SAF; IO yok; girdiler DEĞİŞTİRİLMEZ).
//
// Gruplar (öncelik sırası; bir taş yalnız EN GÜÇLÜ gerekçesinin grubunda listelenir, tüm gerekçeleri `reasons`ta):
//   1) provider_direct  — /chart luckyAssociations.gemstones (sağlayıcının DOĞRUDAN verdiği adlar).
//   2) vibration_exact  — taşın sayısal titreşimi === kişinin sayısı (yalnız 1–9 ve verideki usta değerler).
//   3) vibration_root   — usta sayı (11/22/33) → kök (2/4/6) ya da bileşik sayı (ör. doğum günü 23 → 5). TÜRETİLMİŞTİR,
//                         exact ile ASLA birleştirilmez ve açıklamada açıkça belirtilir.
//   4) planet           — taşın gezegenleri ∋ Yaşam Yolu'nun yönetici gezegeni (bileşik "Venus & Neptune" açılır).
//   5) pairs_with       — doğrudan önerilen taşların "birlikte kullanılır" listesi.
//   6) element          — (varsayılan KAPALI) taş elementleri ∋ luckyAssociations.element.
// Çakra eşleşmesi YOK: sayı → çakra ilişkisini veren bir veri alanı bulunmuyor (uydurulmaz).
// Titreşim 0 = "bilinmiyor" → dışlanır.

import { buildStoneNameIndex, resolveStoneName, type StoneNameIndex } from "./nameIndex";
import type {
  ProviderDirectItem,
  StoneCandidate,
  StoneLuckyAssociations,
  StoneMatchGroup,
  StoneMatchMethod,
  StoneMatchOptions,
  StoneMatchResult,
  StoneNumberKey,
  StonePersonNumbers,
  StoneSuggestion,
  StoneSuggestionReason,
} from "./types";
import { ELEMENT_LABEL_TR, PLANET_LABEL_TR, elementKeys, isCompoundValue, planetKeys, splitCompoundValue, type ElementKey, type PlanetKey } from "./vocab";

export const STONE_MATCH_DISCLAIMER_TR =
  "Taş önerileri numerolojinin sembolik ve geleneksel yorumlarına dayanır; tıbbi tanı, tedavi ya da sağlık önerisi değildir ve bir uzman değerlendirmesinin yerine geçmez.";

export const STONE_NUMBER_LABEL_TR: Readonly<Record<StoneNumberKey, string>> = Object.freeze({
  lifePath: "Yaşam Yolu",
  expression: "İfade",
  soulUrge: "Ruh Güdüsü",
  personality: "Kişilik",
  birthDay: "Doğum Günü",
});

const NUMBER_ORDER: readonly StoneNumberKey[] = ["lifePath", "expression", "soulUrge", "personality", "birthDay"];

export const STONE_GROUP_ORDER: readonly StoneMatchMethod[] = [
  "provider_direct",
  "vibration_exact",
  "vibration_root",
  "planet",
  "pairs_with",
  "element",
];

export const STONE_GROUP_TEXT_TR: Readonly<Record<StoneMatchMethod, { label: string; description: string }>> = Object.freeze({
  provider_direct: {
    label: "Klasik yöntemin doğrudan önerdiği taşlar",
    description: "Yaşam Yolu sayınızın uğurlu ilişkiler listesinde adıyla geçen taşlar.",
  },
  vibration_exact: {
    label: "Sayısal titreşimi birebir eşleşen taşlar",
    description: "Taşın geleneksel sayısal titreşimi, çekirdek sayılarınızdan biriyle aynıdır.",
  },
  vibration_root: {
    label: "Kök sayı üzerinden türetilen taşlar",
    description: "Usta ya da bileşik sayılarınızın tek basamaklı kökü üzerinden türetilmiştir; birebir eşleşme değildir.",
  },
  planet: {
    label: "Yönetici gezegenle ilişkili taşlar",
    description: "Taşın geleneksel gezegen ilişkisi, Yaşam Yolu sayınızın yönetici gezegeniyle aynıdır.",
  },
  pairs_with: {
    label: "Doğrudan önerilerle birlikte kullanılan taşlar",
    description: "Doğrudan önerilen taşların geleneksel eşlikçileri.",
  },
  element: {
    label: "Uğurlu elementle ilişkili taşlar",
    description: "Taşın geleneksel element ilişkisi, uğurlu elementinizle aynıdır.",
  },
});

/** Rahu / Ketu (Ay düğümleri) — gezegen sözlüğünde yok; ayrı not üretilir. */
const LUNAR_NODE_RE = /\b(rahu|ketu)\b|d[uü]ğ[uü]m|\bnode\b/i;
const MASTER_ROOT: Readonly<Record<number, number>> = Object.freeze({ 11: 2, 22: 4, 33: 6 });
const DEFAULT_PER_GROUP = 6;
const DEFAULT_TOTAL = 20;
/** Sağlayıcı / alan adı / API yolu sızıntısı (girdi metinlerinden çıktıya taşınmaz). */
const UNSAFE_TEXT = [/\broxy/i, /\bastrology-?api/i, /\/api\/v\d/i, /https?:\/\//i, /\bapi[_-]?key\b/i];

function isSafeText(v: string): boolean {
  return !UNSAFE_TEXT.some((re) => re.test(v));
}

function digitSum(n: number): number {
  let s = 0;
  for (const ch of String(Math.abs(Math.trunc(n)))) s += Number(ch);
  return s;
}

/** Bileşik sayıyı tek basamağa indirger (usta sayılarda DURMAZ — usta sayılar ayrıca ele alınır). */
export function reduceToDigit(n: number): number {
  let v = Math.abs(Math.trunc(n));
  while (v > 9) v = digitSum(v);
  return v;
}

function vibrationsOf(c: StoneCandidate): number[] {
  const raw = c.numericalVibration;
  const list = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  const out: number[] = [];
  for (const v of list as unknown[]) {
    if (typeof v === "number" && Number.isInteger(v) && v > 0 && !out.includes(v)) out.push(v);
  }
  return out;
}

function hasUnknownVibration(c: StoneCandidate): boolean {
  return vibrationsOf(c).length === 0;
}

function stonePlanets(c: StoneCandidate): { keys: PlanetKey[]; compound: string | null } {
  const keys: PlanetKey[] = [];
  let compound: string | null = null;
  for (const p of Array.isArray(c.planets) ? c.planets : []) {
    if (typeof p !== "string") continue;
    const ks = planetKeys(p);
    if (ks.length > 1 || isCompoundValue(p)) compound = ks.map((k) => PLANET_LABEL_TR[k]).join(" & ");
    for (const k of ks) if (!keys.includes(k)) keys.push(k);
  }
  if (!compound && keys.length > 1) compound = keys.map((k) => PLANET_LABEL_TR[k]).join(" & ");
  return { keys, compound };
}

function stoneElements(c: StoneCandidate): ElementKey[] {
  const out: ElementKey[] = [];
  for (const e of Array.isArray(c.elements) ? c.elements : []) {
    if (typeof e !== "string") continue;
    for (const k of elementKeys(e)) if (!out.includes(k)) out.push(k);
  }
  return out;
}

type NumberPlan = { key: StoneNumberKey; value: number; kind: "single" | "master" | "compound"; root: number | null };

function planNumbers(person: StonePersonNumbers, notes: string[]): NumberPlan[] {
  const out: NumberPlan[] = [];
  for (const key of NUMBER_ORDER) {
    const inp = person?.[key];
    if (!inp) continue;
    const v = inp.value;
    const max = key === "birthDay" ? 31 : 33;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > max) {
      notes.push(`${STONE_NUMBER_LABEL_TR[key]} sayısı geçersiz olduğu için taş eşleştirmesinde kullanılmadı.`);
      continue;
    }
    if (MASTER_ROOT[v] !== undefined) out.push({ key, value: v, kind: "master", root: MASTER_ROOT[v] });
    else if (v <= 9) out.push({ key, value: v, kind: "single", root: null });
    else out.push({ key, value: v, kind: "compound", root: reduceToDigit(v) });
    if (inp.type === "master" && MASTER_ROOT[v] === undefined) {
      notes.push(`${STONE_NUMBER_LABEL_TR[key]} ${v} usta sayı olarak işaretlenmiş ancak usta sayı değil; değerin kendisi kullanıldı.`);
    }
  }
  return out;
}

type Acc = { cand: StoneCandidate; reasons: StoneSuggestionReason[]; firstSeen: number };

function reasonKey(r: StoneSuggestionReason): string {
  return [r.method, r.numberKey ?? "", r.numberValue ?? "", r.matched ?? "", r.root ?? ""].join("|");
}

function displayName(c: { nameTr: string }): string {
  return c.nameTr;
}

/**
 * Ana giriş. `index` null/boş ise kütüphane kapalı kabul edilir (yedek mod): doğrudan öneriler yalnız METİN
 * olarak döner, türetilmiş gruplar boştur.
 */
export function matchStonesForNumbers(
  person: StonePersonNumbers,
  lucky: StoneLuckyAssociations | null | undefined,
  index: readonly StoneCandidate[] | null | undefined,
  options: StoneMatchOptions = {},
): StoneMatchResult {
  const notes: string[] = [];
  const perGroup = Math.max(1, Math.min(50, Math.trunc(options.perGroupCap ?? DEFAULT_PER_GROUP)));
  const totalCap = Math.max(1, Math.min(200, Math.trunc(options.totalCap ?? DEFAULT_TOTAL)));
  const includePairs = options.includePairs !== false;
  const includeElement = options.includeElement === true;
  const stones = Array.isArray(index) ? index.filter((s) => s && typeof s.stoneKey === "string" && s.stoneKey.length > 0) : [];
  const libraryAvailable = stones.length > 0;
  const byKey = new Map<string, StoneCandidate>();
  for (const s of stones) if (!byKey.has(s.stoneKey)) byKey.set(s.stoneKey, s);

  // ── 1) Doğrudan öneriler ────────────────────────────────────────────────────────────────────
  const gems = Array.isArray(lucky?.gemstones) ? lucky!.gemstones!.filter((g): g is string => typeof g === "string" && g.trim().length > 0) : [];
  const alt = Array.isArray(lucky?.gemstonesAlt) ? lucky!.gemstonesAlt! : [];
  const nameIndex: StoneNameIndex | null = libraryAvailable ? buildStoneNameIndex(stones) : null;
  const providerDirect: ProviderDirectItem[] = [];
  let droppedUnsafe = 0;
  gems.forEach((g, i) => {
    const input = g.trim();
    if (!isSafeText(input)) {
      droppedUnsafe++;
      return;
    }
    if (!nameIndex) {
      providerDirect.push({ input, status: "text_only" });
      return;
    }
    let res = resolveStoneName(nameIndex, input);
    let usedAlt = false;
    const altName = typeof alt[i] === "string" ? alt[i].trim() : "";
    // Diğer dildeki ad: birincil ad kesin çözülmediyse denenir. Kesin eşleşme kazanır; iki taraf da belirsizse
    // aday kümeleri birleştirilir (yine otomatik seçim yok).
    if (res.status !== "matched" && altName && isSafeText(altName)) {
      const r2 = resolveStoneName(nameIndex, altName);
      if (r2.status === "matched" || (r2.status === "ambiguous" && res.status === "unmatched")) {
        res = r2;
        usedAlt = true;
      } else if (r2.status === "ambiguous" && res.status === "ambiguous") {
        const seen = new Set(res.candidates.map((c) => c.stoneKey));
        res = { status: "ambiguous", candidates: [...res.candidates, ...r2.candidates.filter((c) => !seen.has(c.stoneKey))].slice(0, 8) };
      }
    }
    if (res.status === "matched") {
      providerDirect.push({ input, status: "matched", stoneKey: res.entry.stoneKey, nameTr: res.entry.nameTr, via: usedAlt ? "alt_lang" : res.via });
    } else if (res.status === "ambiguous") {
      providerDirect.push({
        input,
        status: "ambiguous",
        candidates: res.candidates.map((c) => ({ stoneKey: c.stoneKey, nameTr: c.nameTr, nameEn: c.nameEn, via: c.via })),
        ...(usedAlt ? { via: "alt_lang" as const } : {}),
      });
    } else {
      providerDirect.push({ input, status: "unmatched" });
    }
  });
  if (droppedUnsafe > 0) notes.push(`${droppedUnsafe} öneri adı güvenlik nedeniyle gösterilmedi.`);
  if (!libraryAvailable) {
    notes.push("Taş kütüphanesi bu hesapta erişilebilir değil; klasik yöntemin önerdiği taş adları yalnız metin olarak gösterilir ve türetilmiş eşleşmeler hesaplanmaz.");
  }
  const unmatchedCount = providerDirect.filter((p) => p.status === "unmatched").length;
  if (unmatchedCount > 0) notes.push(`${unmatchedCount} önerilen taş adı kütüphanede bulunamadı; adı metin olarak gösterilir.`);
  const ambiguousCount = providerDirect.filter((p) => p.status === "ambiguous").length;
  if (ambiguousCount > 0) notes.push(`${ambiguousCount} önerilen taş adı birden çok kütüphane taşına uyuyor; otomatik seçim yapılmadı.`);

  const karmic = [...(person?.karmicDebt ?? []), ...(person?.karmicLessons ?? [])];
  if (karmic.length > 0) notes.push("Karmik sayılar için taş verisinde bir karşılık bulunmadığından taş eşleştirmesinde kullanılmadı.");

  const acc = new Map<string, Acc>();
  let seq = 0;
  const add = (cand: StoneCandidate, r: StoneSuggestionReason) => {
    const a = acc.get(cand.stoneKey) ?? { cand, reasons: [], firstSeen: seq++ };
    if (!a.reasons.some((x) => reasonKey(x) === reasonKey(r))) a.reasons.push(r);
    acc.set(cand.stoneKey, a);
  };

  const lifePathValue = person?.lifePath?.value;
  for (const p of providerDirect) {
    if (p.status !== "matched" || !p.stoneKey) continue;
    const cand = byKey.get(p.stoneKey);
    if (!cand) continue;
    add(cand, {
      method: "provider_direct",
      numberKey: typeof lifePathValue === "number" ? "lifePath" : undefined,
      numberValue: typeof lifePathValue === "number" ? lifePathValue : undefined,
      explanation:
        typeof lifePathValue === "number"
          ? `Klasik yöntemin Yaşam Yolu ${lifePathValue} için verdiği uğurlu taşlar listesinde adıyla geçer.`
          : "Klasik yöntemin uğurlu taşlar listesinde adıyla geçer.",
    });
  }

  if (libraryAvailable) {
    // ── 2–3) Titreşim ─────────────────────────────────────────────────────────────────────────
    const plans = planNumbers(person, notes);
    const unknownVib = stones.filter(hasUnknownVibration).length;
    if (unknownVib > 0) notes.push(`${unknownVib} taşın sayısal titreşimi bilinmiyor; bu taşlar titreşim eşleştirmesine alınmadı.`);
    for (const plan of plans) {
      const label = STONE_NUMBER_LABEL_TR[plan.key];
      for (const cand of stones) {
        const vibs = vibrationsOf(cand);
        if (vibs.includes(plan.value)) {
          add(cand, {
            method: "vibration_exact",
            numberKey: plan.key,
            numberValue: plan.value,
            matched: plan.value,
            explanation: `${label} sayınız ${plan.value}; taşın geleneksel sayısal titreşimi de ${plan.value}.`,
          });
        } else if (plan.root !== null && vibs.includes(plan.root)) {
          add(cand, {
            method: "vibration_root",
            numberKey: plan.key,
            numberValue: plan.value,
            matched: plan.root,
            root: plan.root,
            rootKind: plan.kind === "master" ? "master" : "compound",
            explanation:
              plan.kind === "master"
                ? `${label} sayınız ${plan.value} bir usta sayıdır. Taşın titreşimi ${plan.root}; bu öneri ${plan.value} sayısının kökü ${plan.root} üzerinden türetilmiştir ve ${plan.value} ile birebir eşleşme değildir.`
                : `${label} sayınız ${plan.value}; tek basamaklı kökü ${plan.root}. Taşın titreşimi ${plan.root}; bu öneri indirgeme üzerinden türetilmiştir.`,
          });
        }
      }
    }

    // ── 4) Gezegen ────────────────────────────────────────────────────────────────────────────
    const rulingRaw = typeof lucky?.rulingPlanet === "string" ? lucky.rulingPlanet.trim() : "";
    const ruling = planetKeys(rulingRaw);
    if (rulingRaw && ruling.length === 0) {
      notes.push(
        LUNAR_NODE_RE.test(rulingRaw)
          ? "Yönetici olarak bir Ay düğümü (Kuzey/Güney Düğüm) verilmiş; taş verisinde düğüm ilişkisi bulunmadığından gezegen eşleştirmesi yapılmadı."
          : "Yönetici gezegen tanınmadı; gezegen eşleştirmesi yapılmadı.",
      );
    }
    // Ek niteleme ("Venüs (üst oktav)") açıklamada korunur; gezegen anahtarı yalnız tanınan parçadan gelir.
    const rulingQualified = ruling.length > 0 && splitCompoundValue(rulingRaw).length > ruling.length && isSafeText(rulingRaw) ? rulingRaw : null;
    if (rulingQualified) notes.push(`Yönetici gezegen niteleme içeriyor ("${rulingQualified}"); eşleştirmede yalnız gezegenin kendisi kullanıldı.`);
    for (const pk of ruling) {
      for (const cand of stones) {
        const { keys, compound } = stonePlanets(cand);
        if (!keys.includes(pk)) continue;
        add(cand, {
          method: "planet",
          numberKey: typeof lifePathValue === "number" ? "lifePath" : undefined,
          numberValue: typeof lifePathValue === "number" ? lifePathValue : undefined,
          matched: pk,
          explanation: compound
            ? `Yaşam Yolu sayınızın yönetici gezegeni ${PLANET_LABEL_TR[pk]}; taşın geleneksel gezegen ilişkisi bileşiktir (${compound}) ve ${PLANET_LABEL_TR[pk]} içerir.`
            : `Yaşam Yolu sayınızın yönetici gezegeni ${PLANET_LABEL_TR[pk]}; taşın geleneksel gezegen ilişkisi de ${PLANET_LABEL_TR[pk]}.`,
        });
      }
    }

    // ── 5) Eşlikçi taşlar ─────────────────────────────────────────────────────────────────────
    if (includePairs) {
      for (const p of providerDirect) {
        if (p.status !== "matched" || !p.stoneKey) continue;
        const src = byKey.get(p.stoneKey);
        for (const pk of Array.isArray(src?.pairsWith) ? src!.pairsWith! : []) {
          const cand = byKey.get(pk);
          if (!cand || cand.stoneKey === p.stoneKey) continue;
          add(cand, {
            method: "pairs_with",
            matched: src!.stoneKey,
            explanation: `Doğrudan önerilen ${displayName(src!)} taşıyla geleneksel olarak birlikte kullanılan taşlar arasında geçer.`,
          });
        }
      }
    }

    // ── 6) Element (isteğe bağlı) ─────────────────────────────────────────────────────────────
    if (includeElement) {
      for (const ek of elementKeys(lucky?.element ?? null)) {
        for (const cand of stones) {
          if (!stoneElements(cand).includes(ek)) continue;
          add(cand, {
            method: "element",
            matched: ek,
            explanation: `Uğurlu elementiniz ${ELEMENT_LABEL_TR[ek]}; taşın geleneksel element ilişkileri arasında ${ELEMENT_LABEL_TR[ek]} yer alır.`,
          });
        }
      }
    }
  }

  // ── Tekilleştirme + gruplama ───────────────────────────────────────────────────────────────
  const rank = (m: StoneMatchMethod) => STONE_GROUP_ORDER.indexOf(m);
  const numRank = (r: StoneSuggestionReason) => (r.numberKey ? NUMBER_ORDER.indexOf(r.numberKey) : NUMBER_ORDER.length);
  const directOrder = new Map(providerDirect.filter((p) => p.stoneKey).map((p, i) => [p.stoneKey!, i]));
  const all: StoneSuggestion[] = [...acc.values()].map((a) => {
    const reasons = [...a.reasons].sort((x, y) => rank(x.method) - rank(y.method) || numRank(x) - numRank(y));
    return { stoneKey: a.cand.stoneKey, nameTr: a.cand.nameTr, nameEn: a.cand.nameEn ?? null, primary: reasons[0].method, reasons, symbolic: true as const };
  });

  const groups: StoneMatchGroup[] = [];
  const suggestions: StoneSuggestion[] = [];
  for (const method of STONE_GROUP_ORDER) {
    if (method === "element" && !includeElement) continue;
    if (method === "pairs_with" && !includePairs) continue;
    const items = all
      .filter((s) => s.primary === method)
      .sort((a, b) => {
        if (method === "provider_direct") return (directOrder.get(a.stoneKey) ?? 0) - (directOrder.get(b.stoneKey) ?? 0);
        return (
          b.reasons.length - a.reasons.length ||
          numRank(a.reasons[0]) - numRank(b.reasons[0]) ||
          a.nameTr.localeCompare(b.nameTr, "tr") ||
          (a.stoneKey < b.stoneKey ? -1 : a.stoneKey > b.stoneKey ? 1 : 0)
        );
      });
    const room = Math.max(0, totalCap - suggestions.length);
    // Doğrudan öneriler sağlayıcı verisidir: kesilmez (en çok birkaç ad). Türetilmiş gruplar grup + toplam tavanına tabidir.
    const cap = method === "provider_direct" ? items.length : Math.min(perGroup, room);
    const kept = items.slice(0, cap);
    suggestions.push(...kept);
    groups.push({ method, ...STONE_GROUP_TEXT_TR[method], items: kept, total: items.length });
  }

  return {
    libraryAvailable,
    providerDirect,
    groups,
    suggestions,
    notes,
    disclaimer: { symbolic: true, text: STONE_MATCH_DISCLAIMER_TR },
  };
}
