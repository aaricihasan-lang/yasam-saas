"use client";

// AŞAMA 3C — HD profili ↔ merkezî Danışan Yolculuğu bağlantı paneli.
//   • Bağlı: danışan adı + (yetki varsa) Danışan Yolculuğu bağlantısı + DOĞUM TARİHİ UYUŞMAZLIĞI uyarısı
//     ("HD bilgisini güncelle" = merkezî → HD, tek yön, açık onayla; mevcut analizler değişmez).
//   • Bağlı değil (eski profil): kullanıcı KİLİTLENMEZ; "Danışan Yolculuğu'na Bağla" → muhtemel eşleşme
//     (yalnız öneri) / danışan ara-seç / yeni merkezî danışan. Hiçbir bağlantı otomatik kurulmaz.

import { useState } from "react";
import Link from "next/link";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { hasModulePermission } from "@/lib/auth/modulePermissions";
import { formatIsoDateTr, journeyAction, searchJourneyClients, type JourneyClientOption } from "@/lib/human-design/api/journeyClient";
import type { HdJourneyRef } from "../helpers/hdClients";
import { hdFieldBase, hdLabelCls } from "./HdClientForm";

const fullName = (c: { ad: string; soyad: string }) => `${c.ad ?? ""} ${c.soyad ?? ""}`.trim();

function splitName(name: string): { ad: string; soyad: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { ad: parts[0] ?? "", soyad: "" };
  return { ad: parts.slice(0, -1).join(" "), soyad: parts[parts.length - 1] };
}

