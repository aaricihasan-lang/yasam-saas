/**
 * Yaşam Hafızası™ — Aromaterapi Method (Bitki & Preparat Kataloğu / Üretim Yöntemi)
 * SERİ-KİMLİKLİ İNDEKS ÇÖZÜMLEMESİ (Professional Cohort; SEÇENEK B).
 * =========================================================================
 *
 * Aromaterapi method modeli IMMUTABLE seri + revizyon mantığındadır (migration
 * 20260912000000 + 20260915000000):
 *   - `aromatherapy_preparation_method_series`      → değişmez SEMANTIC IDENTITY (source_id).
 *   - `aromatherapy_preparation_method_revisions`   → içerik immutable; yalnız `status`
 *     (`draft|verified|archived`) + `updated_at` değişir. Seri başına EN FAZLA BİR
 *     `verified` revizyon (DB partial-unique `..._verified_uidx`).
 *
 * YAŞAM HAFIZASI KURALI (kullanıcı onaylı SEÇENEK B):
 *   - Hafıza source identity = SERİ (`series.id`); revizyon id Hafıza identity'si DEĞİLDİR.
 *   - Current content = seri için `status='verified'` olan TEK revizyon.
 *   - Promotion/demotion yalnız `status` değiştirir → worker İŞLEME ANINDA current verified
 *     revizyonu source-of-truth'tan (DB) yeniden çözer; verified varsa index/refresh (aynı
 *     series identity → duplicate yok), yoksa deindex (ghost yok).
 *
 * BU DOSYA SAF'tır: DB/IO/Supabase YOKTUR. Yalnız sabit tablo/kolon adları + verilen ham
 * satırlardan sentetik indeks satırını (registry kolon adlarıyla) deterministik kompoze eder.
 * Gerçek DB okuması IO katmanındadır (`supabaseIndexAdapters.readMethodSeriesExact`).
 */

/** Method kaynağının benzersiz registry anahtarı (source_id = series.id). */
export const METHOD_SOURCE_KEY = "aromaterapi:method" as const;

/** Method Hafıza source_table'ı = SERİ tablosu (index/deindex bu ad üzerinden filtreler). */
export const METHOD_SERIES_TABLE = "aromatherapy_preparation_method_series" as const;
export const METHOD_REVISIONS_TABLE = "aromatherapy_preparation_method_revisions" as const;
export const METHOD_PREPARATIONS_TABLE = "aromatherapy_preparations" as const;
export const METHOD_PLANT_TAXA_TABLE = "aromatherapy_plant_taxa" as const;

/** Yalnız gerçek SERİ tablosunda bulunan kolonlar (generic select güvenli fallback). */
export const METHOD_SERIES_SELECT_COLUMNS = ["id", "tenant_id"] as const;

/** IO okuma allowlist'leri (statik; `*` yok). */
export const METHOD_SERIES_READ_COLUMNS = [
  "id",
  "tenant_id",
  "preparation_id",
  "method_kind",
  "method_lang",
] as const;
export const METHOD_REVISION_READ_COLUMNS = [
  "id",
  "tenant_id",
  "series_id",
  "revision",
  "status",
  "updated_at",
  "method_text",
  "plant_part_used",
  "material_state",
  "equipment",
  "amount_ratio",
  "solvent_carrier",
  "duration_text",
  "temperature_text",
  "steps",
  "filtration",
  "resting",
  "storage",
  "quality_notes",
  "safety_notes",
] as const;
export const METHOD_PREPARATION_READ_COLUMNS = [
  "id",
  "tenant_id",
  "taxon_id",
  "preparation_type",
  "plant_part",
  "chemotype",
] as const;
export const METHOD_TAXON_READ_COLUMNS = [
  "id",
  "tenant_id",
  "canonical_name",
  "primary_common_name_tr",
  "family",
] as const;

