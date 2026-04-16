export type NeetGuruVisualAccent = "mint" | "cyan" | "amber" | "rose" | "violet";

export type NeetGuruVisualTheme =
  | "generic"
  | "biology"
  | "chemistry"
  | "physics"
  | "human-physiology"
  | "genetics"
  | "ecology"
  | "organic-chemistry"
  | "mechanics";

export type NeetGuruVisualView = "chain" | "compare" | "cycle" | "layers";
export type NeetGuruVisualAnimation = "auto" | "flow" | "reaction" | "force" | "pulse" | "orbit" | "compare";
export type NeetGuruSimulationKind =
  | "none"
  | "projectile-motion"
  | "force-balance"
  | "equilibrium-shift"
  | "reaction-collision"
  | "circulation-loop"
  | "synapse-signal"
  | "gene-expression";

export type NeetGuruVisualNodeKind =
  | "concept"
  | "process"
  | "input"
  | "output"
  | "organ"
  | "molecule"
  | "force"
  | "reaction"
  | "pressure"
  | "outcome";

export interface NeetGuruVisualStep {
  title: string;
  detail: string;
  accent?: NeetGuruVisualAccent;
  cue?: string;
  animation?: NeetGuruVisualAnimation;
}

export interface NeetGuruVisualNode {
  id: string;
  label: string;
  detail?: string;
  kind?: NeetGuruVisualNodeKind;
  accent?: NeetGuruVisualAccent;
  zone?: string;
  animation?: NeetGuruVisualAnimation;
}

export interface NeetGuruVisualEdge {
  from: string;
  to: string;
  label?: string;
}

export interface NeetGuruVisualSchema {
  title: string;
  summary?: string;
  theme?: NeetGuruVisualTheme;
  view?: NeetGuruVisualView;
  animation?: NeetGuruVisualAnimation;
  simulation?: NeetGuruSimulationKind;
  focus?: string;
  highlights?: string[];
  nodes?: NeetGuruVisualNode[];
  edges?: NeetGuruVisualEdge[];
  steps: NeetGuruVisualStep[];
}

export interface ParsedNeetGuruMessage {
  markdown: string;
  visual: NeetGuruVisualSchema | null;
}

export interface EnrichedNeetGuruVisualStep extends NeetGuruVisualStep {
  cue: string;
  accent: NeetGuruVisualAccent;
  animation: NeetGuruVisualAnimation;
  split: {
    cause: string;
    effect: string;
  };
  spanClass: string;
}

const VISUAL_TAG_PATTERN = /<guru_visual>\s*([\s\S]*?)\s*<\/guru_visual>/i;

const ALLOWED_ACCENTS: NeetGuruVisualAccent[] = ["mint", "cyan", "amber", "rose", "violet"];
const ALLOWED_THEMES: NeetGuruVisualTheme[] = [
  "generic",
  "biology",
  "chemistry",
  "physics",
  "human-physiology",
  "genetics",
  "ecology",
  "organic-chemistry",
  "mechanics",
];
const ALLOWED_VIEWS: NeetGuruVisualView[] = ["chain", "compare", "cycle", "layers"];
const ALLOWED_ANIMATIONS: NeetGuruVisualAnimation[] = ["auto", "flow", "reaction", "force", "pulse", "orbit", "compare"];
const ALLOWED_SIMULATIONS: NeetGuruSimulationKind[] = [
  "none",
  "projectile-motion",
  "force-balance",
  "equilibrium-shift",
  "reaction-collision",
  "circulation-loop",
  "synapse-signal",
  "gene-expression",
];
const ALLOWED_NODE_KINDS: NeetGuruVisualNodeKind[] = [
  "concept",
  "process",
  "input",
  "output",
  "organ",
  "molecule",
  "force",
  "reaction",
  "pressure",
  "outcome",
];

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeAccent(value: unknown): NeetGuruVisualAccent {
  return typeof value === "string" && ALLOWED_ACCENTS.includes(value as NeetGuruVisualAccent)
    ? (value as NeetGuruVisualAccent)
    : "cyan";
}