export function HdJourneyPanel({
  hdClientId,
  profileName,
  profileBirthDate,
  journey,
  suggestions,
  onChanged,
}: {
  hdClientId: string;
  profileName: string;
  profileBirthDate: string | null;
  journey: HdJourneyRef | null;
  suggestions: HdJourneyRef[];
  onChanged: () => void;
}) {
  const { confirm } = useConfirm();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<JourneyClientOption[] | null>(null);
  const [newName, setNewName] = useState(() => splitName(profileName));
  const isDemo = readYasamUser()?.is_demo_account === true;
  const canOpenJourney = hasModulePermission(readYasamUser(), "clients");

  async function run(action: string, body: Record<string, unknown>, okMsg: string) {
    if (busy) return;
    if (isDemo) {
      showToast({ message: "Demo hesabında danışan işlemi yapılamaz.", type: "info" });
      return;
    }
    setBusy(true);
    const r = await journeyAction(action, { hd_client_id: hdClientId, ...body });
    setBusy(false);
    if (!r.ok) {
      showToast({ message: r.error, type: "error" });
      return;
    }
    showToast({ message: okMsg, type: "success" });
    setOpen(false);
    onChanged();
  }

  async function linkTo(c: { id: string; ad: string; soyad: string; dogum: string | null }) {
    const ok = await confirm({
      title: "Danışan Yolculuğu'na bağla",
      message: `Bu Human Design kaydı "${fullName(c)}" (doğum: ${formatIsoDateTr(c.dogum)}) danışanına bağlanacak. Doğru kişi olduğundan emin misiniz?`,
      confirmText: "Bağla",
      cancelText: "Vazgeç",
    });
    if (ok) await run("link_existing", { journey_client_id: c.id }, "Danışan Yolculuğu'na bağlandı.");
  }

  async function syncBirthDate() {
    const ok = await confirm({
      title: "HD bilgisini güncelle",
      message: `Human Design doğum tarihi, Danışan Yolculuğu'ndaki tarih (${formatIsoDateTr(journey?.dogum)}) ile güncellenecek. Mevcut analizler değişmez; sonraki hesaplama yeni tarihle yapılır ve yeni bir analiz oluşturabilir.`,
      confirmText: "Güncelle",
      cancelText: "Vazgeç",
    });
    if (ok) await run("sync_birth_date", {}, "Human Design doğum tarihi güncellendi.");
  }

  if (journey) {
    const mismatch = !!journey.dogum && !!profileBirthDate && journey.dogum.slice(0, 10) !== profileBirthDate.slice(0, 10);
    return (
      <div className="space-y-3" data-hd-journey-linked>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-200/80 bg-emerald-50/50 px-4 py-3">
          <div className="min-w-0">
            <p className="m-0 text-[10px] font-bold uppercase tracking-widest text-emerald-700">Danışan Yolculuğu</p>
            <p className="m-0 break-words text-sm font-bold text-slate-900">{fullName(journey)}</p>
          </div>
          {canOpenJourney ? (
            <Link href={`/dashboard/clients/${journey.id}`} className="text-xs font-bold text-emerald-700 hover:underline">
              Danışan Yolculuğu&apos;nda aç →
            </Link>
          ) : null}
        </div>
        {mismatch ? (
          <div role="status" className="rounded-2xl border border-amber-300/80 bg-amber-50 px-4 py-3" data-hd-birth-mismatch>
            <p className="m-0 text-sm font-bold text-amber-900">Danışan Yolculuğu&apos;ndaki doğum tarihi bu Human Design profilinden farklı.</p>
            <p className="m-0 mt-1 text-xs text-amber-800">
              Danışan Yolculuğu doğum tarihi: {formatIsoDateTr(journey.dogum)} · Human Design doğum tarihi: {formatIsoDateTr(profileBirthDate)}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void syncBirthDate()}
              className="mt-2 h-9 rounded-xl border border-amber-400 bg-white px-4 text-xs font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
            >
              HD bilgisini güncelle
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-200/80 bg-amber-50/40 px-4 py-3" data-hd-journey-unlinked>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-sm font-semibold text-amber-900">Bu Human Design kaydı Danışan Yolculuğu&apos;na bağlı değil.</p>
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="h-9 rounded-xl border border-amber-400 bg-white px-4 text-xs font-bold text-amber-900 hover:bg-amber-100"
          >
            Danışan Yolculuğu&apos;na Bağla
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="mt-3 space-y-4">
          {suggestions.length > 0 ? (
            <div data-hd-journey-suggestions>
              <p className={hdLabelCls}>Muhtemel eşleşme (onayınızla bağlanır)</p>
              <ul className="m-0 list-none space-y-2 p-0">
                {suggestions.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2">
                    <span className="min-w-0 break-words text-sm font-bold text-slate-900">
                      {fullName(c)} <span className="font-normal text-slate-500">· {formatIsoDateTr(c.dogum)}</span>
                    </span>
                    <button type="button" disabled={busy} onClick={() => void linkTo(c)} className="h-8 rounded-lg bg-indigo-600 px-3 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-60">
                      Bu danışana bağla
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <label htmlFor="hd-link-search" className={hdLabelCls}>Mevcut danışana bağla</label>
            <div className="flex gap-2">
              <input id="hd-link-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ad veya soyad" className={`h-9 ${hdFieldBase}`} />
              <button
                type="button"
                onClick={() => void searchJourneyClients(query.trim()).then((r) => setResults(r.rows))}
                className="h-9 shrink-0 rounded-xl border border-indigo-200 bg-white px-3 text-xs font-bold text-indigo-700 hover:bg-indigo-50"
              >
                Ara
              </button>
            </div>
            {results ? (
              results.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">Eşleşen danışan bulunamadı.</p>
              ) : (
                <ul className="m-0 mt-2 max-h-56 list-none space-y-1 overflow-y-auto p-0">
                  {results.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-indigo-100 bg-white px-3 py-2">
                      <span className="min-w-0 break-words text-sm text-slate-800">
                        {fullName(c)} <span className="text-slate-500">· {formatIsoDateTr(c.dogum)}</span>
                      </span>
                      {c.hd_client_id ? (
                        <span className="text-[11px] font-semibold text-slate-500">Başka bir Human Design kaydına bağlı</span>
                      ) : (
                        <button type="button" disabled={busy} onClick={() => void linkTo(c)} className="h-8 rounded-lg border border-indigo-200 bg-indigo-50 px-3 text-xs font-bold text-indigo-800 hover:bg-indigo-100 disabled:opacity-60">
                          Bağla
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </div>

          <div>
            <p className={hdLabelCls}>Yeni merkezî danışan oluştur</p>
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input aria-label="Ad" value={newName.ad} onChange={(e) => setNewName((p) => ({ ...p, ad: e.target.value }))} placeholder="Ad *" className={`h-9 ${hdFieldBase}`} />
              <input aria-label="Soyad" value={newName.soyad} onChange={(e) => setNewName((p) => ({ ...p, soyad: e.target.value }))} placeholder="Soyad *" className={`h-9 ${hdFieldBase}`} />
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!newName.ad.trim() || !newName.soyad.trim()) {
                    showToast({ message: "Ad ve soyad zorunludur.", type: "warning" });
                    return;
                  }
                  void run("link_new", { ad: newName.ad.trim(), soyad: newName.soyad.trim() }, "Danışan oluşturuldu ve bağlandı.");
                }}
                className="h-9 rounded-xl bg-indigo-600 px-4 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                Oluştur ve Bağla
              </button>
            </div>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="text-xs font-bold text-slate-500 hover:underline">
            Vazgeç
          </button>
        </div>
      ) : null}
    </div>
  );
}
