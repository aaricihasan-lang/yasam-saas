// Human Design — EĞİTMENE ÖZEL EĞİTİM HARİTALARI (FAZ 6) · SAF sözleşme: tipler, sabitler, girdi doğrulama (IO yok).
// Merkezî "Hazır Eğitim Haritaları" (educationContract.ts) ile tablo / RPC / bayrak PAYLAŞILMAZ.

export const PRIV_RPC = {
  whoami: "hd_edu_priv_whoami",
  ownerSetOpen: "hd_edu_priv_owner_set_open",
  ownerApproveText: "hd_edu_priv_owner_approve_text",
  ownerOverview: "hd_edu_priv_owner_overview",
  consentText: "hd_edu_priv_consent_text",
  consentRecord: "hd_edu_priv_consent_record",
  consentList: "hd_edu_priv_consent_list",
  consentEvidence: "hd_edu_priv_consent_evidence_get",
  consentWithdraw: "hd_edu_priv_consent_withdraw",
  consentDelete: "hd_edu_priv_consent_delete",
  itemAdd: "hd_edu_priv_item_add",
  itemUpdate: "hd_edu_priv_item_update",
  itemRebind: "hd_edu_priv_item_rebind",
  itemDelete: "hd_edu_priv_item_delete",
  itemList: "hd_edu_priv_item_list",
  itemGet: "hd_edu_priv_item_get",
  chartStatus: "hd_edu_priv_chart_status",
  declarationText: "hd_edu_priv_declaration_text",
  fictionalFind: "hd_edu_priv_fictional_find",
  fictionalAdd: "hd_edu_priv_fictional_add",
} as const;

export const PRIV_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const PRIV_SHA_RE = /^[0-9a-f]{64}$/;

export type PrivActorKind = "owner" | "trainer";
export type PrivItemState = "ok" | "consent_withdrawn" | "consent_invalid" | "evidence_invalid" | "source_changed" | "missing";
export type PrivDisplayMode = "alias" | "named";
export type PrivDisplayScope = "anonim" | "acik_isim";
export type PrivConsentMethod = "islak_imza_tarama" | "e_imza" | "kayitli_eposta" | "egitmen_beyani";
/** FAZ 14: 'gercek' = danışanın kayıtlı haritası (izin şart); 'kurgusal' = kurgusal doğum bilgisiyle eğitim haritası (izin yok). */
export type PrivItemKind = "gercek" | "kurgusal";
export const PRIV_KIND_LABEL: Readonly<Record<PrivItemKind, string>> = Object.freeze({ gercek: "Gerçek Danışan Haritası", kurgusal: "Kurgusal Eğitim Haritası" });
/** Kurgusal beyan metni (sürümüyle kayda yazılır). Gerçek kişiye ait bilgi kullanılmadığının eğitmen beyanı. */
export const PRIV_FICTIONAL_DECLARATION_VERSION = "hd-egitim-kurgusal-beyan-v1";
export const PRIV_FICTIONAL_DECLARATION_TEXT =
  "Bu haritadaki doğum tarihi, saati ve yeri tamamen kurgusaldır; gerçek bir kişiye (danışan, tanıdık veya ünlü) ait bilgi kullanmadım.";
export type PrivRelation = "danisan" | "yasal_temsilci";
export type PrivWithdrawChannel = "danisan_talebi" | "egitmen_karari" | "owner_karari";

export const PRIV_CATEGORIES = ["genel", "tip", "otorite", "profil", "merkezler", "kanallar", "tanim", "iliski", "diger"] as const;
export type PrivCategory = (typeof PRIV_CATEGORIES)[number];
export const PRIV_CATEGORY_LABEL: Readonly<Record<PrivCategory, string>> = Object.freeze({
  genel: "Genel", tip: "Tip", otorite: "Otorite", profil: "Profil", merkezler: "Merkezler", kanallar: "Kanallar",
  tanim: "Tanım", iliski: "İlişki", diger: "Diğer",
});
export const PRIV_STATE_LABEL: Readonly<Record<PrivItemState, string>> = Object.freeze({
  ok: "Erişime açık",
  consent_withdrawn: "Erişim kapalı — danışan izni geri çekildi",
  consent_invalid: "Erişim kapalı — izin kaydı geçersiz",
  evidence_invalid: "Erişim kapalı — izin kanıtı doğrulanamadı",
  source_changed: "Erişim kapalı — kaynak harita değişti",
  missing: "Kayıt bulunamadı",
});
export const PRIV_METHOD_LABEL: Readonly<Record<PrivConsentMethod, string>> = Object.freeze({
  islak_imza_tarama: "Islak imzalı form (tarama)", e_imza: "Elektronik imza", kayitli_eposta: "Kayıtlı e-posta onayı",
  egitmen_beyani: "Eğitmen beyanı",
});
export const PRIV_EVIDENCE_MIMES = ["application/pdf", "image/png", "image/jpeg"] as const;
export type PrivEvidenceMime = (typeof PRIV_EVIDENCE_MIMES)[number];
export const PRIV_EVIDENCE_MAX_BYTES = 2 * 1024 * 1024;

