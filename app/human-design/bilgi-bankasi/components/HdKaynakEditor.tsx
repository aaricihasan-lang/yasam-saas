"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useKbLabels } from "../helpers/useKbLabels";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import type { HdSourceRightsStatus, HdSourceType } from "@/lib/human-design/types";
import {
  insertHdSource,
  updateHdSource,
  deleteHdSource,
  type HdSourceRow,
  type HdSourceEditable,
} from "../helpers/hdKaynaklar";

const fieldBase =
  "w-full rounded-xl border border-indigo-200/90 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm outline-none ring-1 ring-indigo-100/60 transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200/50 placeholder:text-slate-400";
const labelCls = "mb-1.5 block text-xs font-bold text-slate-700";
const sectionCls = "mb-2 mt-4 text-xs font-black uppercase tracking-widest text-indigo-700";

// Kaynak türü kodları (veri/API'de İngilizce enum). Görünen ad: hd.knowledge.source.types.<kod>.
const SOURCE_TYPES: { code: HdSourceType }[] = [
  { code: "book" },
  { code: "article" },
  { code: "website" },
  { code: "video" },
  { code: "teaching_note" },
  { code: "regulatory_document" },
  { code: "oral_source" },
  { code: "other" },
];

// Telif/hak durumu kodları (enum değerleri veri/API'de İngilizce kalır). Kullanıcıya görünen TEK etiket kaynağı
// hd.knowledge.source.rights.<kod> (TR değerleri önceki Türkçe etiketlerle bayt-bayt aynı); hem bu editördeki dropdown
// hem kayıt editöründeki kaynak listesi rozeti useRightsStatusLabel kullanır.
export const RIGHTS_STATUSES: { code: HdSourceRightsStatus }[] = [
  { code: "unknown" },
  { code: "public_domain" },
  { code: "licensed" },
  { code: "permission_granted" },
  { code: "permission_pending" },
  { code: "restricted" },
];

/** Ekran dilinde telif durumu etiketi (kod değişmez; bilinmeyen/eksik kod güvenli biçimde "unknown" = "Belirsiz"). */
export function useRightsStatusLabel(): (code: HdSourceRightsStatus | string | null | undefined) => string {
  const t = useTranslations("hd.knowledge.source");
  return (code) => {
    const known = RIGHTS_STATUSES.find((r) => r.code === code)?.code ?? "unknown";
    return t(`rights.${known}`);
  };
}

const URL_PLACEHOLDER = "https://...";

// Telifi belirsiz / kısıtlı / izin bekleyen kaynaklar private-only olur:
// rapor ve uzman dağıtımına kapatılır (Ürün Kuralı 14).
function isDistributionLocked(rights: HdSourceRightsStatus): boolean {
  return rights === "restricted" || rights === "permission_pending" || rights === "unknown";
}

// Detaylı bölümün otomatik açılıp açılmayacağını belirler: kayıtta güvenli
// varsayılanlar dışında herhangi bir detay alanı doluysa bölüm açık başlar.
// (Yeni taslakta güvenli varsayılanlar geçerli olduğu için kapalı kalır.)
function hasDetailedData(s: HdSourceRow): boolean {
  return (
    (s.source_type ?? "other") !== "other" ||
    !!s.accessed_on ||
    !!s.original_language_tag ||
    !!s.original_text ||
    !!s.faithful_translation_tr ||
    !!s.source_specific_note ||
    (s.rights_status ?? "unknown") !== "unknown" ||
    !!s.permission_reference ||
    !!s.private_use_allowed ||
    !!s.client_report_allowed ||
    !!s.expert_distribution_allowed ||
    !!s.commercial_use_allowed
  );
}

type Props = {
  source: HdSourceRow;
  onSaved: (updated: HdSourceRow) => void;
  onDeleted: (id: string) => void;
  /**
   * Kaydedilmemiş yeni kaynak taslağı. `true` iken "Kaynağı Kaydet" bir POST (insert)
   * yapar ve `onCreated` ile kalıcı satırı üst bileşene bildirir; "Taslağı İptal Et"
   * hiçbir API çağrısı yapmadan yalnız yerel taslağı kapatır (`onDiscard`).
   * `false`/tanımsız iken davranış eskisi gibidir: PATCH + DELETE.
   */
  isDraft?: boolean;
  /** Taslağı POST etmek için gerekli kayıt kimliği (yalnız isDraft iken kullanılır). */
  recordId?: string;
  /** Taslak kalıcı olarak oluşturulduğunda (POST başarılı) çağrılır. */
  onCreated?: (created: HdSourceRow) => void;
  /** Kaydedilmemiş taslak iptal edildiğinde çağrılır — API DELETE YOK. */
  onDiscard?: () => void;
};

