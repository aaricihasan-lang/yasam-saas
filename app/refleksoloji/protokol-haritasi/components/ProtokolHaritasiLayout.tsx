"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import { useToast } from "@/components/ui/ToastProvider";
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import { STORAGE_QUOTA_ERROR_MESSAGE } from "@/lib/safeStorage";
import { EMPTY_PROTOCOL_DRAFT, savedToDraft } from "../lib/protocolStorage";
import { resolveProtocolViews } from "../lib/resolveDisplayRegions";
import { useProtocolRegistry } from "../hooks/useProtocolRegistry";
import { useHydratedAtlasVersion } from "@/app/refleksoloji/hooks/useHydratedAtlasVersion";
import type { AtlasBackgroundGroup } from "@/lib/refleksoloji/atlasRegionsCore";
import type { ProtocolFormDraft, SavedProtocol } from "../types";
import { ProtocolFootMap } from "./ProtocolFootMap";
import { ProtocolRegistrationForm } from "./ProtocolRegistrationForm";
import { ProtocolSummaryPanel } from "./ProtocolSummaryPanel";
import { RefleksolojiEditorLoading } from "@/app/refleksoloji/components/RefleksolojiSkeleton";

/** Server protokol satırı (raw_json = SavedProtocol snapshot; kolonlar fallback). */
type ServerProtocolRow = {
  id: string;
  source_uid: string | null;
  title: string | null;
  target_problem: string | null;
  organs: string | null;
  application_notes: string | null;
  raw_json: unknown;
};

function rowToDraft(row: ServerProtocolRow): ProtocolFormDraft {
  const raw = row.raw_json;
  if (raw && typeof raw === "object" && typeof (raw as { title?: unknown }).title === "string") {
    return savedToDraft(raw as SavedProtocol);
  }
  // raw_json yoksa kolonlardan türet (legacy/aktarılmış kayıt).
  return {
    title: row.title ?? "",
    description: row.target_problem ?? "",
    organs: (row.organs ?? "")
      .split("|")
      .map((o) => o.trim())
      .filter(Boolean),
    notes: row.application_notes ?? "",
  };
}

const panelClass =
  "flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/90 bg-white/80 shadow-[0_8px_28px_-10px_rgba(91,33,182,0.18)] ring-1 ring-violet-100/70 backdrop-blur-md";

