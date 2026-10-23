"use client";

/**
 * Danışan detay — Ücretlendirme sekmesi (merkezi ücret yönetimi).
 *
 * Ücret artık seansa gömülü DEĞİL: danışana ait bütün ücret kayıtlarının TEK
 * KAYNAĞI burasıdır. Uzman istediği kadar bağımsız kayıt ekler (Seans/Ödev/
 * Analiz/Diğer). Toplam ücret üstte; ekle/düzenle/sil anında toplamı günceller.
 *
 * Güvenlik: tüm çağrılar x-user-id + x-session-token ile /api/clients/[id]/charges'a
 * gider; tenant/client kapsamı server-side doğrulanır (bkz. route).
 */

import { runInEffect } from "@/lib/runInEffect";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { formatDateAbsolute } from "@/lib/i18n/format";
import { useToast } from "@/components/ui/ToastProvider";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import { todayInZone } from "@/lib/time/reportTime";
import { isPaymentStatus, readPaymentStatus, summarizeUnpaid, type PaymentStatus } from "@/lib/danisan/chargePayment";
import { dyp } from "@/app/_premium/danisan-yolculugu/DypUi";

type ChargeCategory = "session" | "homework" | "analysis" | "other";
const CATEGORIES: ChargeCategory[] = ["session", "homework", "analysis", "other"];

type ClientCharge = {
  id: string;
  tenant_id: string;
  client_id: string;
  charge_date: string | null;
  category: ChargeCategory;
  detail: string | null;
  note: string | null;
  amount: number;
  /** WT7: paid | unpaid | null (eski kayıt = Belirtilmemiş). */
  payment_status?: PaymentStatus | null;
  source_session_id: string | null;
  created_at: string;
  updated_at: string;
};

type ChargeForm = {
  chargeDate: string;
  category: ChargeCategory;
  detail: string;
  note: string;
  amount: string;
  /** "" = seçilmedi (yeni kayıtta kaydetme engellenir; eski kayıtta dokunulmaz). */
  paymentStatus: PaymentStatus | "";
};

export type UnpaidSummary = { count: number; total: number };

type UcretlendirmeTabProps = {
  clientId: string;
  /** WT7: ücret listesi her yüklendiğinde/değiştiğinde ödenmemiş özeti (detay uyarısı + liste rozeti tazeleme). */
  onUnpaidChange?: (summary: UnpaidSummary) => void;
};

// Form varsayılanı: İstanbul takvim günü (UTC 00:00–03:00 "dün" hatası yok).
function todayISO() {
  return todayInZone();
}

function emptyForm(): ChargeForm {
  return { chargeDate: todayISO(), category: "session", detail: "", note: "", amount: "", paymentStatus: "" };
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(value);
}

/** Tutar geçerli (sonlu, > 0) mu? */
function amountValid(raw: string): boolean {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0;
}

const CATEGORY_TONE: Record<ChargeCategory, string> = {
  session: "border-[#d3dff0] bg-[#eaf0f8] text-[#2c5aa0]",
  homework: "border-[#cfe3e1] bg-[#e6f2f1] text-[#0f6e6e]",
  analysis: "border-[#d4dae3] bg-[#f2f4f7] text-[#1f3050]",
  other: "border-[#d4dae3] bg-[#f8f9fb] text-[#55637a]",
};

const PAYMENT_TONE: Record<PaymentStatus | "unknown", string> = {
  paid: "border-[#cfe7d8] bg-[#ebf6ef] text-[#17703f]",
  unpaid: "border-[#efc6c2] bg-[#fdf1f0] text-[#b42318]",
  unknown: "border-[#d4dae3] bg-[#f8f9fb] text-[#55637a]",
};

const inputCls =
  "w-full";
const labelCls = "mb-1.5 block";