function sanitizeTheme(value: unknown): NeetGuruVisualTheme {
  return typeof value === "string" && ALLOWED_THEMES.includes(value as NeetGuruVisualTheme)
    ? (value as NeetGuruVisualTheme)
    : "generic";
}

function sanitizeView(value: unknown): NeetGuruVisualView {
  return typeof value === "string" && ALLOWED_VIEWS.includes(value as NeetGuruVisualView)
    ? (value as NeetGuruVisualView)
    : "chain";
}

function sanitizeAnimation(value: unknown): NeetGuruVisualAnimation {
  return typeof value === "string" && ALLOWED_ANIMATIONS.includes(value as NeetGuruVisualAnimation)
    ? (value as NeetGuruVisualAnimation)
    : "auto";
}

function sanitizeSimulation(value: unknown): NeetGuruSimulationKind {
  return typeof value === "string" && ALLOWED_SIMULATIONS.includes(value as NeetGuruSimulationKind)
    ? (value as NeetGuruSimulationKind)
    : "none";
}

export function inferNeetView(
  visual: Pick<NeetGuruVisualSchema, "title" | "summary" | "steps">,
): NeetGuruVisualView {
  const corpus = `${visual.title} ${visual.summary ?? ""} ${visual.steps.map((step) => `${step.title} ${step.detail}`).join(" ")}`
    .toLowerCase()
    .normalize("NFKD");

  if (/\bcompare\b|\bdifference\b|\bversus\b|\bvs\b|\bcontrast\b|\bon the other hand\b/.test(corpus)) {
    return "compare";
  }

  if (/\bcycle\b|\bloop\b|\brepeat\b|\brecycling\b|\bfeedback\b/.test(corpus)) {
    return "cycle";
  }

  if (/\blayer\b|\blevel\b|\bhierarchy\b|\bstack\b|\borganization\b/.test(corpus)) {
    return "layers";
  }

  return "chain";
}

export function inferNeetAnimation(
  visual: Pick<NeetGuruVisualSchema, "theme" | "view" | "title" | "summary" | "steps">,
): NeetGuruVisualAnimation {
  const theme = visual.theme ?? inferNeetTheme(visual);
  const view = visual.view ?? inferNeetView(visual);

  if (view === "compare") return "compare";
  if (view === "cycle") return "orbit";
  if (theme === "chemistry" || theme === "organic-chemistry") return "reaction";
  if (theme === "physics" || theme === "mechanics") return "force";
  if (theme === "biology" || theme === "human-physiology" || theme === "genetics" || theme === "ecology") return "flow";
  return "pulse";
}

export function inferNeetSimulation(
  visual: Pick<NeetGuruVisualSchema, "theme" | "title" | "summary" | "steps">,
): NeetGuruSimulationKind {
  const theme = visual.theme ?? inferNeetTheme(visual);
  const corpus = `${visual.title} ${visual.summary ?? ""} ${visual.steps.map((step) => `${step.title} ${step.detail}`).join(" ")}`
    .toLowerCase()
    .normalize("NFKD");

  if ((theme === "physics" || theme === "mechanics") && /\bprojectile\b|\btrajectory\b|\bangle of projection\b|\brange\b|\btime of flight\b/.test(corpus)) {
    return "projectile-motion";
  }

  if ((theme === "physics" || theme === "mechanics") && /\bfree body\b|\bnet force\b|\bequilibrium\b|\bnormal reaction\b|\btension\b|\bfriction\b/.test(corpus)) {
    return "force-balance";
  }

  if ((theme === "chemistry" || theme === "organic-chemistry") && /\ble chatelier\b|\bequilibrium\b|\bforward reaction\b|\breverse reaction\b|\bconcentration\b|\bpressure change\b|\btemperature change\b/.test(corpus)) {
    return "equilibrium-shift";
  }

  if ((theme === "chemistry" || theme === "organic-chemistry") && /\bcollision\b|\bactivation energy\b|\beffective collision\b|\bintermediate\b|\breaction mechanism\b/.test(corpus)) {
    return "reaction-collision";
  }

  if ((theme === "biology" || theme === "human-physiology") && /\bcirculation\b|\bheart\b|\bdouble circulation\b|\boxygenated\b|\bdeoxygenated\b|\bpulmonary\b|\bsystemic\b/.test(corpus)) {
    return "circulation-loop";
  }

  if ((theme === "biology" || theme === "human-physiology") && /\bsynapse\b|\bneurotransmitter\b|\baxon\b|\bdendrite\b|\baction potential\b/.test(corpus)) {
    return "synapse-signal";
  }

  if ((theme === "genetics" || theme === "biology") && /\btranscription\b|\btranslation\b|\bmrna\b|\bribosome\b|\bgene expression\b/.test(corpus)) {
    return "gene-expression";
  }

  return "none";
}

