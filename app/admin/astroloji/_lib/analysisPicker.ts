// Gökyüzü Atlası — ANALİZ SEÇİCİ MODELİ (V3, 2026-11-05). Saf: ağ / durum / tarayıcı erişimi yok.
//
//   • Liste YALNIZ etkin doğum profilinin (danışan dosyası) KİMLİĞİNE bağlıdır:
//       – kayıtlı analizler: sunucu listesi `GET /api/admin/astroloji/analyses?profileId=` (tenant + uzman + profil
//         sahipliği sunucuda denetlenir) — çağıran, listeyi hangi profil için çektiğini `savedFor` ile bildirir; başka
//         profilin listesi asla kullanılmaz;
//       – kaydedilmemiş açık analizler: çalışma masası anahtarı "profilId|revizyon" — yalnız `${profileId}|` önekli masalar.
//     Ad / başlık / açıklama metniyle eşleştirme YAPILMAZ; profil kimliği olmayan hiçbir öğe listeye girmez.
//   • Kayıtlı + aynı anda açık analiz TEK satırdır (kayıtlı satır). Kaydedilmemiş satır işaretlidir; eski doğum
//     revizyonundaki kaydedilmemiş sonuç gizlenmez, ayrıca işaretlenir. Teknik izni kapalı kayıt görünür ama açılmaz.
//   • Seçim yalnız görünümü değiştirir (bkz. page.tsx): yeniden hesap, sağlayıcı isteği, otomatik kayıt YOK.

import { TECHNIQUE_META, describeOptions, techniqueLabel } from "./techniques";

/** Bu modül bayrağı: "off" → eski şeritler (geri dönüş). Derleme anında okunur. */
export const ANALYSIS_PICKER_ENABLED = process.env.NEXT_PUBLIC_ATLAS_ANALYSIS_PICKER !== "off";

export const PICKER_FAMILIES = ["natal", "zaman", "iliski", "konum", "diger", "vedik", "kp"] as const;
export type PickerFamily = (typeof PICKER_FAMILIES)[number];
export const PICKER_FAMILY_LABELS: Record<PickerFamily, string> = {
  natal: "Doğum haritası",
  zaman: "Zamanlama",
  iliski: "İlişki",
  konum: "Konum",
  diger: "Diğer",
  vedik: "Vedik",
  kp: "KP",
};

const ZAMAN = new Set([
  "western.transit",
  "western.forecast",
  "western.progression",
  "western.solar_arc",
  "western.solar_return",
  "western.lunar_return",
  "western.profections",
  "western.transit_scan",
  "western.planetary_return",
  "western.declination_parallels",
]);
const KONUM = new Set(["western.astrocartography", "western.relocation", "western.local_space"]);

export function pickerFamilyOf(technique: string): PickerFamily {
  if (technique === "western.natal") return "natal";
  if ((TECHNIQUE_META as Record<string, { needsPartner?: boolean }>)[technique]?.needsPartner) return "iliski";
  if (ZAMAN.has(technique)) return "zaman";
  if (KONUM.has(technique)) return "konum";
  if (technique.startsWith("vedic.")) return "vedik";
  if (technique.startsWith("kp.")) return "kp";
  return "diger";
}

/** Sunucunun kayıtlı analiz satırı (liste ucu). */
export type PickerSavedRow = {
  id: string;
  title: string;
  technique: string;
  params: Record<string, unknown>;
  partnerLabel: string | null;
  analysisAt: string;
  /** Teknik izni kapalı: kayıt korunur, açılmaz (sunucu da 403 döner). */
  locked?: boolean;
};

/** Çalışma masasındaki AÇIK sonuç (kapatılmış sekmeler gelmez — mevcut × davranışıyla aynı). */
export type PickerBenchRow = {
  /** "profilId|revizyon" */
  benchKey: string;
  itemKey: string;
  technique: string;
  options: Record<string, unknown>;
  /** Bu sonuç kaydedildiyse analiz kimliği. */
  savedId: string | null;
  partial?: boolean;
  /** Sekmede kaydedilmemiş not / Bilgi Bankası taslağı. */
  dirty?: boolean;
};

export type PickerState = "saved" | "unsaved" | "unsaved-old" | "locked";

export type PickerEntry = {
  ref: string;
  kind: "saved" | "bench";
  technique: string;
  family: PickerFamily;
  /** Teknik adı (ör. "Natal"). */
  label: string;
  /** Seçenek özeti (tarih / dönem / karşı taraf …). */
  detail: string;
  /** Kayıt tarihi gg.aa.yyyy (kaydedilmemiş sonuçta null). */
  date: string | null;
  /** Kullanıcının verdiği kayıt adı (teknik adıyla aynıysa null). */
  title: string | null;
  state: PickerState;
  savedId: string | null;
  benchKey: string | null;
  itemKey: string | null;
  revision: number | null;
  partial: boolean;
  dirty: boolean;
  /** Sıralama: kayıt anı (ISO); kaydedilmemişte boş. */
  sortAt: string;
};

export const pickerTime = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
};

export const pickerDay = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Istanbul" });
};

/**
 * Sunucunun VARSAYILAN kayıt adı "<profil>[ & karşı taraf] · <teknik>[ → yer] · gg.aa.yyyy" (analyses/service.ts) başlıkta teknik
 * adını ve tarihi ikinci kez yazdırır → seçicide gösterilmez (karşı taraf / yer ayrıntı satırında zaten var). Kullanıcının
 * verdiği özel ad (ör. "Ali natal (gerçek kayıt)") aynen gösterilir.
 */