// ─── Tip guard'ları (coercion YOK) ────────────────────────────────────────────
function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * steps JSONB → aranabilir düz metin. Şekil: `[{order:number, text:string}]` (CHECK ile
 * DB'de garanti). order'a göre sıralanır; text'ler tek boşlukla birleşir. Beklenmeyen
 * eleman atlanır (fail-safe). Boş/`null`/[] → null (kolon üretilmez).
 */
export function composeStepsText(steps: unknown): string | null {
  if (!Array.isArray(steps)) return null;
  const items: Array<{ order: number; text: string }> = [];
  for (const el of steps) {
    if (!isPlainObject(el)) continue;
    const order = el["order"];
    const text = el["text"];
    if (typeof order !== "number" || !isNonEmptyString(text)) continue;
    items.push({ order, text });
  }
  if (items.length === 0) return null;
  items.sort((a, b) => a.order - b.order);
  const joined = items.map((i) => i.text).join(" ").trim();
  return joined.length > 0 ? joined : null;
}

/**
 * title_text: taksona/preparata bağlı okunabilir başlık. Mevcut parçalar `·` ile birleşir;
 * hiçbiri yoksa method_kind fallback (her zaman vardır) → başlık boş kalmaz.
 */
export function composeMethodTitle(input: {
  canonicalName?: unknown;
  primaryCommonNameTr?: unknown;
  preparationType?: unknown;
  methodKind?: unknown;
}): string {
  const parts: string[] = [];
  if (isNonEmptyString(input.canonicalName)) parts.push(input.canonicalName.trim());
  else if (isNonEmptyString(input.primaryCommonNameTr)) parts.push(input.primaryCommonNameTr.trim());
  if (isNonEmptyString(input.preparationType)) parts.push(input.preparationType.trim());
  if (isNonEmptyString(input.methodKind)) parts.push(input.methodKind.trim());
  return parts.length > 0 ? parts.join(" · ") : "method";
}

/**
 * Sentetik indeks satırı: registry `SourceConfig` (aromaterapi:method) kolon adlarıyla.
 * Anahtarlar: id (=series.id → source_id/group), tenant_id, status ('verified'; row-gate),
 * updated_at (verified revizyonun), title_text, method_kind, material_state, preparation_type,
 * + verified revizyon içerik kolonları (+ steps_text). Değerler HAM taşınır (coercion yok).
 *
 * SAF: yalnız verilen ham satırlardan kompoze eder; DB/IO yok. Verified revizyon eligibility'si
 * IO katmanında (yalnız status='verified' satır çekilir) garanti edilir; burada `status` daima
 * revizyondan gelir (savunma amaçlı row-gate: eligibleStatuses=['verified']).
 */
export function composeMethodSyntheticRow(input: {
  series: Readonly<Record<string, unknown>>;
  verifiedRevision: Readonly<Record<string, unknown>>;
  preparation?: Readonly<Record<string, unknown>> | null;
  taxon?: Readonly<Record<string, unknown>> | null;
}): Record<string, unknown> {
  const { series, verifiedRevision: rev, preparation, taxon } = input;
  const preparationType = preparation?.["preparation_type"];
  const row: Record<string, unknown> = {
    // Kimlik: source_id = series.id; tenant seri (ve revizyon) ile aynı.
    id: series["id"],
    tenant_id: series["tenant_id"],
    // Row-gate (savunma): yalnız verified indexlenir.
    status: rev["status"],
    updated_at: rev["updated_at"],
    // Başlık + etiketler.
    title_text: composeMethodTitle({
      canonicalName: taxon?.["canonical_name"],
      primaryCommonNameTr: taxon?.["primary_common_name_tr"],
      preparationType,
      methodKind: series["method_kind"],
    }),
    method_kind: series["method_kind"],
    preparation_type: preparationType,
    // Verified revizyon içerik kolonları (ham).
    method_text: rev["method_text"],
    material_state: rev["material_state"],
    plant_part_used: rev["plant_part_used"],
    equipment: rev["equipment"],
    amount_ratio: rev["amount_ratio"],
    solvent_carrier: rev["solvent_carrier"],
    duration_text: rev["duration_text"],
    temperature_text: rev["temperature_text"],
    filtration: rev["filtration"],
    resting: rev["resting"],
    storage: rev["storage"],
    quality_notes: rev["quality_notes"],
    safety_notes: rev["safety_notes"],
  };
  const stepsText = composeStepsText(rev["steps"]);
  if (stepsText !== null) row["steps_text"] = stepsText;
  return row;
}
