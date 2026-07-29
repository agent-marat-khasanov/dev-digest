/* MintEvalCaseModal — dry-run preview of "Turn into eval case" (AC-39). Shows
   the case name, owning agent, case type (must-find vs decoy), the source
   diff, and the expected findings BEFORE anything is persisted, then lets the
   user Save or Save & Run. All model/diff-derived text renders as plain text
   nodes only — never dangerouslySetInnerHTML. */
"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { Badge, Button, EmptyState, Modal, SeverityBadge, CategoryTag, type Severity, type Category } from "@devdigest/ui";
import { useToast } from "@/lib/toast";
import {
  useMintEvalCaseFromFinding,
  useMintEvalCasePreview,
  useRunAgentEvalCase,
} from "@/lib/hooks/agent-evals";
import { classifyDiffLines } from "./helpers";
import { s } from "./styles";

export function MintEvalCaseModal({ findingId, onClose }: { findingId: string; onClose: () => void }) {
  const t = useTranslations("prReview.finding.mintModal");
  const toast = useToast();
  const preview = useMintEvalCasePreview(findingId);
  const mint = useMintEvalCaseFromFinding();
  const runCase = useRunAgentEvalCase(preview.data?.agent_id ?? "");

  const handleSave = (thenRun: boolean) => {
    mint.mutate(findingId, {
      onSuccess: (evalCase) => {
        if (thenRun) {
          runCase.mutate(evalCase.id, {
            onSuccess: () => {
              toast.success(t("saveAndRunSuccess"));
              onClose();
            },
          });
        } else {
          toast.success(t("saveSuccess"));
          onClose();
        }
      },
    });
  };

  const saving = mint.isPending || runCase.isPending;

  const footer = (
    <div style={s.footer}>
      <Button kind="ghost" onClick={onClose}>
        {t("cancel")}
      </Button>
      {!preview.data?.existing_case_id && (
        <>
          <Button
            kind="secondary"
            disabled={!preview.data || saving}
            loading={mint.isPending && !runCase.isPending}
            onClick={() => handleSave(false)}
          >
            {t("save")}
          </Button>
          <Button
            kind="primary"
            disabled={!preview.data || saving}
            loading={mint.isPending || runCase.isPending}
            onClick={() => handleSave(true)}
          >
            {t("saveAndRun")}
          </Button>
        </>
      )}
    </div>
  );

  return (
    <Modal width={640} title={t("title")} onClose={onClose} footer={footer}>
      <div style={s.body}>
        {preview.isLoading && <p style={s.empty}>{t("loading")}</p>}
        {preview.isError && (
          <p style={s.errorText}>
            {preview.error instanceof Error ? preview.error.message : t("previewError")}
          </p>
        )}

        {preview.data && (
          <>
            <div style={s.metaRow}>
              <span style={s.metaLabel}>{t("name")}</span>
              <span>{preview.data.name}</span>
            </div>
            <div style={s.metaRow}>
              <span style={s.metaLabel}>{t("agent")}</span>
              <span>{preview.data.agent_name}</span>
            </div>
            <div style={s.metaRow}>
              <span style={s.metaLabel}>{t("caseType")}</span>
              <Badge>
                {preview.data.expected_output.length > 0 ? t("mustFind") : t("decoy")}
              </Badge>
            </div>

            {preview.data.existing_case_id && (
              <div style={s.banner}>
                <span>{t("alreadyExists")}</span>
                <Link href={`/agents/${preview.data.agent_id}?tab=evals`}>{t("viewCase")}</Link>
              </div>
            )}

            <div style={s.section}>
              <div style={s.sectionHeading}>{t("diffHeading")}</div>
              <div style={s.diffBox}>
                {classifyDiffLines(preview.data.input_diff).map((line, i) => (
                  <div key={i} style={s.diffLine(line.kind)}>
                    {line.text}
                  </div>
                ))}
              </div>
            </div>

            <div style={s.section}>
              <div style={s.sectionHeading}>{t("expectedHeading")}</div>
              {preview.data.expected_output.length === 0 ? (
                <EmptyState icon="FlaskConical" title={t("decoyTitle")} body={t("decoyBody")} />
              ) : (
                <div style={s.expectedList}>
                  {preview.data.expected_output.map((ef, i) => (
                    <div key={i} style={s.expectedRow}>
                      <span style={s.expectedTitle}>{ef.title}</span>
                      <div style={s.expectedMeta}>
                        <SeverityBadge severity={ef.severity as Severity} compact />
                        <CategoryTag category={ef.category as Category} />
                        <span style={s.expectedLoc}>
                          {ef.file}:{ef.start_line === ef.end_line ? ef.start_line : `${ef.start_line}-${ef.end_line}`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