// ── Yanıt tipleri (istemciye giden; ham sağlayıcı yanıtı / kanıt baytı / tenant kimliği YOK) ─────────────
export type PrivItemCard = {
  id: string; title: string; aliasLabel: string; displayMode: PrivDisplayMode; category: PrivCategory; description: string | null;
  createdAt: string; updatedAt: string; state: PrivItemState; kind: PrivItemKind;
  typeCode: string | null; profileCode: string | null; authorityCode: string | null;
  /** Yalnız owner yanıtında. */
  trainer?: { userId: string; name: string } | null;
  consent?: { id: string; displayScope: PrivDisplayScope; withdrawnAt: string | null; givenOn: string; method: PrivConsentMethod } | null;
};
export type PrivConsentView = {
  id: string; consenterName: string; relation: PrivRelation; displayScope: PrivDisplayScope; includeBirthData: boolean; textVersion: string;
  givenOn: string; method: PrivConsentMethod; recordedAt: string; withdrawnAt: string | null; withdrawChannel: PrivWithdrawChannel | null;
};
/** İzin özeti (ayrıntı yanıtı) — izni verenin ADI burada YOK (eğitimde ekran paylaşımında görünmesin). */
export type PrivConsentSummary = Omit<PrivConsentView, "consenterName">;
export type PrivItemDetail = {
  actor: PrivActorKind; state: PrivItemState; displayName: string; kind: PrivItemKind;
  /** Yalnız kurgusal kayıtta: eğitmenin kurgusal beyanı (sürüm + tarih). */
  fictional: { declaredAt: string; declaration: string } | null;
  item: {
    id: string; title: string; aliasLabel: string; displayMode: PrivDisplayMode; category: PrivCategory; description: string | null;
    teachingNotes: string | null; createdAt: string; updatedAt: string;
  };
  trainer: { userId: string; name: string };
  /** Kurgusal kayıtta null (izin yok). */
  consent: PrivConsentSummary | null;
  /**
   * Yalnız state='ok' iken; aksi hâlde null (eski hesap / geri çekilmiş izin GÖSTERİLMEZ).
   * FAZ 7: ham `computed_result` / `provider_raw` YOK — yalnız allowlist görünüm (privateChartView). Doğum bilgisi yalnız
   * izin kapsamındaysa `subject` künyesinde; koordinat / UTC anı / kaynak kimlikleri hiçbir durumda yok.
   */
  chart: null | {
    typeCode: string | null; authorityCode: string | null; profileCode: string | null; definitionCode: string | null;
    view: import("./privateChartView").PrivEduChartView;
    render: Record<string, unknown> | null;
    subject: { name: string | null; localDateTime: string | null; zoneLabel: string | null; utcDateTime: null; place: string | null; coordinates: null; age: number | null };
    birthShown: boolean;
  };
};

// ── Girdi doğrulama (DB aynı kuralları ikinci kilit olarak uygular) ──────────────────────────────────────
const str = (v: unknown) => (typeof v === "string" ? v : "");
const trimmed = (v: unknown) => str(v).trim();
export type Parsed<T> = { ok: true; value: T } | { ok: false; field: string };

