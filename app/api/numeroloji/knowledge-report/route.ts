import { createClient } from "@supabase/supabase-js";
import { assertUserModuleAccess } from "@/lib/auth/moduleAccess";
import { Document, Packer } from "docx";
import { isDemoAccountId } from "@/lib/auth/demoServerGuard";
import {
  arraySection,
  bodyText,
  buildFooter,
  buildPremiumCover,
  buildStatsPage,
  buildTOCPage,
  divider,
  fieldInline,
  h1Colored,
  h2,
  h3,
  muted,
  profileLabel,
  ReportChild,
  spacer,
  twoColTable,
} from "@/lib/docx/reportHelpers";
import { isKulvarAnalysisType } from "@/app/numeroloji/bilgi-bankasi/helpers/knowledgeSections";
import {
  bibliographyDetail,
  buildBibliography,
  kulvarSectionsForWord,
  recordSourceMainLine,
  recordSourceView,
} from "@/app/numeroloji/bilgi-bankasi/helpers/wordKulvarLogic";
import type { NumerologySourceRow, RecordSourceRow } from "@/app/numeroloji/bilgi-bankasi/helpers/sourcesApi";
import {
  normalizeWordSections,
  sourceNotesEffective,
} from "@/app/numeroloji/bilgi-bankasi/helpers/wordSectionLogic";
import {
  EXPERT_OWN_NOTE_LABEL,
  sortSourceEntries,
  type SourceEntryRow,
} from "@/app/numeroloji/bilgi-bankasi/helpers/sourceEntryUiLogic";

export const runtime = "nodejs";

const C_KNOWLEDGE = "4c1d95"; // derin mor

type ExportMode = "all" | "filtered";

type KnowledgeRow = {
  id: string;
  tenant_id: string;
  analysis_type: string;
  value: string;
  source: string | null;
  description: string | null;
  content_sections?: unknown;
  updated_at: string;
};

type StoneRow = {
  id: string;
  tenant_id: string;
  analysis_type: string;
  value: string;
  reason: string | null;
  stones: unknown;
  updated_at: string;
};

const ANALIZ_LABELS: Record<string, string> = {
  "ana-kulvar":    "Ana Kulvar",
  "yan-kulvar":    "Yan Kulvar",
  "ifade-sayisi":  "İfade Sayısı",
  "hayat-yolu":    "Hayat Yolu",
  "cakra-omurga":  "Çakra Omurga",
  element:         "Element",
  diger:           "Diğer",
};

function analizLabel(key: string): string {
  return ANALIZ_LABELS[key] ?? key;
}