export function isDefaultSavedTitle(title: string, profileLabel: string | null | undefined): boolean {
  const t = title.trim();
  return !!profileLabel && t.startsWith(`${profileLabel} `) && / · \d{2}\.\d{2}\.\d{4}$/.test(t) && t.includes(" · ");
}

export const savedRef = (id: string) => `saved:${id}`;
export const benchRef = (benchKey: string, itemKey: string) => `bench:${benchKey}|${itemKey}`;

/**
 * Seçici girdileri. `savedFor` = kayıtlı listenin hangi profil için çekildiği; `profileId` ile aynı değilse kayıtlı liste
 * KULLANILMAZ (profil değişirken eski danışanın listesi bir an bile görünmez).
 */
export function buildPickerEntries(input: {
  profileId: string;
  /** Profil etiketi (varsayılan kayıt adını tanımak için; eşleştirmede KULLANILMAZ). */
  profileLabel?: string | null;
  currentRevision: number | null;
  savedFor: string | null;
  saved: readonly PickerSavedRow[];
  bench: readonly PickerBenchRow[];
  labelOf: (id: string) => string | null;
}): PickerEntry[] {
  const { profileId, currentRevision, labelOf } = input;
  const out: PickerEntry[] = [];
  const savedIds = new Set<string>();
  if (input.savedFor === profileId) {
    for (const a of input.saved) {
      if (savedIds.has(a.id)) continue;
      savedIds.add(a.id);
      const label = techniqueLabel(a.technique);
      const raw = (a.title ?? "").trim();
      const title = raw && raw !== label && !isDefaultSavedTitle(raw, input.profileLabel) ? raw : null;
      out.push({
        ref: savedRef(a.id),
        kind: "saved",
        technique: a.technique,
        family: pickerFamilyOf(a.technique),
        label,
        detail: describeOptions(a.technique, a.params, () => a.partnerLabel),
        date: pickerDay(a.analysisAt) || null,
        title,
        state: a.locked ? "locked" : "saved",
        savedId: a.id,
        benchKey: null,
        itemKey: null,
        revision: null,
        partial: false,
        dirty: false,
        sortAt: a.analysisAt,
      });
    }
  }
  const prefix = `${profileId}|`;
  for (const b of input.bench) {
    if (!b.benchKey.startsWith(prefix)) continue; // başka profilin masası — asla
    const rev = Number(b.benchKey.slice(prefix.length));
    if (!Number.isFinite(rev)) continue;
    // Kayıtlı + açık: kayıtlı satır zaten listedeyse tek satır kalır.
    if (b.savedId && savedIds.has(b.savedId)) continue;
    out.push({
      ref: benchRef(b.benchKey, b.itemKey),
      kind: "bench",
      technique: b.technique,
      family: pickerFamilyOf(b.technique),
      label: techniqueLabel(b.technique),
      detail: describeOptions(b.technique, b.options, labelOf),
      date: null,
      title: null,
      // Kaydedildi ama kayıt satırı henüz listede değil (ör. liste yenilenmedi / sonraki sayfada): kaydedilmiş sayılır.
      state: b.savedId ? "saved" : currentRevision !== null && rev !== currentRevision ? "unsaved-old" : "unsaved",
      savedId: b.savedId,
      benchKey: b.benchKey,
      itemKey: b.itemKey,
      revision: rev,
      partial: !!b.partial,
      dirty: !!b.dirty,
      sortAt: "",
    });
  }
  // Aynı teknik + aynı gün + aynı ayrıntı → yalnız tarih yetmez: kayıt saati eklenir (ör. "05.11.2026 00:44").
  const dupKey = (e: PickerEntry) => `${e.technique}|${e.date}|${e.detail}|${e.title ?? ""}`;
  const seen = new Map<string, number>();
  for (const e of out) if (e.kind === "saved" && e.date) seen.set(dupKey(e), (seen.get(dupKey(e)) ?? 0) + 1);
  for (const e of out) if (e.kind === "saved" && e.date && (seen.get(dupKey(e)) ?? 0) > 1) e.date = `${e.date} ${pickerTime(e.sortAt)}`.trim();
  const fam = (e: PickerEntry) => PICKER_FAMILIES.indexOf(e.family);
  out.sort(
    (a, b) =>
      fam(a) - fam(b) ||
      a.label.localeCompare(b.label, "tr") ||
      // aynı teknikte önce bu oturumdaki (kaydedilmemiş) sonuçlar, sonra en yeni kayıt
      (a.kind === b.kind ? 0 : a.kind === "bench" ? -1 : 1) ||
      b.sortAt.localeCompare(a.sortAt),
  );
  return out;
}

/** Arama: teknik adı, ayrıntı, tarih ve kayıt adı içinde (Türkçe küçük harf). */
export function filterPickerEntries(entries: readonly PickerEntry[], query: string): PickerEntry[] {
  const q = query.trim().toLocaleLowerCase("tr");
  if (!q) return [...entries];
  return entries.filter((e) => `${e.label} ${e.detail} ${e.date ?? ""} ${e.title ?? ""}`.toLocaleLowerCase("tr").includes(q));
}

/** Kapalı seçicinin metni: "Natal · 04.11.2026 · Ali natal" / "Transit (tek an) · an … " */
export function pickerHeadline(e: Pick<PickerEntry, "label" | "date" | "title" | "detail" | "kind">): string {
  const parts = [e.label];
  if (e.date) parts.push(e.date);
  if (e.title) parts.push(e.title);
  else if (e.kind === "bench" && e.detail) parts.push(e.detail);
  return parts.join(" · ");
}