export default function UcretlendirmeTab({ clientId, onUnpaidChange }: UcretlendirmeTabProps) {
  const t = useTranslations("clients.charges");
  const { showToast } = useToast();
  const deleteConfirm = useDeleteConfirm();

  const fmtDate = useCallback(
    (date: string | null) => (date ? formatDateAbsolute(date) : "—"),
    [],
  );

  const [tenantId, setTenantId] = useState<string | null>(null);
  const [charges, setCharges] = useState<ClientCharge[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ChargeForm>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ChargeForm>(emptyForm());
  const [loaded, setLoaded] = useState(false);

  const total = useMemo(
    () => charges.reduce((sum, c) => sum + Number(c.amount || 0), 0),
    [charges],
  );
  const unpaid = useMemo(() => summarizeUnpaid(charges), [charges]);

  // Yalnız gerçek yüklemeden sonra bildir (ilk boş durum "ödenmemiş yok" sayılmasın).
  useEffect(() => {
    if (loaded) onUnpaidChange?.(unpaid);
  }, [loaded, unpaid, onUnpaidChange]);

  useEffect(() => {
    void getSyncedTenantId().then(setTenantId);
  }, []);

  const loadCharges = useCallback(async () => {
    if (!clientId || !tenantId) return;
    setLoading(true);
    const token = readSessionToken();
    const res = await fetch(`/api/clients/${clientId}/charges`, {
      headers: {
        "x-user-id": readYasamUser()?.id ?? "",
        ...(token ? { "x-session-token": token } : {}),
      },
    });
    if (!res.ok) {
      console.error("Ücret kayıtları yüklenemedi");
      showToast({ title: t("toast.failTitle"), message: t("toast.loadFailed"), type: "error" });
      setLoading(false);
      return;
    }
    const json = (await res.json()) as { charges?: ClientCharge[] };
    // Sıralama: tarih desc (null sonda), sonra created_at desc.
    const list = (json.charges ?? []).slice().sort((a, b) => {
      const d = (b.charge_date ?? "").localeCompare(a.charge_date ?? "");
      if (d !== 0) return d;
      return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    });
    setCharges(list);
    setLoaded(true);
    setLoading(false);
  }, [clientId, tenantId, showToast, t]);

  useEffect(() => {
    if (!tenantId) return;
    runInEffect(() => {
      loadCharges();
    });
  }, [tenantId, loadCharges]);

  /** Form doğrulama (server ile ayna). Geçerliyse null, değilse hata mesajı döner. */
  function validate(f: ChargeForm, isNew: boolean): string | null {
    if (!CATEGORIES.includes(f.category)) return t("validation.category");
    if (!amountValid(f.amount)) return t("validation.amount");
    if (f.category === "other" && !f.detail.trim()) return t("validation.detailRequired");
    // WT7: yeni kayıtta ödeme durumu açık seçim; eski (Belirtilmemiş) kayıt düzenlenirken zorlanmaz.
    if (isNew && !isPaymentStatus(f.paymentStatus)) return t("validation.paymentStatus");
    return null;
  }

  function toPayload(f: ChargeForm) {
    return {
      charge_date: f.chargeDate || null,
      category: f.category,
      detail: f.detail.trim() || null,
      note: f.note.trim() || null,
      amount: Number(f.amount),
      // Seçilmediyse gönderilmez → eski kaydın NULL durumu korunur (tahmin yazılmaz).
      ...(isPaymentStatus(f.paymentStatus) ? { payment_status: f.paymentStatus } : {}),
    };
  }

  async function addCharge() {
    if (!clientId || !tenantId) {
      showToast({ title: t("toast.failTitle"), message: t("toast.noClient"), type: "error" });
      return;
    }
    const err = validate(form, true);
    if (err) {
      showToast({ title: t("toast.failTitle"), message: err, type: "error" });
      return;
    }
    setSaving(true);
    const token = readSessionToken();
    const res = await fetch(`/api/clients/${clientId}/charges`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": readYasamUser()?.id ?? "",
        ...(token ? { "x-session-token": token } : {}),
      },
      body: JSON.stringify(toPayload(form)),
    }).catch(() => null); // ağ hatası → saving takılı kalmasın
    if (!res || !res.ok) {
      console.error("Ücret kaydı eklenemedi");
      showToast({ title: t("toast.failTitle"), message: t("toast.addFailed"), type: "error" });
      setSaving(false);
      return;
    }
    // Kayıt oluştu: form önce kapanır (aynı ücret yeniden gönderilemez); liste tazeleme
    // ağ hatası verse de "eklenemedi" denmez ve saving her durumda serbest kalır.
    setForm(emptyForm());
    setShowForm(false);
    try {
      await loadCharges();
    } catch {
      console.error("Ücret eklendi; liste tazelenemedi");
    } finally {
      setSaving(false);
    }
    showToast({ title: t("toast.successTitle"), message: t("toast.added"), type: "success" });
  }

  function startEdit(charge: ClientCharge) {
    setEditingId(charge.id);
    setEditForm({
      chargeDate: charge.charge_date || todayISO(),
      category: charge.category,
      detail: charge.detail || "",
      note: charge.note || "",
      amount: charge.amount === null || charge.amount === undefined ? "" : String(charge.amount),
      paymentStatus: readPaymentStatus(charge.payment_status) ?? "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(emptyForm());
  }

  async function updateCharge(id: string) {
    const err = validate(editForm, false);
    if (err) {
      showToast({ title: t("toast.failTitle"), message: err, type: "error" });
      return;
    }
    setSaving(true);
    const token = readSessionToken();
    const res = await fetch(`/api/clients/${clientId}/charges`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": readYasamUser()?.id ?? "",
        ...(token ? { "x-session-token": token } : {}),
      },
      body: JSON.stringify({ id, ...toPayload(editForm) }),
    }).catch(() => null); // ağ hatası → saving takılı kalmasın
    if (!res || !res.ok) {
      console.error("Ücret kaydı güncellenemedi");
      showToast({ title: t("toast.failTitle"), message: t("toast.updateFailed"), type: "error" });
      setSaving(false);
      return;
    }
    cancelEdit();
    try {
      await loadCharges();
    } catch {
      console.error("Ücret güncellendi; liste tazelenemedi");
    } finally {
      setSaving(false);
    }
    showToast({ title: t("toast.successTitle"), message: t("toast.updated"), type: "success" });
  }

  /** WT7: Ödenmedi → Ödendi tek dokunuşla (kalıcı PATCH; yalnız payment_status). */
  async function markPaid(id: string) {
    if (saving) return;
    setSaving(true);
    const token = readSessionToken();
    const res = await fetch(`/api/clients/${clientId}/charges`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": readYasamUser()?.id ?? "",
        ...(token ? { "x-session-token": token } : {}),
      },
      body: JSON.stringify({ id, payment_status: "paid" }),
    }).catch(() => null);
    if (!res || !res.ok) {
      showToast({ title: t("toast.failTitle"), message: t("toast.updateFailed"), type: "error" });
      setSaving(false);
      return;
    }
    const json = (await res.json().catch(() => null)) as { charge?: ClientCharge } | null;
    setCharges((prev) => prev.map((c) => (c.id === id ? { ...c, ...(json?.charge ?? {}), payment_status: "paid" } : c)));
    setSaving(false);
    showToast({ title: t("toast.successTitle"), message: t("toast.markedPaid"), type: "success" });
  }

  async function removeCharge(id: string) {
    const ok = await deleteConfirm({ title: t("delete.title"), message: t("delete.message") });
    if (!ok) return;
    const token = readSessionToken();
    const res = await fetch(`/api/clients/${clientId}/charges?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: {
        "x-user-id": readYasamUser()?.id ?? "",
        ...(token ? { "x-session-token": token } : {}),
      },
    }).catch(() => null);
    if (!res || !res.ok) {
      console.error("Ücret kaydı silinemedi");
      showToast({ title: t("toast.failTitle"), message: t("toast.deleteFailed"), type: "error" });
      return;
    }
    if (editingId === id) cancelEdit();
    setCharges((prev) => prev.filter((c) => c.id !== id));
    showToast({ title: t("toast.successTitle"), message: t("toast.deleted"), type: "success" });
  }

  function renderForm(
    data: ChargeForm,
    onChange: <K extends keyof ChargeForm>(key: K, value: ChargeForm[K]) => void,
    isNew: boolean,
  ) {
    const payLabelId = `pay-label-${isNew ? "new" : "edit"}`;
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <span className={`${dyp.kLabel} ${labelCls}`} id={payLabelId}>
            {t("payment.label")}
            {isNew ? <span className="text-[#b42318]"> *</span> : null}
          </span>
          <div role="radiogroup" aria-labelledby={payLabelId} className="grid grid-cols-2 gap-2 sm:max-w-sm">
            {(["paid", "unpaid"] as const).map((ps) => {
              const active = data.paymentStatus === ps;
              const tone = ps === "paid"
                ? active ? "border-[#2c5aa0] bg-[#eaf0f8] text-[#13284b] ring-1 ring-[#2c5aa0]" : "border-[#d4dae3] bg-[#f8f9fb] text-[#1f3050] hover:bg-[#f2f4f7]"
                : active ? "border-[#2c5aa0] bg-[#eaf0f8] text-[#13284b] ring-1 ring-[#2c5aa0]" : "border-[#d4dae3] bg-[#f8f9fb] text-[#1f3050] hover:bg-[#f2f4f7]";
              return (
                <button
                  key={ps}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onChange("paymentStatus", ps)}
                  className={`min-h-[44px] rounded-[10px] border px-3 py-2 text-sm font-bold transition ${tone}`}
                >
                  {t(`payment.${ps}`)}
                </button>
              );
            })}
          </div>
          {isNew || data.paymentStatus === "" ? (
            <p className={`${dyp.kMeta} mt-1`}>
              {isNew ? t("payment.requiredHint") : t("payment.legacyHint")}
            </p>
          ) : null}
        </div>
        <div>
          <label className={`${dyp.kLabel} ${labelCls}`}>{t("form.dateLabel")}</label>
          <input
            type="date"
            value={data.chargeDate}
            onChange={(e) => onChange("chargeDate", e.target.value)}
            className={`${dyp.kInput} ${inputCls}`}
          />
        </div>
        <div>
          <label className={`${dyp.kLabel} ${labelCls}`}>{t("form.categoryLabel")}</label>
          <select
            value={data.category}
            onChange={(e) => onChange("category", e.target.value as ChargeCategory)}
            className={`${dyp.kInput} ${inputCls}`}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`category.${c}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={`${dyp.kLabel} ${labelCls}`}>{t(`form.detailLabel.${data.category}`)}</label>
          <input
            value={data.detail}
            onChange={(e) => onChange("detail", e.target.value)}
            placeholder={t(`form.detailPlaceholder.${data.category}`)}
            className={`${dyp.kInput} ${inputCls}`}
          />
        </div>
        <div>
          <label className={`${dyp.kLabel} ${labelCls}`}>{t("form.amountLabel")}</label>
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={data.amount}
            onChange={(e) => onChange("amount", e.target.value)}
            placeholder={t("form.amountPlaceholder")}
            className={`${dyp.kInput} ${inputCls}`}
          />
        </div>
        <div className="md:col-span-2">
          <label className={`${dyp.kLabel} ${labelCls}`}>{t("form.noteLabel")}</label>
          <textarea
            value={data.note}
            onChange={(e) => onChange("note", e.target.value)}
            placeholder={t("form.notePlaceholder")}
            rows={2}
            className={`${dyp.kInput} ${inputCls} resize-none`}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Üst: Toplam Ücret + Yeni ekle ── */}
      <div className={`${dyp.kHeader} overflow-hidden`}>
        <div>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className={`${dyp.kEyebrow} mb-2 inline-flex`}>
                {t("header.badge")}
              </div>
              <h2 className={dyp.kTitle}>{t("header.title")}</h2>
              <p className={`${dyp.kDesc} mt-2 max-w-3xl`}>
                {t("header.subtitle")}
              </p>
            </div>

            <div className="flex w-full flex-col items-stretch gap-2 md:w-auto md:items-end">
              <div className={`${dyp.kStat} ${dyp.kStatAccent}`}>
                <div className={dyp.kStatValue}>{formatMoney(total)}</div>
                <div className={dyp.kStatLabel}>
                  {t("totalLabel")} · {charges.length} {t("countLabel")}
                </div>
                {unpaid.count > 0 ? (
                  <div data-testid="charges-unpaid-summary" className="mt-1 text-xs font-bold text-[#b42318]">
                    {t("payment.unpaidSummary", { count: unpaid.count, total: formatMoney(unpaid.total) })}
                  </div>
                ) : null}
              </div>
              {/* Üst özet kartında yalnız "Yeni Ücret Ekle" bulunur; form açıkken
                  gizlenir. Tek "Vazgeç" aksiyonu form kartının içindedir (aşağıda). */}
              {!showForm && (
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className={`${dyp.kBtnPrimary} w-full`}
                >
                  {t("addButton")}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Yeni kayıt formu ── */}
      {showForm && (
        <div className="overflow-hidden rounded-xl border border-[#e3e7ee] bg-white">
          {/* Form başlığında ayrı Vazgeç YOK — tek Vazgeç alttaki aksiyon alanında. */}
          <div className={`${dyp.kModalHead} flex items-center justify-between`}>
            <h3 className={dyp.kSubtitle}>{t("form.newTitle")}</h3>
          </div>
          <div className="p-4">
            {renderForm(form, (key, value) => setForm((p) => ({ ...p, [key]: value })), true)}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setForm(emptyForm());
                }}
                className={dyp.kBtnSecondary}
              >
                {t("form.cancel")}
              </button>
              <button
                type="button"
                onClick={addCharge}
                disabled={saving}
                className={dyp.kBtnSave}
              >
                {saving ? t("form.saving") : t("form.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Kayıt listesi ── */}
      <div className={dyp.kCardMuted}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className={dyp.kSubtitle}>{t("header.title")}</h3>
          <button
            onClick={loadCharges}
            disabled={loading}
            className={`${dyp.kBtnSecondary} ${dyp.kBtnSm} w-fit`}
          >
            {loading ? t("loading") : t("refresh")}
          </button>
        </div>

        {loading ? (
          <div className={dyp.kEmpty}>
            {t("loadingRecords")}
          </div>
        ) : charges.length === 0 ? (
          <div className={dyp.kEmpty}>
            <div className={dyp.kSubtitle}>{t("empty.title")}</div>
            <p className={`${dyp.kDesc} mt-2`}>{t("empty.hint")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {charges.map((charge) => {
              const isEditing = editingId === charge.id;
              if (isEditing) {
                return (
                  <div key={charge.id} className={dyp.kCard}>
                    <h4 className={`${dyp.kSubtitle} mb-3`}>{t("form.editTitle")}</h4>
                    {renderForm(editForm, (key, value) => setEditForm((p) => ({ ...p, [key]: value })), false)}
                    <div className="mt-4 flex justify-end gap-2">
                      <button
                        onClick={cancelEdit}
                        className={dyp.kBtnSecondary}
                      >
                        {t("form.cancel")}
                      </button>
                      <button
                        onClick={() => updateCharge(charge.id)}
                        disabled={saving}
                        className={dyp.kBtnSave}
                      >
                        {saving ? t("form.updating") : t("form.update")}
                      </button>
                    </div>
                  </div>
                );
              }
              return (
                <div
                  key={charge.id}
                  className={`${dyp.kCard} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-[#0f1d36]">{fmtDate(charge.charge_date)}</span>
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${CATEGORY_TONE[charge.category]}`}
                      >
                        {t(`category.${charge.category}`)}
                      </span>
                      {charge.detail ? (
                        <span className="truncate text-sm font-semibold text-[#1f3050]">{charge.detail}</span>
                      ) : null}
                      <span
                        data-testid="charge-payment-chip"
                        className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${PAYMENT_TONE[readPaymentStatus(charge.payment_status) ?? "unknown"]}`}
                      >
                        {t(`payment.${readPaymentStatus(charge.payment_status) ?? "unknown"}`)}
                      </span>
                    </div>
                    {charge.note ? (
                      <p className={`${dyp.kDesc} mt-1.5 whitespace-pre-wrap`}>
                        {charge.note}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <span className="rounded-[10px] border border-[#e3e7ee] bg-[#f8f9fb] px-3 py-1.5 text-sm font-extrabold text-[#0f1d36]">
                      {formatMoney(Number(charge.amount || 0))}
                    </span>
                    <div className="flex flex-wrap justify-end gap-2">
                      {readPaymentStatus(charge.payment_status) === "unpaid" ? (
                        <button
                          type="button"
                          onClick={() => markPaid(charge.id)}
                          disabled={saving}
                          className={`${dyp.kBtnSave} ${dyp.kBtnSm}`}
                        >
                          {t("payment.markPaid")}
                        </button>
                      ) : null}
                      <button
                        onClick={() => startEdit(charge)}
                        className={`${dyp.kBtnSecondary} ${dyp.kBtnSm}`}
                      >
                        {t("item.edit")}
                      </button>
                      <button
                        onClick={() => removeCharge(charge.id)}
                        className={`${dyp.kBtnDanger} ${dyp.kBtnSm}`}
                      >
                        {t("item.delete")}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