function parseStones(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => String(s)).filter(Boolean);
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const { tenantId, userId, exportMode = "all", knowledgeIds, stoneIds, sections: sectionsRaw } = body as {
    tenantId?: string;
    userId?: string;
    exportMode?: ExportMode;
    knowledgeIds?: string[];
    stoneIds?: string[];
    sections?: unknown;
  };

  // Bölüm seçimi (verilmezse tüm bölümler — eski istemci uyumu).
  const sections = normalizeWordSections(sectionsRaw);

  if (!tenantId || typeof tenantId !== "string" || !userId || typeof userId !== "string")
    return Response.json({ ok: false, error: "Kimlik doğrulama gerekli." }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey)
    return Response.json({ ok: false, error: "Supabase yapılandırması eksik." }, { status: 500 });

  const db = createClient(supabaseUrl, supabaseKey);

  // Kullanıcının bu tenant'a ait olduğunu doğrula (IDOR koruması) — service_role
  const { data: userRow } = await db
    .from("users")
    .select("id")
    .eq("id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!userRow)
    return Response.json({ ok: false, error: "Yetkisiz erişim." }, { status: 403 });

  const __moduleGate = await assertUserModuleAccess(db, userId, "numerology");
  if (!__moduleGate.ok) return __moduleGate.response;

  // Demo hesap: export sunucu seviyesinde engellenir
  if (await isDemoAccountId(userId, db))
    return Response.json({ error: "Demo hesabında bu işlem kullanılamaz." }, { status: 403 });

  let knowledgeQ = db.from("numerology_knowledge_records").select("*").eq("tenant_id", tenantId);
  let stoneQ = db.from("numerology_stone_assignments").select("*").eq("tenant_id", tenantId);

  if (exportMode === "filtered") {
    if (Array.isArray(knowledgeIds) && knowledgeIds.length > 0)
      knowledgeQ = knowledgeQ.in("id", knowledgeIds);
    else if (exportMode === "filtered") {
      // If filtered mode but no knowledge IDs, fetch nothing
      knowledgeQ = knowledgeQ.eq("id", "none");
    }
    if (Array.isArray(stoneIds) && stoneIds.length > 0)
      stoneQ = stoneQ.in("id", stoneIds);
    else if (exportMode === "filtered") {
      stoneQ = stoneQ.eq("id", "none");
    }
  }

  const [kRes, sRes] = await Promise.all([
    knowledgeQ.order("analysis_type").order("value"),
    stoneQ.order("analysis_type").order("value"),
  ]);

  if (kRes.error)
    return Response.json({ ok: false, error: `Açıklama kayıtları okunamadı: ${kRes.error.message}` }, { status: 500 });
  if (sRes.error)
    return Response.json({ ok: false, error: `Taş atamaları okunamadı: ${sRes.error.message}` }, { status: 500 });

  const knowledgeRows = (kRes.data || []) as KnowledgeRow[];
  const stoneRows = (sRes.data || []) as StoneRow[];

  if (!knowledgeRows.length && !stoneRows.length)
    return Response.json({ ok: false, error: "Bu seçim için kayıt bulunamadı." }, { status: 404 });

  // NKB-V2-E: Ana/Yan Kulvar kayıtları için yapılandırılmış kaynakları N+1'siz, tenant-scoped topla.
  // Boş id listesinde `.in()` çalıştırılmaz. Hata → güvenli mesaj (başka tenant fallback YOK).
  const kulvarIds = knowledgeRows.filter((r) => isKulvarAnalysisType(r.analysis_type)).map((r) => r.id);
  let recordSources: RecordSourceRow[] = [];
  const sourcesById = new Map<string, NumerologySourceRow>();
  if (kulvarIds.length > 0) {
    const { data: rsData, error: rsErr } = await db
      .from("numerology_record_sources")
      .select("*")
      .eq("tenant_id", tenantId)
      .in("knowledge_record_id", kulvarIds);
    if (rsErr) return Response.json({ ok: false, error: "Kaynak bağlantıları okunamadı." }, { status: 500 });
    recordSources = (rsData || []) as RecordSourceRow[];

    const srcIds = Array.from(new Set(recordSources.map((l) => l.source_id)));
    if (srcIds.length > 0) {
      const { data: sData, error: sErr } = await db
        .from("numerology_sources")
        .select("*")
        .eq("tenant_id", tenantId)
        .in("id", srcIds);
      if (sErr) return Response.json({ ok: false, error: "Kaynaklar okunamadı." }, { status: 500 });
      for (const s of (sData || []) as NumerologySourceRow[]) sourcesById.set(s.id, s);
    }
  }
  // record_id → bağlantılar (bellek map; N+1 yok).
  const linksByRecord = new Map<string, RecordSourceRow[]>();
  for (const l of recordSources) {
    const arr = linksByRecord.get(l.knowledge_record_id) ?? [];
    arr.push(l);
    linksByRecord.set(l.knowledge_record_id, arr);
  }

  // NKB-V2: Kaynak Notları (include_in_analysis=true) — yalnız seçiliyse; TEK bounded sorgu (N+1 yok).
  const entriesByRecord = new Map<string, SourceEntryRow[]>();
  const entrySourceLabelById = new Map<string, string>();
  if (sourceNotesEffective(sections) && knowledgeRows.length > 0) {
    const kIds = knowledgeRows.map((r) => r.id);
    const { data: seData, error: seErr } = await db
      .from("numerology_knowledge_source_entries")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("include_in_analysis", true)
      .in("knowledge_record_id", kIds);
    if (seErr) return Response.json({ ok: false, error: "Kaynak notları okunamadı." }, { status: 500 });
    const seRows = (seData || []) as SourceEntryRow[];
    for (const e of sortSourceEntries(seRows)) {
      const arr = entriesByRecord.get(e.knowledge_record_id) ?? [];
      arr.push(e);
      entriesByRecord.set(e.knowledge_record_id, arr);
    }
    // Kaynak etiketleri: bibliyografik sources'dan gelenleri kullan; eksikleri ayrıca çek.
    const needSrcIds = Array.from(new Set(seRows.map((e) => e.source_id).filter((x): x is string => x !== null)));
    for (const id of needSrcIds) {
      const s = sourcesById.get(id);
      if (s) entrySourceLabelById.set(id, s.display_label);
    }
    const missing = needSrcIds.filter((id) => !entrySourceLabelById.has(id));
    if (missing.length > 0) {
      const { data: msData } = await db
        .from("numerology_sources")
        .select("id, display_label")
        .eq("tenant_id", tenantId)
        .in("id", missing);
      for (const s of (msData || []) as { id: string; display_label: string }[]) {
        entrySourceLabelById.set(s.id, s.display_label);
      }
    }
  }

  const today = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const dateSlug = new Date().toISOString().slice(0, 10);
  const totalCount = knowledgeRows.length + stoneRows.length;
  const exportLabel = exportMode === "filtered"
    ? `Filtrelenmiş Kayıtlar (${totalCount})`
    : `Tüm Bilgi Bankası (${totalCount})`;

  // Analiz türlerine göre grupla
  const groupKeys = new Set<string>();
  for (const r of knowledgeRows) groupKeys.add(r.analysis_type);
  for (const r of stoneRows) groupKeys.add(r.analysis_type);

  const sortedKeys = Array.from(groupKeys).sort((a, b) =>
    analizLabel(a).localeCompare(analizLabel(b), "tr-TR")
  );

  const all: ReportChild[] = [];

  // Premium kapak
  all.push(...buildPremiumCover({
    title1:   "YAŞAM SİSTEMİ",
    title2:   "NUMEROLOJİ BİLGİ BANKASI",
    subtitle: "Yorum ve Doğaltaş Atama Referans Kataloğu",
    date:     `Oluşturulma Tarihi: ${today}`,
    stats: [
      { label: "Açıklama Kaydı",  value: String(knowledgeRows.length) },
      { label: "Doğaltaş Atama",  value: String(stoneRows.length) },
      { label: "Analiz Türü",     value: String(groupKeys.size) },
      { label: "Kapsam",          value: exportLabel },
    ],
  }));

  // Sistem özeti
  all.push(...buildStatsPage([
    ["Açıklama Kaydı",  String(knowledgeRows.length)],
    ["Doğaltaş Atama",  String(stoneRows.length)],
    ["Toplam Kayıt",    String(totalCount)],
    ["Analiz Türü",     String(groupKeys.size)],
  ]));

  all.push(...buildTOCPage());

  // Genel özet
  all.push(h1Colored("1. Genel Özet", C_KNOWLEDGE, true));
  all.push(twoColTable([
    ["Açıklama Kaydı",  `${knowledgeRows.length} kayıt`],
    ["Doğaltaş Atama",  `${stoneRows.length} kayıt`],
    ["Toplam",          `${totalCount} kayıt`],
    ["Kapsam",          exportLabel],
  ]));

  // Bir kanonik kayda ait Kaynak Notları'nı Word'e ekler (yalnız sourceNotes seçiliyse çağrılır).
  const pushSourceNotes = (recordId: string) => {
    const es = entriesByRecord.get(recordId);
    if (!es || es.length === 0) return;
    all.push(muted("Kaynak Notları"));
    for (const e of es) {
      const srcLabel = e.source_id === null
        ? EXPERT_OWN_NOTE_LABEL
        : entrySourceLabelById.get(e.source_id) ?? "Bilinmeyen Kaynak";
      all.push(bodyText(`[${srcLabel}] ${e.body.trim()}`, 20));
    }
  };

  // Gruplu içerik
  let sectionN = 2;
  for (const key of sortedKeys) {
    const label = analizLabel(key);
    const kRows = knowledgeRows.filter((r) => r.analysis_type === key);
    const sRows = stoneRows.filter((r) => r.analysis_type === key);

    // Bölüm seçimine göre bu grupta gösterilecek içerik var mı?
    const showDesc = sections.descriptions && kRows.length > 0;
    const showStones = sections.stones && sRows.length > 0;
    if (!showDesc && !showStones) continue; // boş grup başlığı basılmaz

    all.push(h1Colored(`${sectionN}. ${label}`, C_KNOWLEDGE, true));
    all.push(muted(`${kRows.length} açıklama · ${sRows.length} taş atama`));
    all.push(spacer());

    let itemN = 0;

    // Açıklama kayıtları
    if (showDesc) {
      all.push(h2("Açıklama Kayıtları"));
      for (const k of kRows) {
        itemN++;
        all.push(profileLabel(`KAYIT #${String(itemN).padStart(3, "0")}`, C_KNOWLEDGE));
        all.push(h3(k.value || "—"));

        if (isKulvarAnalysisType(k.analysis_type)) {
          // Yapılandırılmış dört bölüm (KANONİK sıra) veya legacy overview fallback; boş bölüm atlanır.
          for (const sec of kulvarSectionsForWord(k)) {
            all.push(h3(sec.label));
            all.push(bodyText(sec.body));
          }
          // Eski Kaynak Bilgisi (legacy source) — yapılandırılmış kaynaklardan AYRI.
          if (k.source?.trim()) all.push(fieldInline("Eski Kaynak Bilgisi", k.source.trim()));
          // Yapılandırılmış Kaynaklar (kayıt-altı, ikincil hiyerarşi). internal_note YOK.
          const links = [...(linksByRecord.get(k.id) ?? [])].sort(
            (a, b) => a.display_order - b.display_order || a.created_at.localeCompare(b.created_at),
          );
          if (links.length > 0) {
            all.push(muted("Yapılandırılmış Kaynaklar"));
            for (const l of links) {
              const view = recordSourceView(l, sourcesById.get(l.source_id) ?? null);
              all.push(bodyText(recordSourceMainLine(view), 20));
              if (view.title) all.push(muted(view.title));
            }
          }
        } else {
          // Diğer analysis_type türleri: mevcut Word davranışı AYNEN.
          if (k.source?.trim()) all.push(fieldInline("Kaynak", k.source.trim()));
          if (k.description?.trim()) all.push(bodyText(k.description.trim()));
        }

        // NKB-V2: Kaynak Notları (yalnız sourceNotes seçiliyse; include_in_analysis=true).
        if (sourceNotesEffective(sections)) pushSourceNotes(k.id);

        all.push(fieldInline("Güncelleme",
          new Date(k.updated_at).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" })
        ));
        if (itemN < kRows.length) all.push(divider());
      }
    }

    // Doğaltaş atamaları
    if (showStones) {
      if (showDesc) all.push(spacer());
      all.push(h2("Doğaltaş Atamaları"));
      let sItemN = 0;
      for (const s of sRows) {
        sItemN++;
        const stones = parseStones(s.stones);
        all.push(profileLabel(`ATAMA #${String(sItemN).padStart(3, "0")}`, C_KNOWLEDGE));
        all.push(h3(s.value || "—"));
        if (s.reason?.trim()) all.push(bodyText(s.reason.trim()));
        all.push(...arraySection("Taşlar", stones));
        all.push(fieldInline("Güncelleme",
          new Date(s.updated_at).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" })
        ));
        if (sItemN < sRows.length) all.push(divider());
      }
    }

    sectionN++;
  }

  // NKB-V2-E: Belge-sonu Kaynakça — yalnız dahil edilen Kulvar kayıtlarına bağlı yapılandırılmış
  // numerology_sources kayıtları; her source_id BİR kez; deterministik sıra. Legacy source DAHİL DEĞİL.
  const bibliography = sections.bibliography
    ? buildBibliography(recordSources, Array.from(sourcesById.values()))
    : [];
  if (bibliography.length > 0) {
    all.push(h1Colored(`${sectionN}. Kaynakça`, C_KNOWLEDGE, true));
    all.push(muted(`${bibliography.length} kaynak`));
    all.push(spacer());
    for (const s of bibliography) {
      all.push(h3(s.display_label));
      const detail = bibliographyDetail(s);
      if (detail) all.push(bodyText(detail, 20));
    }
  }

  const doc = new Document({
    sections: [{
      properties: {},
      footers: { default: buildFooter("Numeroloji Bilgi Bankası · Yaşam Sistemi") },
      children: all,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const modeSlug = exportMode === "filtered" ? "filtreli" : "tumu";
  const filename = `numeroloji-bilgi-bankasi-${modeSlug}-${dateSlug}.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
