"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import { Badge, Icon, SectionLabel } from "@devdigest/ui";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import type { TourSection } from "@devdigest/shared";
import { s } from "../../styles";

/**
 * Markdown-authored links must never become clickable (AC-21) — the model's
 * narrative is untrusted text. Overriding `a` to render its children as a
 * plain span (no href) is the neutralization point; combined with NOT using
 * `rehype-raw`, no model string can reach the DOM as an anchor or raw HTML.
 */
const MARKDOWN_COMPONENTS = {
  a: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      aria-label="Copy command"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        background: "none",
        border: "1px solid var(--border-strong)",
        borderRadius: 6,
        padding: "4px 8px",
        cursor: "pointer",
        color: copied ? "var(--ok)" : "var(--text-muted)",
        fontSize: 12,
      }}
    >
      <Icon.Copy size={12} />
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

interface SectionCardProps {
  section: TourSection;
  onOpenFile: (path: string) => void;
}

export function SectionCard({ section, onOpenFile }: SectionCardProps) {
  return (
    <div id={section.id} style={s.sectionCard}>
      <SectionLabel icon="FileText">{section.title}</SectionLabel>

      <div style={s.body}>
        <ReactMarkdown components={MARKDOWN_COMPONENTS}>{section.body}</ReactMarkdown>
      </div>

      {section.diagram && <MermaidDiagram chart={section.diagram} />}

      {section.commands && section.commands.length > 0 && (
        <ol style={s.commandsList}>
          {section.commands.map((cmd, i) => (
            <li key={i} style={s.commandRow}>
              <span className="mono" style={{ fontSize: 13 }}>
                {cmd}
              </span>
              <CopyButton text={cmd} />
            </li>
          ))}
        </ol>
      )}

      {section.links && section.links.length > 0 && (
        <ol style={s.linksList}>
          {section.links.map((link, i) => (
            <li key={`${link.path}-${i}`} style={s.linkItem}>
              <span style={s.linkLabel}>{link.label}</span>
              <Badge
                icon="ExternalLink"
                bg="transparent"
                color="var(--accent)"
              >
                <button
                  type="button"
                  onClick={() => onOpenFile(link.path)}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    fontFamily: "var(--mono, monospace)",
                  }}
                >
                  {link.path}
                </button>
              </Badge>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