function sanitizeNodeKind(value: unknown): NeetGuruVisualNodeKind {
  return typeof value === "string" && ALLOWED_NODE_KINDS.includes(value as NeetGuruVisualNodeKind)
    ? (value as NeetGuruVisualNodeKind)
    : "process";
}

function titleCase(input: string) {
  return input
    .trim()
    .replace(/^[\d.\-\s]+/, "")
    .replace(/\s+/g, " ")
    .replace(/^[a-z]/, (char) => char.toUpperCase());
}

function splitStepDetail(detail: string) {
  const normalized = detail.replace(/\s+/g, " ").replace(/\u2192/g, "->").trim();
  const delimited = normalized
    .split(/\s*;\s*|\s+therefore\s+|\s+so\s+|\s+hence\s+|\s+thus\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);

  if (delimited.length >= 2) {
    return {
      cause: delimited[0],
      effect: delimited.slice(1).join("; "),
    };
  }

  const arrowParts = normalized.split(/\s*->\s*/).map((part) => part.trim()).filter(Boolean);
  if (arrowParts.length >= 2) {
    return {
      cause: arrowParts[0],
      effect: arrowParts.slice(1).join(" -> "),
    };
  }

  return {
    cause: normalized,
    effect: "",
  };
}

function splitLineToStep(line: string, index: number): NeetGuruVisualStep | null {
  const cleaned = line.trim().replace(/^[\d]+[.)]\s*/, "").replace(/^[-*]\s*/, "");
  if (cleaned.length < 12) return null;

  const [rawTitle, ...rest] = cleaned.split(/:\s+/);
  const detail = (rest.join(": ") || cleaned).trim();

  return {
    title: rawTitle && rest.length ? titleCase(rawTitle) : `Step ${index + 1}`,
    detail,
    accent: ALLOWED_ACCENTS[index % ALLOWED_ACCENTS.length],
    animation: "auto",
  };
}

const VISUAL_NOISE_PATTERNS = [
  /\bmisti\b/i,
  /\battempt\b/i,
  /\bdays? left\b/i,
  /\bcompletion percentage\b/i,
  /\bbehind schedule\b/i,
  /\bstrict mode\b/i,
  /\bvery strict\b/i,
  /\bconsisten[ct]y\b/i,
  /\baiims\b/i,
  /\brishikesh\b/i,
  /\bdelhi\b/i,
  /\bstudy status\b/i,
  /\bperformance metrics?\b/i,
  /\breality check\b/i,
  /\bprove it by solving\b/i,
  /\bpartner and husband\b/i,
  /\badarsh\b/i,
];

