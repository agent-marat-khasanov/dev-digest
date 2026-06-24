"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Modal, Icon } from "@devdigest/ui";
import type { SkillImportPreview, SkillSource } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useCreateSkill, useImportSkillPreview } from "@/lib/hooks/skills";
import { TYPE_COLOR } from "../../../SkillCard/constants";
import { ACCEPT, MODAL_WIDTH } from "./constants";
import { s } from "./styles";

/**
 * Two-step import: pick a file → server returns a preview → user clicks save
 * → POST /skills with the parsed payload. The trust banner stays visible the
 * whole time; the executable parts of an archive were already filtered out
 * server-side (we never see them).
 */
export function ImportSkillModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills.lab");
  const router = useRouter();
  const preview = useImportSkillPreview();
  const create = useCreateSkill();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [filename, setFilename] = React.useState<string | null>(null);

  const onPick = async (file: File) => {
    setFilename(file.name);
    preview.reset();
    try {
      await preview.mutateAsync(file);
    } catch {
      // Error is read off `preview.error` for the inline error box.
    }
  };

  const parsed: SkillImportPreview | undefined = preview.data;

  const save = async () => {
    if (!parsed) return;
    const source: SkillSource = parsed.format === "archive" ? "community" : "imported_url";
    const skill = await create.mutateAsync({
      name: parsed.parsed.name,
      description: parsed.parsed.description,
      type: parsed.parsed.type,
      body: parsed.parsed.body,
      source,
      evidence_files: parsed.parsed.evidence_files ?? null,
    });
    onClose();
    router.push(`/skills/${skill.id}`);
  };

  const importErr = preview.error instanceof ApiError ? preview.error.message : preview.error ? String(preview.error) : null;
  const saveLabel = parsed
    ? t("import.savePrefix", { name: parsed.parsed.name })
    : t("import.saveAnonymous");
  const canSave = !!parsed && !create.isPending;

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("import.title")}
      subtitle={t("import.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("import.cancel")}
          </Button>
          <Button kind="primary" icon="Check" onClick={save} disabled={!canSave}>
            {create.isPending ? t("import.saving") : saveLabel}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.trustBanner}>{t("import.trustBanner")}</div>

        <div style={s.pickerRow}>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            style={s.hiddenInput}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPick(f);
            }}
          />
          <Button
            kind="secondary"
            size="sm"
            icon="Upload"
            onClick={() => inputRef.current?.click()}
            disabled={preview.isPending}
          >
            {t("import.pickFile")}
          </Button>
          <span style={filename ? s.filename : s.filenameMuted}>
            {preview.isPending ? t("import.parsing") : filename ?? t("import.noFile")}
          </span>
          {preview.isPending && <Icon.RefreshCw size={14} style={{ animation: "ddspin 1s linear infinite" }} />}
        </div>

        {importErr && !preview.isPending && (
          <div style={s.errorBox}>
            {t("import.importError")}: {importErr}
          </div>
        )}

        {parsed && <Preview preview={parsed} />}
      </div>
    </Modal>
  );
}

function Preview({ preview }: { preview: SkillImportPreview }) {
  const t = useTranslations("skills.lab");
  const p = preview.parsed;
  const color = TYPE_COLOR[p.type];
  return (
    <div style={s.previewWrap}>
      <span style={s.previewTitle}>{t("import.previewTitle")}</span>
      <div style={s.previewHead}>
        <span style={s.previewName}>{p.name}</span>
        <span className="mono" style={s.previewTypeChip(color)}>
          {p.type}
        </span>
      </div>
      {p.description && <div style={s.previewDescription}>{p.description}</div>}
      <pre className="mono" style={s.previewBody}>
        {p.body || "—"}
      </pre>
      {p.evidence_files && p.evidence_files.length > 0 && (
        <div>
          <span style={s.refLabel}>{t("import.evidenceFiles")}:</span>
          <div style={s.refList}>
            {p.evidence_files.map((f) => (
              <span key={f} className="mono" style={s.refChip}>
                {f}
              </span>
            ))}
          </div>
        </div>
      )}
      {preview.warnings.length > 0 && (
        <div style={s.warnings}>
          <div style={s.warningsTitle}>{t("import.warnings")}</div>
          {preview.warnings.map((w, i) => (
            <div key={i}>• {w}</div>
          ))}
        </div>
      )}
    </div>
  );
}
