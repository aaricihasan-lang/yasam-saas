"use client";

// Klasik Numeroloji · kaydedilmemiş sonuç çubuğu. 30.10.2026 owner kararı: kayıt YALNIZ uzmanın açık kararıyla.
//   • Yeni hesap  → "Kaydet" (başlık bu adımda sorulur) → POST /analyses (sunucu önbellekten doğrular; 0 sağlayıcı çağrısı).
//   • Düzenlenen kayıtlı analiz → "Kaydı Güncelle" (onaylı; PUT /analyses/[id], row_version CAS) ya da
//     "Yeni kayıt olarak kaydet". Kaydetmeden çıkılırsa hiçbir kayıt oluşmaz / değişmez.

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { CLASSIC_TITLE_MAX } from "@/lib/numeroloji-klasik/input";
import { API_BASE, apiRequest, errorMessage, type ApiErr } from "../_lib/api";
import { draftRefOf, dropDraft, editHref, type StoredDraft } from "../_lib/draft";
import type { AnalysisResponse } from "../_lib/types";
import { Alert, ConfirmDialog, Icon } from "./kit";

type Action = "save" | "replace";

function clip(s: string): string {
  const chars = [...s.replace(/[<>\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim()];
  return chars.length > CLASSIC_TITLE_MAX ? chars.slice(0, CLASSIC_TITLE_MAX).join("") : chars.join("");
}

export function DraftSaveBar({ draft, activeTab, canWrite }: { draft: StoredDraft; activeTab: string; canWrite: boolean }) {
  const router = useRouter();
  const uid = useId();
  const [dialog, setDialog] = useState<Action | null>(null);
  const [title, setTitle] = useState(draft.request.title);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ msg: string; stale: boolean } | null>(null);
  const src = draft.source;

  async function run(action: Action) {
    const t = clip(title) || draft.request.title;
    setBusy(true);
    setErr(null);
    const ref = draftRefOf(draft);
    const body = { ...ref, request: { ...ref.request, title: t } };
    const r = action === "replace" && src
      ? await apiRequest<AnalysisResponse>(`${API_BASE}/analyses/${encodeURIComponent(src.id)}`, { method: "PUT", json: { ...body, rowVersion: src.rowVersion } })
      : await apiRequest<AnalysisResponse>(`${API_BASE}/analyses`, { method: "POST", json: body });
    if (r.ok) {
      dropDraft(draft.key);
      // Kayıtlı analize geç (aynı sekme açık kalır); geri tuşu taslak sayfasına değil önceki ekrana döner.
      router.replace(`/numeroloji-klasik/analiz/${encodeURIComponent(r.data.analysis.id)}${activeTab ? `#${encodeURIComponent(activeTab)}` : ""}`);
      return;
    }
    setBusy(false);
    const e = r as ApiErr;
    if (e.code === "DRAFT_STALE") setErr({ msg: e.error ?? "Bu hesaplama sonucu artık doğrulanamıyor. Bilgileri kontrol edip yeniden hesaplayın.", stale: true });
    else if (e.status === 409) setErr({ msg: "Kayıt başka bir oturumda değişti. Kayıtlı analizi yeniden açıp tekrar düzenleyin.", stale: false });
    else setErr({ msg: errorMessage(e), stale: false });
    setDialog(null);
  }

  return (
    <section className="nk-card nk-panel nk-draft-bar" aria-labelledby={`${uid}-t`} data-testid="draft-bar" style={{ marginTop: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ minWidth: 0, flex: "1 1 320px" }}>
          <h2 className="nk-h3" id={`${uid}-t`}>{src ? "Düzenlenmiş sonuç henüz kaydedilmedi" : "Bu sonuç henüz kaydedilmedi"}</h2>
          <p className="nk-hint" style={{ marginTop: 4 }}>
            {src
              ? <>Kayıtlı “{src.title}” analizi değişmedi. Güncellemek ya da yeni kayıt olarak saklamak için seçim yapın; kaydetmeden çıkarsanız kayıt olduğu gibi kalır.</>
              : <>İnceleyebilir, Word / görsel rapor alabilirsiniz. Kayıtlı Analizler’e eklemek, danışana bağlamak ya da karşılaştırmak için kaydedin; kaydetmeden çıkarsanız kayıt oluşmaz.</>}
          </p>
        </div>
        {canWrite ? (
          <div className="nk-btn-row">
            {src ? (
              <>
                <button type="button" className="nk-btn nk-primary" onClick={() => { setTitle(draft.request.title); setDialog("replace"); }} disabled={busy} data-testid="draft-replace"><Icon name="save" />Kaydı Güncelle</button>
                <button type="button" className="nk-btn" onClick={() => { setTitle(draft.request.title); setDialog("save"); }} disabled={busy} data-testid="draft-save-new">Yeni kayıt olarak kaydet</button>
              </>
            ) : (
              <button type="button" className="nk-btn nk-primary" onClick={() => { setTitle(draft.request.title); setDialog("save"); }} disabled={busy} data-testid="draft-save"><Icon name="save" />Kaydet</button>
            )}
          </div>
        ) : null}
      </div>
      {err ? (
        <Alert tone="error" title="Kaydedilemedi" action={err.stale ? <a className="nk-btn nk-sm" href={editHref(draft.request.kind, { draftKey: draft.key })}>Bilgileri Düzenle</a> : undefined}>
          {err.msg}
        </Alert>
      ) : null}
      <ConfirmDialog
        open={dialog !== null}
        title={dialog === "replace" ? "Kayıtlı analiz güncellensin mi?" : "Analizi kaydet"}
        confirmLabel={dialog === "replace" ? "Kaydı Güncelle" : "Kaydet"}
        busy={busy}
        onCancel={() => setDialog(null)}
        onConfirm={() => void run(dialog ?? "save")}
      >
        {dialog === "replace" && src ? (
          <p className="nk-lead">“{src.title}” kaydındaki bilgiler ve sonuçlar bu yeni hesapla değiştirilecek. Eski sonuç saklanmaz.</p>
        ) : (
          <p className="nk-lead">Analiz Kayıtlı Analizler listesine eklenir{draft.request.clientId ? " ve seçtiğiniz danışana bağlanır" : ""}.</p>
        )}
        <div className="nk-field" style={{ marginTop: 12 }}>
          <label htmlFor={`${uid}-baslik`}>Kayıt başlığı</label>
          <input id={`${uid}-baslik`} className="nk-input" value={title} maxLength={CLASSIC_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} autoComplete="off" data-testid="draft-title" />
          <p className="nk-hint">Boş bırakılırsa ad kullanılır.</p>
        </div>
      </ConfirmDialog>
    </section>
  );
}
