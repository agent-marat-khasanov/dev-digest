"use client";

import React from "react";
import { Badge, Icon, MonoLink } from "@devdigest/ui";
import type { ChangedSymbol, DownstreamImpact } from "@devdigest/shared";

interface SymbolNodeProps {
  impact: DownstreamImpact;
  changed?: ChangedSymbol;
  onOpenCaller: (path: string, line: number) => void;
}

/**
 * One changed symbol in the blast tree: a collapsible node listing its
 * downstream callers (file:line, clickable → in-app viewer) and the HTTP
 * endpoints / crons reachable from it.
 */
export function SymbolNode({ impact, changed, onOpenCaller }: SymbolNodeProps) {
  const [open, setOpen] = React.useState(true);
  const callerCount = impact.callers.length;
  const hasFacts = impact.endpoints_affected.length > 0 || impact.crons_affected.length > 0;

  return (
    <div style={{ marginBottom: 8, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 4px",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <Icon.ChevronRight
          size={14}
          style={{
            color: "var(--text-muted)",
            transform: open ? "rotate(90deg)" : "none",
            transition: "transform .12s",
            flexShrink: 0,
          }}
        />
        <Icon.Code size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          {impact.symbol}()
        </span>
        {changed && (
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{changed.kind}</span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" }}>
          {callerCount} {callerCount === 1 ? "caller" : "callers"}
        </span>
      </div>

      {open && (
        <div style={{ paddingLeft: 26, display: "flex", flexDirection: "column", gap: 4, paddingBottom: 6 }}>
          {callerCount === 0 && (
            <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>No downstream callers.</span>
          )}
          {impact.callers.map((c) => (
            <div key={`${c.file}:${c.line}:${c.name}`} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Icon.CornerDownRight size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              <MonoLink onClick={() => onOpenCaller(c.file, c.line)}>
                {c.file}:{c.line}
              </MonoLink>
            </div>
          ))}

          {hasFacts && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {impact.endpoints_affected.map((e) => (
                <Badge key={e} icon="Globe" color="var(--accent-text)">
                  {e}
                </Badge>
              ))}
              {impact.crons_affected.map((c) => (
                <Badge key={c} icon="Clock" color="var(--warn)">
                  {c}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
