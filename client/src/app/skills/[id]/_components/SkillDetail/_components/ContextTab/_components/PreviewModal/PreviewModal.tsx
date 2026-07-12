"use client";

import { useTranslations } from "next-intl";
import { Markdown, Modal } from "@devdigest/ui";
import { useContextPreview } from "@/lib/hooks/context";
import { s } from "../../styles";

/** Read-only per-doc preview, fetched on demand (AC-10). */
export function PreviewModal({
  repoId,
  path,
  onClose,
}: {
  repoId: string;
  path: string;
  onClose: () => void;
}) {
  const t = useTranslations("skills.lab");
  const { data, isLoading, isError } = useContextPreview(repoId, path, true);

  return (
    <Modal title={path} onClose={onClose} width={720}>
      <div style={s.previewBody}>
        {isLoading && <p>{t("contextTab.previewLoading")}</p>}
        {isError && <p>{t("contextTab.previewError")}</p>}
        {data && <Markdown>{data.content}</Markdown>}
      </div>
    </Modal>
  );
}
