import { createClient } from "@supabase/supabase-js";
import { inngest } from "@/lib/inngest/client";

const TABLE = "belge_ceviri_jobs";

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase env değişkenleri eksik.");
  return createClient(url, key);
}

export const pdfTranslateFunction = inngest.createFunction(
  {
    id: "pdf-translate",
    name: "PDF Çeviri Worker",
    triggers: [{ event: "document.translation.requested" }],
  },
  async ({ event, step }) => {
    const { jobId } = event.data as { jobId: string };

    // 1. Job kaydını oku
    const job = await step.run("job-oku", async () => {
      const db = getDb();
      const { data, error } = await db
        .from(TABLE)
        .select("id, status, job_type, file_name, total_chunks")
        .eq("id", jobId)
        .single();
      if (error || !data) throw new Error(`Job bulunamadı: ${jobId}`);
      return data;
    });

    // 2. İşleme başladığını kaydet
    await step.run("status-processing", async () => {
      const db = getDb();
      await db
        .from(TABLE)
        .update({ status: "processing" })
        .eq("id", jobId);
    });

    // 3. Çeviri placeholder — gerçek çeviri Aşama 5'te eklenecek
    await step.sleep("bekle-stub", "10s");

    // 4. Tamamlandı olarak işaretle
    await step.run("status-completed", async () => {
      const db = getDb();
      await db
        .from(TABLE)
        .update({
          status: "completed",
          done_chunks: job.total_chunks,
        })
        .eq("id", jobId);
    });

    return { jobId, status: "completed" };
  },
);
