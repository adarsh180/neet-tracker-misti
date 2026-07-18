type GraphSeries = { label?: unknown; points?: unknown };
type GraphSpec = {
  kind: "CARTESIAN_GRAPH";
  title?: unknown;
  xLabel?: unknown;
  yLabel?: unknown;
  xMin?: unknown;
  xMax?: unknown;
  yMin?: unknown;
  yMax?: unknown;
  series?: unknown;
};
type DiagramNode = { id?: unknown; label?: unknown; x?: unknown; y?: unknown; shape?: unknown };
type DiagramEdge = { from?: unknown; to?: unknown; label?: unknown };
type DiagramSpec = { kind: "LABELLED_DIAGRAM"; title?: unknown; nodes?: unknown; edges?: unknown };
type SchematicElement = {
  type?: unknown;
  x?: unknown;
  y?: unknown;
  x2?: unknown;
  y2?: unknown;
  width?: unknown;
  height?: unknown;
  radius?: unknown;
  radiusY?: unknown;
  points?: unknown;
  label?: unknown;
  fill?: unknown;
  stroke?: unknown;
  dashed?: unknown;
};
type SchematicSpec = { kind: "SCIENTIFIC_SCHEMATIC"; title?: unknown; caption?: unknown; elements?: unknown };

const COLORS = ["#2563eb", "#dc2626", "#15803d", "#7c3aed"];
const PALETTE: Record<string, string> = {
  WHITE: "#ffffff",
  SLATE: "#475569",
  BLACK: "#0f172a",
  BLUE: "#2563eb",
  LIGHT_BLUE: "#dbeafe",
  RED: "#dc2626",
  LIGHT_RED: "#fee2e2",
  GREEN: "#15803d",
  LIGHT_GREEN: "#dcfce7",
  AMBER: "#d97706",
  LIGHT_AMBER: "#fef3c7",
  PURPLE: "#7c3aed",
  LIGHT_PURPLE: "#ede9fe",
  GRAY: "#94a3b8",
  LIGHT_GRAY: "#f1f5f9",
  NONE: "none",
};

function escapeXml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .slice(0, 120);
}

