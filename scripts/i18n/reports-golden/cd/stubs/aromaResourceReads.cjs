// I18N rapor golden (grup C+D) — Aromaterapi `report/resourceReads` yerine sentetik okuma (DB YOK).
// Veri harness tarafından `globalThis.__RCD_ARO__` ile verilir; seçili kipte id filtresi uygulanır.
"use strict";
const data = () => globalThis.__RCD_ARO__ || {};
const pick = (list, sel, key = (x) => x.id) => (sel && sel.mode === "selected" ? list.filter((x) => sel.ids.includes(key(x))) : list);
exports.fetchTaxaDetails = async (_db, _t, sel) => ({ items: pick(data().taxa || [], sel), error: null });
exports.fetchPreparationDetails = async (_db, _t, sel) => ({ items: pick(data().preparations || [], sel), error: null });
exports.fetchKnowledgeDetails = async (_db, _t, sel) => ({ items: pick(data().knowledge || [], sel), error: null });
exports.fetchSourceExports = async (_db, _t, sel) => {
  const items = pick(data().sources || [], sel, (x) => x.source.id);
  return { items, sources: items.map((x) => x.source), error: null };
};
exports.fetchMethodExports = async (_db, _t, sel) => ({ items: pick(data().methods || [], sel, (x) => x.series.id), error: null });
exports.fetchGlossary = async (_db, _t, sel) => ({ items: pick(data().glossary || [], sel), error: null });
