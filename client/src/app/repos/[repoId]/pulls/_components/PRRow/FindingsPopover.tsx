"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Skeleton, SeverityBadge, CategoryTag, ConfidenceNum } from "@devdigest/ui";
import type { ReviewRecord } from "@devdigest/shared";
import { usePrReviews } from "@/lib/hooks/reviews";
import { s } from "../../styles";

const MAX_FINDINGS = 8;
const HOVER_CLOSE_DELAY = 150;

export function FindingsPopover({
  prId,
  totalCount,
  children,
}: {
  prId: string;
  totalCount: number;
  children: React.ReactNode;
}) {
  const t = useTranslations("prReview");
  const [show, setShow] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);

  const { data: reviews } = usePrReviews(show ? prId : null);

  const open = () => {
    if (timer.current) clearTimeout(timer.current);
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 8, left: rect.right - 420 });
    }
    setShow(true);
  };
  const close = () => {
    timer.current = setTimeout(() => setShow(false), HOVER_CLOSE_DELAY);
  };

  const groups = React.useMemo(() => {
    if (!reviews) return [];
    return reviews
      .filter((r: ReviewRecord) => r.kind === "review" && r.findings.length > 0)
      .map((r: ReviewRecord) => ({
        agentName: r.agent_name ?? "Agent",
        findings: r.findings,
      }));
  }, [reviews]);

  let rendered = 0;
  const remaining = totalCount - MAX_FINDINGS;

  return (
    <div ref={triggerRef} onMouseEnter={open} onMouseLeave={close}>
      {children}
      {show && pos && (
        <div
          style={{ ...s.findingsPopover, top: pos.top, left: pos.left }}
          onClick={(e) => e.stopPropagation()}
          onMouseEnter={open}
          onMouseLeave={close}
        >
          <div style={s.findingsPopoverHeader}>
            <Icon.AlertTriangle size={13} />
            {t("list.findingsPopover.title", { count: totalCount })}
          </div>
          {!reviews ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "4px 0" }}>
              <Skeleton height={60} />
              <Skeleton height={60} />
            </div>
          ) : (
            <>
              {groups.map((group) => {
                if (rendered >= MAX_FINDINGS) return null;
                const slice = group.findings.slice(0, MAX_FINDINGS - rendered);
                rendered += slice.length;
                return (
                  <div key={group.agentName} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={s.findingsPopoverAgent}>{group.agentName}</div>
                    {slice.map((f) => (
                      <div key={f.id} style={s.findingsPopoverItem}>
                        <div style={s.findingsPopoverItemTitle}>
                          <SeverityBadge severity={f.severity} compact />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                            {f.title}
                          </span>
                          <CategoryTag category={f.category} />
                        </div>
                        <div style={s.findingsPopoverItemMeta}>
                          <span className="mono" style={{ color: "var(--accent-text)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                            {f.file}:{f.start_line}
                          </span>
                          <ConfidenceNum value={f.confidence} />
                        </div>
                        <div style={s.findingsPopoverRationale}>{f.rationale}</div>
                      </div>
                    ))}
                  </div>
                );
              })}
              {remaining > 0 && (
                <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
                  {t("list.findingsPopover.more", { count: remaining })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
