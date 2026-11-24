"use client";

/**
 * GİRİŞ GÜVENLİĞİ F2-H — Owner: denetim kayıtları saklama ve kontrollü imha.
 * Varsayılan: "karar bekliyor" — süre + hukuki gerekçe + yöntem girilmeden hiçbir kayıt silinmez / anonimleştirilmez.
 * Akış: karar (ek doğrulama) → önizleme (salt sayım, kesim tarihi sabit) → AYRI açık onay (birebir onay metni + ek
 * doğrulama) → tek işlemde imha / anonimleştirme. Otomatik zamanlayıcı YOKTUR. Ekranda kayıt içeriği gösterilmez.
 */
import { useCallback, useEffect, useState } from "react";
import { ownerAdminHeaders } from "@/components/admin/notifications/ownerBellStore";
import OwnerStepUpDialog, { type StepUpAction } from "@/components/admin/OwnerStepUpDialog";

type Policy = { table: string; data_class: string; retention_days: number | null; legal_basis: string | null; method: string;
  decided_at: string | null; note: string | null; target: string; total: number | null; past_retention: number | null };
type Run = { id: string; table: string; method: string; cutoff: string; candidates: number; held: number; expires_at: string; confirm_text: string };
type Recent = { id: string; table: string; method: string; state: string; candidates: number; affected: number | null; error: string | null; created_at: string };
type Hold = { id: number; type: string; subject_id: string; reason: string; created_at: string; release_target: string };

const TABLE_LABEL: Record<string, string> = {
  auth_device_decisions: "Cihaz onay / iptal kararları",
  auth_recovery_events: "Hesap kurtarma olayları",
  security_events: "Güvenlik olayları",
};
const METHOD_LABEL: Record<string, string> = { karar_bekliyor: "Karar bekliyor", silme: "Silme", anonimlestirme: "Anonimleştirme" };
const CLASS_LABEL: Record<string, string> = { takma_adli_kisisel_veri: "Takma adlı kişisel veri", kisisel_veri: "Kişisel veri", anonim: "Anonim" };
const fmt = (iso: string | null | undefined) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" }); } catch { return iso; }
};
const inputCls = "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200";
const btn = "flex h-9 items-center justify-center rounded-lg px-3 text-xs font-bold transition disabled:opacity-60";

