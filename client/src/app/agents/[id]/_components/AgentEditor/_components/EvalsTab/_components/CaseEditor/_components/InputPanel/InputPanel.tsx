/* InputPanel — the case editor's left column: case name + the Diff/Files/PR
   meta input tabs. The Diff tab pairs an editable mono textarea with an
   inert, syntax-colored preview (plain text nodes only — no raw HTML). */
"use client";

import { useTranslations } from "next-intl";
import { FormField, Tabs, Textarea, TextInput } from "@devdigest/ui";
import { classifyDiffLine } from "../../helpers";
import { s } from "../../styles";

export type InputTabKey = "diff" | "files" | "prMeta";

export function InputPanel({
  name,
  onNameChange,
  diffText,
  onDiffChange,
  tab,
  onTabChange,
  inputFiles,
  inputMeta,
}: {
  name: string;
  onNameChange: (v: string) => void;
  diffText: string;
  onDiffChange: (v: string) => void;
  tab: InputTabKey;
  onTabChange: (tab: InputTabKey) => void;
  inputFiles: unknown;
  inputMeta: unknown;
}) {
  const t = useTranslations("agents.editor.evals.caseEditor");

  return (
    <div style={s.column}>
      <FormField label={t("name")} required>
        <TextInput value={name} onChange={onNameChange} placeholder={t("namePlaceholder")} />
      </FormField>

      <FormField label={t("input")}>
        <Tabs
          pad="0"
          value={tab}
          onChange={(k) => onTabChange(k as InputTabKey)}
          tabs={[
            { key: "diff", label: t("tabs.diff") },
            { key: "files", label: t("tabs.files") },
            { key: "prMeta", label: t("tabs.prMeta") },
          ]}
        />
        <div style={s.tabPanel}>
          {tab === "diff" && (
            <>
              <Textarea
                mono
                rows={8}
                value={diffText}
                onChange={onDiffChange}
                placeholder={t("diffPlaceholder")}
              />
              <DiffPreview diffText={diffText} />
            </>
          )}
          {tab === "files" && <RawJsonPreview value={inputFiles} emptyLabel={t("filesEmpty")} />}
          {tab === "prMeta" && <RawJsonPreview value={inputMeta} emptyLabel={t("prMetaEmpty")} />}
        </div>
      </FormField>
    </div>
  );
}

/** Inert colored preview of a pasted unified diff — plain text nodes only. */
function DiffPreview({ diffText }: { diffText: string }) {
  if (!diffText) return null;
  return (
    <pre className="mono" style={s.diffPreview}>
      {diffText.split("\n").map((line, i) => (
        <div key={i} style={s.diffLine[classifyDiffLine(line)]}>
          {line.length > 0 ? line : " "}
        </div>
      ))}
    </pre>
  );
}

/** Minimal read-only view over `input_files`/`input_meta` — no invented fields. */
function RawJsonPreview({ value, emptyLabel }: { value: unknown; emptyLabel: string }) {
  const isEmpty = value == null || (Array.isArray(value) && value.length === 0);
  if (isEmpty) return <p style={s.rawJsonEmpty}>{emptyLabel}</p>;
  return (
    <pre className="mono" style={s.rawJson}>
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
