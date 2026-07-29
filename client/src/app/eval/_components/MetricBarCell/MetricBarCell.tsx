/* MetricBarCell — a short colored progress bar + percent, used inside a runs
   table cell (one per metric column). Composes the same visual language as
   the vendored `BarRow` chart but fits a narrow table cell instead of
   BarRow's fixed label+bar+value grid. */
import { s } from "./styles";

export function MetricBarCell({ value, color }: { value: number; color: string }) {
  const pct = Math.round(value * 100);
  return (
    <div style={s.wrap}>
      <div style={s.track}>
        <div style={{ ...s.fill, width: `${pct}%`, background: color }} />
      </div>
      <span className="mono tnum" style={s.pct}>
        {pct}%
      </span>
    </div>
  );
}
