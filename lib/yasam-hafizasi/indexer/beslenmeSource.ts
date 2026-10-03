/**
 * Yaşam Hafızası™ — BESLENME MESLEKİ AGGREGATE DOKÜMANLARI (SAF composer).
 * =========================================================================
 *
 * Beslenme Mesleki Hafıza'ya YALNIZ 3 aggregate kaynakla girer (ürün kararı 2026-10):
 *   beslenme:foods     → tenant'a ait besin (+ grup, porsiyon etiketleri, geleneksel nitelik, kaynaklar)
 *   beslenme:topics    → konu (+ bölümler, bağlı besin adları/ilişki/gerekçe, kaynaklar)
 *   beslenme:templates → şablon (+ öğün tipleri/etiketleri, besin adları, porsiyon etiketleri)
 *
 * KESİN DIŞARIDA (bu dosya bunları HİÇ okumaz/kompoze etmez):
 *   - SYSTEM tenant satırları (ortak katalog Mesleki Hafıza DEĞİLDİR) — fork tenant'ındır, girer.
 *   - Besin değeri sayıları, gram/enerji/miktar (arama gürültüsü).
 *   - Şablon öğün/öğe NOTLARI (plandan kopyalanır → danışan bilgisi taşıyabilir).
 *   - nutrition_client_*, planlar, plan-danışan bağı, global sözlükler, formüller.
 *
 * BU DOSYA SAF'tır: DB/IO yok. Gerçek okuma IO katmanında (`supabaseIndexAdapters.readBeslenmeExact`)
 * yapılır; burada yalnız sabit tablo/kolon adları + verilen ham satırlardan registry kolon
 * adlarıyla SENTETİK indeks satırı deterministik kurulur.
 */

export const BESLENME_SYSTEM_TENANT_ID = "00000000-0000-4000-8000-000000000001";

export const BESLENME_FOODS_SOURCE_KEY = "beslenme:foods" as const;
export const BESLENME_TOPICS_SOURCE_KEY = "beslenme:topics" as const;
export const BESLENME_TEMPLATES_SOURCE_KEY = "beslenme:templates" as const;
export const BESLENME_SOURCE_KEYS: readonly string[] = [
  BESLENME_FOODS_SOURCE_KEY,
  BESLENME_TOPICS_SOURCE_KEY,
  BESLENME_TEMPLATES_SOURCE_KEY,
];

/** Ebeveyn tabloları (Hafıza source_table = ebeveyn). */
export const BESLENME_TABLES = {
  foods: "nutrition_foods",
  topics: "nutrition_topics",
  templates: "nutrition_templates",
  foodGroups: "nutrition_food_groups",
  frameworks: "nutrition_traditional_frameworks",
  portions: "nutrition_food_portions",
  traditional: "nutrition_food_traditional",
  foodSources: "nutrition_food_sources",
  sources: "nutrition_sources",
  sections: "nutrition_topic_sections",
  topicFoods: "nutrition_topic_foods",
  topicSources: "nutrition_topic_sources",
  templateMeals: "nutrition_template_meals",
  templateItems: "nutrition_template_items",
} as const;

/** IO okuma allowlist'leri (statik; `*` yok; NOT ve SAYI kolonları bilinçli olarak YOK). */
export const BESLENME_READ_COLUMNS = {
  foods: ["id", "tenant_id", "name_tr", "name_en", "aliases", "food_group_id", "prep_state", "description", "notes", "is_active", "updated_at", "origin_food_id"],
  topics: ["id", "tenant_id", "topic_type", "framework_id", "title", "summary", "is_active", "updated_at"],
  templates: ["id", "tenant_id", "template_type", "title", "note", "is_active", "updated_at"],
  portions: ["label_tr", "sort_order"],
  traditional: ["framework_id", "thermal_quality", "moisture_quality", "notes"],
  foodSources: ["source_id", "locator", "note", "sort_order"],
  sources: ["id", "title", "authors", "organization", "is_active"],
  sections: ["heading", "content", "sort_order"],
  topicFoods: ["food_id", "relation_type", "rationale", "sort_order"],
  topicSources: ["source_id", "locator", "note", "sort_order"],
  templateMeals: ["meal_type", "label", "sort_order"],
  templateItems: ["food_name_snapshot", "portion_label_snapshot", "sort_order"],
} as const;

/** Generic select güvenli fallback (yalnız ebeveynde gerçekten var olan kolonlar). */
export const BESLENME_PARENT_SELECT_COLUMNS = ["id", "tenant_id"] as const;

