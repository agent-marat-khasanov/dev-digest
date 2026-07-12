import { Badge, ErrorState, Markdown, Skeleton } from "@devdigest/ui";
import type { ContextDoc } from "@devdigest/shared";
import { useContextPreview } from "@/lib/hooks/context";
import { FOLDER_TYPE_META } from "../../constants";
import { docFileName } from "../../helpers";
import { s } from "../../styles";

export function DocPreview({ repoId, doc }: { repoId: string | null; doc: ContextDoc | null }) {
  const { data, isLoading, isError, refetch } = useContextPreview(repoId, doc?.path, !!doc);

  if (!doc) {
    return (
      <div style={s.previewCard}>
        <div style={s.previewPlaceholder}>Select a doc to preview it.</div>
      </div>
    );
  }

  const meta = FOLDER_TYPE_META[doc.folder_type];

  return (
    <div style={s.previewCard}>
      <div style={s.previewHeader}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{docFileName(doc.path)}</div>
          <div style={s.previewPath}>{doc.path}</div>
        </div>
        <Badge icon={meta.icon}>{meta.label}</Badge>
      </div>

      {isLoading && (
        <div>
          <Skeleton height={14} style={{ marginBottom: 10 }} />
          <Skeleton height={14} style={{ marginBottom: 10 }} />
          <Skeleton height={14} width="70%" />
        </div>
      )}
      {isError && (
        <ErrorState body="Couldn't load this doc's preview." onRetry={() => refetch()} />
      )}
      {!isLoading && !isError && <Markdown>{data?.content}</Markdown>}
    </div>
  );
}
