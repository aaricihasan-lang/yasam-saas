import { NextRequest, NextResponse } from "next/server";
import { androidWordGuard } from "@/lib/platform/androidWordGuard";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { readAllPaged } from "@/lib/db/readAllPaged";
import { trackUsage } from "@/lib/usage/trackUsage";
import { expertDisplayName } from "@/lib/docx/reportDisclaimer";
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
import { canSeeNumerologyFutureYears } from "@/app/numeroloji/utils/futureYearsAccess";

export const runtime = "nodejs";

type ExportMode = "all" | "selected" | "single";

export async function POST(req: NextRequest): Promise<Response> {
  // Android Word politikası (defense-in-depth): Android cihazlarda .docx üretilmez.
  const androidBlocked = androidWordGuard(req);
  if (androidBlocked) return androidBlocked;

  // NUM-001: kimlik + tenant SUNUCUDA oturumdan çözülür (x-user-id + x-session-token
  // binding + numerology modül izni). Body'den tenantId/userId ARTIK OKUNMAZ →
  // başka tenant'ın Word'ünü indirtmek imkânsız (çapraz-tenant export kapandı).
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const { exportMode = "all", ids, recordId, sections: sectionsRaw, referenceDate: referenceDateRaw } = body as {
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
    if (!m) return NextResponse.json({ ok: false, error: "Zamanlama & Gelişim için geçerli bir referans tarihi (YYYY-AA-GG) gereklidir." }, { status: 400 });
    const year = Number(m[1]); const month = Number(m[2]); const day = Number(m[3]);
    if (!isValidCalendarDate(day, month, year))
      return NextResponse.json({ ok: false, error: "Geçersiz zamanlama referans tarihi." }, { status: 400 });
    refCalendar = { year, month, day };
  }

  if (is_demo_account)
    return NextResponse.json({ error: "Demo hesabında bu işlem kullanılamaz." }, { status: 403 });

  // P3 (AŞAMA 1): "single" recordId'siz veya "selected" boş/geçersiz id listesiyle TÜM tenant
  // dışa aktarılıyordu; artık açık hata döner. Geçersiz UUID → 400 (eskiden 500).
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let idFilter: string[] | null = null;
  if (exportMode === "single") {
    if (typeof recordId !== "string" || !UUID_RE.test(recordId))
      return NextResponse.json({ ok: false, error: "Geçerli bir kayıt seçilmedi." }, { status: 400 });
    idFilter = [recordId];
  } else if (exportMode === "selected") {
    const clean = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string" && UUID_RE.test(x)) : [];
    if (clean.length === 0 || clean.length !== (Array.isArray(ids) ? ids.length : 0))
      return NextResponse.json({ ok: false, error: "Geçerli kayıt seçilmedi." }, { status: 400 });
    if (clean.length > 1000)
      return NextResponse.json({ ok: false, error: "Tek seferde en fazla 1000 kayıt dışa aktarılabilir." }, { status: 400 });
    idFilter = clean;
  }

  // NUM-F09: PostgREST max-rows (1000) sınırında sessiz kesilme yok — sayfalı tam okuma.
  const { rows: pagedRows, error } = await readAllPaged((from, to) => {
    let q = db.from("numerology_records").select("*", { count: "exact" }).eq("tenant_id", tenantId);
    if (idFilter) q = q.in("id", idFilter);
    return q.order("name").order("id").range(from, to);
  });
  const data = pagedRows;
  if (error) {
    await trackUsage(guard, req, { module: "numerology", action: "action_failed", failedAction: "report_generated", subEntity: "analysis", errorClass: "server" });
    return NextResponse.json({ ok: false, error: "Kayıtlar okunamadı." }, { status: 500 });
  }

  const rows = (data || []) as WordRecordRow[];
  if (!rows.length) return Response.json({ ok: false, error: "Bu seçim için kayıt bulunamadı." }, { status: 404 });

  const isSingle = exportMode === "single" || rows.length === 1;

  // Paylaşımlı bulk veriler (yalnız gereken sekmeler seçiliyse; N+1 yok).
  const shared: WordSharedData = { knowledgeRows: [], entries: [], sourceLabelById: new Map(), stoneRows: [] };
  if (sections.detailed || sections.summary) {
    const [kRes, seRes, srcRes] = await Promise.all([
      readAllPaged((f, t) => db.from("numerology_knowledge_records").select("*", { count: "exact" }).eq("tenant_id", tenantId).order("id").range(f, t)),
      readAllPaged((f, t) => db.from("numerology_knowledge_source_entries").select("*", { count: "exact" }).eq("tenant_id", tenantId).eq("include_in_analysis", true).order("id").range(f, t)),
      readAllPaged((f, t) => db.from("numerology_sources").select("id, display_label", { count: "exact" }).eq("tenant_id", tenantId).order("id").range(f, t)),
    ]);
    if (kRes.error || seRes.error || srcRes.error)
      return NextResponse.json({ ok: false, error: "Bilgi bankası verileri okunamadı." }, { status: 500 });
    shared.knowledgeRows = kRes.rows as KnowledgeRecordRow[];
    shared.entries = seRes.rows as SourceEntryRow[];
    for (const s of srcRes.rows as { id: string; display_label: string }[]) shared.sourceLabelById.set(s.id, s.display_label);
  }
  // Uzmanın kendi Doğaltaş stoku (yalnız Taş bölümü seçiliyse; tek toplu tenant-scoped sorgu — N+1 yok).
  let stockIndex: StockIndex = new Map();
  if (sections.tas) {
    if (shared.knowledgeRows.length === 0) {
      const kRes = await readAllPaged((f, t) => db.from("numerology_knowledge_records").select("id, analysis_type, value", { count: "exact" }).eq("tenant_id", tenantId).order("id").range(f, t));
      if (kRes.error) return NextResponse.json({ ok: false, error: "Bilgi bankası verileri okunamadı." }, { status: 500 });
      shared.knowledgeRows = kRes.rows as KnowledgeRecordRow[];
    }
    const [stRes, invRes] = await Promise.all([
      readAllPaged((f, t) => db.from("numerology_stone_assignments").select("id, analysis_type, value, reason, stones", { count: "exact" }).eq("tenant_id", tenantId).order("id").range(f, t)),
      readAllPaged((f, t) => db.from("dogaltas_inventory").select("name, adet", { count: "exact" }).eq("tenant_id", tenantId).order("name").range(f, t)),
    ]);
    if (stRes.error) return NextResponse.json({ ok: false, error: "Taş atamaları okunamadı." }, { status: 500 });
    shared.stoneRows = stRes.rows as WordStoneRow[];
    stockIndex = buildStockIndex((invRes.error ? [] : invRes.rows) as { name?: unknown; adet?: unknown }[]);
  }

  // Gelecek Yıllar alt-yetkisi SUNUCUDA, doğrulanmış profilden (module_permissions) her istekte
  // yeniden çözülür; body'de gelen hiçbir alan yetki sayılmaz. Rapor saklanmaz/önbelleğe alınmaz →
  // yetki kapatıldıktan sonraki ilk indirme sınırı yeniden uygular.
  const futureYears = canSeeNumerologyFutureYears(guard.profile);
  const { children, emptyTabs, anyContent } = buildNumerolojiWordChildren(rows, sections, shared, stockIndex, refCalendar, new Date(), futureYears);

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

  // FA-16: belge sonunda sade bilgilendirme notu + Hazırlayan (packNumerolojiDocx ekler).
  const buffer = await packNumerolojiDocx(children, `${rows[0]!.name} ${rows[0]!.surname}`.trim(), {
    expertName: expertDisplayName(guard.profile),
  });

  const filename = isSingle
    ? wordFileName(`${rows[0]!.name} ${rows[0]!.surname}`, selectedTabs)
    : `Numeroloji_${rows.length}_Kayit_${selectedTabs.length === 1 ? WORD_TAB_LABELS[selectedTabs[0]!].replace(/[^A-Za-z0-9]+/g, "_") : "Secili_Bolumler"}.docx`;

  const emptyHeader = emptyTabs.map((t) => WORD_TAB_LABELS[t]).join("|");

  // Usage360: Word dosyası BAŞARIYLA üretildi → tek rapor olayı (konu: analiz; çoklu → itemCount).
  await trackUsage(guard, req, {
    module: "numerology",
    action: "report_generated",
    subEntity: "analysis",
    resourceId: rows.map((r) => r.id).sort().join(","),
    itemCount: rows.length,
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Content-Length": String(buffer.length),
      "X-Empty-Tabs": encodeURIComponent(emptyHeader),
      // Yetkiye bağlı içerik (Gelecek Yıllar) → ara katman/tarayıcı önbelleğinde tekrar kullanılmaz.
      "Cache-Control": "no-store",
    },
  });
}
