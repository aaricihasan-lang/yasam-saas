"use client";

// AŞAMA 3C — Yeni danışan: merkezî Danışan Yolculuğu danışanı + bağlı Human Design profili.
// Ad ve soyad ayrı ve ZORUNLU (merkezî kayıttan gelir); doğum tarihi/saati/yeri zorunlu. Yer yalnız
// listeden (Location Search) seçilir — saat dilimi/koordinat kullanıcıya gösterilmez, sunucu çözer.
// Oluşturma sonrası danışan çalışma alanına (Hesapla) geçilir. Çift tık/ağ tekrarı aynı request_id ile
// aynı kaydı döndürür (çift danışan yok).

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useHdLeaveGuard } from "../../hooks/useHdLeaveGuard";
import { useToast } from "@/components/ui/ToastProvider";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { journeyAction } from "@/lib/human-design/api/journeyClient";
import { HdBirthLocationPicker, type HdPickedLocation } from "../../components/HdBirthLocationPicker";

export const hdFieldBase =
  "w-full rounded-xl border border-indigo-200/90 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm outline-none ring-1 ring-indigo-100/60 transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200/50 placeholder:text-slate-400";
export const hdLabelCls = "mb-1.5 block text-xs font-bold text-slate-700";

const empty = { ad: "", soyad: "", dogum: "", birth_time: "" };

function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "";
}

export function HdClientForm() {
  const router = useRouter();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [form, setForm] = useState(empty);
  const [birthLoc, setBirthLoc] = useState<HdPickedLocation | null>(null);
  const [saving, setSaving] = useState(false);
  const requestIdRef = useRef<string>("");

  const dirty = Object.values(form).some((v) => v.trim() !== "") || !!birthLoc;
  const confirmLeave = useCallback(
    () =>
      confirm({
        title: "Kaydedilmemiş danışan",
        message: "Girdiğiniz danışan bilgileri henüz kaydedilmedi. Sayfadan ayrılmak istiyor musunuz?",
        confirmText: "Bilgileri At ve Çık",
        cancelText: "Sayfada Kal",
        tone: "danger",
      }),
    [confirm],
  );
  useHdLeaveGuard(dirty && !saving, confirmLeave);

  function set(field: keyof typeof empty) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      requestIdRef.current = ""; // içerik değişti → yeni deneme yeni istek kimliği
      setForm((p) => ({ ...p, [field]: e.target.value }));
    };
  }

  async function handleSave() {
    if (saving) return;
    if (readYasamUser()?.is_demo_account === true) {
      showToast({ message: "Demo hesabında danışan eklenemez.", type: "info" });
      return;
    }
    const missing = [
      !form.ad.trim() && "Ad",
      !form.soyad.trim() && "Soyad",
      !form.dogum && "Doğum Tarihi",
      !form.birth_time && "Doğum Saati",
      !birthLoc && "Doğum Yeri (listeden seçin)",
    ].filter(Boolean);
    if (missing.length > 0) {
      showToast({ message: `Zorunlu alanlar: ${missing.join(", ")}.`, type: "warning" });
      return;
    }
    if (!requestIdRef.current) requestIdRef.current = newRequestId();
    setSaving(true);
    const r = await journeyAction("create_new", {
      ad: form.ad.trim(),
      soyad: form.soyad.trim(),
      dogum: form.dogum,
      birth_time: form.birth_time,
      birth_location_ref: birthLoc!.id,
      ...(requestIdRef.current ? { request_id: requestIdRef.current } : {}),
    });
    setSaving(false);
    if (!r.ok || !r.hdClientId) {
      showToast({ message: r.ok ? "Danışan oluşturulamadı." : r.error, type: "error" });
      return;
    }
    showToast({ message: "Danışan oluşturuldu. Haritayı hesaplayabilirsiniz.", type: "success" });
    setForm(empty);
    setBirthLoc(null);
    requestIdRef.current = "";
    router.push(`/human-design/danisanlar/${r.hdClientId}`);
  }

  return (
    <div className="space-y-5" data-hd-new-client-form>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="hd-new-ad" className={hdLabelCls}>Ad *</label>
          <input id="hd-new-ad" type="text" autoComplete="off" value={form.ad} onChange={set("ad")} placeholder="Ali Kaan" className={`h-10 ${hdFieldBase}`} />
        </div>
        <div>
          <label htmlFor="hd-new-soyad" className={hdLabelCls}>Soyad *</label>
          <input id="hd-new-soyad" type="text" autoComplete="off" value={form.soyad} onChange={set("soyad")} placeholder="Arıcı" className={`h-10 ${hdFieldBase}`} />
        </div>
        <div>
          <label htmlFor="hd-new-dogum" className={hdLabelCls}>Doğum Tarihi *</label>
          <input id="hd-new-dogum" type="date" value={form.dogum} onChange={set("dogum")} className={`h-10 ${hdFieldBase}`} />
        </div>
        <div>
          <label htmlFor="hd-new-saat" className={hdLabelCls}>Doğum Saati *</label>
          <input id="hd-new-saat" type="time" value={form.birth_time} onChange={set("birth_time")} className={`h-10 ${hdFieldBase}`} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="hd-new-client-birth-place" className={hdLabelCls}>Doğum Yeri *</label>
          <HdBirthLocationPicker
            id="hd-new-client-birth-place"
            value={birthLoc}
            onChange={(loc) => {
              requestIdRef.current = "";
              setBirthLoc(loc);
            }}
          />
          <p className="mt-1 text-[11px] text-slate-500">İl, ilçe veya şehir yazıp listeden seçin.</p>
        </div>
      </div>
      <p className="text-[11px] leading-relaxed text-slate-500">
        Danışan, Danışan Yolculuğu&apos;nda da oluşturulur; Human Design analizleri bu danışanın geçmişinde görünür.
      </p>
      <div className="flex justify-end border-t border-indigo-100/80 pt-4">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="h-10 rounded-xl border border-indigo-300/80 bg-gradient-to-r from-indigo-600 to-violet-600 px-6 text-sm font-black uppercase tracking-wide text-white shadow-[0_4px_16px_-4px_rgba(79,70,229,0.4)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Oluşturuluyor..." : "Danışanı Oluştur ve Devam Et"}
        </button>
      </div>
    </div>
  );
}
