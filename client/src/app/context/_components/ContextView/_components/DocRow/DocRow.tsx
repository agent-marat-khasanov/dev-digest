import { Badge } from "@devdigest/ui";
import type { ContextDoc } from "@devdigest/shared";
import { FOLDER_TYPE_META } from "../../constants";
import { docFileName } from "../../helpers";
import { s } from "./styles";

export function DocRow({
  doc,
  selected,
  onSelect,
}: {
  doc: ContextDoc;
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = FOLDER_TYPE_META[doc.folder_type];
  return (
    <button type="button" style={s.row(selected)} onClick={onSelect} aria-pressed={selected}>
      <div style={s.text}>
        <div style={s.name}>{docFileName(doc.path)}</div>
        <div style={s.path}>{doc.path}</div>
      </div>
      <Badge icon={meta.icon}>{meta.label}</Badge>
    </button>
  );
}
