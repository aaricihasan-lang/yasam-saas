"use client";

/**
 * GİRİŞ GÜVENLİĞİ F2-C — Owner cihaz eşleştirme onayları.
 *
 * Kural (protokol §5–6): Owner uzmanı KENDİ kayıtlarındaki numaradan arar veya yüz yüze görüşür;
 * telefonun ekranındaki 8 karakterlik kodu UZMAN okur, Owner buradaki kodla karşılaştırır.
 * Onay cihazı yalnız "owner_approved" yapar — oturum AÇMAZ; cihaz kendi imzasıyla aktifleşir.
 * Yetki sunucuda/DB'de (yalnız is_super_admin + QR ile açılmış Owner oturumu; kendi cihazı yasak).
 */
import { useCallback, useEffect, useState } from "react";
import { ownerAdminHeaders } from "@/components/admin/notifications/ownerBellStore";
import OwnerStepUpDialog from "@/components/admin/OwnerStepUpDialog";

type Pending = {
  id: string;
  user_id: string;
  email: string | null;
  name: string | null;
  display_code: string;
  model: string | null;
  android_api: number | null;
  app_version: string | null;
  attestation: string;
  created_at: string;
  /** F2-E: kullanıcı eski telefonuyla (QR) doğrulanmış oturumdan telefon değişimi başlattıysa eski cihaz. */
  replaces?: { display_code: string | null; model: string | null } | null;
};

type RowState = { method: "telefon" | "yuz_yuze" | ""; confirmed: boolean; note: string; busy: boolean; msg: string | null };

const fmt = (iso: string) => {
  try {
    return new Date(iso).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" });
  } catch {
    return iso;
  }
};