export type PrivItemCreateInput = {
  chartId: string; consentId: string; title: string; aliasLabel: string; displayMode: PrivDisplayMode; category: PrivCategory;
  description: string | null; teachingNotes: string | null;
};
export function parseItemCreate(b: Record<string, unknown>): Parsed<PrivItemCreateInput> {
  const chartId = trimmed(b.chartId), consentId = trimmed(b.consentId);
  if (!PRIV_UUID_RE.test(chartId)) return { ok: false, field: "chartId" };
  if (!PRIV_UUID_RE.test(consentId)) return { ok: false, field: "consentId" };
  const title = trimmed(b.title), aliasLabel = trimmed(b.aliasLabel);
  if (title.length < 1 || title.length > 160) return { ok: false, field: "title" };
  if (aliasLabel.length < 1 || aliasLabel.length > 80) return { ok: false, field: "aliasLabel" };
  const displayMode = (b.displayMode ?? "alias") as PrivDisplayMode;
  if (displayMode !== "alias" && displayMode !== "named") return { ok: false, field: "displayMode" };
  const category = (b.category ?? "genel") as PrivCategory;
  if (!(PRIV_CATEGORIES as readonly string[]).includes(category)) return { ok: false, field: "category" };
  const description = trimmed(b.description) || null, teachingNotes = trimmed(b.teachingNotes) || null;
  if (description && description.length > 2000) return { ok: false, field: "description" };
  if (teachingNotes && teachingNotes.length > 20000) return { ok: false, field: "teachingNotes" };
  return { ok: true, value: { chartId, consentId, title, aliasLabel, displayMode, category, description, teachingNotes } };
}

const PATCH_MAP = { title: "title", aliasLabel: "alias_label", displayMode: "display_mode", category: "category", description: "description", teachingNotes: "teaching_notes" } as const;
export type PrivItemPatch = { patch: Record<string, string | null>; expectedUpdatedAt: string };
/** Yalnız eğitim alanları. Doğum / hesap / kaynak alanı içeren her gövde REDDEDİLİR (sessizce yok sayılmaz). */
export function parseItemPatch(b: Record<string, unknown>): Parsed<PrivItemPatch> {
  const expectedUpdatedAt = trimmed(b.expectedUpdatedAt);
  if (!expectedUpdatedAt || Number.isNaN(Date.parse(expectedUpdatedAt))) return { ok: false, field: "expectedUpdatedAt" };
  const src = (b.patch && typeof b.patch === "object" && !Array.isArray(b.patch)) ? (b.patch as Record<string, unknown>) : null;
  if (!src) return { ok: false, field: "patch" };
  const keys = Object.keys(src);
  if (!keys.length) return { ok: false, field: "patch" };
  const patch: Record<string, string | null> = {};
  for (const k of keys) {
    if (!(k in PATCH_MAP)) return { ok: false, field: k };
    const v = src[k];
    if (v !== null && typeof v !== "string") return { ok: false, field: k };
    const t = typeof v === "string" ? v.trim() : null;
    if (k === "title" && (!t || t.length > 160)) return { ok: false, field: k };
    if (k === "aliasLabel" && (!t || t.length > 80)) return { ok: false, field: k };
    if (k === "displayMode" && t !== "alias" && t !== "named") return { ok: false, field: k };
    if (k === "category" && !(PRIV_CATEGORIES as readonly string[]).includes(t ?? "")) return { ok: false, field: k };
    if (k === "description" && t && t.length > 2000) return { ok: false, field: k };
    if (k === "teachingNotes" && t && t.length > 20000) return { ok: false, field: k };
    patch[PATCH_MAP[k as keyof typeof PATCH_MAP]] = t || null;
  }
  return { ok: true, value: { patch, expectedUpdatedAt } };
}