const CONCEPT_SIGNAL_PATTERNS = [
  /\bprojectile\b/i,
  /\btrajectory\b/i,
  /\bangle of projection\b/i,
  /\btime of flight\b/i,
  /\brange\b/i,
  /\bvelocity\b/i,
  /\bacceleration\b/i,
  /\bgravity\b/i,
  /\bforce\b/i,
  /\bfriction\b/i,
  /\btension\b/i,
  /\bnormal reaction\b/i,
  /\bequilibrium\b/i,
  /\ble chatelier\b/i,
  /\breactant\b/i,
  /\bproduct\b/i,
  /\bcollision\b/i,
  /\bactivation energy\b/i,
  /\bmechanism\b/i,
  /\breaction\b/i,
  /\bcirculation\b/i,
  /\bheart\b/i,
  /\blungs?\b/i,
  /\bsynapse\b/i,
  /\bneuron\b/i,
  /\btranscription\b/i,
  /\btranslation\b/i,
  /\bmrna\b/i,
  /\bdna\b/i,
  /\bgene\b/i,
  /\bbiology\b/i,
  /\bchemistry\b/i,
  /\bphysics\b/i,
  /\bmechanics\b/i,
];

function isVisualNoiseLine(line: string) {
  return VISUAL_NOISE_PATTERNS.some((pattern) => pattern.test(line));
}

function isConceptSignalLine(line: string) {
  return CONCEPT_SIGNAL_PATTERNS.some((pattern) => pattern.test(line));
}

function compactText(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

function deriveStepsFromConceptProse(lines: string[]) {
  const sentences = compactText(lines.join(" "))
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 24 && !isVisualNoiseLine(sentence))
    .filter((sentence) => isConceptSignalLine(sentence))
    .slice(0, 5);

  return sentences.map((sentence, index) => {
    const fragments = sentence.split(/,\s+|:\s+/).map((part) => part.trim()).filter(Boolean);
    const titleSource = fragments[0] ?? sentence;
    const shortTitle = titleCase(titleSource.split(/\s+/).slice(0, 4).join(" "));

    return {
      title: shortTitle.length >= 6 ? shortTitle : `Step ${index + 1}`,
      detail: sentence,
      accent: ALLOWED_ACCENTS[index % ALLOWED_ACCENTS.length],
      animation: "auto" as const,
    };
  });
}

function extractTeachingLines(markdown: string) {
  const lines = markdown.split("\n");
  const filtered = lines
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isVisualNoiseLine(line));

  const conceptLines = filtered.filter((line) => isConceptSignalLine(line) || /^#{1,3}\s+/.test(line));
  return conceptLines.length >= 2 ? conceptLines : filtered;
}

export function inferNeetTheme(
  visual: Pick<NeetGuruVisualSchema, "title" | "summary" | "steps">,
): NeetGuruVisualTheme {
  const corpus = `${visual.title} ${visual.summary ?? ""} ${visual.steps.map((step) => `${step.title} ${step.detail}`).join(" ")}`
    .toLowerCase()
    .normalize("NFKD");

  if (/\bheart\b|\blung\b|\bkidney\b|\bnephron\b|\bneuron\b|\bsynapse\b|\bhormone\b|\bendocrine\b|\bcirculation\b|\brespiration\b|\bdigestion\b/.test(corpus)) {
    return "human-physiology";
  }

  if (/\bdna\b|\brna\b|\bchromosome\b|\ballel(e|ic)\b|\bmutation\b|\btranscription\b|\btranslation\b|\bpunnett\b|\binheritance\b/.test(corpus)) {
    return "genetics";
  }

  if (/\becosystem\b|\bfood chain\b|\bfood web\b|\bbiome\b|\bsuccession\b|\bbiodiversity\b|\bpopulation\b|\bcommunity\b|\bconservation\b/.test(corpus)) {
    return "ecology";
  }

  if (/\bester\b|\baldol\b|\bgrignard\b|\bbenzene\b|\bharoth? reaction\b|\borganic\b|\bintermediate\b|\bmechanism\b|\bsubstitution\b|\belimination\b/.test(corpus)) {
    return "organic-chemistry";
  }

  if (/\bforce\b|\bfriction\b|\btension\b|\btorque\b|\bprojectile\b|\bacceleration\b|\bnewton\b|\bwork-energy\b|\bmomentum\b/.test(corpus)) {
    return "mechanics";
  }

  if (/\bvelocity\b|\bcurrent\b|\bfield\b|\bpotential\b|\bwave\b|\boptics\b|\belectric\b|\bmagnetic\b|\bphysics\b/.test(corpus)) {
    return "physics";
  }

  if (/\breactant\b|\bproduct\b|\bequilibrium\b|\benthalpy\b|\bmole\b|\bionic\b|\bcovalent\b|\bph\b|\bchemistry\b/.test(corpus)) {
    return "chemistry";
  }

  if (/\bcell\b|\bchloroplast\b|\bphotosynthesis\b|\bmitochondria\b|\benzyme\b|\bplant\b|\banimal tissue\b|\bimmunity\b|\bbiology\b/.test(corpus)) {
    return "biology";
  }

  return "generic";
}

