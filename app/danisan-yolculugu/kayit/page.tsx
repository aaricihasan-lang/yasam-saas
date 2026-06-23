"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import Link from "next/link";
import { useToast } from "@/components/ui/ToastProvider";
import { BirthDateInput } from "@/components/ui/BirthDateInput";
import { readYasamUser, type YasamUser } from "@/lib/auth/yasamUser";
import { supabase } from "@/lib/supabase";
import { addDemoClient, initDemoSession } from "@/lib/demo/demoSession";

function todayForInput() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTR(date: string | null) {
  if (!date) return "";
  const parts = date.split("-");
  if (parts.length !== 3) return date;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function burcHesapla(date: string) {
  if (!date) return "";
  const parts = date.split("-");
  if (parts.length !== 3) return "";
  const ay = Number(parts[1]);
  const gun = Number(parts[2]);
  if ((ay === 3 && gun >= 21) || (ay === 4 && gun <= 19)) return "Koç";
  if ((ay === 4 && gun >= 20) || (ay === 5 && gun <= 20)) return "Boğa";
  if ((ay === 5 && gun >= 21) || (ay === 6 && gun <= 20)) return "İkizler";
  if ((ay === 6 && gun >= 21) || (ay === 7 && gun <= 22)) return "Yengeç";
  if ((ay === 7 && gun >= 23) || (ay === 8 && gun <= 22)) return "Aslan";
  if ((ay === 8 && gun >= 23) || (ay === 9 && gun <= 22)) return "Başak";
  if ((ay === 9 && gun >= 23) || (ay === 10 && gun <= 22)) return "Terazi";
  if ((ay === 10 && gun >= 23) || (ay === 11 && gun <= 21)) return "Akrep";
  if ((ay === 11 && gun >= 22) || (ay === 12 && gun <= 21)) return "Yay";
  if ((ay === 12 && gun >= 22) || (ay === 1 && gun <= 19)) return "Oğlak";
  if ((ay === 1 && gun >= 20) || (ay === 2 && gun <= 18)) return "Kova";
  return "Balık";
}

const MONTH_NAMES_TR = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
] as const;

const WEEKDAY_NAMES_TR = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"] as const;