export default function CihazOnaylariPage() {
  const [items, setItems] = useState<Pending[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  // F2-G: onay için işleme özel yeniden doğrulama penceresi (hedef cihaz).
  const [stepUpFor, setStepUpFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    const headers = ownerAdminHeaders();
    if (!headers) { setError("Yönetici oturumu bulunamadı."); return; }
    try {
      const res = await fetch("/api/admin/devices", { headers, cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as { devices?: Pending[]; error?: string };
      if (!res.ok) { setError(j.error ?? "Liste alınamadı."); setItems([]); return; }
      setError(null);
      setItems(Array.isArray(j.devices) ? j.devices : []);
    } catch {
      setError("Bağlantı hatası. Lütfen yeniden deneyin.");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const run = async () => { if (alive) await load(); };
    void run();
    return () => { alive = false; };
  }, [load]);

  const row = (id: string): RowState => rows[id] ?? { method: "", confirmed: false, note: "", busy: false, msg: null };
  const patch = (id: string, p: Partial<RowState>) => setRows((cur) => ({ ...cur, [id]: { ...row(id), ...cur[id], ...p } }));

  const decide = async (id: string, action: "approve" | "reject") => {
    const r = row(id);
    const headers = ownerAdminHeaders(true);
    if (!headers) return;
    patch(id, { busy: true, msg: null });
    try {
      const res = await fetch(`/api/admin/devices/${encodeURIComponent(id)}`, {
        method: "POST",
        headers,
        cache: "no-store",
        body: JSON.stringify({ action, fingerprintConfirmed: r.confirmed, verificationMethod: r.method || null, note: r.note || null }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (!res.ok && j.code === "step_up_required" && action === "approve") {
        patch(id, { busy: false, msg: "Telefonunuzdan (QR) veya e-postanızdan onay bekleniyor…" });
        setStepUpFor(id);
        return;
      }
      if (!res.ok) { patch(id, { busy: false, msg: j.error ?? "İşlem tamamlanamadı." }); return; }
      patch(id, { busy: false, msg: action === "approve" ? "Onaylandı. Uzman telefonundan aktivasyonu 15 dakika içinde tamamlamalı." : "Reddedildi." });
      await load();
    } catch {
      patch(id, { busy: false, msg: "Bağlantı hatası." });
    }
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      {stepUpFor && (
        <OwnerStepUpDialog
          action="device_approve"
          targetId={stepUpFor}
          onVerified={() => { const id = stepUpFor; setStepUpFor(null); void decide(id, "approve"); }}
          onCancel={() => { patch(stepUpFor, { msg: "Onay iptal edildi." }); setStepUpFor(null); }}
        />
      )}
      <h1 className="text-xl font-extrabold text-slate-900">Cihaz eşleştirme onayları</h1>
      <p className="mt-1 text-sm text-slate-600">
        Uzmanın telefonunu güvenilir cihaz yapmadan önce kimliğini doğrulayın. Onay oturum açmaz; telefon kendi güvenli anahtarıyla aktifleşir.
      </p>
      <p className="mt-1 text-sm">
        <a href="/admin/hesap-kurtarma" className="font-bold text-violet-700 hover:underline" data-testid="link-recovery-cases">
          Bütün giriş yöntemlerini kaybeden kullanıcılar için: Hesap kurtarma talepleri →
        </a>
      </p>

      <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-900">
        <p className="font-bold">Doğrulama kuralı</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-5">
          <li>Uzmanı <span className="font-semibold">kendi kayıtlarınızdaki</span> telefon numarasından arayın (istekte gelen hiçbir iletişim bilgisini kullanmayın) veya yüz yüze görüşün.</li>
          <li>Telefonunun ekranındaki 8 karakterlik kodu <span className="font-semibold">uzmanın kendisi okusun</span>. Siz kod okumayın, &quot;görüyor musunuz?&quot; diye sormayın.</li>
          <li>Kod buradakiyle birebir aynı değilse veya uzman böyle bir istek yapmadığını söylüyorsa <span className="font-semibold">reddedin</span>.</li>
        </ol>
      </section>

      {error && <p role="alert" className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}
      {items === null && !error && <p className="mt-6 text-sm text-slate-500">Yükleniyor…</p>}
      {items && items.length === 0 && !error && <p className="mt-6 text-sm text-slate-500" data-testid="devices-empty">Bekleyen eşleştirme isteği yok.</p>}

      <ul className="mt-4 space-y-4">
        {(items ?? []).map((d) => {
          const r = row(d.id);
          const canApprove = r.confirmed && (r.method === "telefon" || r.method === "yuz_yuze") && !r.busy;
          return (
            <li key={d.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="device-request">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-bold text-slate-900">{d.name || d.email || "Uzman"}</p>
                  <p className="truncate text-xs text-slate-500">{d.email}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {d.model ?? "Bilinmeyen cihaz"}{d.android_api ? ` · Android API ${d.android_api}` : ""}{d.app_version ? ` · uygulama ${d.app_version}` : ""} · {fmt(d.created_at)}
                  </p>
                  {d.replaces && (
                    <p className="mt-1 text-[11px] font-semibold text-sky-700" data-testid="device-replaces">
                      Telefon değişimi: kullanıcı eski telefonuyla ({d.replaces.model ?? "Android cihaz"} {d.replaces.display_code ?? ""}) doğrulanmış oturumdan başlattı.
                      Yeni cihaz etkinleşince eski cihaz otomatik iptal edilir. Kimlik kontrolü yine gereklidir.
                    </p>
                  )}
                  {d.attestation === "unverified" && (
                    <p className="mt-1 text-[11px] font-semibold text-amber-700">Donanım doğrulaması (attestation) henüz denetlenmiyor — kimlik kontrolüne özen gösterin.</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Telefondaki kod</p>
                  <p className="font-mono text-2xl font-extrabold tracking-[0.15em] text-violet-800" data-testid="device-code">{d.display_code}</p>
                </div>
              </div>

              <fieldset className="mt-3 flex flex-wrap gap-4 text-sm text-slate-700" disabled={r.busy}>
                <legend className="sr-only">Doğrulama kanalı</legend>
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name={`m-${d.id}`} checked={r.method === "telefon"} onChange={() => patch(d.id, { method: "telefon" })} />
                  Kayıtlı numarasından aradım
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name={`m-${d.id}`} checked={r.method === "yuz_yuze"} onChange={() => patch(d.id, { method: "yuz_yuze" })} />
                  Yüz yüze görüştüm
                </label>
              </fieldset>
              <label className="mt-2 flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" className="mt-1" checked={r.confirmed} disabled={r.busy} onChange={(e) => patch(d.id, { confirmed: e.target.checked })} />
                <span>Kodu uzman kendisi okudu ve yukarıdaki kodla <span className="font-semibold">birebir aynı</span>.</span>
              </label>
              <input
                type="text"
                maxLength={500}
                value={r.note}
                disabled={r.busy}
                onChange={(e) => patch(d.id, { note: e.target.value })}
                placeholder="Not (isteğe bağlı)"
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              {r.msg && <p className="mt-2 text-sm font-semibold text-slate-700" role="status">{r.msg}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void decide(d.id, "approve")}
                  disabled={!canApprove}
                  className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Onayla
                </button>
                <button
                  type="button"
                  onClick={() => void decide(d.id, "reject")}
                  disabled={r.busy}
                  className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-bold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                >
                  Reddet
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <section className="mt-8 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] leading-relaxed text-slate-700">
        <p className="font-bold text-slate-800">Kendi ilk cihazınız</p>
        <p className="mt-1">
          Kendi telefonunuzu buradan onaylayamazsınız. Supabase SQL konsolunda <code className="rounded bg-white px-1">select public.auth_owner_bootstrap_issue();</code>{" "}
          çalıştırın; 15 dakika geçerli kodu telefonda &quot;Yönetici ilk cihaz kodu&quot; alanına girin.
        </p>
      </section>
    </main>
  );
}
