"use client";

import React from "react";
import { useTranslations } from "next-intl";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { Icon } from "@devdigest/ui";
import { s } from "./styles";

/**
 * CodeMirror-backed Markdown editor for the skill body. Header strip carries
 * the synthetic filename, an "unsaved" chip when the live value differs from
 * the saved one, and the SAVED token count (the live one is intentionally
 * NOT recomputed per keystroke — see plan §7 for rationale).
 */
export function BodyEditor({
  filename,
  value,
  savedValue,
  savedTokens,
  onChange,
}: {
  filename: string;
  value: string;
  savedValue: string;
  savedTokens?: number;
  onChange: (next: string) => void;
}) {
  const t = useTranslations("skills.lab.editor");
  const dirty = value !== savedValue;
  const extensions = React.useMemo(() => [markdown()], []);
  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <Icon.FileText size={14} style={s.filenameIcon} />
        <span style={s.filename}>{filename}</span>
        {dirty && <span style={s.unsavedBadge}>{t("unsaved")}</span>}
        <span style={s.tokens}>
          {savedTokens != null ? `${savedTokens} ${t("tokensSuffix")}` : ""}
        </span>
      </div>
      <CodeMirror
        value={value}
        onChange={onChange}
        extensions={extensions}
        theme="dark"
        basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: false }}
        style={s.editor}
      />
    </div>
  );
}
