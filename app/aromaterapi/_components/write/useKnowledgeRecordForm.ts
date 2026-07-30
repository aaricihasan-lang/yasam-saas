"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { KnowledgeRecordDetail } from "@/lib/aromaterapi/readTypes";
import {
  createKnowledgeRecord,
  updateKnowledgeRecord,
  type CreateKnowledgeRecordInput,
  type UpdateKnowledgeRecordInput,
  type UpdatePatch,
  type WriteResult,
} from "@/lib/aromaterapi/claimWrite";
import {
  rationaleRequired,
  safetyTopicRequired,
  SAFETY_TOPIC_RE,
  PREPARATION_CONTEXT_RE,
  REASON_MAX_LEN,
  AGE_MIN_LO,
  AGE_MAX_HI,
} from "@/lib/aromaterapi/claimFormConfig";

/**
 * Aromaterapi V2 — C3D-D Bilgi Kaydı form durumu (create/edit).
 *
 * Kritik: child preserve/clear/replace semantiği. Edit'te dokunulmayan grup request'e
 * KONMAZ (preserve); tümü silinmişse [] (clear); değiştiyse tam yeni array (replace).
 * Hydrate false-positive "değişti" üretmez. Scalar patch YALNIZ gerçekten değişen
 * alanları içerir; no-op submit engellenir. tenant/actor/id gövdeye konmaz (wrapper).
 */

export type ChildGroup = "routes" | "populations" | "sources" | "passages" | "relations";

export type RouteRow = { _key: string; route_code: string };
export type PopRow = { _key: string; population_code: string; age_min: string; age_max: string };
export type SourceRow = {
  _key: string;
  source_id: string;
  source_label: string;
  source_role: string;
  verification_status: string;
  locator_text: string;
  url_fragment: string;
  source_original_excerpt: string;
  faithful_translation: string;
};
export type PassageRow = {
  _key: string;
  source_id: string;
  source_label: string;
  passage_id: string;
  passage_label: string;
  passage_kind: string;
  evidence_relation: string;
  verification_status: string;
};
export type RelationRow = {
  _key: string;
  other_claim_id: string;
  other_label: string;
  relation_type: string;
  explanation_tr: string;
};

export type CoreState = {
  preparation_id: string;
  preparation_label: string;
  claim_type: string;
  conclusion: string;
  conclusion_provenance: string;
  evidence_layer: string;
  rationale_status: string;
  safety_topic: string;
  preparation_context: string;
  outcome_type: string;
  rationale: string;
  status: string;
};

export type FormMode = "create" | "edit";

const EMPTY_CORE: CoreState = {
  preparation_id: "",
  preparation_label: "",
  claim_type: "",
  conclusion: "",
  conclusion_provenance: "",
  evidence_layer: "",
  rationale_status: "",
  safety_topic: "",
  preparation_context: "",
  outcome_type: "",
  rationale: "",
  status: "draft",
};