export function getNeetThemeMeta(theme: NeetGuruVisualTheme) {
  switch (theme) {
    case "biology":
      return {
        eyebrow: "Biology pathway",
        focusLabel: "Core pathway",
        causeLabel: "Trigger",
        effectLabel: "Outcome",
      };
    case "human-physiology":
      return {
        eyebrow: "System physiology",
        focusLabel: "Body logic",
        causeLabel: "System input",
        effectLabel: "Physiological result",
      };
    case "genetics":
      return {
        eyebrow: "Genetic logic",
        focusLabel: "Inheritance path",
        causeLabel: "Genetic change",
        effectLabel: "Expression or trait",
      };
    case "ecology":
      return {
        eyebrow: "Ecology network",
        focusLabel: "Ecosystem driver",
        causeLabel: "Environmental shift",
        effectLabel: "Ecological effect",
      };
    case "chemistry":
      return {
        eyebrow: "Reaction flow",
        focusLabel: "Reaction driver",
        causeLabel: "Condition or reagent",
        effectLabel: "Transformation",
      };
    case "organic-chemistry":
      return {
        eyebrow: "Organic mechanism",
        focusLabel: "Reaction route",
        causeLabel: "Mechanistic move",
        effectLabel: "Intermediate or product",
      };
    case "physics":
      return {
        eyebrow: "Physics system",
        focusLabel: "Controlling relation",
        causeLabel: "Variable shift",
        effectLabel: "Observed effect",
      };
    case "mechanics":
      return {
        eyebrow: "Force chain",
        focusLabel: "Governing force",
        causeLabel: "Applied condition",
        effectLabel: "Motion result",
      };
    default:
      return {
        eyebrow: "Dynamic view",
        focusLabel: "Main focus",
        causeLabel: "What changes",
        effectLabel: "Main outcome",
      };
  }
}

export function deriveNeetHighlights(visual: NeetGuruVisualSchema) {
  if (visual.highlights?.length) {
    return visual.highlights.map((item) => item.trim()).filter(Boolean).slice(0, 4);
  }

  return visual.steps.map((step) => step.title.trim()).filter(Boolean).slice(0, 4);
}

export function deriveMemoryHooks(visual: NeetGuruVisualSchema) {
  const sources = visual.highlights?.length
    ? visual.highlights
    : visual.steps.map((step) => `${step.title}: ${step.detail}`);

  return sources
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((item) => {
      const [first, second] = item.split(/[:;,-]\s+/);
      return (second || first).slice(0, 72);
    })
    .filter(Boolean)
    .slice(0, 3);
}

export function deriveNeetFocus(
  visual: NeetGuruVisualSchema,
  themeMeta: ReturnType<typeof getNeetThemeMeta>,
) {
  if (visual.focus?.trim()) return visual.focus.trim();
  if (visual.summary?.trim()) return visual.summary.trim();
  return `${themeMeta.focusLabel} in ${visual.title}`;
}

