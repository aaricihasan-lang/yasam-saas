import { createClient } from "@supabase/supabase-js";
import { extractText } from "unpdf";
import { Document, Packer, Paragraph, TextRun } from "docx";
import OpenAI from "openai";
import { inngest } from "@/lib/inngest/client";

// ── Sabitler ───────────────────────────────────────────────────────────────────
const TABLE = "belge_ceviri_jobs";
const BUCKET = "belge-ceviri";
const WORDS_PER_CHUNK = 500;
const CHUNK_CONCURRENCY = 4;

type TranslationMode = "standard" | "academic";

// ── Supabase client ────────────────────────────────────────────────────────────
function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service role yapılandırması eksik.");
  return createClient(url, key);
}

// ── Türkçe karakter normalizasyonu ─────────────────────────────────────────────
const TURKISH_CHAR_MAP: Record<string, string> = {
  "Đ": "İ", "đ": "i", "Ð": "İ", "ð": "i",
};
const TURKISH_CHAR_REGEX = new RegExp(
  Object.keys(TURKISH_CHAR_MAP).map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
  "g",
);
function normalizeTurkishText(text: string): string {
  return text.replace(TURKISH_CHAR_REGEX, (ch) => TURKISH_CHAR_MAP[ch] ?? ch);
}
function cleanLine(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

// ── Chunk bölme ────────────────────────────────────────────────────────────────
function splitIntoSmallChunks(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (wordCount <= WORDS_PER_CHUNK) return [trimmed];
  const sentences = trimmed.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  if (sentences.length <= 1) {
    const words = trimmed.split(/\s+/);
    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += WORDS_PER_CHUNK)
      chunks.push(words.slice(i, i + WORDS_PER_CHUNK).join(" "));
    return chunks;
  }
  const chunks: string[] = [];
  let current: string[] = [];
  let currentWords = 0;
  for (const sentence of sentences) {
    const wc = sentence.split(/\s+/).filter(Boolean).length;
    if (currentWords + wc > WORDS_PER_CHUNK && current.length > 0) {
      chunks.push(current.join(" "));
      current = [sentence];
      currentWords = wc;
    } else {
      current.push(sentence);
      currentWords += wc;
    }
  }
  if (current.length > 0) chunks.push(current.join(" "));
  return chunks;
}

// ── OpenAI prompts ─────────────────────────────────────────────────────────────
const STANDARD_PROMPT = `Sen deneyimli bir kitap çevirmensin. Görevin verilen metni Türk okuyucu için profesyonel bir kitap bölümü kalitesinde Türkçeye çevirmek.

Çeviri kuralları:
- Yalnızca çeviriyi döndür; açıklama, not veya ek metin ekleme.
- Kelime kelime değil, anlam ve akış odaklı çeviri yap. Cümleler Türkçede doğal ve akıcı okunmalı.
- Başlıkları ve alt başlıkları Türkçeleştir; orijinal dilde bırakma.
- Teknik ve uzmanlık terimlerini Türkçeye çevir. Yaygın Türkçe karşılığı yoksa terimi Türkçeleştir, ardından parantez içinde orijinalini yaz: örn. "enerji alanı (energy field)".
- Tıbbi, astrolojik, psikolojik ve akademik terimleri metnin tamamında tutarlı kullan.
- Paragraf yapısını koru; liste ve madde işaretlerini aynen koru.
- Sayıları, tarihleri ve birimleri değiştirme.
- Çeviri Türk okuyucu için yazılmış, yayına hazır bir kitap bölümü gibi görünmeli.`;

const ACADEMIC_PROMPT = `Sen profesyonel akademik çevirmen ve editörsün.

Metni yalnızca çevirmekle kalma. Türkçeyi doğal, akıcı, akademik ve yayınlanabilir kitap kalitesinde oluştur.

Kelime kelime çeviri yapma. Anlamı koru. Teknik terimlerde Türkçeyi tercih et. Gerekirse ilk kullanımda: Türkçe Terim (Original Term) formatını kullan.

Başlıkları profesyonel Türkçeleştir. Paragraf yapısını koru.

Sonuç bir yapay zeka çevirisi gibi değil, Türkçe yazılmış özgün akademik eser gibi okunmalıdır.

Yalnızca çeviriyi döndür; açıklama veya ek metin ekleme.`;

const MODE_CONFIG = {
  standard: { model: "gpt-4o-mini", prompt: STANDARD_PROMPT },
  academic: { model: "gpt-4.1", prompt: ACADEMIC_PROMPT },
} as const;

async function translateChunk(
  text: string,
  openai: OpenAI,
  model: string,
  systemPrompt: string,
): Promise<string> {
  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ],
    temperature: 0.3,
  });
  return response.choices[0]?.message?.content ?? text;
}