export type PrivConsentInput = {
  hdClientId: string; consenterName: string; relation: PrivRelation; displayScope: PrivDisplayScope; includeBirthData: boolean;
  namedConfirmed: boolean; textVersion: string; textSha256: string; givenOn: string; method: PrivConsentMethod;
  /** FAZ 14: eğitmen beyanında dosya YOK (null); belgeli yöntemlerde zorunlu. */
  evidenceBase64: string | null; evidenceMime: PrivEvidenceMime | null;
};
export function parseConsentInput(b: Record<string, unknown>): Parsed<PrivConsentInput> {
  const hdClientId = trimmed(b.hdClientId);
  if (!PRIV_UUID_RE.test(hdClientId)) return { ok: false, field: "hdClientId" };
  const consenterName = trimmed(b.consenterName);
  if (consenterName.length < 2 || consenterName.length > 200) return { ok: false, field: "consenterName" };
  const relation = str(b.relation) as PrivRelation;
  if (relation !== "danisan" && relation !== "yasal_temsilci") return { ok: false, field: "relation" };
  const displayScope = str(b.displayScope) as PrivDisplayScope;
  if (displayScope !== "anonim" && displayScope !== "acik_isim") return { ok: false, field: "displayScope" };
  if (typeof b.includeBirthData !== "boolean") return { ok: false, field: "includeBirthData" };
  if (typeof b.namedConfirmed !== "boolean") return { ok: false, field: "namedConfirmed" };
  const textVersion = trimmed(b.textVersion), textSha256 = trimmed(b.textSha256).toLowerCase();
  if (!/^hd-egitim-(izin|beyan)-v[0-9]{1,3}$/.test(textVersion)) return { ok: false, field: "textVersion" };
  if (!PRIV_SHA_RE.test(textSha256)) return { ok: false, field: "textSha256" };
  const givenOn = trimmed(b.givenOn);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(givenOn) || Number.isNaN(Date.parse(`${givenOn}T00:00:00Z`))) return { ok: false, field: "givenOn" };
  const method = str(b.method) as PrivConsentMethod;
  if (!["islak_imza_tarama", "e_imza", "kayitli_eposta", "egitmen_beyani"].includes(method)) return { ok: false, field: "method" };
  if (displayScope === "acik_isim" && (!b.namedConfirmed || method === "kayitli_eposta")) return { ok: false, field: "displayScope" };
  // FAZ 14: eğitmen beyanı ↔ beyan metni; beyan yolunda dosya GÖNDERİLMEZ (gönderilirse ret — sessizce yok sayılmaz).
  if ((method === "egitmen_beyani") !== textVersion.startsWith("hd-egitim-beyan-")) return { ok: false, field: "textVersion" };
  if (method === "egitmen_beyani") {
    if (b.evidenceBase64 || b.evidenceMime) return { ok: false, field: "evidenceBase64" };
    return {
      ok: true,
      value: { hdClientId, consenterName, relation, displayScope, includeBirthData: b.includeBirthData, namedConfirmed: b.namedConfirmed, textVersion,
        textSha256, givenOn, method, evidenceBase64: null, evidenceMime: null },
    };
  }
  const evidenceMime = str(b.evidenceMime) as PrivEvidenceMime;
  if (!(PRIV_EVIDENCE_MIMES as readonly string[]).includes(evidenceMime)) return { ok: false, field: "evidenceMime" };
  const evidenceBase64 = str(b.evidenceBase64).replace(/\s+/g, "");
  // base64 uzunluğu ≈ 4/3 × bayt; üst sınır DB'de bayt bazında ayrıca uygulanır.
  if (!evidenceBase64 || evidenceBase64.length > Math.ceil((PRIV_EVIDENCE_MAX_BYTES * 4) / 3) + 8 || !/^[A-Za-z0-9+/]+={0,2}$/.test(evidenceBase64)) {
    return { ok: false, field: "evidenceBase64" };
  }
  return {
    ok: true,
    value: { hdClientId, consenterName, relation, displayScope, includeBirthData: b.includeBirthData, namedConfirmed: b.namedConfirmed, textVersion,
      textSha256, givenOn, method, evidenceBase64, evidenceMime },
  };
}