function finite(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function palette(value: unknown, fallback: string) {
  return PALETTE[String(value ?? "").toUpperCase()] ?? fallback;
}

function svgDocument(title: string, body: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="560" viewBox="0 0 900 560" role="img" aria-label="${escapeXml(title)}">
  <rect width="900" height="560" rx="18" fill="#ffffff"/>
  <rect x="1" y="1" width="898" height="558" rx="17" fill="none" stroke="#cbd5e1" stroke-width="2"/>
  <style>text{font-family:Arial,Helvetica,sans-serif;fill:#0f172a}.muted{fill:#475569}.axis{stroke:#334155;stroke-width:2}.grid{stroke:#e2e8f0;stroke-width:1}.edge{stroke:#64748b;stroke-width:2;fill:none}</style>
  ${body}
</svg>`;
}

function renderGraph(spec: GraphSpec) {
  const title = escapeXml(spec.title || "Question graph");
  const xLabel = escapeXml(spec.xLabel || "x");
  const yLabel = escapeXml(spec.yLabel || "y");
  const xMin = finite(spec.xMin, 0);
  const xMax = finite(spec.xMax, 10);
  const yMin = finite(spec.yMin, 0);
  const yMax = finite(spec.yMax, 10);
  if (!(xMax > xMin) || !(yMax > yMin)) return null;
  const rawSeries = Array.isArray(spec.series) ? spec.series.slice(0, 4) as GraphSeries[] : [];
  if (!rawSeries.length) return null;
  const left = 105;
  const top = 70;
  const width = 690;
  const height = 390;
  const x = (value: number) => left + ((value - xMin) / (xMax - xMin)) * width;
  const y = (value: number) => top + height - ((value - yMin) / (yMax - yMin)) * height;
  const grid = Array.from({ length: 6 }, (_, index) => {
    const ratio = index / 5;
    const gx = left + ratio * width;
    const gy = top + ratio * height;
    const xv = xMin + ratio * (xMax - xMin);
    const yv = yMax - ratio * (yMax - yMin);
    return `<line class="grid" x1="${gx}" y1="${top}" x2="${gx}" y2="${top + height}"/><line class="grid" x1="${left}" y1="${gy}" x2="${left + width}" y2="${gy}"/><text class="muted" x="${gx}" y="${top + height + 22}" font-size="13" text-anchor="middle">${Number(xv.toFixed(2))}</text><text class="muted" x="${left - 14}" y="${gy + 5}" font-size="13" text-anchor="end">${Number(yv.toFixed(2))}</text>`;
  }).join("");
  const series = rawSeries.map((entry, index) => {
    const points = Array.isArray(entry.points) ? entry.points.slice(0, 40).map((point) => Array.isArray(point) ? [Number(point[0]), Number(point[1])] : null).filter((point): point is number[] => Boolean(point && point.every(Number.isFinite) && point[0] >= xMin && point[0] <= xMax && point[1] >= yMin && point[1] <= yMax)) : [];
    if (points.length < 2) return "";
    const color = COLORS[index];
    const path = points.map((point) => `${x(point[0]).toFixed(1)},${y(point[1]).toFixed(1)}`).join(" ");
    return `<polyline points="${path}" fill="none" stroke="${color}" stroke-width="4" stroke-linejoin="round"/><text x="${left + width - 130}" y="${top + 24 + index * 24}" font-size="14" fill="${color}">${escapeXml(entry.label || `Series ${index + 1}`)}</text>`;
  }).join("");
  if (!series) return null;
  return {
    kind: "GRAPH" as const,
    alt: String(spec.title || `Graph of ${yLabel} against ${xLabel}`),
    normalized: spec,
    svg: svgDocument(title, `<text x="450" y="38" font-size="22" font-weight="700" text-anchor="middle">${title}</text>${grid}<line class="axis" x1="${left}" y1="${top + height}" x2="${left + width + 12}" y2="${top + height}"/><line class="axis" x1="${left}" y1="${top + height}" x2="${left}" y2="${top - 12}"/><text x="450" y="530" font-size="16" text-anchor="middle">${xLabel}</text><text x="28" y="270" font-size="16" text-anchor="middle" transform="rotate(-90 28 270)">${yLabel}</text>${series}`),
  };
}

function renderDiagram(spec: DiagramSpec) {
  const title = escapeXml(spec.title || "Question diagram");
  const rawNodes = Array.isArray(spec.nodes) ? spec.nodes.slice(0, 16) as DiagramNode[] : [];
  const nodes = rawNodes.map((node, index) => ({
    id: String(node.id ?? `n${index + 1}`).slice(0, 30),
    label: escapeXml(node.label ?? `Node ${index + 1}`),
    x: 90 + Math.max(0, Math.min(100, finite(node.x, 50))) * 7.2,
    y: 85 + Math.max(0, Math.min(100, finite(node.y, 50))) * 4.1,
    shape: String(node.shape).toUpperCase() === "CIRCLE" ? "CIRCLE" : "RECT",
  }));
  if (nodes.length < 2 || new Set(nodes.map((node) => node.id)).size !== nodes.length) return null;
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const rawEdges = Array.isArray(spec.edges) ? spec.edges.slice(0, 28) as DiagramEdge[] : [];
  const edges = rawEdges.map((edge) => {
    const from = nodeMap.get(String(edge.from));
    const to = nodeMap.get(String(edge.to));
    if (!from || !to) return "";
    return `<line class="edge" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" marker-end="url(#arrow)"/>${edge.label ? `<text class="muted" x="${(from.x + to.x) / 2}" y="${(from.y + to.y) / 2 - 7}" font-size="12" text-anchor="middle">${escapeXml(edge.label)}</text>` : ""}`;
  }).join("");
  const nodeSvg = nodes.map((node) => node.shape === "CIRCLE"
    ? `<circle cx="${node.x}" cy="${node.y}" r="42" fill="#eff6ff" stroke="#2563eb" stroke-width="3"/><text x="${node.x}" y="${node.y + 5}" font-size="14" text-anchor="middle">${node.label}</text>`
    : `<rect x="${node.x - 60}" y="${node.y - 28}" width="120" height="56" rx="10" fill="#f0fdf4" stroke="#15803d" stroke-width="3"/><text x="${node.x}" y="${node.y + 5}" font-size="14" text-anchor="middle">${node.label}</text>`).join("");
  return {
    kind: "DIAGRAM" as const,
    alt: String(spec.title || "Labelled scientific diagram"),
    normalized: spec,
    svg: svgDocument(title, `<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#64748b"/></marker></defs><text x="450" y="40" font-size="22" font-weight="700" text-anchor="middle">${title}</text>${edges}${nodeSvg}`),
  };
}

function renderSchematic(spec: SchematicSpec) {
  const title = escapeXml(spec.title || "Scientific schematic");
  const caption = escapeXml(spec.caption || "");
  const rawElements = Array.isArray(spec.elements) ? spec.elements.slice(0, 80) as SchematicElement[] : [];
  if (rawElements.length < 2) return null;
  const left = 70;
  const top = 72;
  const width = 760;
  const height = 410;
  const x = (value: unknown) => left + Math.max(0, Math.min(100, finite(value, 50))) * (width / 100);
  const y = (value: unknown) => top + Math.max(0, Math.min(100, finite(value, 50))) * (height / 100);
  const sx = (value: unknown, fallback: number) => Math.max(2, Math.min(100, finite(value, fallback))) * (width / 100);
  const sy = (value: unknown, fallback: number) => Math.max(2, Math.min(100, finite(value, fallback))) * (height / 100);
  const elements = rawElements.map((element) => {
    const type = String(element.type ?? "").toUpperCase();
    const stroke = palette(element.stroke, "#334155");
    const fill = palette(element.fill, "none");
    const dash = element.dashed === true ? ' stroke-dasharray="8 6"' : "";
    const label = escapeXml(element.label ?? "");
    if (type === "CIRCLE") {
      const radius = Math.max(6, Math.min(90, sx(element.radius, 8)));
      return `<circle cx="${x(element.x)}" cy="${y(element.y)}" r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="3"${dash}/>${label ? `<text x="${x(element.x)}" y="${y(element.y) + 5}" font-size="13" text-anchor="middle">${label}</text>` : ""}`;
    }
    if (type === "ELLIPSE") {
      const rx = Math.max(8, Math.min(190, sx(element.radius ?? element.width, 10)));
      const ry = Math.max(6, Math.min(130, sy(element.radiusY ?? element.height, 7)));
      return `<ellipse cx="${x(element.x)}" cy="${y(element.y)}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="3"${dash}/>${label ? `<text x="${x(element.x)}" y="${y(element.y) + 5}" font-size="13" text-anchor="middle">${label}</text>` : ""}`;
    }
    if (type === "RECT") {
      const rectWidth = sx(element.width, 16);
      const rectHeight = sy(element.height, 12);
      return `<rect x="${x(element.x) - rectWidth / 2}" y="${y(element.y) - rectHeight / 2}" width="${rectWidth}" height="${rectHeight}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="3"${dash}/>${label ? `<text x="${x(element.x)}" y="${y(element.y) + 5}" font-size="13" text-anchor="middle">${label}</text>` : ""}`;
    }
    if (type === "LINE" || type === "ARROW") {
      return `<line x1="${x(element.x)}" y1="${y(element.y)}" x2="${x(element.x2)}" y2="${y(element.y2)}" stroke="${stroke}" stroke-width="3"${dash}${type === "ARROW" ? ' marker-end="url(#schematic-arrow)"' : ""}/>${label ? `<text x="${(x(element.x) + x(element.x2)) / 2}" y="${(y(element.y) + y(element.y2)) / 2 - 7}" font-size="12" text-anchor="middle">${label}</text>` : ""}`;
    }
    if (type === "POLYLINE") {
      const points = Array.isArray(element.points) ? element.points.slice(0, 40).map((point) => Array.isArray(point) && point.length >= 2 ? `${x(point[0])},${y(point[1])}` : null).filter(Boolean).join(" ") : "";
      return points ? `<polyline points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="3" stroke-linejoin="round"${dash}/>` : "";
    }
    if (type === "TEXT" && label) return `<text x="${x(element.x)}" y="${y(element.y)}" font-size="14" font-weight="600" text-anchor="middle" fill="${stroke}">${label}</text>`;
    return "";
  }).join("");
  if (!elements) return null;
  return {
    kind: "DIAGRAM" as const,
    alt: String(spec.caption || spec.title || "Scientific schematic"),
    normalized: spec,
    svg: svgDocument(title, `<defs><marker id="schematic-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#475569"/></marker></defs><text x="450" y="38" font-size="22" font-weight="700" text-anchor="middle">${title}</text>${elements}${caption ? `<text class="muted" x="450" y="535" font-size="13" text-anchor="middle">${caption}</text>` : ""}`),
  };
}

export function renderQuestionVisualSvg(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const kind = String((input as { kind?: unknown }).kind ?? "").toUpperCase();
  if (kind === "CARTESIAN_GRAPH") return renderGraph(input as GraphSpec);
  if (kind === "LABELLED_DIAGRAM") return renderDiagram(input as DiagramSpec);
  if (kind === "SCIENTIFIC_SCHEMATIC") return renderSchematic(input as SchematicSpec);
  return null;
}
