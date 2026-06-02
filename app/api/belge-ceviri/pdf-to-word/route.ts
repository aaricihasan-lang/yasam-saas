import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, message: "Dosya bulunamadı. 'file' alanı gerekli." },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Dosya alındı, dönüşüm altyapısı hazırlanıyor.",
      fileName: file.name,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