function inferCue(step: NeetGuruVisualStep, view: NeetGuruVisualView, index: number) {
  if (step.cue?.trim()) return step.cue.trim();

  const lower = step.title.toLowerCase();
  if (lower.includes("input")) return "Input";
  if (lower.includes("output")) return "Output";
  if (lower.includes("enzyme")) return "Catalyst";
  if (lower.includes("product")) return "Product";
  if (lower.includes("force")) return "Force";
  if (view === "compare") return index === 0 ? "Side A" : "Side B";
  if (view === "cycle") return "Loop stage";
  if (view === "layers") return "Layer";
  return "Stage";
}

function inferSpanClass(view: NeetGuruVisualView, step: NeetGuruVisualStep, index: number) {
  const detailLength = `${step.title} ${step.detail}`.length;

  if (view === "compare") return "span-6";
  if (view === "cycle") return "span-6";
  if (view === "layers") return detailLength > 110 ? "span-12" : "span-6";
  if (index === 0 && detailLength > 95) return "span-8";
  if (detailLength > 135) return "span-8";
  return "span-4";
}

export function enrichNeetSteps(visual: NeetGuruVisualSchema, view: NeetGuruVisualView): EnrichedNeetGuruVisualStep[] {
  return visual.steps.slice(0, 5).map((step, index) => ({
    ...step,
    accent: sanitizeAccent(step.accent),
    cue: inferCue(step, view, index),
    animation: sanitizeAnimation(step.animation) === "auto" ? inferNeetAnimation({ ...visual, steps: [step] }) : sanitizeAnimation(step.animation),
    split: splitStepDetail(step.detail),
    spanClass: inferSpanClass(view, step, index),
  }));
}

function deriveVisualFromMarkdown(markdown: string): NeetGuruVisualSchema | null {
  const lines = extractTeachingLines(markdown);
  const numberedLines = lines.filter((line) => /^(\d+[.)]\s+|[-*]\s+)/.test(line)).slice(0, 5);
  const numberedSteps = numberedLines
    .map((line, index) => splitLineToStep(line, index))
    .filter((step): step is NeetGuruVisualStep => Boolean(step));
  const steps = numberedSteps.length >= 3 ? numberedSteps : deriveStepsFromConceptProse(lines);

  if (steps.length < 2) return null;

  const titleSource =
    lines.find((line) => /^#{1,3}\s+/.test(line) && isConceptSignalLine(line))?.replace(/^#{1,3}\s+/, "") ??
    lines.find((line) => isConceptSignalLine(line) && line.length > 12 && !/^(\d+[.)]\s+|[-*]\s+)/.test(line)) ??
    "Concept breakdown";

  const provisional: NeetGuruVisualSchema = {
    title: titleCase(titleSource).slice(0, 72),
    summary: compactText(steps[0]?.detail ?? "Concept structure from the explanation above.").slice(0, 160),
    theme: "generic",
    view: "chain",
    animation: "auto",
    simulation: "none",
    highlights: steps.map((step) => step.title).slice(0, 4),
    nodes: [],
    edges: [],
    steps,
  };

  provisional.theme = inferNeetTheme(provisional);
  provisional.view = inferNeetView(provisional);
  provisional.animation = inferNeetAnimation(provisional);
  provisional.simulation = inferNeetSimulation(provisional);
  return provisional;
}

