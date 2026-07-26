/* CaseEditor — create an agent eval case by pasting a diff (with an inert
   preview via DiffViewer/parsePatch), choosing the expectation type
   (must-find vs must-not-flag), and setting the expected finding's
   file + line range. Stored via `EvalCaseInput` through the same
   POST /agents/:id/evals route manually authored cases always use. */
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, SelectInput, Textarea, TextInput } from "@devdigest/ui";
import type { EvalCaseInput, ExpectedFinding, FindingCategory, Severity } from "@devdigest/shared";
import { DiffViewer } from "@/components/diff-viewer";
import type { PrFile } from "@/lib/types";
import { ApiError } from "@/lib/api";
import { useCreateAgentEvalCase } from "@/lib/hooks/agent-evals";
import { extractFilePath } from "./helpers";
import { s } from "./styles";

const SEVERITIES: Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];
const CATEGORIES: FindingCategory[] = ["bug", "security", "perf", "style", "test"];

type ExpectationType = "mustFind" | "mustNotFlag";

export function CaseEditor({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  const t = useTranslations("agents.editor.evals.caseEditor");
  const createCase = useCreateAgentEvalCase(agentId);

  const [name, setName] = useState("");
  const [diffText, setDiffText] = useState("");
  const [expectationType, setExpectationType] = useState<ExpectationType>("mustFind");
  const [severity, setSeverity] = useState<Severity>("WARNING");
  const [category, setCategory] = useState<FindingCategory>("bug");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState("");
  const [startLine, setStartLine] = useState("1");
  const [endLine, setEndLine] = useState("1");
  const [serverError, setServerError] = useState<string | null>(null);

  const previewFiles: PrFile[] = diffText
    ? [{ path: extractFilePath(diffText), additions: 0, deletions: 0, patch: diffText }]
    : [];

  const handleSave = () => {
    setServerError(null);
    const expectedOutput: ExpectedFinding[] =
      expectationType === "mustFind"
        ? [
            {
              severity,
              category,
              title,
              file,
              start_line: Number(startLine),
              end_line: Number(endLine),
            },
          ]
        : [];

    const input: EvalCaseInput = {
      owner_kind: "agent",
      owner_id: agentId,
      name,
      input_diff: diffText,
      expected_output: expectedOutput,
    };

    createCase.mutate(input, {
      onSuccess: () => onClose(),
      onError: (err) => setServerError(err instanceof ApiError ? err.message : t("saveError")),
    });
  };

  const footer = (
    <div style={s.footer}>
      <Button kind="ghost" size="sm" onClick={onClose}>
        {t("cancel")}
      </Button>
      <Button
        kind="primary"
        size="sm"
        loading={createCase.isPending}
        disabled={createCase.isPending || !name || !diffText}
        onClick={handleSave}
      >
        {t("save")}
      </Button>
    </div>
  );

  return (
    <Modal title={t("newTitle")} onClose={onClose} footer={footer}>
      <div style={{ padding: 20 }}>
        {serverError && <div style={s.error}>{serverError}</div>}

        <FormField label={t("name")} required>
          <TextInput value={name} onChange={setName} placeholder={t("namePlaceholder")} />
        </FormField>

        <FormField label={t("pasteDiff")} required>
          <Textarea mono rows={8} value={diffText} onChange={setDiffText} placeholder={t("diffPlaceholder")} />
        </FormField>

        <FormField label={t("preview")}>
          <DiffViewer files={previewFiles} />
        </FormField>

        <FormField label={t("expectationType")}>
          <SelectInput
            value={expectationType}
            onChange={(v) => setExpectationType(v as ExpectationType)}
            options={[
              { value: "mustFind", label: t("mustFind") },
              { value: "mustNotFlag", label: t("mustNotFlag") },
            ]}
          />
        </FormField>

        {expectationType === "mustFind" && (
          <>
            <FormField label={t("severity")}>
              <SelectInput value={severity} onChange={(v) => setSeverity(v as Severity)} options={SEVERITIES} />
            </FormField>
            <FormField label={t("category")}>
              <SelectInput value={category} onChange={(v) => setCategory(v as FindingCategory)} options={CATEGORIES} />
            </FormField>
            <FormField label={t("title")}>
              <TextInput value={title} onChange={setTitle} placeholder={t("titlePlaceholder")} />
            </FormField>
            <FormField label={t("file")}>
              <TextInput value={file} onChange={setFile} placeholder={t("filePlaceholder")} />
            </FormField>
            <div style={s.lineRangeRow}>
              <div style={s.lineRangeField}>
                <FormField label={t("startLine")}>
                  <TextInput type="number" value={startLine} onChange={setStartLine} />
                </FormField>
              </div>
              <div style={s.lineRangeField}>
                <FormField label={t("endLine")}>
                  <TextInput type="number" value={endLine} onChange={setEndLine} />
                </FormField>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