/** FAZ 14: kurgusal eğitim haritası girdisi (tamamen kurgusal doğum bilgisi + eğitim alanları + zorunlu kurgusal beyan). */
export type PrivFictionalInput = {
  title: string; aliasLabel: string; category: PrivCategory; description: string | null; teachingNotes: string | null;
  birthDate: string; birthTime: string; locationRef: string; declaration: typeof PRIV_FICTIONAL_DECLARATION_VERSION;
};
export function parseFictionalInput(b: Record<string, unknown>): Parsed<PrivFictionalInput> {
  const title = trimmed(b.title), aliasLabel = trimmed(b.aliasLabel) || "Kurgusal kişi";
  if (title.length < 1 || title.length > 160) return { ok: false, field: "title" };
  if (aliasLabel.length > 80) return { ok: false, field: "aliasLabel" };
  const category = (b.category ?? "genel") as PrivCategory;
  if (!(PRIV_CATEGORIES as readonly string[]).includes(category)) return { ok: false, field: "category" };
  const description = trimmed(b.description) || null, teachingNotes = trimmed(b.teachingNotes) || null;
  if (description && description.length > 2000) return { ok: false, field: "description" };
  if (teachingNotes && teachingNotes.length > 20000) return { ok: false, field: "teachingNotes" };
  const birthDate = trimmed(b.birthDate), birthTime = trimmed(b.birthTime), locationRef = trimmed(b.locationRef);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return { ok: false, field: "birthDate" };
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(birthTime)) return { ok: false, field: "birthTime" };
  if (!locationRef || locationRef.length > 4000) return { ok: false, field: "locationRef" };
  // Kurgusal beyan: aktif onay + güncel sürüm ZORUNLU (onaysız kurgusal kayıt oluşmaz).
  if (b.declarationAccepted !== true || trimmed(b.declarationVersion) !== PRIV_FICTIONAL_DECLARATION_VERSION) return { ok: false, field: "declaration" };
  return { ok: true, value: { title, aliasLabel, category, description, teachingNotes, birthDate, birthTime, locationRef, declaration: PRIV_FICTIONAL_DECLARATION_VERSION } };
}

/** RPC hata kodu → HTTP. Eğitmen yüzünde "yetkisiz" ve "bulunamadı" AYNI 404'tür (varlık sızdırılmaz). */
export const PRIV_ERROR_MAP: Readonly<Record<string, { status: number; code: string; error: string }>> = Object.freeze({
  EP001: { status: 400, code: "INVALID_REQUEST", error: "İstek eksik veya geçersiz." },
  EP003: { status: 400, code: "TARGET_INELIGIBLE", error: "Hedef kullanıcı uygun değil (aktif, onaylı, demo olmayan, Human Design izinli uzman olmalı)." },
  EP010: { status: 400, code: "CONSENT_TEXT_INVALID", error: "İzin metni sürümü geçersiz veya kullanıma onaylı değil." },
  EP011: { status: 400, code: "EVIDENCE_INVALID", error: "İzin kanıtı dosyası geçersiz (PDF/PNG/JPEG, en fazla 2 MB, içerik türüyle uyumlu olmalı)." },
  EP012: { status: 400, code: "NAMED_NOT_ALLOWED", error: "Açık isim gösterimi için danışanın ayrıca açık isim izni (imzalı) gerekir." },
  EP013: { status: 409, code: "CONSENT_WITHDRAWN", error: "Danışan izni geri çekilmiş." },
  EP014: { status: 400, code: "SOURCE_NOT_ELIGIBLE", error: "Yalnız danışana bağlı, hesaplanmış kayıtlı haritalar eklenebilir." },
  EP015: { status: 400, code: "CONSENT_CLIENT_MISMATCH", error: "Seçilen izin bu haritanın danışanına ait değil." },
  EP016: { status: 409, code: "DUPLICATE", error: "Bu harita zaten eğitim arşivinizde." },
  EP017: { status: 409, code: "CONFLICT", error: "Kayıt başka bir oturumda değişti. Sayfayı yenileyip tekrar deneyin." },
  EP018: { status: 400, code: "CONFIRM_REQUIRED", error: "Silme onayı eksik." },
  EP019: { status: 400, code: "INVALID_FIELD", error: "Alan değeri geçersiz." },
  EP020: { status: 409, code: "SOURCE_UNCHANGED", error: "Kaynak harita değişmemiş; yeniden bağlamaya gerek yok." },
});
/** Owner listesi durum filtresi (J): yalnız backend'in gerçekten hesapladığı durumlar. */
export const PRIV_STATE_FILTERS = ["all", "ok", "consent_withdrawn", "invalid"] as const;
export type PrivStateFilter = (typeof PRIV_STATE_FILTERS)[number];
export function matchesStateFilter(state: PrivItemState, f: PrivStateFilter): boolean {
  if (f === "all") return true;
  if (f === "ok") return state === "ok";
  if (f === "consent_withdrawn") return state === "consent_withdrawn";
  return state === "source_changed" || state === "evidence_invalid" || state === "consent_invalid";
}

/** "Yok / yetkisiz" kodları — her iki yüzde de tek tip 404. */
export const PRIV_NOT_FOUND_CODES: ReadonlySet<string> = new Set(["EP002", "EP004"]);
