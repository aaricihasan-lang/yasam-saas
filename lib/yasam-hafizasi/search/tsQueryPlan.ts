/**
 * Yaşam Hafızası™ — search_tsv tsquery Planı (Sprint 2 / S2.17).
 *
 * S2.15 Concept Set + S2.16 Dictionary Expansion çıktısını (`readonly Concept[]`) PostgreSQL
 * full-text search için **güvenli, deterministik bir tsquery planına** çevirir
 * (kaynak: docs/yasam-hafizasi/04-phase-2-fast-search.md §3). Saf/DB'siz/yan-etkisiz.
 *
 * SÖZLEŞME (kilitli):
 *   - Tek kelimeli concept → prefix (`term:*`); çok kelimeli concept → exact phrase
 *     (`(t1 <-> t2 …)`). **Phrase'in HİÇBİR token'ına prefix EKLENMEZ** (KARAR 1).
 *   - Clause fragment'ları **giriş sırasıyla** `" | "` (OR) üzerinden birleşir.
 *   - PostgreSQL text-search **config = `simple`** (DB trigger `to_tsvector('simple',
 *     unaccent(...))` ile simetrik); hedef kolon **`search_tsv`**.
 *   - **Query güvenliği:** ham girdi tsquery'ye doğrudan eklenmez. Her lexeme burada yeniden
 *     `^[a-z0-9]+$` allowlist'inden geçer; tek geçersiz lexeme → o concept clause'u **tamamen
 *     atlanır**. Operatörler (`:*`, `<->`, `|`, `(`, `)`) YALNIZ koddaki sabitlerden gelir;
 *     kullanıcı/concept içeriğinden operatör kabul edilmez. SQL üretimi/interpolation/DB çağrısı YOK.
 *   - **Fail-safe:** boş/geçersiz/bozuk öğeler atlanır; hepsi elenirse `clauses:[]`,
 *     `tsquery:""`, `isEmpty:true`. **Asla throw etmez.**
 *   - **Dedup:** yalnız serializer savunması — aynı güvenli fragment tekrar oluşursa ilk görünüm
 *     korunur, sonrakiler atlanır (giriş sırası + ilk clause `origin`'i korunur). S2.15/S2.16
 *     semantik dedup'ı YENİDEN uygulanmaz; term üzerinden yeniden canonicalizasyon YOK.
 *   - **Immutability:** plan + `clauses` + her `TsQueryClause` `Object.freeze`; her çağrı taze;
 *     girdi (`concepts`/`Concept`) mutasyonsuz; modül-seviyesi paylaşılan mutable state YOK.
 *   - **Kapsam dışı:** `candidateLimit`/`YH_CANDIDATE_LIMIT` · `ts_rank`/weights · Supabase/
 *     textSearch/RPC · tenant/visibility · evidence/stone/ranking · SQL/limit/offset · UI.
 *     (Bunlar DB execution/adapter fazına aittir; bu birim yalnız `tsquery` string'ini üretir.)
 */

import type { Concept, ConceptOrigin } from "./types";

/** Bir clause'un tsquery biçimi: tek-token → prefix, çok-token → exact phrase. */
export type TsQueryClauseKind = "prefix" | "phrase";

/** Tek bir concept'ten üretilen güvenli tsquery clause'u. */
export interface TsQueryClause {
  /** Normalize edilmiş concept terimi (phrase için boşlukla birleşik). */
  readonly term: string;
  /** Concept kaynağı (downstream için korunur; tsquery'de ağırlıklandırılmaz). */
  readonly origin: ConceptOrigin;
  /** Clause biçimi. */
  readonly kind: TsQueryClauseKind;
  /** Güvenli to_tsquery parçası: "isik:*" | "(anne <-> sutu)". */
  readonly fragment: string;
}

/** search_tsv için güvenli, deterministik tsquery planı (saf veri; DB çalıştırmaz). */
export interface TsQueryPlan {
  readonly config: "simple";
  readonly column: "search_tsv";
  readonly clauses: readonly TsQueryClause[];
  readonly tsquery: string;
  readonly isEmpty: boolean;
}

/** Güvenli lexeme alfabesi (S2.14 normalize garantisinin bağımsız yeniden doğrulaması). */
const LEXEME_RE = /^[a-z0-9]+$/;

/**
 * `Concept[]`'ten güvenli/deterministik/DB'siz tsquery planı üretir. Saf + fail-safe;
 * asla throw etmez; her çağrı taze frozen plan + clause nesneleri döndürür.
 */
export function buildTsQueryPlan(concepts: readonly Concept[]): TsQueryPlan {
  // Runtime savunması: TS tipine rağmen çağıran bozuk değer geçebilir. Sınırda `unknown`
  // üzerinden koru → guard'lar gerçekten gereklidir (no-unnecessary-condition çatışmaz).
  const rawConcepts: unknown = concepts;
  const list: readonly unknown[] = Array.isArray(rawConcepts) ? rawConcepts : [];

  const clauses: TsQueryClause[] = [];
  const seenFragments = new Set<string>();

  for (const raw of list) {
    // concept null/object değilse atla (bozuk öğe tüm fonksiyonu düşürmez).
    if (raw === null || typeof raw !== "object") continue;
    const c = raw as { term?: unknown; origin?: unknown };

    // 1) term string olmalı.
    if (typeof c.term !== "string") continue;
    // 2) baş/son boşluk temizle · 3) whitespace token'la · 4) boş token'ları çıkar.
    const tokens = c.term.trim().split(/\s+/).filter((t) => t.length > 0);
    if (tokens.length === 0) continue;

    // 5+6) her lexeme allowlist; tek geçersiz lexeme → tüm clause atlanır.
    let allValid = true;
    for (const t of tokens) {
      if (!LEXEME_RE.test(t)) {
        allValid = false;
        break;
      }
    }
    if (!allValid) continue;

    // 7) operatörler YALNIZ koddan: tek-token prefix `:*`, çok-token exact phrase `<->`.
    const kind: TsQueryClauseKind = tokens.length === 1 ? "prefix" : "phrase";
    const fragment =
      kind === "prefix" ? `${tokens[0]}:*` : `(${tokens.join(" <-> ")})`;

    // Serializer dedup: aynı fragment tekrarında ilk görünüm korunur (origin/sıra korunur).
    if (seenFragments.has(fragment)) continue;
    seenFragments.add(fragment);

    const clause: TsQueryClause = {
      term: tokens.join(" "), // normalize edilmiş (çoklu boşluk sadeleşir); yeni canonicalizasyon YOK
      origin: c.origin as ConceptOrigin, // olduğu gibi taşınır (doğrulama yok; sözleşme gereği)
      kind,
      fragment,
    };
    clauses.push(Object.freeze(clause));
  }

  const tsquery = clauses.map((c) => c.fragment).join(" | ");

  const plan: TsQueryPlan = {
    config: "simple",
    column: "search_tsv",
    clauses: Object.freeze(clauses),
    tsquery,
    isEmpty: clauses.length === 0,
  };
  return Object.freeze(plan);
}