// ── Inngest Function ───────────────────────────────────────────────────────────
export const pdfTranslateFunction = inngest.createFunction(
  {
    id: "pdf-translate",
    name: "PDF Çeviri Worker",
    triggers: [{ event: "document.translation.requested" }],
  },
  async ({ event, step }) => {
    const { jobId, mode = "standard" } = event.data as { jobId: string; mode?: string };
    const translationMode: TranslationMode = mode === "academic" ? "academic" : "standard";
    const { model, prompt: systemPrompt } = MODE_CONFIG[translationMode];

    try {
      // ── 1. PDF indir, metin çıkar, chunk'lara böl ────────────────────────────
      const { chunks, totalChunks, tenantId } = await step.run("hazırla", async () => {
        const db = getDb();

        const { data: job, error: jobError } = await db
          .from(TABLE)
          .select("source_path, tenant_id")
          .eq("id", jobId)
          .single();
        if (jobError || !job) throw new Error(`Job bulunamadı: ${jobId}`);

        const { data: blob, error: dlError } = await db.storage
          .from(BUCKET)
          .download(job.source_path);
        if (dlError || !blob) throw new Error(`PDF indirilemedi: ${dlError?.message}`);

        const ab = await blob.arrayBuffer();
        const { text: pages } = await extractText(
          new Uint8Array(ab.slice(0)),
          { mergePages: false },
        );

        const pageList = Array.isArray(pages) ? pages : [pages as string];
        const lines: string[] = [];
        for (const pageText of pageList) {
          for (const raw of pageText.split("\n")) {
            const line = normalizeTurkishText(cleanLine(raw));
            if (line) lines.push(line);
          }
          lines.push("");
        }
        const fullText = lines.join("\n").trim();
        if (!fullText) throw new Error("PDF'den metin çıkarılamadı.");

        const chunks = splitIntoSmallChunks(fullText);

        await db.from(TABLE).update({
          status: "processing",
          total_chunks: chunks.length,
          done_chunks: 0,
        }).eq("id", jobId);

        return {
          chunks,
          totalChunks: chunks.length,
          tenantId: (job.tenant_id as string | null) ?? "",
        };
      });

      // ── 2. Chunk'ları batch batch çevir ─────────────────────────────────────
      const translated: string[] = new Array(totalChunks).fill("");

      for (let i = 0; i < totalChunks; i += CHUNK_CONCURRENCY) {
        const batchIndex = Math.floor(i / CHUNK_CONCURRENCY);
        const end = Math.min(i + CHUNK_CONCURRENCY, totalChunks);

        const batchResult = await step.run(`cevir-batch-${batchIndex}`, async () => {
          const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
          const batch = chunks.slice(i, end);
          const results = await Promise.all(
            batch.map((c) => translateChunk(c, openai, model, systemPrompt)),
          );

          const db = getDb();
          await db.from(TABLE).update({ done_chunks: end }).eq("id", jobId);

          return results;
        });

        batchResult.forEach((r, j) => { translated[i + j] = r; });
      }

      // ── 3. DOCX oluştur, Storage'a yükle, tamamla ───────────────────────────
      await step.run("tamamla", async () => {
        const translatedText = translated.join("\n\n");
        const modeLabel = translationMode === "academic" ? "Akademik Çeviri" : "Standart Çeviri";

        const children: Paragraph[] = [
          new Paragraph({
            children: [
              new TextRun({ text: `Çeviri Modu: ${modeLabel}`, size: 18, italics: true, color: "888888" }),
            ],
            spacing: { after: 240 },
          }),
        ];
        for (const raw of translatedText.split("\n")) {
          const line = raw.trim();
          children.push(
            new Paragraph({
              children: line ? [new TextRun({ text: line, size: 22 })] : [],
              spacing: { after: 120 },
            }),
          );
        }

        const doc = new Document({
          sections: [{
            properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
            children,
          }],
        });

        const docxBuffer = await Packer.toBuffer(doc);
        // Tenant prefix ile path — eski kayıtlar (tenant_id boş) için fallback
        const resultPath = tenantId
          ? `${tenantId}/output/${jobId}.docx`
          : `output/${jobId}.docx`;

        const db = getDb();
        const { error: uploadError } = await db.storage
          .from(BUCKET)
          .upload(resultPath, new Uint8Array(docxBuffer), {
            contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            upsert: true,
          });
        if (uploadError) throw new Error(`DOCX yükleme hatası: ${uploadError.message}`);

        await db.from(TABLE).update({
          status: "completed",
          result_path: resultPath,
          done_chunks: totalChunks,
        }).eq("id", jobId);
      });

      return { jobId, status: "completed" };

    } catch (err) {
      // Hata durumunda DB'yi güncelle
      const errorMessage = err instanceof Error ? err.message : String(err);
      try {
        await getDb().from(TABLE).update({
          status: "failed",
          error_message: errorMessage,
        }).eq("id", jobId);
      } catch {
        // DB güncellemesi de başarısız olursa yoksay
      }
      throw err; // Inngest retry mekanizması devreye girsin
    }
  },
);
