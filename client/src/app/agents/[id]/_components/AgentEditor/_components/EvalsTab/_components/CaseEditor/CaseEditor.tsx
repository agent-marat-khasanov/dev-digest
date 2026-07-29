/* CaseEditor — create or edit an agent eval case: two-column modal, name +
   pasted diff (with an inert colored preview) on the left, the raw
   `ExpectedFinding[]` JSON contract on the right. Create goes through
   POST /agents/:id/evals; passing `caseId` + `initialCase` switches the form
   to edit mode, hydrating from the existing case and saving via
   PATCH /agents/:id/evals/:caseId. "Run on save" immediately runs the case
   after a successful save; "Run case" runs the already-persisted case. */
"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Modal, Toggle } from "@devdigest/ui";
import type { EvalCase, EvalCaseInput, EvalCaseSummary } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useAgent } from "@/lib/hooks/agents";
import {
  useAgentEvalRuns,
  useCreateAgentEvalCase,
  useRunAgentEvalCase,
  useUpdateAgentEvalCase,
} from "@/lib/hooks/agent-evals";
import { ExpectedOutputPanel, type LastRunInfo } from "./_components/ExpectedOutputPanel";
import { InputPanel, type InputTabKey } from "./_components/InputPanel";
import { parseJson } from "./helpers";
import { s } from "./styles";

export function CaseEditor({
  agentId,
  caseId,
  initialCase,
  summary,
  onClose,
}: {
  agentId: string;
  caseId?: string;
  initialCase?: EvalCase;
  summary?: EvalCaseSummary;
  onClose: () => void;
}) {
  const t = useTranslations("agents.editor.evals.caseEditor");
  const agent = useAgent(agentId);
  const runs = useAgentEvalRuns(agentId);
  const createCase = useCreateAgentEvalCase(agentId);
  const updateCase = useUpdateAgentEvalCase(agentId);
  const runCase = useRunAgentEvalCase(agentId);

  const [name, setName] = useState(initialCase?.name ?? "");
  const [diffText, setDiffText] = useState(initialCase?.input_diff ?? "");
  const [inputTab, setInputTab] = useState<InputTabKey>("diff");
  const [expectedJson, setExpectedJson] = useState(
    JSON.stringify(initialCase?.expected_output ?? [], null, 2),
  );
  const [runOnSave, setRunOnSave] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const isEditing = !!caseId;
  const activeMutation = isEditing ? updateCase : createCase;
  const { valid: isValidJson, value: parsedExpected } = parseJson(expectedJson);

  const latestRun = useMemo(() => {
    if (!caseId || !runs.data) return undefined;
    return [...runs.data]
      .filter((r) => r.case_id === caseId)
      .sort((a, b) => b.ran_at.localeCompare(a.ran_at))[0];
  }, [runs.data, caseId]);

  const lastRun: LastRunInfo | undefined = summary?.last_run
    ? {
        pass: summary.last_run.pass,
        expectedCount: summary.expected_count,
        actualCount: summary.last_run.actual_count,
        durationMs: latestRun?.duration_ms ?? null,
        costUsd: latestRun?.cost_usd ?? null,
      }
    : undefined;

  const handleSave = () => {
    setServerError(null);
    const input: EvalCaseInput = {
      owner_kind: "agent",
      owner_id: agentId,
      name,
      input_diff: diffText,
      expected_output: parsedExpected,
    };

    const onError = (err: unknown) =>
      setServerError(err instanceof ApiError ? err.message : t("saveError"));
    const afterSave = (savedCaseId: string) => {
      if (runOnSave) runCase.mutate(savedCaseId);
      onClose();
    };

    if (isEditing) {
      updateCase.mutate({ caseId, patch: input }, { onSuccess: () => afterSave(caseId), onError });
    } else {
      createCase.mutate(input, { onSuccess: (saved) => afterSave(saved.id), onError });
    }
  };

  const footer = (
    <div style={s.footer}>
      <div style={s.footerLeft}>
        <Toggle on={runOnSave} onChange={setRunOnSave} />
        <span style={s.runOnSaveLabel}>{t("runOnSave")}</span>
      </div>
      <div style={s.footerRight}>
        <Button kind="ghost" size="sm" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button
          kind="secondary"
          size="sm"
          icon="Play"
          loading={runCase.isPending}
          disabled={!caseId || runCase.isPending}
          onClick={() => caseId && runCase.mutate(caseId)}
        >
          {t("runCase")}
        </Button>
        <Button
          kind="primary"
          size="sm"
          icon="Check"
          loading={activeMutation.isPending}
          disabled={activeMutation.isPending || !name || !diffText || !isValidJson}
          onClick={handleSave}
        >
          {t("save")}
        </Button>
      </div>
    </div>
  );

  return (
    <Modal
      width={920}
      title={name ? t("title", { name }) : t("newTitle")}
      subtitle={t("subtitle", { agent: agent.data?.name ?? "" })}
      onClose={onClose}
      footer={footer}
    >
      <div style={s.body}>
        {serverError && <div style={s.error}>{serverError}</div>}
        <div style={s.columns}>
          <InputPanel
            name={name}
            onNameChange={setName}
            diffText={diffText}
            onDiffChange={setDiffText}
            tab={inputTab}
            onTabChange={setInputTab}
            inputFiles={initialCase?.input_files}
            inputMeta={initialCase?.input_meta}
          />
          <ExpectedOutputPanel
            json={expectedJson}
            onJsonChange={setExpectedJson}
            isValidJson={isValidJson}
            lastRun={lastRun}
          />
        </div>
      </div>
    </Modal>
  );
}