export function useKnowledgeRecordForm(opts: {
  mode: FormMode;
  initial?: KnowledgeRecordDetail | null;
  isDemo: boolean;
  onCreated: (id: string, warnings: unknown[]) => void;
  onUpdated: (id: string, warnings: unknown[]) => void;
}) {
  const { mode, initial, isDemo } = opts;
  const keyRef = useRef(0);
  const nextKey = useCallback(() => `r${(keyRef.current += 1)}`, []);

  const initialCore: CoreState = useMemo(() => {
    if (mode === "edit" && initial) {
      return {
        preparation_id: initial.preparation_id,
        preparation_label: initial.preparation?.taxon_canonical_name ?? "",
        claim_type: initial.claim_type,
        conclusion: initial.conclusion,
        conclusion_provenance: initial.conclusion_provenance,
        evidence_layer: initial.evidence_layer,
        rationale_status: initial.rationale_status,
        safety_topic: initial.safety_topic ?? "",
        preparation_context: initial.preparation_context ?? "",
        outcome_type: initial.outcome_type ?? "",
        rationale: initial.rationale ?? "",
        status: initial.status,
      };
    }
    return { ...EMPTY_CORE };
  }, [mode, initial]);

  // İlk satırların _key'i = DB satır id'si (kararlı). Yeni eklenen satırlar event
  // handler'da nextKey() kullanır → ref render sırasında OKUNMAZ.
  const [core, setCore] = useState<CoreState>(initialCore);
  const [routes, setRoutes] = useState<RouteRow[]>(() =>
    (initial?.routes ?? []).map((r) => ({ _key: r.id, route_code: r.route_code })),
  );
  const [populations, setPopulations] = useState<PopRow[]>(() =>
    (initial?.populations ?? []).map((p) => ({
      _key: p.id,
      population_code: p.population_code,
      age_min: p.age_min === null ? "" : String(p.age_min),
      age_max: p.age_max === null ? "" : String(p.age_max),
    })),
  );
  const [sources, setSources] = useState<SourceRow[]>(() =>
    (initial?.sources ?? []).map((s) => ({
      _key: s.id,
      source_id: s.source_id,
      source_label: s.source_title ?? "",
      source_role: s.source_role,
      verification_status: s.verification_status,
      locator_text: s.locator_text ?? "",
      url_fragment: "",
      source_original_excerpt: s.source_original_excerpt ?? "",
      faithful_translation: s.faithful_translation ?? "",
    })),
  );
  const [passages, setPassages] = useState<PassageRow[]>(() =>
    (initial?.passages ?? []).map((pg) => ({
      _key: pg.id,
      source_id: "",
      source_label: "",
      passage_id: pg.passage_id,
      passage_label: pg.passage_locator_label ?? "",
      passage_kind: pg.passage_kind,
      evidence_relation: pg.evidence_relation,
      verification_status: pg.verification_status,
    })),
  );
  const [relations, setRelations] = useState<RelationRow[]>(() =>
    (initial?.relations ?? []).map((rel) => {
      const other = rel.a_claim_id === initial?.id ? rel.b_claim_id : rel.a_claim_id;
      return { _key: rel.id, other_claim_id: other, other_label: "", relation_type: rel.relation_type, explanation_tr: rel.explanation_tr };
    }),
  );
  const [touched, setTouched] = useState<Record<ChildGroup, boolean>>({
    routes: false, populations: false, sources: false, passages: false, relations: false,
  });
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<WriteResult | null>(null);
  const [triedSubmit, setTriedSubmit] = useState(false);

  const markTouched = useCallback((g: ChildGroup) => setTouched((t) => (t[g] ? t : { ...t, [g]: true })), []);

  // Core alan güncelleme + coupling normalizasyonu.
  const setCoreField = useCallback(<K extends keyof CoreState>(field: K, value: CoreState[K]) => {
    setCore((c) => {
      const next = { ...c, [field]: value };
      if (field === "claim_type" && !safetyTopicRequired(next.claim_type)) {
        next.safety_topic = "";
        next.outcome_type = "";
      }
      if (field === "rationale_status" && !rationaleRequired(next.rationale_status)) {
        next.rationale = "";
      }
      return next;
    });
  }, []);

  // ---- Doğrulama ----
  const fieldErrors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!core.preparation_id) e.preparation_id = "Preparat seçin.";
    if (!core.claim_type) e.claim_type = "Bilgi türü seçin.";
    if (!core.conclusion.trim()) e.conclusion = "Sonuç zorunludur.";
    if (!core.conclusion_provenance) e.conclusion_provenance = "Sonuç kaynağı seçin.";
    if (!core.evidence_layer) e.evidence_layer = "Kanıt katmanı seçin.";
    if (!core.rationale_status) e.rationale_status = "Gerekçe durumu seçin.";
    if (safetyTopicRequired(core.claim_type)) {
      if (!core.safety_topic.trim()) e.safety_topic = "Güvenlik konusu zorunludur.";
      else if (!SAFETY_TOPIC_RE.test(core.safety_topic.trim())) e.safety_topic = "Yalnız küçük harf/rakam/alt çizgi, harfle başlar.";
      if (!core.outcome_type) e.outcome_type = "Güvenlik sonucu türü zorunludur.";
    }
    if (core.preparation_context.trim() && !PREPARATION_CONTEXT_RE.test(core.preparation_context.trim())) {
      e.preparation_context = "Yalnız küçük harf/rakam/alt çizgi, harfle başlar.";
    }
    if (rationaleRequired(core.rationale_status) && !core.rationale.trim()) {
      e.rationale = "Kaynaktan gerekçe zorunludur.";
    }
    // Child satır-içi doğrulama
    if (routes.some((r) => !r.route_code)) e.routes = "Her rota için bir değer seçin.";
    if (populations.some((p) => !p.population_code)) e.populations = "Her popülasyon için bir değer seçin.";
    if (populations.some((p) => ageInvalid(p))) e.populations = "Yaş değerleri 0–120 aralığında ve min < max olmalı.";
    if (sources.some((s) => !s.source_id || !s.source_role)) e.sources = "Her kaynak için kaynak ve rol seçin.";
    if (passages.some((p) => !p.passage_id || !p.evidence_relation)) e.passages = "Her pasaj için pasaj ve kanıt ilişkisi seçin.";
    if (relations.some((r) => !r.other_claim_id || !r.relation_type || !r.explanation_tr.trim())) {
      e.relations = "Her ilişki için kayıt, tür ve açıklama gerekir.";
    }
    if (mode === "edit") {
      const t = reason.trim();
      if (t === "" || t.length > REASON_MAX_LEN) e.reason = "Gerekçe zorunludur (1–2000 karakter).";
    } else if (reason.length > REASON_MAX_LEN) {
      e.reason = "Gerekçe en fazla 2000 karakter.";
    }
    return e;
  }, [core, routes, populations, sources, passages, relations, reason, mode]);

  // ---- Değişiklik (patch) hesabı — edit ----
  const scalarPatch = useMemo<UpdatePatch>(() => {
    if (mode !== "edit") return {};
    const p: UpdatePatch = {};
    const norm = (v: string) => (v.trim() === "" ? null : v);
    if (core.claim_type !== initialCore.claim_type) p.claim_type = core.claim_type;
    if (core.conclusion !== initialCore.conclusion) p.conclusion = core.conclusion;
    if (core.conclusion_provenance !== initialCore.conclusion_provenance) p.conclusion_provenance = core.conclusion_provenance;
    if (core.evidence_layer !== initialCore.evidence_layer) p.evidence_layer = core.evidence_layer;
    if (core.rationale_status !== initialCore.rationale_status) p.rationale_status = core.rationale_status;
    if (core.status !== initialCore.status) p.status = core.status;
    if (norm(core.safety_topic) !== norm(initialCore.safety_topic)) p.safety_topic = norm(core.safety_topic);
    if (norm(core.preparation_context) !== norm(initialCore.preparation_context)) p.preparation_context = norm(core.preparation_context);
    if (norm(core.outcome_type) !== norm(initialCore.outcome_type)) p.outcome_type = norm(core.outcome_type);
    if (norm(core.rationale) !== norm(initialCore.rationale)) p.rationale = norm(core.rationale);
    return p;
  }, [mode, core, initialCore]);

  const hasChanges = useMemo(() => {
    if (mode !== "edit") return true;
    return Object.keys(scalarPatch).length > 0 || Object.values(touched).some(Boolean);
  }, [mode, scalarPatch, touched]);

  const dirty = useMemo(() => {
    if (mode === "edit") return hasChanges || reason.trim() !== "";
    return (
      JSON.stringify(core) !== JSON.stringify(initialCore) ||
      routes.length > 0 || populations.length > 0 || sources.length > 0 ||
      passages.length > 0 || relations.length > 0 || reason.trim() !== ""
    );
  }, [mode, hasChanges, reason, core, initialCore, routes, populations, sources, passages, relations]);

  const hasErrors = Object.keys(fieldErrors).length > 0;

  const submit = useCallback(async () => {
    setTriedSubmit(true);
    if (isDemo || submitting || hasErrors) return;

    if (mode === "create") {
      const input: CreateKnowledgeRecordInput = {
        preparation_id: core.preparation_id,
        claim_type: core.claim_type,
        conclusion: core.conclusion,
        conclusion_provenance: core.conclusion_provenance,
        evidence_layer: core.evidence_layer,
        rationale_status: core.rationale_status,
      };
      if (safetyTopicRequired(core.claim_type)) {
        input.safety_topic = core.safety_topic.trim();
        input.outcome_type = core.outcome_type;
      }
      if (core.preparation_context.trim()) input.preparation_context = core.preparation_context.trim();
      if (rationaleRequired(core.rationale_status) && core.rationale.trim()) input.rationale = core.rationale;
      if (routes.length) input.routes = routes.map((r) => ({ route_code: r.route_code }));
      if (populations.length) input.populations = populations.map(buildPop);
      if (sources.length) input.sources = sources.map(buildSource);
      if (passages.length) input.passages = passages.map(buildPassage);
      if (relations.length) input.relations = relations.map(buildRelation);
      if (reason.trim()) input.reason = reason;

      setSubmitting(true);
      const res = await createKnowledgeRecord(input);
      setSubmitting(false);
      setResult(res);
      if (res.ok && res.claimId) opts.onCreated(res.claimId, res.warnings);
      return;
    }

    // edit
    if (!hasChanges) {
      setResult({ ok: false, claimId: null, warnings: [], errorCode: "AROMA_NOOP", stale: false, demoForbidden: false });
      return;
    }
    const input: UpdateKnowledgeRecordInput = {
      reason,
      expected_updated_at: initial?.updated_at ?? null,
    };
    if (Object.keys(scalarPatch).length) input.patch = scalarPatch;
    if (touched.routes) input.routes = routes.map((r) => ({ route_code: r.route_code }));
    if (touched.populations) input.populations = populations.map(buildPop);
    if (touched.sources) input.sources = sources.map(buildSource);
    if (touched.passages) input.passages = passages.map(buildPassage);
    if (touched.relations) input.relations = relations.map(buildRelation);

    setSubmitting(true);
    const res = await updateKnowledgeRecord(initial!.id, input);
    setSubmitting(false);
    setResult(res);
    if (res.ok && res.claimId) opts.onUpdated(res.claimId, res.warnings);
  }, [
    isDemo, submitting, hasErrors, mode, core, routes, populations, sources, passages, relations,
    reason, hasChanges, scalarPatch, touched, initial, opts,
  ]);

  return {
    core, setCoreField,
    routes, setRoutes, populations, setPopulations, sources, setSources,
    passages, setPassages, relations, setRelations,
    touched, markTouched, nextKey,
    reason, setReason,
    submitting, result, setResult,
    fieldErrors, triedSubmit, hasErrors, dirty, hasChanges,
    submit,
  };
}

