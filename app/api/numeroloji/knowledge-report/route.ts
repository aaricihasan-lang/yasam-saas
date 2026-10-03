import { NextRequest, NextResponse } from "next/server";
import { androidWordGuard } from "@/lib/platform/androidWordGuard";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { readAllPaged } from "@/lib/db/readAllPaged";
import { trackUsage } from "@/lib/usage/trackUsage";
import { Document, Packer } from "docx";
import {
  arraySection,
  bodyText,
  buildFooter,
  buildWellnessNoteSection,
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
import { expertDisplayName } from "@/lib/docx/reportDisclaimer";
import { formatInstantDateTime, reportFileDate, reportGeneratedLabel } from "@/lib/time/reportTime";
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export async function POST(req: NextRequest): Promise<Response> {
  // Android Word politikası (defense-in-depth): Android cihazlarda .docx üretilmez.
  const androidBlocked = androidWordGuard(req);
  if (androidBlocked) return androidBlocked;

  // NUM-001: kimlik + tenant SUNUCUDA oturumdan çözülür (x-user-id + x-session-token
  // binding + numerology modül izni). Body'den tenantId/userId ARTIK OKUNMAZ →
  // başka tenant'ın bilgi bankası Word'ünü indirtmek imkânsız.
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const { exportMode = "all", knowledgeIds, stoneIds, sections: sectionsRaw } = body as {
    exportMode?: ExportMode;
    knowledgeIds?: string[];
    stoneIds?: string[];
    sections?: unknown;
  };

  // Bölüm seçimi (verilmezse tüm bölümler — eski istemci uyumu).
  const sections = normalizeWordSections(sectionsRaw);

  // Demo hesap: export sunucu seviyesinde engellenir
  if (is_demo_account)
    return NextResponse.json({ error: "Demo hesabında bu işlem kullanılamaz." }, { status: 403 });

  // NUM-F05: filtreli modda boş id listesi = o türden kayıt YOK. Eskiden `.eq("id","none")`
  // uuid kolonunda 22P02 → 500 veriyordu; artık o tür hiç sorgulanmaz (boş sonuç).
  // NUM-F09: sayfalı tam okuma (PostgREST 1000 satır sınırında sessiz kesilme yok).
  let kFilter: string[] | null = null;
  let sFilter: string[] | null = null;
  let skipKnowledge = false;
  let skipStones = false;
  if (exportMode === "filtered") {
    kFilter = Array.isArray(knowledgeIds) ? knowledgeIds.filter((x): x is string => typeof x === "string" && UUID_RE.test(x)) : [];
    sFilter = Array.isArray(stoneIds) ? stoneIds.filter((x): x is string => typeof x === "string" && UUID_RE.test(x)) : [];
    skipKnowledge = kFilter.length === 0;
    skipStones = sFilter.length === 0;
    if (skipKnowledge && skipStones)
      return NextResponse.json({ ok: false, error: "Filtrede rapora eklenecek kayıt yok." }, { status: 400 });
  }

  const EMPTY = { rows: [] as unknown[], error: null, total: 0, truncated: false };
  const [kPaged, sPaged] = await Promise.all([
    skipKnowledge
      ? Promise.resolve(EMPTY)
      : readAllPaged((f, t) => {
          let q = db.from("numerology_knowledge_records").select("*", { count: "exact" }).eq("tenant_id", tenantId);
          if (kFilter) q = q.in("id", kFilter);
          return q.order("analysis_type").order("value").order("id").range(f, t);
        }),
    skipStones
      ? Promise.resolve(EMPTY)
      : readAllPaged((f, t) => {
          let q = db.from("numerology_stone_assignments").select("*", { count: "exact" }).eq("tenant_id", tenantId);
          if (sFilter) q = q.in("id", sFilter);
          return q.order("analysis_type").order("value").order("id").range(f, t);
        }),
  ]);
  const kRes = { data: kPaged.rows, error: kPaged.error };
  const sRes = { data: sPaged.rows, error: sPaged.error };

  if (kRes.error) {
    await trackUsage(guard, req, { module: "numerology", action: "action_failed", failedAction: "report_generated", subEntity: "knowledge", errorClass: "server" });
    return NextResponse.json({ ok: false, error: "Açıklama kayıtları okunamadı." }, { status: 500 });
  }
  if (sRes.error) {
    await trackUsage(guard, req, { module: "numerology", action: "action_failed", failedAction: "report_generated", subEntity: "knowledge", errorClass: "server" });
    return NextResponse.json({ ok: false, error: "Taş atamaları okunamadı." }, { status: 500 });
  }

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
    // NUM-F09: büyük id listesini URL'ye koymadan, tenant'ın tüm bağlantı/kaynaklarını sayfalı
    // okuyup bellekte filtreler (1000 kesmesi ve uzun-URL riski yok).
    const kulvarIdSet = new Set(kulvarIds);
    const rsRes = await readAllPaged((f, t) => db.from("numerology_record_sources").select("*", { count: "exact" }).eq("tenant_id", tenantId).order("id").range(f, t));
    if (rsRes.error) return Response.json({ ok: false, error: "Kaynak bağlantıları okunamadı." }, { status: 500 });
    recordSources = (rsRes.rows as RecordSourceRow[]).filter((l) => kulvarIdSet.has(l.knowledge_record_id));

    if (recordSources.length > 0) {
      const sRes = await readAllPaged((f, t) => db.from("numerology_sources").select("*", { count: "exact" }).eq("tenant_id", tenantId).order("id").range(f, t));
      if (sRes.error) return Response.json({ ok: false, error: "Kaynaklar okunamadı." }, { status: 500 });
      for (const src of sRes.rows as NumerologySourceRow[]) sourcesById.set(src.id, src);
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
    const kIdSet = new Set(knowledgeRows.map((r) => r.id));
    const seRes = await readAllPaged((f, t) =>
      db.from("numerology_knowledge_source_entries").select("*", { count: "exact" }).eq("tenant_id", tenantId).eq("include_in_analysis", true).order("id").range(f, t),
    );
    if (seRes.error) return Response.json({ ok: false, error: "Kaynak notları okunamadı." }, { status: 500 });
    const seData = (seRes.rows as SourceEntryRow[]).filter((e) => kIdSet.has(e.knowledge_record_id));
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

  // FA-02: rapor tarihi / dosya adı Europe/Istanbul yerel günü.
  const today = reportGeneratedLabel();
  const dateSlug = reportFileDate();
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
          formatInstantDateTime(k.updated_at, { fallback: "—" })
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
          formatInstantDateTime(s.updated_at, { fallback: "—" })
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

  // FA-16: sade bilgilendirme notu + Hazırlayan (rapor sonu).
  all.push(...buildWellnessNoteSection("numeroloji", expertDisplayName(guard.profile)));

  const doc = new Document({
    sections: [{
      properties: {},
      footers: { default: buildFooter("Numeroloji Bilgi Bankası · Yaşam Sistemi", { note: "numeroloji" }) },
      children: all,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const modeSlug = exportMode === "filtered" ? "filtreli" : "tumu";
  const filename = `numeroloji-bilgi-bankasi-${modeSlug}-${dateSlug}.docx`;

  // Usage360: Word dosyası BAŞARIYLA üretildi → tek rapor olayı (konu: bilgi bankası).
  await trackUsage(guard, req, {
    module: "numerology",
    action: "report_generated",
    subEntity: "knowledge",
    resourceId: [...knowledgeRows.map((r) => r.id), ...stoneRows.map((r) => r.id)].sort().join(","),
    itemCount: knowledgeRows.length + stoneRows.length,
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