type FormState = {
  source_name: string;
  source_type: HdSourceType;
  author_or_organization: string;
  title: string;
  page_or_section: string;
  source_url: string;
  accessed_on: string;
  original_language_tag: string;
  original_text: string;
  faithful_translation_tr: string;
  source_specific_note: string;
  rights_status: HdSourceRightsStatus;
  permission_reference: string;
  private_use_allowed: boolean;
  client_report_allowed: boolean;
  expert_distribution_allowed: boolean;
  commercial_use_allowed: boolean;
  sort_order: number;
};

function rowToForm(s: HdSourceRow): FormState {
  return {
    source_name: s.source_name ?? "",
    source_type: s.source_type ?? "other",
    author_or_organization: s.author_or_organization ?? "",
    title: s.title ?? "",
    page_or_section: s.page_or_section ?? "",
    source_url: s.source_url ?? "",
    accessed_on: s.accessed_on ?? "",
    original_language_tag: s.original_language_tag ?? "",
    original_text: s.original_text ?? "",
    faithful_translation_tr: s.faithful_translation_tr ?? "",
    source_specific_note: s.source_specific_note ?? "",
    rights_status: s.rights_status ?? "unknown",
    permission_reference: s.permission_reference ?? "",
    private_use_allowed: s.private_use_allowed ?? false,
    client_report_allowed: s.client_report_allowed ?? false,
    expert_distribution_allowed: s.expert_distribution_allowed ?? false,
    commercial_use_allowed: s.commercial_use_allowed ?? false,
    sort_order: s.sort_order ?? 0,
  };
}