/** Konu dokümanı metin tavanı (tsvector 1MB sınırının çok altında; büyük bölümler kırpılır). */
export const BESLENME_TOPIC_TEXT_CAP = 30_000;

const PREP_LABELS: Readonly<Record<string, string>> = { raw: "Çiğ", cooked: "Pişmiş", processed: "İşlenmiş" };
const THERMAL_LABELS: Readonly<Record<string, string>> = { hot: "Sıcak", cold: "Soğuk", neutral: "Nötr (ısı)" };
const MOISTURE_LABELS: Readonly<Record<string, string>> = { wet: "Nemli", dry: "Kuru", neutral: "Nötr (nem)" };
const RELATION_LABELS: Readonly<Record<string, string>> = {
  recommended: "Önerilir", suitable: "Uygun", neutral: "Nötr", limit: "Sınırla", avoid: "Kaçın", caution: "Dikkat",
};
const TOPIC_TYPE_LABELS: Readonly<Record<string, string>> = {
  dietary_pattern: "Beslenme düzeni", goal: "Hedef", condition: "Durum", sport: "Spor",
  life_stage: "Yaşam dönemi", traditional_profile: "Geleneksel profil",
};
const TEMPLATE_TYPE_LABELS: Readonly<Record<string, string>> = { meal: "Öğün şablonu", day: "Gün şablonu" };
const MEAL_TYPE_LABELS: Readonly<Record<string, string>> = {
  breakfast: "Kahvaltı", snack: "Ara öğün", lunch: "Öğle yemeği", dinner: "Akşam yemeği", late_snack: "Gece ara öğünü",
};

type Row = Readonly<Record<string, unknown>>;

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}
function bySort(a: Row, b: Row): number {
  const x = typeof a["sort_order"] === "number" ? (a["sort_order"] as number) : 0;
  const y = typeof b["sort_order"] === "number" ? (b["sort_order"] as number) : 0;
  return x - y;
}
function uniq(values: ReadonlyArray<string | null>): string[] {
  return [...new Set(values.filter((v): v is string => v !== null))];
}
function joinOrNull(values: ReadonlyArray<string | null>, sep = " · "): string | null {
  const u = uniq(values);
  return u.length > 0 ? u.join(sep) : null;
}

/** Kaynakça satırı → okunur başlık ("Başlık — Yazarlar/Kurum"). Pasif kaynak atlanır. */
function sourceTitle(s: Row | undefined): string | null {
  if (!s || s["is_active"] === false) return null;
  const title = str(s["title"]);
  if (title === null) return null;
  const by = str(s["authors"]) ?? str(s["organization"]);
  return by ? `${title} — ${by}` : title;
}

/** Ebeveyn satırı Mesleki Hafıza'ya girebilir mi? (SYSTEM / pasif / tenant'sız → hayır) */
export function isBeslenmeParentIndexable(parent: Row | null | undefined): boolean {
  if (!parent) return false;
  const tenant = parent["tenant_id"];
  if (typeof tenant !== "string" || tenant.length === 0) return false;
  if (tenant === BESLENME_SYSTEM_TENANT_ID) return false;
  if (parent["is_active"] === false) return false;
  return true;
}

// ─── FOODS ────────────────────────────────────────────────────────────────────
export function composeBeslenmeFoodRow(input: {
  food: Row;
  groupName?: string | null;
  portions?: readonly Row[];
  traditional?: Row | null;
  frameworkName?: string | null;
  foodSources?: readonly Row[];
  sourcesById?: ReadonlyMap<string, Row>;
}): Record<string, unknown> {
  const f = input.food;
  const trad = input.traditional ?? null;
  const portions = [...(input.portions ?? [])].sort(bySort);
  const links = [...(input.foodSources ?? [])].sort(bySort);
  const sourcesById = input.sourcesById ?? new Map<string, Row>();
  const linkTitles = links.map((l) => sourceTitle(sourcesById.get(String(l["source_id"]))));
  const linkText = links.map((l) => {
    const t = sourceTitle(sourcesById.get(String(l["source_id"])));
    return t === null ? null : joinOrNull([t, str(l["locator"]), str(l["note"])], " — ");
  });
  const aliases = Array.isArray(f["aliases"]) ? (f["aliases"] as unknown[]).map(str) : [];
  const thermal = trad ? THERMAL_LABELS[String(trad["thermal_quality"])] ?? null : null;
  const moisture = trad ? MOISTURE_LABELS[String(trad["moisture_quality"])] ?? null : null;
  return {
    id: f["id"],
    tenant_id: f["tenant_id"],
    updated_at: f["updated_at"] ?? null,
    name_tr: str(f["name_tr"]),
    name_en: str(f["name_en"]),
    aliases: uniq(aliases),
    group_name: str(input.groupName ?? null),
    prep_label: PREP_LABELS[String(f["prep_state"])] ?? null,
    fork_tag: typeof f["origin_food_id"] === "string" ? "Kişisel kopya" : null,
    traditional_tags: uniq([thermal, moisture, str(input.frameworkName ?? null)]),
    traditional_text: trad ? str(trad["notes"]) : null,
    description: str(f["description"]),
    notes: str(f["notes"]),
    portion_labels: joinOrNull(portions.map((p) => str(p["label_tr"])), ", "),
    source_titles: uniq(linkTitles),
    source_text: joinOrNull(linkText, " | "),
  };
}

