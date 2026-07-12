"use client";

import { useTranslations } from "next-intl";
import { Markdown, Modal, Skeleton } from "@devdigest/ui";
import { useContextPreview } from "@/lib/hooks/context";
import { s } from "../../styles";

/** Read-only markdown preview of one attached/discovered doc, opened per-row. */
export function PreviewModal({
  repoId,
  path,
  onClose,
}: {
  repoId: string | null | undefined;
  path: string;
  onClose: () => void;
}) {
  const t = useTranslations("agents.context");
  const { data, isLoading, isError } = useContextPreview(repoId, path, true);

  return (
    <Modal title={path} onClose={onClose} width={720}>
      <div style={s.previewBody}>
        {isLoading && <Skeleton height={140} />}
        {isError && <p>{t("previewError")}</p>}
        {data && <Markdown>{data.content}</Markdown>}
      </div>
    </Modal>
  );
}