export function HdKaynakEditor({
  source,
  onSaved,
  onDeleted,
  isDraft = false,
  recordId,
  onCreated,
  onDiscard,
  onDirtyChange,
}: Props & { onDirtyChange?: (dirty: boolean) => void }) {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const t = useTranslations("hd.knowledge.source");
  const tk = useTranslations("hd.knowledge");
  const labels = useKbLabels();
  // Aktif kaynak değişince bileşen `key` ile remount edilir (çağıran editör) →
  // form doğrudan initializer'dan yüklenir; effect içinde setState gerekmez.
  const [form, setForm] = useState<FormState>(() => rowToForm(source));
  const [saving, setSaving] = useState(false);
  // Detaylı bölüm: yeni taslakta kapalı; mevcut kayıtta detay verisi varsa açık.
  // Başlangıç değeri ilk `source`'tan türetilir; kullanıcı sonradan açıp kapatabilir.
  const [showDetails, setShowDetails] = useState<boolean>(
    () => !isDraft && hasDetailedData(source),
  );

  const locked = isDistributionLocked(form.rights_status);

  // P2-13: kaydedilmemiş kaynak düzenlemesi üst editöre bildirilir → kaynak/sekme değişimi
  // ve sayfadan çıkışta sorulur (önceden uzun özgün metin/çeviri sessizce kayboluyordu).
  const [baseline, setBaseline] = useState(() => JSON.stringify(rowToForm(source)));
  const [version, setVersion] = useState<string | null>(source.updated_at ?? null);
  // Taslak (henüz kaydedilmemiş yeni kaynak) dahil: yazılan metin, sekme/kaynak değişiminde
  // editör unmount olunca kaybolacağından taslaktaki her değişiklik de "kirli" sayılır.
  const dirty = JSON.stringify(form) !== baseline;
  const onDirtyRef = useRef(onDirtyChange);
  useEffect(() => {
    onDirtyRef.current = onDirtyChange;
  });
  useEffect(() => {
    onDirtyRef.current?.(dirty);
  }, [dirty]);
  useEffect(() => () => onDirtyRef.current?.(false), []);

  function setRights(rights: HdSourceRightsStatus) {
    setForm((p) => {
      const lock = isDistributionLocked(rights);
      return {
        ...p,
        rights_status: rights,
        // private-only'e düşünce dağıtım bayraklarını kapat
        client_report_allowed: lock ? false : p.client_report_allowed,
        expert_distribution_allowed: lock ? false : p.expert_distribution_allowed,
        commercial_use_allowed: lock ? false : p.commercial_use_allowed,
      };
    });
  }

  async function handleSave() {
    if (!form.source_name.trim()) {
      showToast({ message: t("nameRequired"), type: "warning" });
      return;
    }
    setSaving(true);
    // Detaylı bölüm kapalı olsa da form state'i (dolayısıyla gizli detay değerleri)
    // korunur ve payload'a girer — kapatmak alanları TEMİZLEMEZ.
    const payload: HdSourceEditable = {
      source_name: form.source_name.trim(),
      source_type: form.source_type,
      author_or_organization: form.author_or_organization.trim() || null,
      title: form.title.trim() || null,
      page_or_section: form.page_or_section.trim() || null,
      source_url: form.source_url.trim() || null,
      accessed_on: form.accessed_on.trim() || null,
      original_language_tag: form.original_language_tag.trim() || null,
      original_text: form.original_text.trim() || null,
      faithful_translation_tr: form.faithful_translation_tr.trim() || null,
      source_specific_note: form.source_specific_note.trim() || null,
      rights_status: form.rights_status,
      permission_reference: form.permission_reference.trim() || null,
      private_use_allowed: form.private_use_allowed,
      client_report_allowed: locked ? false : form.client_report_allowed,
      expert_distribution_allowed: locked ? false : form.expert_distribution_allowed,
      commercial_use_allowed: locked ? false : form.commercial_use_allowed,
      sort_order: form.sort_order,
    };
    // Yeni taslak → POST (insert); mevcut kayıtlı kaynak → PATCH (update).
    if (isDraft) {
      const { id, error } = await insertHdSource(recordId ?? source.record_id, payload);
      setSaving(false);
      if (error || !id) {
        showToast({ message: t("createFailed", { error: labels.err(error) }), type: "error" });
        return;
      }
      showToast({ message: t("created"), type: "success" });
      onCreated?.({ ...source, ...payload, id } as HdSourceRow);
      return;
    }
    const { error, conflict, updatedAt } = await updateHdSource(source.id, payload, version);
    setSaving(false);
    if (error) {
      showToast({ message: conflict ? error : tk("form.error", { error: labels.err(error) }), type: "error" });
      return;
    }
    setBaseline(JSON.stringify(form));
    setVersion(updatedAt ?? version);
    onDirtyRef.current?.(false);
    showToast({ message: t("saved"), type: "success" });
    onSaved({ ...source, ...payload, updated_at: updatedAt ?? source.updated_at } as HdSourceRow);
  }

  async function handleDelete() {
    // Kaydedilmemiş taslak: API DELETE YOK — yalnız yerel taslağı kapat.
    if (isDraft) {
      onDiscard?.();
      return;
    }
    const ok = await confirm({
      title: t("deleteTitle"),
      message: t("deleteMessage"),
      tone: "danger",
      confirmText: tk("list.delete"),
    });
    if (!ok) return;
    const { error } = await deleteHdSource(source.id);
    if (error) {
      showToast({ message: tk("form.error", { error: labels.err(error) }), type: "error" });
      return;
    }
    showToast({ message: t("deleted"), type: "success" });
    onDeleted(source.id);
  }

  return (
    <div className="space-y-1">
      {/* ---------- HIZLI KAYNAK KAYDI ---------- */}
      <p className={`${sectionCls} mt-0`}>{t("quickTitle")}</p>
      <p className="mb-3 text-[11px] leading-snug text-slate-500">
        {t("quickHelp")}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>{t("name")}</label>
          <input
            type="text"
            value={form.source_name}
            onChange={(e) => setForm((p) => ({ ...p, source_name: e.target.value }))}
            placeholder={t("namePh")}
            className={`h-9 ${fieldBase}`}
          />
        </div>
        <div>
          <label className={labelCls}>{t("author")}</label>
          <input
            type="text"
            value={form.author_or_organization}
            onChange={(e) => setForm((p) => ({ ...p, author_or_organization: e.target.value }))}
            placeholder={t("authorPh")}
            className={`h-9 ${fieldBase}`}
          />
        </div>
        <div>
          <label className={labelCls}>{t("work")}</label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            placeholder={t("workPh")}
            className={`h-9 ${fieldBase}`}
          />
        </div>
        <div>
          <label className={labelCls}>{t("page")}</label>
          <input
            type="text"
            value={form.page_or_section}
            onChange={(e) => setForm((p) => ({ ...p, page_or_section: e.target.value }))}
            placeholder={t("pagePh")}
            className={`h-9 ${fieldBase}`}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>{t("url")}</label>
          <input
            type="text"
            value={form.source_url}
            onChange={(e) => setForm((p) => ({ ...p, source_url: e.target.value }))}
            placeholder={URL_PLACEHOLDER}
            className={`h-9 ${fieldBase}`}
          />
        </div>
      </div>

      {/* ---------- DETAYLI KAYNAK BİLGİLERİ (açılır-kapanır) ---------- */}
      <div className="mt-4 border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          aria-expanded={showDetails}
          className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1 text-left transition hover:bg-slate-50"
        >
          <span className="text-xs font-black uppercase tracking-widest text-indigo-700">
            {showDetails
              ? t("hideDetails")
              : t("showDetails")}
          </span>
          <span className="shrink-0 text-slate-400">{showDetails ? "▾" : "▸"}</span>
        </button>

        {showDetails && (
          <div className="mt-2">
            <p className="mb-3 text-[11px] leading-snug text-slate-500">
              {t("detailsHelp")}
            </p>

            {/* Künye detayları */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>{t("type")}</label>
                <select
                  value={form.source_type}
                  onChange={(e) => setForm((p) => ({ ...p, source_type: e.target.value as HdSourceType }))}
                  className={`h-9 ${fieldBase}`}
                >
                  {SOURCE_TYPES.map((st) => (
                    <option key={st.code} value={st.code}>{t(`types.${st.code}`)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>{t("accessed")}</label>
                <input
                  type="date"
                  value={form.accessed_on}
                  onChange={(e) => setForm((p) => ({ ...p, accessed_on: e.target.value }))}
                  className={`h-9 ${fieldBase}`}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>{t("origLang")}</label>
                <input
                  type="text"
                  value={form.original_language_tag}
                  onChange={(e) => setForm((p) => ({ ...p, original_language_tag: e.target.value }))}
                  placeholder={t("origLangPh")}
                  className={`h-9 ${fieldBase}`}
                />
              </div>
            </div>

            {/* Metin katmanları */}
            <p className={sectionCls}>{t("textLayers")}</p>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>{t("origText")}</label>
                <textarea
                  value={form.original_text}
                  onChange={(e) => setForm((p) => ({ ...p, original_text: e.target.value }))}
                  rows={4}
                  placeholder={t("origTextPh")}
                  className={`${fieldBase} resize-y leading-relaxed`}
                />
              </div>
              <div>
                <label className={labelCls}>{t("faithful")}</label>
                <div className="mb-1.5 rounded-lg border border-amber-200/80 bg-amber-50/70 px-2.5 py-1.5 text-[11px] font-semibold leading-snug text-amber-800">
                  {t("faithfulHelp")}
                </div>
                <textarea
                  value={form.faithful_translation_tr}
                  onChange={(e) => setForm((p) => ({ ...p, faithful_translation_tr: e.target.value }))}
                  rows={4}
                  placeholder={t("faithfulPh")}
                  className={`${fieldBase} resize-y leading-relaxed`}
                />
              </div>
              <div>
                <label className={labelCls}>{t("note")}</label>
                <textarea
                  value={form.source_specific_note}
                  onChange={(e) => setForm((p) => ({ ...p, source_specific_note: e.target.value }))}
                  rows={2}
                  className={`${fieldBase} resize-y leading-relaxed`}
                />
              </div>
            </div>

            {/* Hak / kullanım */}
            <p className={sectionCls}>{t("rightsTitle")}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>{t("rightsStatus")}</label>
                <select
                  value={form.rights_status}
                  onChange={(e) => setRights(e.target.value as HdSourceRightsStatus)}
                  className={`h-9 ${fieldBase}`}
                >
                  {RIGHTS_STATUSES.map((r) => (
                    <option key={r.code} value={r.code}>{t(`rights.${r.code}`)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>{t("permRef")}</label>
                <input
                  type="text"
                  value={form.permission_reference}
                  onChange={(e) => setForm((p) => ({ ...p, permission_reference: e.target.value }))}
                  placeholder={t("permRefPh")}
                  className={`h-9 ${fieldBase}`}
                />
              </div>
            </div>
            {locked && (
              <p className="mt-2 rounded-lg border border-rose-200/80 bg-rose-50/70 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700">
                {t("lockedNote")}
              </p>
            )}
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {([
                ["private_use_allowed", false],
                ["client_report_allowed", true],
                ["expert_distribution_allowed", true],
                ["commercial_use_allowed", true],
              ] as const).map(([key, gated]) => {
                const label = t(`flags.${key}`);
                const disabled = gated && locked;
                const checked = disabled ? false : form[key];
                return (
                  <label
                    key={key}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold ${
                      disabled ? "cursor-not-allowed text-slate-400" : "text-slate-700"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.checked }))}
                      className="h-4 w-4 rounded border-indigo-300 accent-indigo-600 disabled:opacity-50"
                    />
                    {label}
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Aksiyonlar */}
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={handleDelete}
          className="h-9 rounded-xl border border-rose-200 bg-white px-4 text-sm font-black uppercase tracking-wide text-rose-600 shadow-sm transition hover:border-rose-300 hover:bg-rose-50"
        >
          {isDraft ? t("cancelDraft") : t("deleteSource")}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="h-9 rounded-xl border border-indigo-300/80 bg-gradient-to-r from-indigo-600 to-violet-600 px-6 text-sm font-black uppercase tracking-wide text-white shadow-[0_4px_16px_-4px_rgba(79,70,229,0.4)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? tk("editor.saving") : t("save")}
        </button>
      </div>
    </div>
  );
}
