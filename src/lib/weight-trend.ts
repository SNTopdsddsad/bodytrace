import { measurementChart, type Measurement } from "./measurements";

export function buildWeightTrendSvg(
  entries: Measurement[], target: number | null, width = 260, height = 90,
) {
  const series = measurementChart(entries, "weight");
  const ordered: [string, number][] = [];
  for (const point of series) {
    if (point.value !== null) ordered.push([point.date, point.value]);
  }
  if (ordered.length < 2) return { ordered, svg: null };

  const values = ordered.map(([, v]) => v);
  const allVals = target != null ? [...values, target] : values;
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const span = max - min || 1;
  const mapY = (v: number) => Number((height - 8 - ((v - min) / span) * (height - 16)).toFixed(1));

  const start = Date.parse(ordered[0][0]);
  const duration = Date.parse(ordered[ordered.length - 1][0]) - start;
  const points = [];
  const path = [];
  let connected = false;
  for (const sample of series) {
    if (sample.value === null) {
      connected = false;
      continue;
    }
    const x = 8 + ((Date.parse(sample.date) - start) / duration) * (width - 16);
    const y = mapY(sample.value);
    points.push({ date: sample.date, x, y });
    path.push(`${connected ? "L" : "M"} ${x} ${y}`);
    connected = true;
  }

  return {
    ordered,
    svg: {
      points,
      path: path.join(" "),
      targetY: target != null ? mapY(target) : null,
    },
  };
}
