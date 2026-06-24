"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  FormField,
  SelectInput,
  TextInput,
  Toggle,
} from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { BodyEditor } from "../BodyEditor";
import { s } from "./styles";

const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Config tab — header + name/description/type + body editor + save. */
export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills.lab");
  const toast = useToast();
  const update = useUpdateSkill();

  const [name, setName] = React.useState(skill.name);
  const [description, setDescription] = React.useState(skill.description);
  const [type, setType] = React.useState<SkillType>(skill.type);
  const [body, setBody] = React.useState(skill.body);
  const [enabled, setEnabled] = React.useState(skill.enabled);

  // Reset local form when switching skills OR when the saved state advances
  // (e.g. another tab saved, a restore mutated the body) — value comes from
  // the parent's `skill` prop which TanStack keeps fresh.
  React.useEffect(() => {
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
    setBody(skill.body);
    setEnabled(skill.enabled);
  }, [skill.id, skill.version, skill.body, skill.name, skill.description, skill.type, skill.enabled]);

  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`create.types.${v}`) }));

  const save = () =>
    update.mutate(
      {
        id: skill.id,
        patch: { name, description, type, body, enabled },
      },
      {
        onSuccess: (data) => toast.success(t("editor.savedToast", { version: data.version })),
      },
    );

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>Configuration</h2>
        <span style={s.versionPill}>{t("editor.versionPill", { version: skill.version })}</span>
        <label style={s.enabledLabel}>
          {t("editor.enabledLabel")}
          <Toggle on={enabled} onChange={setEnabled} size={16} />
        </label>
      </div>
      <FormField label={t("create.fields.name")} required>
        <TextInput value={name} onChange={setName} mono />
      </FormField>
      <FormField label={t("create.fields.description")} hint={t("create.fields.descriptionHint")}>
        <TextInput value={description} onChange={setDescription} />
      </FormField>
      <FormField label={t("create.fields.type")}>
        <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
      </FormField>
      <FormField label={t("create.fields.body")} hint={t("editor.bodyHint")}>
        <BodyEditor
          filename={`${skill.name}.md`}
          value={body}
          savedValue={skill.body}
          savedTokens={skill.body_tokens}
          onChange={setBody}
        />
      </FormField>
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending}>
          {update.isPending ? t("editor.saving") : t("editor.save")}
        </Button>
        {update.isSuccess && (
          <span style={s.savedNote}>{t("editor.saved", { version: update.data?.version })}</span>
        )}
      </div>
    </div>
  );
}
