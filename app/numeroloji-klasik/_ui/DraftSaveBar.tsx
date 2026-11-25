"use client";

// Klasik Numeroloji · kaydedilmemiş sonuç çubuğu. 30.10.2026 owner kararı: kayıt YALNIZ uzmanın açık kararıyla.
//   • Yeni hesap  → "Kaydet" (başlık bu adımda sorulur) → POST /analyses (sunucu önbellekten doğrular; 0 sağlayıcı çağrısı).
//   • Düzenlenen kayıtlı analiz → "Kaydı Güncelle" (onaylı; PUT /analyses/[id], row_version CAS) ya da
//     "Yeni kayıt olarak kaydet". Kaydetmeden çıkılırsa hiçbir kayıt oluşmaz / değişmez.

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { CLASSIC_TITLE_MAX } from "@/lib/numeroloji-klasik/input";
import { API_BASE, apiRequest, errorMessage, errorMessageEn, type ApiErr } from "../_lib/api";
import { draftRefOf, dropDraft, editHref, type StoredDraft } from "../_lib/draft";
import type { AnalysisResponse } from "../_lib/types";
import { DuplicateAnalysisDialog, type DuplicateDialogMode, type DuplicateMatchView } from "./DuplicateAnalysisDialog";
import { Alert, ConfirmDialog, Icon } from "./kit";

type Action = "save" | "replace";

function clip(s: string): string {
  const chars = [...s.replace(/[<>\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim()];
  return chars.length > CLASSIC_TITLE_MAX ? chars.slice(0, CLASSIC_TITLE_MAX).join("") : chars.join("");
}

export function DraftSaveBar({ draft, activeTab, canWrite }: { draft: StoredDraft; activeTab: string; canWrite: boolean }) {
  const t = useTranslations("numerology.classic.draftSave");
  const tErr = useTranslations("numerology.classic.apiErrors");
  const isTr = useLocale() === DEFAULT_LOCALE;
  const router = useRouter();
  const uid = useId();
  const [dialog, setDialog] = useState<Action | null>(null);
  const [title, setTitle] = useState(draft.request.title);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ msg: string; stale: boolean } | null>(null);
  // Mükerrer kişi analizi uyarısı: yeni kayıt (Kaydet / Yeni kayıt olarak kaydet) ÖNCESİ kontrol. "Kaydı Güncelle"
  // yeni kayıt oluşturmadığı için kontrol edilmez. Kontrol yapılamazsa OTOMATİK kayıt yapılmaz.
  const [dup, setDup] = useState<{ mode: DuplicateDialogMode; matches: DuplicateMatchView[]; total: number } | null>(null);
  const [checking, setChecking] = useState(false);
  const checkLock = useRef(false);
  const src = draft.source;

  async function startNewSave() {
    if (checkLock.current || busy) return;
    const rq = draft.request;
    if (rq.kind !== "person") {
      setTitle(rq.title);
      setDialog("save");
      return;
    }
    checkLock.current = true;
    setChecking(true);
    setErr(null);
    try {
      const r = await apiRequest<{ ok: true; total: number; matches: DuplicateMatchView[] }>(`${API_BASE}/analyses/mukerrer`, {
        method: "POST",
        json: { fullName: rq.input.fullName, birth: rq.input.birth, ...(src ? { excludeId: src.id } : {}) },
      });
      if (!r.ok || !Array.isArray(r.data.matches)) {
        setDup({ mode: "checkFailed", matches: [], total: 0 });
      } else if (r.data.matches.length > 0) {
        setDup({ mode: "duplicate", matches: r.data.matches, total: typeof r.data.total === "number" ? r.data.total : r.data.matches.length });
      } else {
        setDup(null);
        setTitle(rq.title);
        setDialog("save");
      }
    } finally {
      checkLock.current = false;
      setChecking(false);
    }
  }

  async function run(action: Action) {
    const finalTitle = clip(title) || draft.request.title;
    setBusy(true);
    setErr(null);
    const ref = draftRefOf(draft);
    const body = { ...ref, request: { ...ref.request, title: finalTitle } };
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
    // TR: sunucu metni birebir; EN: dil-bağımsız kod → katalog (kontrol akışı koda bağlı, değişmedi).
    if (e.code === "DRAFT_STALE") setErr({ msg: (isTr ? e.error : null) ?? t("staleFallback"), stale: true });
    else if (e.status === 409) setErr({ msg: t("conflict"), stale: false });
    else setErr({ msg: isTr ? errorMessage(e) : errorMessageEn(e, tErr), stale: false });
    setDialog(null);
  }

  return (
    <section className="nk-card nk-panel nk-draft-bar" aria-labelledby={`${uid}-t`} data-testid="draft-bar" style={{ marginTop: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ minWidth: 0, flex: "1 1 320px" }}>
          <h2 className="nk-h3" id={`${uid}-t`}>{src ? t("editedTitle") : t("newTitle")}</h2>
          <p className="nk-hint" style={{ marginTop: 4 }}>
            {src ? t("editedHint", { title: src.title }) : t("newHint")}
          </p>
        </div>
        {canWrite ? (
          <div className="nk-btn-row">
            {src ? (
              <>
                <button type="button" className="nk-btn nk-primary" onClick={() => { setTitle(draft.request.title); setDialog("replace"); }} disabled={busy} data-testid="draft-replace"><Icon name="save" />{t("replace")}</button>
                <button type="button" className="nk-btn" onClick={() => void startNewSave()} disabled={busy || checking} data-testid="draft-save-new">{t("saveNew")}</button>
              </>
            ) : (
              <button type="button" className="nk-btn nk-primary" onClick={() => void startNewSave()} disabled={busy || checking} data-testid="draft-save"><Icon name="save" />{checking && !dup ? t("checking") : t("save")}</button>
            )}
          </div>
        ) : null}
      </div>
      {err ? (
        <Alert tone="error" title={t("failedTitle")} action={err.stale ? <a className="nk-btn nk-sm" href={editHref(draft.request.kind, { draftKey: draft.key })}>{t("editInputs")}</a> : undefined}>
          {err.msg}
        </Alert>
      ) : null}
      <DuplicateAnalysisDialog
        open={dup !== null}
        mode={dup?.mode ?? "duplicate"}
        matches={dup?.matches ?? []}
        total={dup?.total ?? 0}
        checking={checking}
        onCancel={() => { if (!checking) setDup(null); }}
        onRetry={() => void startNewSave()}
        onSaveAnyway={() => {
          if (checking) return;
          setDup(null);
          setTitle(draft.request.title);
          setDialog("save");
        }}
      />
      <ConfirmDialog
        open={dialog !== null}
        title={dialog === "replace" ? t("confirmReplaceTitle") : t("confirmSaveTitle")}
        confirmLabel={dialog === "replace" ? t("replace") : t("save")}
        busy={busy}
        onCancel={() => setDialog(null)}
        onConfirm={() => void run(dialog ?? "save")}
      >
        {dialog === "replace" && src ? (
          <p className="nk-lead">{t("replaceBody", { title: src.title })}</p>
        ) : (
          <p className="nk-lead">{draft.request.clientId ? t("saveBodyLinked") : t("saveBody")}</p>
        )}
        <div className="nk-field" style={{ marginTop: 12 }}>
          <label htmlFor={`${uid}-baslik`}>{t("titleLabel")}</label>
          <input id={`${uid}-baslik`} className="nk-input" value={title} maxLength={CLASSIC_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} autoComplete="off" data-testid="draft-title" />
          <p className="nk-hint">{t("titleHint")}</p>
        </div>
      </ConfirmDialog>
    </section>
  );
}
