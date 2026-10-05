"use client";

// Hesaplanmış harita → UZMANIN KENDİ Bilgi Bankası eşleşmeleri (human_design_knowledge_records).
//
// Kodlar merkezi normalizasyondan (normalize/hdAppCodes) üretilir:
//   tip_ otorite_ profil_ tanim_ merkez_tanimli_ merkez_acik_ kanal_ kapi_
// → manuel haritalarla BİREBİR aynı kod biçimi; uzman kayıtları tenant-scoped
// /api/hd/knowledge?codes= ucundan okunur. Sağlayıcı (RoxyAPI) açıklama metni BURADA YOKTUR.

import { useEffect, useMemo, useState } from "react";
import { buildExpertKnowledgeCodes, toAppChartCodes, type StoredChartScalars } from "@/lib/human-design/normalize/hdAppCodes";
import { loadKnowledgeForCodes, type KnowledgeGroup } from "../../rapor-olustur/helpers/hdRapor";

export function HdExpertKnowledgePanel({ chart }: { chart: StoredChartScalars }) {
  const codes = useMemo(() => buildExpertKnowledgeCodes(toAppChartCodes(chart)), [chart]);
  const codesKey = codes.join(",");
  const [state, setState] = useState<{ loading: boolean; groups: KnowledgeGroup[]; error: string | null }>({
    loading: true,
    groups: [],
    error: null,
  });

  useEffect(() => {
    let alive = true;
    const list = codesKey ? codesKey.split(",") : [];
    loadKnowledgeForCodes(list).then(({ groups, error }) => {
      if (alive) setState({ loading: false, groups, error });
    });
    return () => {
      alive = false;
    };
  }, [codesKey]);

  const matched = state.groups.reduce((n, g) => n + g.records.length, 0);

  return (
    <section aria-labelledby="hd-expert-kb-title" data-hd-expert-codes={codesKey}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p id="hd-expert-kb-title" className="text-xs font-black uppercase tracking-widest text-emerald-700">
          Bilgi Bankanızdan Eşleşmeler
        </p>
        {!state.loading && !state.error ? (
          <span className="text-[11px] font-semibold text-slate-500">
            {matched} kayıt · {codes.length} harita başlığı
          </span>
        ) : null}
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
        Bu bölüm yalnız sizin Human Design Bilgi Bankanızdaki kayıtları gösterir. Hesaplama servisinin açıklama metinleri buraya eklenmez.
      </p>
      {state.loading ? (
        <p className="text-xs text-slate-500">Yükleniyor...</p>
      ) : state.error ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
          Bilgi Bankası okunamadı: {state.error}
        </p>
      ) : matched === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
          Bu haritanın başlıkları için Bilgi Bankanızda henüz kayıt yok. Bilgi Bankası&apos;na tip, otorite, profil, tanım, merkez, kanal veya kapı kaydı eklediğinizde burada otomatik görünür.
        </p>
      ) : (
        <div className="space-y-3">
          {state.groups.map(({ category, records }) => (
            <div key={category}>
              <p className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-emerald-600">{category}</p>
              <div className="space-y-2">
                {records.map((r) => (
                  <article key={r.id} data-hd-kb-code={r.code} className="rounded-xl border border-emerald-100 bg-emerald-50/40 px-4 py-3">
                    <p className="mb-1 text-xs font-bold text-slate-800">{r.title}</p>
                    {r.content ? (
                      <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700">{r.content}</p>
                    ) : null}
                    {r.expert_notes ? (
                      <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2">
                        <p className="text-[10px] font-black uppercase tracking-wide text-amber-700">Uzman Notum</p>
                        <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700">{r.expert_notes}</p>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