// ─── TOPICS ───────────────────────────────────────────────────────────────────
export function composeBeslenmeTopicRow(input: {
  topic: Row;
  frameworkName?: string | null;
  sections?: readonly Row[];
  topicFoods?: readonly Row[];
  foodNamesById?: ReadonlyMap<string, string>;
  topicSources?: readonly Row[];
  sourcesById?: ReadonlyMap<string, Row>;
}): Record<string, unknown> {
  const t = input.topic;
  const sections = [...(input.sections ?? [])].sort(bySort);
  const tf = [...(input.topicFoods ?? [])].sort(bySort);
  const names = input.foodNamesById ?? new Map<string, string>();
  const links = [...(input.topicSources ?? [])].sort(bySort);
  const sourcesById = input.sourcesById ?? new Map<string, Row>();

  let sectionsText = sections
    .map((s) => joinOrNull([str(s["heading"]), str(s["content"])], "\n"))
    .filter((x): x is string => x !== null)
    .join("\n\n");
  if (sectionsText.length > BESLENME_TOPIC_TEXT_CAP) sectionsText = sectionsText.slice(0, BESLENME_TOPIC_TEXT_CAP);

  const foodRelations = tf.map((r) => {
    const name = names.get(String(r["food_id"])) ?? null;
    if (name === null) return null;
    const rel = RELATION_LABELS[String(r["relation_type"])] ?? null;
    return rel ? `${name} (${rel})` : name;
  });
  const rationale = tf.map((r) => {
    const name = names.get(String(r["food_id"])) ?? null;
    const why = str(r["rationale"]);
    return why === null ? null : name ? `${name}: ${why}` : why;
  });

  return {
    id: t["id"],
    tenant_id: t["tenant_id"],
    updated_at: t["updated_at"] ?? null,
    title: str(t["title"]),
    topic_type_label: TOPIC_TYPE_LABELS[String(t["topic_type"])] ?? null,
    framework_name: str(input.frameworkName ?? null),
    summary: str(t["summary"]),
    sections_text: sectionsText.length > 0 ? sectionsText : null,
    food_relations: uniq(foodRelations),
    food_rationale: joinOrNull(rationale, " | "),
    source_titles: uniq(links.map((l) => sourceTitle(sourcesById.get(String(l["source_id"]))))),
    source_text: joinOrNull(
      links.map((l) => {
        const st = sourceTitle(sourcesById.get(String(l["source_id"])));
        return st === null ? null : joinOrNull([st, str(l["locator"]), str(l["note"])], " — ");
      }),
      " | ",
    ),
  };
}

// ─── TEMPLATES ────────────────────────────────────────────────────────────────
export function composeBeslenmeTemplateRow(input: {
  template: Row;
  meals?: readonly Row[];
  items?: readonly Row[];
}): Record<string, unknown> {
  const t = input.template;
  const meals = [...(input.meals ?? [])].sort(bySort);
  const items = [...(input.items ?? [])].sort(bySort);
  return {
    id: t["id"],
    tenant_id: t["tenant_id"],
    updated_at: t["updated_at"] ?? null,
    title: str(t["title"]),
    template_type_label: TEMPLATE_TYPE_LABELS[String(t["template_type"])] ?? null,
    // Şablonun KENDİ üst notu (uzman yazar). Öğün/öğe notları KOPYADIR → okunmaz/eklenmez.
    note: str(t["note"]),
    meal_types: uniq(meals.map((m) => MEAL_TYPE_LABELS[String(m["meal_type"])] ?? null)),
    meal_labels: joinOrNull(meals.map((m) => str(m["label"])), ", "),
    food_names: uniq(items.map((i) => str(i["food_name_snapshot"]))),
    portion_labels: joinOrNull(items.map((i) => str(i["portion_label_snapshot"])), ", "),
  };
}