function parseInputDate(value: string) {
  if (!value) return null;
  const parts = value.split("-");
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

function toInputDate(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function mondayFirstOffset(year: number, month: number) {
  const day = new Date(year, month - 1, 1).getDay();
  return (day + 6) % 7;
}

function PremiumDatePicker({
  value,
  onChange,
  inputClassName,
  alignRight = false,
}: {
  value: string;
  onChange: (next: string) => void;
  inputClassName: string;
  alignRight?: boolean;
}) {
  const today = todayForInput();
  const parsedToday = parseInputDate(today);
  const parsedValue = parseInputDate(value);

  const initialYear = parsedValue?.y ?? parsedToday?.y ?? new Date().getFullYear();
  const initialMonth = parsedValue?.m ?? parsedToday?.m ?? new Date().getMonth() + 1;

  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(initialYear);
  const [viewMonth, setViewMonth] = useState(initialMonth);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const parsed = parseInputDate(value);
    if (parsed) {
      setViewYear(parsed.y);
      setViewMonth(parsed.m);
    }
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  function goMonth(delta: number) {
    let nextMonth = viewMonth + delta;
    let nextYear = viewYear;
    if (nextMonth < 1) { nextMonth = 12; nextYear -= 1; }
    else if (nextMonth > 12) { nextMonth = 1; nextYear += 1; }
    setViewMonth(nextMonth);
    setViewYear(nextYear);
  }

  const leading = mondayFirstOffset(viewYear, viewMonth);
  const totalDays = daysInMonth(viewYear, viewMonth);
  const cells: Array<{ day: number; inMonth: boolean }> = [];
  for (let i = 0; i < leading; i += 1) cells.push({ day: 0, inMonth: false });
  for (let day = 1; day <= totalDays; day += 1) cells.push({ day, inMonth: true });
  while (cells.length % 7 !== 0) cells.push({ day: 0, inMonth: false });

  const popupPositionClass = alignRight
    ? "absolute bottom-full right-0 left-auto mb-3 origin-bottom-right"
    : "absolute bottom-full left-0 mb-3 origin-bottom-left";

  return (
    <div ref={rootRef} className="relative min-w-0 w-full">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`${inputClassName} flex items-center justify-between text-left`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className={value ? "text-slate-900" : "text-slate-400"}>
          {value ? formatDateTR(value) : "Tarih seçin"}
        </span>
        <span className="text-lg text-indigo-500" aria-hidden>📅</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Tarih seçici"
          className={`${popupPositionClass} z-50 w-[360px] max-w-[calc(100vw-48px)] rounded-3xl border border-white/80 bg-white/95 p-4 shadow-[0_25px_80px_rgba(15,23,42,0.18)] backdrop-blur-xl`}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => goMonth(-1)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-all hover:scale-110 hover:bg-indigo-100"
              aria-label="Önceki ay"
            >‹</button>
            <p className="text-lg font-black text-slate-900">
              {MONTH_NAMES_TR[viewMonth - 1]} {viewYear}
            </p>
            <button
              type="button"
              onClick={() => goMonth(1)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-all hover:scale-110 hover:bg-indigo-100"
              aria-label="Sonraki ay"
            >›</button>
          </div>

          <div className="mb-2 grid grid-cols-7 gap-1">
            {WEEKDAY_NAMES_TR.map((name) => (
              <div key={name} className="flex h-8 items-center justify-center text-sm font-bold text-slate-500">
                {name}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell, index) => {
              if (!cell.inMonth) return <div key={`empty-${index}`} className="h-10 w-10" />;
              const cellValue = toInputDate(viewYear, viewMonth, cell.day);
              const isSelected = value === cellValue;
              const isToday = today === cellValue;
              return (
                <button
                  key={cellValue}
                  type="button"
                  onClick={() => { onChange(cellValue); setOpen(false); }}
                  className={`flex h-10 w-10 items-center justify-center rounded-xl font-semibold transition-all hover:scale-110 hover:bg-indigo-100 ${
                    isSelected
                      ? "bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg hover:from-indigo-500 hover:to-violet-500"
                      : "text-slate-800"
                  } ${isToday && !isSelected ? "border-2 border-indigo-300" : ""}`}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              className="rounded-xl px-3 py-2 font-bold text-slate-600 transition-all hover:scale-110 hover:bg-indigo-100"
            >Temizle</button>
            <button
              type="button"
              onClick={() => {
                onChange(today);
                if (parsedToday) { setViewYear(parsedToday.y); setViewMonth(parsedToday.m); }
                setOpen(false);
              }}
              className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-3 py-2 font-bold text-white shadow-md transition-all hover:scale-110"
            >Bugün</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      <span className="text-[13px] font-black tracking-wide text-slate-800">{label}</span>
      {children}
    </label>
  );
}

export default function DanisanKayitPage() {
  const router = useRouter();
  useBfcacheRefresh();
  const { showToast } = useToast();

  const [sessionUser, setSessionUser] = useState<YasamUser | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [saving, setSaving] = useState(false);

  const tenantId = sessionUser?.tenant_id?.trim() || null;
  const isDemo = sessionUser?.is_demo_account === true;
  // Demo hesapta tenant kontrolü devre dışı — kayıt localStorage'a gider
  const tenantMissing = !isDemo && sessionChecked && (!sessionUser || !tenantId);

  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const forceSaveRef = useRef(false);

  const [ad, setAd] = useState("");
  const [soyad, setSoyad] = useState("");
  const [telefon, setTelefon] = useState("");
  const [dogum, setDogum] = useState("");
  const [gorusme, setGorusme] = useState(todayForInput());
  const [kan, setKan] = useState("");
  const [mizac, setMizac] = useState("");

  const burc = burcHesapla(dogum);

  useEffect(() => {
    setSessionUser(readYasamUser());
    setSessionChecked(true);
  }, []);

  function showTenantWarning() {
    showToast({
      title: "Oturum uyarısı",
      message: !sessionUser
        ? "Oturum bulunamadı. Lütfen tekrar giriş yapın."
        : "Hesabınızda çalışma alanı (tenant) bilgisi yok. İşlem yapılamaz.",
      type: "warning",
    });
  }

  async function saveClient() {
    if (!ad.trim() || !soyad.trim()) {
      showToast({ title: "İşlem başarısız", message: "Ad ve soyad gerekli", type: "error" });
      return;
    }

    // Demo hesap: DB yerine localStorage'a kaydet
    if (isDemo) {
      setSaving(true);
      initDemoSession();
      addDemoClient({
        ad: ad.trim(),
        soyad: soyad.trim(),
        telefon: telefon.trim(),
        dogum,
        gorusme,
        burc,
        kan,
        mizac,
      });
      showToast({ title: "Başarılı", message: "Demo danışan oluşturuldu.", type: "success" });
      router.push("/danisan-yolculugu/liste");
      return;
    }

    const user = readYasamUser();
    const activeTenantId = user?.tenant_id?.trim();
    if (!user || !activeTenantId) { showTenantWarning(); return; }

    // Duplicate kontrolü (forceSaveRef ile override edilebilir)
    if (!forceSaveRef.current) {
      const { data: existing } = await supabase
        .from("clients")
        .select("id, ad, soyad")
        .eq("tenant_id", activeTenantId)
        .ilike("ad", ad.trim())
        .ilike("soyad", soyad.trim())
        .limit(1);

      if (existing && existing.length > 0) {
        setDuplicateWarning(
          `"${ad.trim()} ${soyad.trim()}" adında bir danışan zaten kayıtlı. Aynı kişiyi tekrar kaydetmek istiyor musunuz?`
        );
        return;
      }
    }

    setDuplicateWarning(null);
    forceSaveRef.current = false;
    setSaving(true);

    const { error } = await supabase.from("clients").insert({
      tenant_id: activeTenantId,
      ad: ad.trim(),
      soyad: soyad.trim(),
      telefon: telefon.trim(),
      dogum,
      gorusme,
      burc,
      kan,
      mizac,
    });

    if (error) {
      showToast({ title: "İşlem başarısız", message: "Kayıt hatası: " + error.message, type: "error" });
      setSaving(false);
      return;
    }

    showToast({ title: "Başarılı", message: "Danışan kaydedildi.", type: "success" });
    router.push("/danisan-yolculugu/liste");
  }

  const inputClassName =
    "h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-[15px] font-semibold text-slate-900 shadow-inner outline-none transition-all placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100";

  return (
    <main className="relative w-full overflow-x-hidden bg-[radial-gradient(circle_at_10%_10%,rgba(52,211,153,0.12),transparent_30%),radial-gradient(circle_at_90%_15%,rgba(99,102,241,0.10),transparent_30%),linear-gradient(135deg,#edf5ff_0%,#f7f2ff_48%,#fff4fb_100%)] px-4 py-5 text-slate-900 antialiased sm:px-6 lg:px-8 xl:px-10">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 -top-24 h-[500px] w-[500px] rounded-full bg-emerald-400/14 blur-[160px]" />
        <div className="absolute -right-20 top-0 h-[440px] w-[440px] rounded-full bg-indigo-400/10 blur-[160px]" />
        <div className="absolute bottom-0 left-1/3 h-[380px] w-[380px] -translate-x-1/2 rounded-full bg-teal-300/10 blur-[140px]" />
      </div>

      <div className="relative z-10 w-full">
        {isDemo && (
          <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50/95 px-5 py-4 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-lg leading-none">🔎</span>
              <div>
                <p className="text-sm font-black text-blue-900">Demo Modu — Geçici Kayıt</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-blue-800">
                  Bu danışan veritabanına kaydedilmeyecek; yalnızca oturumunuz süresince tarayıcınızda saklanacak.
                  Çıkış yaptığınızda otomatik olarak silinir.
                </p>
              </div>
            </div>
          </div>
        )}

        {tenantMissing && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/95 px-5 py-4 text-sm font-bold text-amber-950 shadow-sm">
            {!sessionUser
              ? "Oturum bulunamadı. Danışan kaydı için lütfen tekrar giriş yapın."
              : "Çalışma alanı (tenant) bilgisi bulunamadı. Kayıt yapılamaz."}
          </div>
        )}

        {/* Form */}
        <section className="overflow-visible rounded-2xl border border-emerald-200/80 bg-white/80 p-6 shadow-lg backdrop-blur-sm sm:p-8">
          <div className="mb-6">
            <span className={`inline-flex rounded-full px-3.5 py-1.5 text-xs font-black ${
              isDemo ? "bg-blue-100 text-blue-800" : "bg-emerald-100 text-emerald-800"
            }`}>
              {isDemo ? "Demo Danışan" : "Yeni Danışan"}
            </span>
            <h2 className="mt-3 text-2xl font-black text-slate-950">Danışanı Kaydet</h2>
            <p className="mt-1 text-sm text-slate-500">Tüm alanlar isteğe bağlıdır; ad ve soyad zorunludur.</p>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Ad">
              <input value={ad} onChange={(e) => setAd(e.target.value)} className={inputClassName} placeholder="Ad" />
            </Field>
            <Field label="Soyad">
              <input value={soyad} onChange={(e) => setSoyad(e.target.value)} className={inputClassName} placeholder="Soyad" />
            </Field>
            <Field label="Telefon">
              <input value={telefon} onChange={(e) => setTelefon(e.target.value)} className={inputClassName} placeholder="05xx xxx xx xx" />
            </Field>
            <Field label="Doğum Tarihi">
              <BirthDateInput value={dogum} onChange={setDogum} className={inputClassName} />
            </Field>
            <Field label="Görüşme Tarihi">
              <PremiumDatePicker value={gorusme} onChange={setGorusme} inputClassName={inputClassName} />
            </Field>
            <Field label="Burç (Otomatik)">
              <input value={burc} disabled className={`${inputClassName} bg-slate-100 text-slate-600`} />
            </Field>
            <Field label="Kan Grubu">
              <select value={kan} onChange={(e) => setKan(e.target.value)} className={inputClassName}>
                <option value="">Seçiniz</option>
                <option>A Rh+</option><option>A Rh-</option>
                <option>B Rh+</option><option>B Rh-</option>
                <option>AB Rh+</option><option>AB Rh-</option>
                <option>0 Rh+</option><option>0 Rh-</option>
              </select>
            </Field>
            <Field label="Mizaç">
              <select value={mizac} onChange={(e) => setMizac(e.target.value)} className={inputClassName}>
                <option value="">Seçiniz</option>
                <option value="safra">Safra</option>
                <option value="sovdavi">Sovdavi</option>
                <option value="dem">Dem</option>
                <option value="balgam">Balgam</option>
              </select>
            </Field>
          </div>

          {duplicateWarning && (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
              <p className="text-sm font-bold text-amber-900">{duplicateWarning}</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setDuplicateWarning(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  İptal
                </button>
                <button
                  type="button"
                  onClick={() => { forceSaveRef.current = true; void saveClient(); }}
                  className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-black text-white hover:bg-amber-700"
                >
                  Yine de Kaydet
                </button>
              </div>
            </div>
          )}

          <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-6">
            <button
              type="button"
              onClick={saveClient}
              disabled={saving || tenantMissing}
              className="btn-primary px-7 py-3 text-sm hover:-translate-y-0.5 hover:scale-[1.02]"
            >
              {saving ? "Kaydediliyor..." : isDemo ? "Demo Danışan Oluştur" : "Danışanı Kaydet"}
            </button>
            <Link
              href="/danisan-yolculugu/liste"
              className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              Listeye Dön
            </Link>
          </div>
        </section>

      </div>
    </main>
  );
}