export default function DenetimSaklamaPage() {
  const [data, setData] = useState<{ policies: Policy[]; openRuns: Run[]; recentRuns: Recent[]; holds: Hold[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<{ table: string; days: string; basis: string; method: string } | null>(null);
  const [confirm, setConfirm] = useState<Record<string, string>>({});
  const [hold, setHold] = useState({ type: "subject_user", subject: "", reason: "" });
  const [stepUp, setStepUp] = useState<{ action: StepUpAction; target: string; retry: () => void } | null>(null);

  const load = useCallback(async () => {
    const headers = ownerAdminHeaders();
    if (!headers) { setError("Yönetici oturumu bulunamadı."); return; }
    try {
      const res = await fetch("/api/admin/retention", { headers, cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as typeof data & { error?: string };
      if (!res.ok || !j) { setError(j?.error ?? "Bilgi alınamadı."); return; }
      setError(null);
      setData(j);
    } catch {
      setError("Bağlantı hatası.");
    }
  }, []);
  useEffect(() => { const id = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(id); }, [load]);

  async function op(body: Record<string, unknown>, okMsg: string, retry?: () => void): Promise<Record<string, unknown> | null> {
    const headers = ownerAdminHeaders(true);
    if (!headers || busy) return null;
    setBusy(true); setError(null); setMsg(null);
    try {
      const res = await fetch("/api/admin/retention", { method: "POST", headers, cache: "no-store", body: JSON.stringify(body) });
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok && j.code === "STEP_UP_REQUIRED" && typeof j.action === "string" && typeof j.target === "string" && retry) {
        setMsg("Telefonunuzdan (QR) veya e-postanızdan onay bekleniyor…");
        setStepUp({ action: j.action as StepUpAction, target: j.target, retry });
        return null;
      }
      if (!res.ok) { setError(typeof j.error === "string" ? j.error : "İşlem yapılamadı."); return null; }
      setMsg(okMsg);
      void load();
      return j;
    } catch {
      setError("Bağlantı hatası.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  const savePolicy = () => {
    if (!edit) return;
    const run = () => void op({ op: "policy_set", table: edit.table, retentionDays: Number(edit.days), legalBasis: edit.basis, method: edit.method },
      "Saklama kararı kaydedildi.", run).then((j) => { if (j) setEdit(null); });
    run();
  };
  const execute = (r: Run) => {
    const run = () => void op({ op: "execute", runId: r.id, confirm: confirm[r.id] ?? "" }, "İşlem tamamlandı ve kayda alındı.", run);
    run();
  };
  const release = (h: Hold) => {
    const run = () => void op({ op: "hold_release", holdId: h.id }, "Yasal saklama kaldırıldı.", run);
    run();
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6" data-testid="retention-page">
      {stepUp && (
        <OwnerStepUpDialog action={stepUp.action} targetId={stepUp.target}
          onVerified={() => { const s = stepUp; setStepUp(null); s.retry(); }}
          onCancel={() => { setStepUp(null); setMsg(null); }} />
      )}
      <h1 className="text-xl font-black text-slate-900">Denetim kayıtları — saklama ve imha</h1>
      <p className="mt-1 text-sm text-slate-600">
        Saklama süresi, hukuki gerekçe ve yöntem <strong>hukuki karar</strong> sonrasında girilir. Karar girilmeden hiçbir kayıt silinmez veya
        anonimleştirilmez. İmha otomatik çalışmaz; her işlem önizleme, ayrı onay ve ek doğrulama ister.
      </p>
      {error && <p role="alert" data-testid="retention-error" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>}
      {msg && <p role="status" data-testid="retention-msg" className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{msg}</p>}

      <section className="mt-6 space-y-3">
        {(data?.policies ?? []).map((p) => {
          const runs = (data?.openRuns ?? []).filter((r) => r.table === p.table);
          return (
            <div key={p.table} data-testid="retention-policy" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-900">{TABLE_LABEL[p.table] ?? p.table}</p>
                  <p className="text-[11px] text-slate-500">{CLASS_LABEL[p.data_class] ?? p.data_class} · toplam {p.total ?? "—"} kayıt
                    {p.past_retention !== null ? ` · süresi dolmuş ${p.past_retention}` : ""}</p>
                </div>
                <span data-testid="retention-method" className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${p.method === "karar_bekliyor" ? "bg-amber-50 text-amber-800" : "bg-violet-50 text-violet-800"}`}>
                  {METHOD_LABEL[p.method] ?? p.method}{p.retention_days ? ` · ${p.retention_days} gün` : ""}
                </span>
              </div>
              {p.legal_basis && <p className="mt-2 break-words text-xs text-slate-600"><strong>Gerekçe:</strong> {p.legal_basis} · {fmt(p.decided_at)}</p>}
              {edit?.table === p.table ? (
                <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); savePolicy(); }}>
                  <input type="number" min={30} max={36500} value={edit.days} onChange={(e) => setEdit({ ...edit, days: e.target.value })}
                    placeholder="Saklama süresi (gün)" aria-label="Saklama süresi (gün)" className={inputCls} data-testid="retention-days" />
                  <textarea value={edit.basis} onChange={(e) => setEdit({ ...edit, basis: e.target.value })} rows={2} maxLength={1000}
                    placeholder="Hukuki gerekçe (hukuk danışmanının kararı)" aria-label="Hukuki gerekçe" data-testid="retention-basis"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                  <select value={edit.method} onChange={(e) => setEdit({ ...edit, method: e.target.value })} aria-label="Yöntem" className={inputCls} data-testid="retention-method-select">
                    <option value="">Yöntem seçin</option>
                    <option value="silme">Silme</option>
                    {p.table !== "security_events" && <option value="anonimlestirme">Anonimleştirme</option>}
                  </select>
                  <div className="flex gap-2">
                    <button type="submit" disabled={busy || !edit.days || edit.basis.trim().length < 10 || !edit.method} className={`${btn} bg-violet-600 text-white`} data-testid="retention-save">Kararı kaydet</button>
                    <button type="button" onClick={() => setEdit(null)} className={`${btn} border border-slate-200 bg-white text-slate-700`}>Vazgeç</button>
                  </div>
                </form>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => setEdit({ table: p.table, days: p.retention_days ? String(p.retention_days) : "", basis: p.legal_basis ?? "", method: p.method === "karar_bekliyor" ? "" : p.method })}
                    className={`${btn} border border-slate-200 bg-white text-slate-700`} data-testid="retention-edit">Saklama kararı gir / değiştir</button>
                  <button type="button" disabled={busy || p.method === "karar_bekliyor"} onClick={() => void op({ op: "preview", table: p.table }, "Önizleme hazır; hiçbir kayıt değişmedi.")}
                    className={`${btn} bg-slate-800 text-white`} data-testid="retention-preview">Önizleme (yalnız sayım)</button>
                </div>
              )}
              {runs.map((r) => (
                <div key={r.id} className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900" data-testid="retention-run">
                  <p><strong>{r.candidates}</strong> kayıt {METHOD_LABEL[r.method]?.toLowerCase()} kapsamında (kesim {fmt(r.cutoff)}); yasal saklama nedeniyle hariç: {r.held}.
                    Önizleme {fmt(r.expires_at)} tarihine kadar geçerli.</p>
                  <p className="mt-1">Geri döndürülemez. Onaylamak için aşağıdaki metni <strong>aynen</strong> yazın: <code className="break-all font-mono">{r.confirm_text}</code></p>
                  <input value={confirm[r.id] ?? ""} onChange={(e) => setConfirm({ ...confirm, [r.id]: e.target.value })} aria-label="Onay metni"
                    className={`${inputCls} mt-2 font-mono`} data-testid="retention-confirm" />
                  <div className="mt-2 flex gap-2">
                    <button type="button" disabled={busy || (confirm[r.id] ?? "").trim() !== r.confirm_text} onClick={() => execute(r)}
                      className={`${btn} bg-rose-600 text-white`} data-testid="retention-execute">Onaylıyorum — uygula</button>
                    <button type="button" disabled={busy} onClick={() => void op({ op: "cancel", runId: r.id }, "Önizleme iptal edildi.")}
                      className={`${btn} border border-slate-200 bg-white text-slate-700`}>İptal</button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-black text-slate-900">Yasal saklama (imhadan muaf)</h2>
        <p className="mt-1 text-xs text-slate-600">Dava, şikâyet veya resmî talep nedeniyle saklanması gereken kişi ya da cihaz kayıtları imha edilmez.</p>
        <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); void op({ op: "hold_set", holdType: hold.type, subjectId: hold.subject.trim(), reason: hold.reason }, "Yasal saklama eklendi.").then((j) => { if (j) setHold({ ...hold, subject: "", reason: "" }); }); }}>
          <select value={hold.type} onChange={(e) => setHold({ ...hold, type: e.target.value })} aria-label="Saklama türü" className={inputCls}>
            <option value="subject_user">Kişi (kullanıcı kimliği)</option>
            <option value="device">Cihaz (cihaz kimliği)</option>
          </select>
          <input value={hold.subject} onChange={(e) => setHold({ ...hold, subject: e.target.value })} placeholder="Kimlik (UUID)" aria-label="Kimlik" className={`${inputCls} font-mono`} />
          <input value={hold.reason} onChange={(e) => setHold({ ...hold, reason: e.target.value })} placeholder="Gerekçe (en az 10 karakter)" aria-label="Gerekçe" className={inputCls} />
          <button type="submit" disabled={busy || hold.reason.trim().length < 10 || hold.subject.trim().length !== 36} className={`${btn} bg-violet-600 text-white`}>Saklamaya al</button>
        </form>
        <ul className="mt-3 space-y-2">
          {(data?.holds ?? []).map((h) => (
            <li key={h.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs" data-testid="retention-hold">
              <span className="min-w-0 break-all">{h.type === "device" ? "Cihaz" : "Kişi"} {h.subject_id} — {h.reason} ({fmt(h.created_at)})</span>
              <button type="button" disabled={busy} onClick={() => release(h)} className={`${btn} border border-slate-200 bg-white text-slate-700`}>Kaldır</button>
            </li>
          ))}
        </ul>
      </section>

      {(data?.recentRuns ?? []).length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-black text-slate-900">Son işlemler</h2>
          <ul className="mt-2 space-y-1 text-xs text-slate-600">
            {(data?.recentRuns ?? []).map((r) => (
              <li key={r.id} data-testid="retention-recent">{fmt(r.created_at)} · {TABLE_LABEL[r.table] ?? r.table} · {METHOD_LABEL[r.method]} · {r.state}
                {r.affected !== null ? ` · ${r.affected} kayıt` : ""}{r.error ? ` · ${r.error}` : ""}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