export function ProtokolHaritasiLayout() {
  const isDemo = readYasamUser()?.is_demo_account === true;
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editParam = searchParams.get("id");
  const { hydrated, protocols, saveProtocol, syncErrorMessage, clearSyncError } =
    useProtocolRegistry();

  useEffect(() => {
    if (!syncErrorMessage) return;
    showToast({ type: "warning", title: "Bulut eşitleme", message: syncErrorMessage });
    clearSyncError();
  }, [syncErrorMessage, clearSyncError, showToast]);
  const [draft, setDraft] = useState<ProtocolFormDraft>(EMPTY_PROTOCOL_DRAFT);
  const [footView, setFootView] = useState<AtlasBackgroundGroup>("taban");
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // REF-005: düzenleme. `?id=` (source_uid) ile mevcut protokolü forma hydrate et ve
  // editId'yi taşı → kaydetme YENİ satır AÇMAZ, mevcut satırı GÜNCELLER. Hydrate
  // tamamlanmadan editId set EDİLMEZ (boş formla üzerine yazma engeli).
  const [editId, setEditId] = useState<string | null>(null);
  // "none" (yeni) | "loading" | "ready" | "notfound"
  const [editState, setEditState] = useState<"none" | "loading" | "ready" | "notfound">(
    editParam ? "loading" : "none",
  );
  const editResolvedRef = useRef(false);

  useEffect(() => {
    if (!hydrated || !editParam || editResolvedRef.current) return;
    editResolvedRef.current = true;

    // 1) Yerel kayıt (aynı cihaz) — p.id === source_uid.
    const local = protocols.find((p) => p.id === editParam);
    if (local) {
      setDraft(savedToDraft(local));
      setEditId(local.id);
      setEditState("ready");
      return;
    }
    // 2) Demo veya oturumsuz → sunucu yok; düzenlenemez.
    const uid = readYasamUser()?.id;
    const token = readSessionToken();
    if (isDemo || !uid || !token) {
      setEditState("notfound");
      return;
    }
    // 3) Sunucudan çek (başka cihazda oluşturulmuş) — source_uid veya server id ile.
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/refleksoloji/protocols", {
          headers: { "x-user-id": uid, "x-session-token": token },
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as
          | { ok?: boolean; protocols?: ServerProtocolRow[] }
          | null;
        if (cancelled) return;
        const rows = res.ok && json?.ok && Array.isArray(json.protocols) ? json.protocols : [];
        const match =
          rows.find((r) => r.source_uid === editParam) ??
          rows.find((r) => r.id === editParam);
        if (!match) {
          setEditState("notfound");
          return;
        }
        setDraft(rowToDraft(match));
        // by-uid güncellemesi için editId = source_uid olmalı (yoksa server id).
        setEditId(match.source_uid ?? match.id);
        setEditState("ready");
      } catch {
        if (!cancelled) setEditState("notfound");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, editParam, protocols, isDemo]);

  // BUG-4: atlas'ı sunucudan hydrate et → yeni cihaz/tarayıcıda önizleme boş kalmaz.
  const atlasVersion = useHydratedAtlasVersion();

  const { resolved, availableViews } = useMemo(
    () => resolveProtocolViews(draft.organs),
    // atlasVersion: sunucudan hydrate sonrası yeniden çöz (loadAtlas içeride okunur).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft.organs, atlasVersion],
  );

  // Aktif görünüm anlamlı değilse ilk anlamlı görünümü TÜRET (setState-in-effect yok;
  // boş sekme açma). Kullanıcı yalnız mevcut görünüm düğmelerine basabildiğinden
  // footView her zaman geçerli kalır; bu yalnız organ değişince fallback sağlar.
  const effectiveFootView = availableViews.includes(footView)
    ? footView
    : availableViews[0] ?? footView;
  const regions = resolved.regionsByGroup[effectiveFootView];
  const missingOrgans = resolved.missingOrgans;

  const resetForm = useCallback(() => {
    setDraft(EMPTY_PROTOCOL_DRAFT);
    setValidationMessage(null);
    setEditId(null);
    setEditState("none");
  }, []);

  // Çift-tıklama / hızlı tekrar gönderim koruması (duplicate protokol engeli).
  // Sunucu (tenant_id, source_uid) idempotensi ile birlikte savunma-derinliği.
  const savingRef = useRef(false);

  const handleSave = () => {
    if (savingRef.current) return;
    if (editState === "loading") {
      setValidationMessage("Protokol yükleniyor, lütfen bekleyin.");
      return;
    }
    // REF-005: DÜZENLEME NİYETİYLE (?id) gelinip hedef BULUNAMADIYSA sessizce YENİ
    // kayıt OLUŞTURMA. Yanlışlıkla duplicate/veri sapması üretmemek için kaydı engelle
    // ve kullanıcıyı açıkça bilgilendir; yeni kayıt yalnız açık niyetle (aşağıdaki
    // "Yeni protokol oluştur" düğmesi id'yi temizler) yapılır.
    if (editParam && editState === "notfound") {
      setValidationMessage(
        "Düzenlenecek protokol bulunamadı. Otomatik yeni kayıt OLUŞTURULMAZ. " +
          "Yeni bir protokol oluşturmak istiyorsanız «Yeni protokol oluştur»u kullanın.",
      );
      return;
    }
    if (!draft.title.trim()) {
      setValidationMessage("Hedef / sorun adı zorunludur.");
      return;
    }
    if (draft.organs.length === 0) {
      setValidationMessage("En az bir organ ekleyin.");
      return;
    }

    savingRef.current = true;
    setSaving(true);
    // Kısa bir süre sonra tekrar kaydetmeye izin ver (aynı formu bilinçli tekrar kaydetme).
    // Yeni kayıtta her çağrı yeni id ürettiğinden bu pencere duplicate'ı engeller (REF-023).
    setTimeout(() => {
      savingRef.current = false;
      setSaving(false);
    }, 800);

    // REF-005: editId varsa mevcut protokolü GÜNCELLE; yoksa yeni oluştur.
    const result = saveProtocol(draft, editId);
    if (!result.saved) {
      setValidationMessage("Kayıt yapılamadı. Alanları kontrol edin.");
      return;
    }
    if (!result.storageOk) {
      showToast({ type: "error", title: "Depolama Hatası", message: STORAGE_QUOTA_ERROR_MESSAGE });
      return;
    }

    if (editId) {
      showToast({
        type: "success",
        title: "Protokol güncellendi",
        message: `«${result.saved.title}» güncellendi.`,
      });
      // Düzenleme tamamlandı → Kayıtlı Protokoller'e dön (güncel hâli orada görünür).
      router.push("/refleksoloji/kayitli-protokoller");
      return;
    }

    showToast({
      type: "success",
      title: "Protokol kaydedildi",
      message: `«${result.saved.title}» başarıyla kaydedildi.`,
    });
    resetForm();
  };

  const handleClear = () => {
    resetForm();
  };

  // REF-005: notfound durumunda AÇIK niyetle yeni kayda geçiş — id'yi URL'den temizler
  // (böylece kaydetme artık "yeni oluştur" yoludur, sessiz değil kullanıcı-onaylı).
  const startFreshProtocol = () => {
    editResolvedRef.current = true;
    resetForm();
    router.replace("/refleksoloji/protokol-haritasi");
  };

  if (!hydrated) {
    return <RefleksolojiEditorLoading />; // REF-021: düz "Yükleniyor…" yerine iskelet
  }

  return (
    <main className="relative flex min-h-screen w-full max-w-none flex-col overflow-x-hidden bg-[linear-gradient(160deg,#f3ebff_0%,#ebe4ff_28%,#f8f4ff_58%,#f0f7ff_100%)] text-slate-900 antialiased xl:h-screen xl:overflow-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-violet-300/25 blur-3xl" />
        <div className="absolute right-[-8%] top-[8%] h-80 w-80 rounded-full bg-fuchsia-200/20 blur-3xl" />
      </div>

      <div className="relative z-10 flex w-full flex-col px-3 py-2 md:px-5 xl:h-full xl:px-7">
        {isDemo && (
          <DemoModuleBanner
            className="shrink-0"
            message="Oluşturduğunuz protokoller sadece cihazınızda saklanır ve Kayıtlı Protokoller sayfasında görünür. Çıkışta silinir."
          />
        )}
        <header className="flex shrink-0 items-center gap-3 pb-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-700/90">
              Refleksoloji &middot; Protokol Kaydı
            </p>
            <h1 className="truncate text-lg font-black leading-tight tracking-tight text-slate-900 sm:text-xl">
              {editId ? "Protokolü Düzenle" : "Protokol Haritası"}
            </h1>
          </div>
          <p className="hidden shrink-0 text-xs font-medium text-slate-500 xl:block">
            {editId
              ? "Mevcut protokolü düzenliyorsunuz; kaydettiğinizde güncellenir."
              : "Yeni protokol oluşturun; kayıtlılar için Kayıtlı Protokoller sayfasını kullanın."}
          </p>
        </header>

        <div className="grid min-h-0 grid-cols-1 gap-3 xl:flex-1 xl:grid-cols-[300px_1fr_1fr] xl:gap-4">
          <aside className={`${panelClass} p-4 xl:h-full`}>
            {editState === "loading" ? (
              <p className="mb-2 shrink-0 rounded-xl border border-violet-200/80 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-900">
                Düzenlenecek protokol yükleniyor…
              </p>
            ) : editState === "notfound" ? (
              <div className="mb-2 shrink-0 rounded-xl border border-amber-300/80 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950">
                <p>
                  Düzenlenecek protokol bulunamadı (silinmiş veya başka bir hesaba ait
                  olabilir). Güvenlik için otomatik yeni kayıt <strong>oluşturulmaz</strong>.
                </p>
                <button
                  type="button"
                  onClick={startFreshProtocol}
                  className="mt-2 rounded-lg border border-amber-400/80 bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-950 hover:bg-amber-200/90"
                >
                  Yeni protokol oluştur
                </button>
              </div>
            ) : null}
            <ProtocolRegistrationForm
              draft={draft}
              onDraftChange={setDraft}
              onSave={handleSave}
              onClear={handleClear}
              validationMessage={validationMessage}
              saving={saving}
              editing={!!editId}
            />
          </aside>

          <section className={`${panelClass} p-4 xl:h-full`}>
            <h2 className="mb-3 shrink-0 text-base font-bold text-violet-900">Protokol Özeti</h2>
            <ProtocolSummaryPanel draft={draft} organs={resolved.organs} footView={effectiveFootView} />
          </section>

          <div className={`${panelClass} h-[68vh] min-h-[460px] min-w-0 xl:h-full xl:min-h-0`}>
            <ProtocolFootMap
              regions={regions}
              footView={effectiveFootView}
              availableViews={availableViews}
              missingOrgans={missingOrgans}
              onFootViewChange={setFootView}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
