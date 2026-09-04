import { createClient } from "@supabase/supabase-js";
import { assertUserModuleAccess } from "@/lib/auth/moduleAccess";
import { isDemoAccountId } from "@/lib/auth/demoServerGuard";
import {
  WORD_TAB_LABELS,
  WORD_TAB_ORDER,
  normalizeWordPersonSections,
  wordFileName,
} from "@/app/numeroloji/bilgi-bankasi/helpers/wordPersonSections";
import {
  buildNumerolojiWordChildren,
  packNumerolojiDocx,
  type WordRecordRow,
  type WordSharedData,
  type WordStoneRow,
} from "@/app/numeroloji/bilgi-bankasi/helpers/wordDocxBuild";
import { isValidCalendarDate } from "@/lib/numeroloji";
import type { CalendarDate } from "@/lib/numeroloji/timing";
import type { SourceEntryRow } from "@/app/numeroloji/bilgi-bankasi/helpers/sourceEntryUiLogic";
import type { KnowledgeRecordRow } from "@/app/numeroloji/bilgi-bankasi/helpers/bilgiBankaKayit";
import { buildStockIndex, type StockIndex } from "@/app/numeroloji/bilgi-bankasi/helpers/stoneStockLogic";

export const runtime = "nodejs";

type ExportMode = "all" | "selected" | "single";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const { tenantId, userId, exportMode = "all", ids, recordId, sections: sectionsRaw, referenceDate: referenceDateRaw } = body as {
    tenantId?: string;
    userId?: string;
    exportMode?: ExportMode;
    ids?: string[];
    recordId?: string;
    sections?: unknown;
    referenceDate?: unknown;
  };

  const sections = normalizeWordPersonSections(sectionsRaw);
  const selectedTabs = WORD_TAB_ORDER.filter((k) => sections[k]);

  // FAZ 6: "Zamanlama & Gelişim" seçiliyse referans tarih ZORUNLU ve GEÇERLİ olmalı.
  // Engine'e açık CalendarDate geçirilir; sunucuda gizli new Date() KULLANILMAZ.
  let refCalendar: CalendarDate | null = null;
  if (sections.zamanlama) {
    const m = typeof referenceDateRaw === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(referenceDateRaw) : null;
    if (!m) return Response.json({ ok: false, error: "Zamanlama & Gelişim için geçerli bir referans tarihi (YYYY-AA-GG) gereklidir." }, { status: 400 });
    const year = Number(m[1]); const month = Number(m[2]); const day = Number(m[3]);
    if (!isValidCalendarDate(day, month, year))
      return Response.json({ ok: false, error: "Geçersiz zamanlama referans tarihi." }, { status: 400 });
    refCalendar = { year, month, day };
  }

  if (!tenantId || typeof tenantId !== "string" || !userId || typeof userId !== "string")
    return Response.json({ ok: false, error: "Kimlik doğrulama gerekli." }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey)
    return Response.json({ ok: false, error: "Supabase yapılandırması eksik." }, { status: 500 });

  const db = createClient(supabaseUrl, supabaseKey);

  // IDOR koruması — kullanıcı bu tenant'a ait mi (service_role)
  const { data: userRow } = await db.from("users").select("id").eq("id", userId).eq("tenant_id", tenantId).maybeSingle();
  if (!userRow) return Response.json({ ok: false, error: "Yetkisiz erişim." }, { status: 403 });

  const __moduleGate = await assertUserModuleAccess(db, userId, "numerology");
  if (!__moduleGate.ok) return __moduleGate.response;

  if (await isDemoAccountId(userId, db))
    return Response.json({ error: "Demo hesabında bu işlem kullanılamaz." }, { status: 403 });

  let query = db.from("numerology_records").select("*").eq("tenant_id", tenantId);
  if (exportMode === "single" && recordId) query = query.eq("id", recordId);
  else if (exportMode === "selected" && Array.isArray(ids) && ids.length > 0) query = query.in("id", ids);

  const { data, error } = await query.order("name");
  if (error) return Response.json({ ok: false, error: `Veri okunamadı: ${error.message}` }, { status: 500 });

  const rows = (data || []) as WordRecordRow[];
  if (!rows.length) return Response.json({ ok: false, error: "Bu seçim için kayıt bulunamadı." }, { status: 404 });

  const isSingle = exportMode === "single" || rows.length === 1;

  // Paylaşımlı bulk veriler (yalnız gereken sekmeler seçiliyse; N+1 yok).
  const shared: WordSharedData = { knowledgeRows: [], entries: [], sourceLabelById: new Map(), stoneRows: [] };
  if (sections.detailed || sections.summary) {
    const [kRes, seRes, srcRes] = await Promise.all([
      db.from("numerology_knowledge_records").select("*").eq("tenant_id", tenantId),
      db.from("numerology_knowledge_source_entries").select("*").eq("tenant_id", tenantId).eq("include_in_analysis", true),
      db.from("numerology_sources").select("id, display_label").eq("tenant_id", tenantId),
    ]);
    shared.knowledgeRows = (kRes.data || []) as KnowledgeRecordRow[];
    shared.entries = (seRes.data || []) as SourceEntryRow[];
    for (const s of (srcRes.data || []) as { id: string; display_label: string }[]) shared.sourceLabelById.set(s.id, s.display_label);
  }
  // Uzmanın kendi Doğaltaş stoku (yalnız Taş bölümü seçiliyse; tek toplu tenant-scoped sorgu — N+1 yok).
  let stockIndex: StockIndex = new Map();
  if (sections.tas) {
    if (shared.knowledgeRows.length === 0) {
      const kRes = await db.from("numerology_knowledge_records").select("id, analysis_type, value").eq("tenant_id", tenantId);
      shared.knowledgeRows = (kRes.data || []) as KnowledgeRecordRow[];
    }
    const [stRes, invRes] = await Promise.all([
      db.from("numerology_stone_assignments").select("id, analysis_type, value, reason, stones").eq("tenant_id", tenantId),
      db.from("dogaltas_inventory").select("name, adet").eq("tenant_id", tenantId),
    ]);
    shared.stoneRows = (stRes.data || []) as WordStoneRow[];
    stockIndex = buildStockIndex((invRes.data || []) as { name?: unknown; adet?: unknown }[]);
  }

  const { children, emptyTabs, anyContent } = buildNumerolojiWordChildren(rows, sections, shared, stockIndex, refCalendar);

  // Tüm seçilen sekmeler boşsa → dosya üretme, açık mesaj döndür.
  if (!anyContent) {
    const emptyLabels = selectedTabs.map((t) => WORD_TAB_LABELS[t]);
    return Response.json(
      {
        ok: false,
        error: `Seçtiğiniz ${emptyLabels.map((l) => `'${l}'`).join(", ")} bölümünde Word'e aktarılabilecek içerik bulunmuyor.`,
        emptyTabs: emptyLabels,
      },
      { status: 422 },
    );
  }

  const buffer = await packNumerolojiDocx(children, `${rows[0]!.name} ${rows[0]!.surname}`.trim());

  const filename = isSingle
    ? wordFileName(`${rows[0]!.name} ${rows[0]!.surname}`, selectedTabs)
    : `Numeroloji_${rows.length}_Kayit_${selectedTabs.length === 1 ? WORD_TAB_LABELS[selectedTabs[0]!].replace(/[^A-Za-z0-9]+/g, "_") : "Secili_Bolumler"}.docx`;

  const emptyHeader = emptyTabs.map((t) => WORD_TAB_LABELS[t]).join("|");

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Content-Length": String(buffer.length),
      "X-Empty-Tabs": encodeURIComponent(emptyHeader),
    },
  });
}
