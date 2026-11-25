import { useTranslations } from "next-intl";
import type {
  HdEntityKind,
  HdKnowledgeContent,
} from "@/lib/human-design/knowledge/expertReadTypes";
import { CONTENT_TYPE_FIELDS } from "./knowledgeConstants";
import { KnowledgeEmpty } from "./KnowledgeStates";

/** Salt-okuma Ana Metin görünümü (Kaynaklandırılmış). */
export function AnaMetinView({
  content,
  entityKind,
}: {
  content: HdKnowledgeContent | null;
  entityKind: HdEntityKind;
}) {
  const t = useTranslations("hd.knowledge.canonical");
  if (!content) {
    return (
      <KnowledgeEmpty
        title={t("noPublishedContent")}
        hint={t("noPublishedHint")}
      />
    );
  }

  const typeFields = CONTENT_TYPE_FIELDS[entityKind].filter(
    (f) => typeof (content as unknown as Record<string, unknown>)[f.key] === "string" && ((content as unknown as Record<string, string>)[f.key]).trim() !== "",
  );

  const hasGeneral = content.general_description.trim() !== "";
  const hasReport = content.report_text.trim() !== "";

  if (!hasGeneral && !hasReport && typeFields.length === 0) {
    return <KnowledgeEmpty title={t("contentEmpty")} />;
  }

  return (
    <div className="space-y-5">
      {hasGeneral && (
        <section>
          <h3 className="mb-1 text-xs font-black uppercase tracking-wide text-indigo-700">{t("generalDescription")}</h3>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{content.general_description}</p>
        </section>
      )}
      {hasReport && (
        <section>
          <h3 className="mb-1 text-xs font-black uppercase tracking-wide text-indigo-700">{t("sourcedMainText")}</h3>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{content.report_text}</p>
        </section>
      )}
      {typeFields.map((f) => (
        <section key={f.key}>
          <h3 className="mb-1 text-xs font-black uppercase tracking-wide text-indigo-700">{t(`contentField.${f.key}`)}</h3>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {(content as unknown as Record<string, string>)[f.key]}
          </p>
        </section>
      ))}
    </div>
  );
}
