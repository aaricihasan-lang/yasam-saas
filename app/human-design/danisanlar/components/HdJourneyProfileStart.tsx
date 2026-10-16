"use client";

// "HUMAN DESIGN BAŞLAT" — tek listede seçilen, henüz Human Design kaydı OLMAYAN Danışan Yolculuğu danışanı
// için HD profili (doğum saati + yeri tamamlanır; merkezî kayıt DEĞİŞMEZ). Ayrı danışan listesi YOK.
//   • Doğum tarihi merkezî kayıttan gelir; yoksa elle yazılır (MOB-01). Saat elle SS:DD (MOB-02).
//   • Eski/silinmiş HD bilgisi geri YÜKLENMEZ: alanlar boş başlar, profil yeni yaşam döngüsüyle oluşur.
//   • Olası mükerrer profil → sunucu 409 → HdDuplicateDialog (uzman karar verir).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/ToastProvider";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { journeyAction } from "@/lib/human-design/api/journeyClient";
import type { HdDuplicateCandidate } from "@/lib/human-design/api/hdIdentity";
import { HdBirthLocationPicker, type HdPickedLocation } from "../../components/HdBirthLocationPicker";
import { HdBirthTimeInput } from "../../components/HdBirthTimeInput";
import { HdBirthDateInput } from "../../components/HdBirthDateInput";
import { hdFieldBase, hdLabelCls } from "./HdClientForm";
import { HdDuplicateDialog } from "./HdDuplicateDialog";

export function HdJourneyProfileStart({
  journeyClientId,
  name,
  birthDate: journeyBirthDate,
  onCancel,
}: {
  journeyClientId: string;
  name: string;
  birthDate: string | null;
  onCancel: () => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [birthDate, setBirthDate] = useState(journeyBirthDate ?? "");
  const [birthTime, setBirthTime] = useState("");
  const [birthLoc, setBirthLoc] = useState<HdPickedLocation | null>(null);
  const [saving, setSaving] = useState(false);
  const [dup, setDup] = useState<HdDuplicateCandidate[] | null>(null);

  async function createProfile(acknowledged: string[] = []) {
    if (saving) return;
    if (readYasamUser()?.is_demo_account === true) {
      showToast({ message: "Demo hesabında danışan işlemi yapılamaz.", type: "info" });
      return;
    }
    const missing = [!birthDate && "Doğum Tarihi", !birthTime && "Doğum Saati (SS:DD)", !birthLoc && "Doğum Yeri (listeden seçin)"].filter(Boolean);
    if (missing.length > 0) {
      showToast({ message: `Zorunlu alanlar: ${missing.join(", ")}.`, type: "warning" });
      return;
    }
    setSaving(true);
    const r = await journeyAction("create_for_existing", {
      journey_client_id: journeyClientId,
      birth_time: birthTime,
      birth_location_ref: birthLoc!.id,
      ...(journeyBirthDate ? {} : { birth_date: birthDate }),
      ...(acknowledged.length ? { acknowledged_duplicate_keys: acknowledged } : {}),
    });
    setSaving(false);
    if (!r.ok && r.code === "POSSIBLE_DUPLICATE_CLIENT" && r.candidates && r.candidates.length > 0) {
      setDup(r.candidates);
      return;
    }
    setDup(null);
    if ((r.ok && r.hdClientId) || (!r.ok && r.code === "HD_PROFILE_EXISTS" && r.hdClientId)) {
      router.push(`/human-design/danisanlar/${r.hdClientId}`);
      return;
    }
    showToast({ message: r.ok ? "Human Design profili oluşturulamadı." : r.error, type: "error" });
  }

  return (
    <div className="mt-2 w-full space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3" data-hd-profile-start={journeyClientId}>
      <p className="m-0 text-xs text-slate-600">
        <strong className="text-slate-800">{name}</strong> için Human Design başlatın: doğum saati ve doğum yerini tamamlayın.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor={`hd-start-dogum-${journeyClientId}`} className={hdLabelCls}>Doğum Tarihi *</label>
          {journeyBirthDate ? (
            <input id={`hd-start-dogum-${journeyClientId}`} type="text" value={journeyBirthDate.split("-").reverse().join(".")} disabled className={`h-10 ${hdFieldBase} disabled:bg-slate-50 disabled:text-slate-600`} />
          ) : (
            <HdBirthDateInput id={`hd-start-dogum-${journeyClientId}`} value={birthDate} onChange={setBirthDate} className={`h-10 ${hdFieldBase}`} />
          )}
        </div>
        <div>
          <label htmlFor={`hd-start-saat-${journeyClientId}`} className={hdLabelCls}>Doğum Saati *</label>
          <HdBirthTimeInput id={`hd-start-saat-${journeyClientId}`} value={birthTime} onChange={setBirthTime} className={`h-10 ${hdFieldBase}`} />
        </div>
        <div>
          <label htmlFor={`hd-start-yer-${journeyClientId}`} className={hdLabelCls}>Doğum Yeri *</label>
          <HdBirthLocationPicker id={`hd-start-yer-${journeyClientId}`} value={birthLoc} onChange={setBirthLoc} />
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">
          Vazgeç
        </button>
        <button
          type="button"
          onClick={() => void createProfile()}
          disabled={saving}
          className="h-9 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 text-sm font-black text-white shadow-sm hover:brightness-105 disabled:opacity-60"
          data-hd-profile-start-save
        >
          {saving ? "Kaydediliyor..." : "Devam Et"}
        </button>
      </div>
      {dup ? (
        <HdDuplicateDialog
          mode="client"
          candidates={dup}
          busy={saving}
          onOpen={(c) => {
            setDup(null);
            if (c.hdClientId) router.push(`/human-design/danisanlar/${c.hdClientId}${c.chartId ? `?chart=${encodeURIComponent(c.chartId)}` : ""}`);
            else if (c.chartId) router.push(`/human-design/kayitli-haritalar/${c.chartId}`);
          }}
          onProceed={() => void createProfile(dup.map((c) => c.key))}
          onCancel={() => setDup(null)}
        />
      ) : null}
    </div>
  );
}
