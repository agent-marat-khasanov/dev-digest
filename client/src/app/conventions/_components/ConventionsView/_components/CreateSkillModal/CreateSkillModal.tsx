"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Modal, FormField, TextInput, SelectInput, Textarea, Toggle } from "@devdigest/ui";
import type { Convention } from "@devdigest/shared";
import { useToast } from "@/lib/toast";
import { useCreateSkillFromConventions } from "@/lib/hooks/conventions";
import { CREATE_MODAL_WIDTH, SKILL_TYPE } from "../../constants";
import { buildSkillBodyPreview } from "../../helpers";
import { s } from "./styles";

interface CreateSkillModalProps {
  repoId: string;
  repoName: string;
  accepted: Convention[];
  onClose: () => void;
}

/**
 * "Create skill from conventions" — name/description/type/enabled plus a live
 * preview of the generated markdown. The server rebuilds the body from accepted
 * conventions, so the preview mirrors `buildSkillBodyPreview`; editing the
 * description updates both (it is interpolated into the body intro).
 */
export function CreateSkillModal({ repoId, repoName, accepted, onClose }: CreateSkillModalProps) {
  const t = useTranslations("conventions");
  const router = useRouter();
  const toast = useToast();
  const create = useCreateSkillFromConventions();

  const [name, setName] = React.useState(`${repoName}-conventions`);
  const [description, setDescription] = React.useState(
    t("modal.descriptionDefault", { count: accepted.length, repo: repoName }),
  );
  const [enabled, setEnabled] = React.useState(true);

  const previewBody = buildSkillBodyPreview(name, description, accepted);
  const canSubmit = name.trim().length > 0 && !create.isPending;

  const submit = async () => {
    const skill = await create.mutateAsync({
      repo_id: repoId,
      skill_name: name.trim(),
      description: description.trim(),
      enabled,
    });
    toast.success(t("modal.created", { name: skill.name }));
    onClose();
    router.push(`/skills/${skill.id}`);
  };

  return (
    <Modal
      width={CREATE_MODAL_WIDTH}
      title={t("modal.title")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <span style={s.footerNote}>{t("modal.footerNote")}</span>
          <div style={s.footerActions}>
            <Button kind="ghost" onClick={onClose}>
              {t("modal.cancel")}
            </Button>
            <Button kind="primary" icon="Sparkles" onClick={submit} disabled={!canSubmit}>
              {create.isPending ? t("modal.creating") : t("modal.create")}
            </Button>
          </div>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.banner}>
          {t("modal.banner", { count: accepted.length, repo: repoName })}
        </div>

        <FormField label={t("modal.fields.name")} required>
          <TextInput value={name} onChange={setName} mono />
        </FormField>

        <FormField label={t("modal.fields.description")}>
          <TextInput value={description} onChange={setDescription} />
        </FormField>

        <FormField label={t("modal.fields.type")}>
          <SelectInput
            value={SKILL_TYPE}
            onChange={() => {}}
            options={[{ value: SKILL_TYPE, label: t("modal.typeConvention") }]}
          />
        </FormField>

        <FormField label={t("modal.fields.enabled")}>
          <div style={s.toggleRow}>
            <Toggle on={enabled} onChange={setEnabled} />
            <span style={s.toggleHint}>{t("modal.enabledHint")}</span>
          </div>
        </FormField>

        <div>
          <div style={s.bodyHead}>
            <span className="mono" style={s.bodyFile}>
              {name || "skill"}.md
            </span>
            <span style={s.unsaved}>{t("modal.unsaved")}</span>
            <span className="mono" style={s.tokens}>
              {t("modal.tokens", { count: estimateTokens(previewBody) })}
            </span>
          </div>
          <Textarea value={previewBody} onChange={() => {}} rows={12} mono />
        </div>
      </div>
    </Modal>
  );
}

/** Rough token estimate (~4 chars/token) for the editor header — display only. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