function sanitizeSchema(input: unknown): NeetGuruVisualSchema | null {
  if (!input || typeof input !== "object") return null;

  const candidate = input as {
    title?: unknown;
    summary?: unknown;
    theme?: unknown;
    view?: unknown;
    animation?: unknown;
    simulation?: unknown;
    focus?: unknown;
    highlights?: unknown;
    nodes?: unknown;
    edges?: unknown;
    steps?: unknown;
  };

  if (typeof candidate.title !== "string" || !Array.isArray(candidate.steps)) {
    return null;
  }

  const steps = candidate.steps
    .map((step) => {
      if (!step || typeof step !== "object") return null;
      const current = step as { title?: unknown; detail?: unknown; emphasis?: unknown; cue?: unknown; accent?: unknown; animation?: unknown };
      if (typeof current.title !== "string" || typeof current.detail !== "string") return null;
      const detail = current.emphasis ? `${current.detail.trim()}; ${asText(current.emphasis)}` : current.detail.trim();

      return {
        title: current.title.trim(),
        detail,
        cue: typeof current.cue === "string" ? current.cue.trim() : undefined,
        accent: sanitizeAccent(current.accent),
        animation: sanitizeAnimation(current.animation),
      };
    })
    .filter((step): step is NonNullable<typeof step> => Boolean(step?.title && step?.detail))
    .slice(0, 5);

  if (steps.length < 2) return null;

  const highlights = Array.isArray(candidate.highlights)
    ? candidate.highlights.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 4)
    : [];

  const nodes = Array.isArray(candidate.nodes)
    ? candidate.nodes
        .map((node) => {
          if (!node || typeof node !== "object") return null;
          const current = node as {
            id?: unknown;
            label?: unknown;
            detail?: unknown;
            kind?: unknown;
            accent?: unknown;
            zone?: unknown;
            note?: unknown;
          };
          if (typeof current.id !== "string" || typeof current.label !== "string") return null;

          return {
            id: current.id.trim(),
            label: current.label.trim(),
            detail: asText(current.detail) || asText(current.note),
            kind: sanitizeNodeKind(current.kind),
            accent: sanitizeAccent(current.accent),
            zone: asText(current.zone),
            animation: sanitizeAnimation((current as { animation?: unknown }).animation),
          };
        })
        .filter((node): node is NonNullable<typeof node> => Boolean(node?.id && node?.label))
        .slice(0, 8)
    : [];

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = Array.isArray(candidate.edges)
    ? candidate.edges
        .map((edge) => {
          if (!edge || typeof edge !== "object") return null;
          const current = edge as { from?: unknown; to?: unknown; label?: unknown };
          if (typeof current.from !== "string" || typeof current.to !== "string") return null;
          if (!nodeIds.has(current.from.trim()) || !nodeIds.has(current.to.trim())) return null;

          return {
            from: current.from.trim(),
            to: current.to.trim(),
            label: typeof current.label === "string" ? current.label.trim() : "",
          };
        })
        .filter((edge): edge is NonNullable<typeof edge> => Boolean(edge?.from && edge?.to))
        .slice(0, 12)
    : [];

  return {
    title: candidate.title.trim(),
    summary: typeof candidate.summary === "string" ? candidate.summary.trim() : "",
    theme: sanitizeTheme(candidate.theme),
    view: sanitizeView(candidate.view),
    animation: sanitizeAnimation(candidate.animation),
    simulation: sanitizeSimulation(candidate.simulation),
    focus: typeof candidate.focus === "string" ? candidate.focus.trim() : "",
    highlights,
    nodes,
    edges,
    steps,
  };
}

export function hasSemanticScene(visual: NeetGuruVisualSchema) {
  return Boolean(visual.nodes?.length && visual.edges?.length);
}

export function parseNeetGuruMessage(content: string): ParsedNeetGuruMessage {
  const match = content.match(VISUAL_TAG_PATTERN);
  if (!match) {
    return { markdown: content.trim(), visual: deriveVisualFromMarkdown(content.trim()) };
  }

  let visual: NeetGuruVisualSchema | null = null;
  try {
    visual = sanitizeSchema(JSON.parse(match[1]));
  } catch {
    visual = null;
  }

  const markdown = content.replace(VISUAL_TAG_PATTERN, "").trim();
  return { markdown, visual: visual ?? deriveVisualFromMarkdown(markdown) };
}
