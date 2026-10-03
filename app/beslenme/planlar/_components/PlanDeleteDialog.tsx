"use client";
/**
 * "Planı Sil" — tüm plan REVİZYONU için 3 AŞAMALI onay ("Günü Temizle" ile AYNI güçlü koruma).
 *
 *   AŞAMA 1 — Kapsam: plan adı + revizyon + gün/öğün/besin kalemi sayıları (SUNUCU hesaplar).
 *   AŞAMA 2 — "Emin misiniz? Bu işlem geri alınamaz."
 *   AŞAMA 3 — Sunucunun ürettiği 4 haneli kod elle yazılmadan son buton AKTİF OLMAZ.
 *
 * Vazgeç / Escape / arka plan → onClose; hiçbir silme isteği gönderilmez (silme yalnız
 * DestructiveChallengeDialog'un son adımında confirm ile çağrılır). Kod sunucuda da doğrulanır
 * (tek kullanımlık, 5 dk, kapsam özeti, işlem türü "plan_delete"); çift tık tek silme üretir.
 * Aynı ailedeki diğer revizyonlar SİLİNMEZ ("Yeni Revizyon" semantiği korunur).
 */
import { useCallback } from "react";
import { deletePlan, requestPlanDeleteChallenge } from "@/lib/beslenme/planClient";
import {
  DestructiveChallengeDialog,
  challengeErrorMessage,
  type ChallengeConfirm,
  type ChallengeRequest,
} from "../../_components/DestructiveChallengeDialog";
import { friendlyPlanError, revisionLabel } from "./planFormat";

export type PlanDeleteTarget = { id: string; title: string; revision_number: number };

export function PlanDeleteDialog({
  plan,
  onClose,
  onDeleted,
}: {
  plan: PlanDeleteTarget;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const requestChallenge = useCallback<ChallengeRequest>(async () => {
    const r = await requestPlanDeleteChallenge(plan.id);
    if (r.ok && r.data) {
      const d = r.data;
      return {
        ok: true,
        value: {
          challenge_id: d.challenge_id,
          code: d.code,
          expires_at: d.expires_at,
          count: 1,
          names: [
            `${d.plan.title} (${revisionLabel(d.plan.revision_number)})`,
            `${d.days} gün`,
            `${d.meals} öğün`,
            `${d.items} besin kalemi`,
            d.other_revisions > 0
              ? `Bu planın diğer ${d.other_revisions} revizyonu silinmez`
              : "Bu planın başka revizyonu yok",
          ],
        },
      };
    }
    return { ok: false, message: friendlyPlanError(r.code, r.status) };
  }, [plan.id]);

  const confirm = useCallback<ChallengeConfirm>(
    async (challengeId, code) => {
      const r = await deletePlan(plan.id, challengeId, code);
      if (r.ok) return { ok: true };
      const e = challengeErrorMessage(r.code);
      return {
        ok: false,
        message: r.code?.startsWith("CHALLENGE_") ? e.message : friendlyPlanError(r.code, r.status),
        refresh: e.refresh,
      };
    },
    [plan.id],
  );

  return (
    <DestructiveChallengeDialog
      open
      title="Planı Sil"
      itemNoun="plan revizyonu"
      scopeIntro={
        <>
          <b>{plan.title}</b> ({revisionLabel(plan.revision_number)}) planı <b>tüm günleri, öğünleri ve besin
          kalemleriyle birlikte</b> kalıcı olarak silinecek. Varsa aynı planın diğer revizyonları etkilenmez.
        </>
      }
      warning="Plan, içindeki tüm günler, öğünler ve besin kalemleri kalıcı olarak silinecektir."
      confirmLabel="Planı Sil"
      requestChallenge={requestChallenge}
      confirm={confirm}
      onClose={onClose}
      onDone={onDeleted}
    />
  );
}