// ---- Yardımcılar ----
function ageInvalid(p: PopRow): boolean {
  const min = p.age_min.trim() === "" ? null : Number(p.age_min);
  const max = p.age_max.trim() === "" ? null : Number(p.age_max);
  if (min !== null && (!Number.isInteger(min) || min < AGE_MIN_LO || min > AGE_MAX_HI)) return true;
  if (max !== null && (!Number.isInteger(max) || max < 1 || max > AGE_MAX_HI)) return true;
  if (min !== null && max !== null && min >= max) return true;
  return false;
}

function buildPop(p: PopRow) {
  const out: { population_code: string; age_min?: number | null; age_max?: number | null } = {
    population_code: p.population_code,
  };
  if (p.age_min.trim() !== "") out.age_min = Number(p.age_min);
  if (p.age_max.trim() !== "") out.age_max = Number(p.age_max);
  return out;
}

function buildSource(s: SourceRow) {
  const out: Record<string, unknown> = { source_id: s.source_id, source_role: s.source_role };
  if (s.verification_status) out.verification_status = s.verification_status;
  if (s.locator_text.trim()) out.locator_text = s.locator_text;
  if (s.url_fragment.trim()) out.url_fragment = s.url_fragment;
  if (s.source_original_excerpt.trim()) out.source_original_excerpt = s.source_original_excerpt;
  if (s.faithful_translation.trim()) out.faithful_translation = s.faithful_translation;
  return out as { source_id: string; source_role: string };
}

function buildPassage(p: PassageRow) {
  const out: Record<string, unknown> = {
    passage_id: p.passage_id,
    passage_kind: p.passage_kind,
    evidence_relation: p.evidence_relation,
  };
  if (p.verification_status) out.verification_status = p.verification_status;
  return out as { passage_id: string; passage_kind: string; evidence_relation: string };
}

function buildRelation(r: RelationRow) {
  return { other_claim_id: r.other_claim_id, relation_type: r.relation_type, explanation_tr: r.explanation_tr };
}
