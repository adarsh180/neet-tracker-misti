"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  deriveNeetFocus,
  deriveNeetHighlights,
  deriveMemoryHooks,
  enrichNeetSteps,
  getNeetThemeMeta,
  hasSemanticScene,
  inferNeetAnimation,
  inferNeetSimulation,
  inferNeetTheme,
  inferNeetView,
  type EnrichedNeetGuruVisualStep,
  type NeetGuruVisualAccent,
  type NeetGuruVisualAnimation,
  type NeetGuruVisualNode,
  type NeetGuruVisualNodeKind,
  type NeetGuruSimulationKind,
  type NeetGuruVisualSchema,
  type NeetGuruVisualTheme,
} from "@/lib/neet-guru-visual";

function buildNodeStyle(index: number, accent: NeetGuruVisualAccent): CSSProperties {
  const glow =
    accent === "mint"
      ? "rgba(126,224,164,0.22)"
      : accent === "amber"
        ? "rgba(255,212,123,0.22)"
        : accent === "rose"
          ? "rgba(255,156,188,0.2)"
          : accent === "violet"
            ? "rgba(202,176,255,0.22)"
            : "rgba(137,213,255,0.22)";

  return {
    animationDelay: `${index * 90}ms`,
    ["--ngv-node-glow" as string]: glow,
  } as CSSProperties;
}

function buildConnectorStyle(index: number): CSSProperties {
  return {
    animationDelay: `${index * 90 + 40}ms`,
  };
}

function getThemeClass(theme: NeetGuruVisualTheme) {
  return `theme-${theme}`;
}

function getAccentClass(accent: NeetGuruVisualAccent) {
  return `accent-${accent}`;
}

function getNodeToneClass(kind: NeetGuruVisualNodeKind) {
  switch (kind) {
    case "organ":
      return "tone-organ";
    case "molecule":
      return "tone-molecule";
    case "force":
      return "tone-force";
    case "reaction":
      return "tone-reaction";
    case "pressure":
      return "tone-pressure";
    case "input":
      return "tone-input";
    case "output":
      return "tone-output";
    case "outcome":
      return "tone-outcome";
    default:
      return "tone-process";
  }
}

function getNodeKindLabel(kind: NeetGuruVisualNodeKind) {
  switch (kind) {
    case "organ":
      return "Organ";
    case "molecule":
      return "Molecule";
    case "force":
      return "Force";
    case "reaction":
      return "Reaction";
    case "pressure":
      return "Pressure";
    case "input":
      return "Input";
    case "output":
      return "Output";
    case "outcome":
      return "Outcome";
    default:
      return "Process";
  }
}

function SemanticNode({ node }: { node: NeetGuruVisualNode }) {
  return (
    <article className={`ngv-semantic-node ${getNodeToneClass(node.kind ?? "process")} ${getAccentClass(node.accent ?? "cyan")}`}>
      <div className="ngv-semantic-node-top">
        <div className="ngv-semantic-node-kind">{getNodeKindLabel(node.kind ?? "process")}</div>
        {node.zone ? <div className="ngv-semantic-node-zone">{node.zone}</div> : null}
      </div>
      <div className="ngv-semantic-node-label">{node.label}</div>
      {node.detail ? <p className="ngv-semantic-node-detail">{node.detail}</p> : null}
    </article>
  );
}

function SceneNode({
  step,
  index,
  themeMeta,
  active = false,
  onClick,
  className = "",
}: {
  step: EnrichedNeetGuruVisualStep;
  index: number;
  themeMeta: ReturnType<typeof getNeetThemeMeta>;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`ngv-scene-node ${step.spanClass} ${getAccentClass(step.accent)} ${active ? "is-active" : ""}${className ? ` ${className}` : ""}`}
      style={buildNodeStyle(index, step.accent)}
      role="listitem"
      onClick={onClick}
    >
      <div className="ngv-scene-node-top">
        <div className="ngv-scene-node-index">{index + 1}</div>
        <div className="ngv-scene-node-cue">{step.cue}</div>
      </div>
      <div className="ngv-scene-node-title">{step.title}</div>
      {step.split.effect ? (
        <div className="ngv-scene-node-panels">
          <div className="ngv-scene-panel">
            <div className="ngv-scene-panel-label">{themeMeta.causeLabel}</div>
            <p className="ngv-scene-panel-text">{step.split.cause}</p>
          </div>
          <div className="ngv-scene-panel-connector" aria-hidden="true">
            <span />
          </div>
          <div className="ngv-scene-panel">
            <div className="ngv-scene-panel-label">{themeMeta.effectLabel}</div>
            <p className="ngv-scene-panel-text">{step.split.effect}</p>
          </div>
        </div>
      ) : (
        <p className="ngv-scene-node-text">{step.detail}</p>
      )}
    </button>
  );
}

function DetailPanel({
  heading,
  title,
  body,
  tone,
}: {
  heading: string;
  title: string;
  body: string;
  tone: string;
}) {
  return (
    <div className={`ngv-detail-panel ${tone}`}>
      <div className="ngv-detail-heading">{heading}</div>
      <div className="ngv-detail-title">{title}</div>
      <p className="ngv-detail-body">{body}</p>
    </div>
  );
}

function SimulationLab({
  simulation,
  activeStep,
}: {
  simulation: NeetGuruSimulationKind;
  activeStep: number;
}) {
  if (simulation === "none") return null;
  const phase = activeStep % 3;

  if (simulation === "projectile-motion") {
    return (
      <div className="ngv-sim ngv-sim-projectile" aria-label="Projectile motion simulation">
        <div className="ngv-sim-caption">
          {phase === 0
            ? "Launch phase: horizontal and vertical velocity components are both present, while gravity already begins reducing only the upward component."
            : phase === 1
              ? "Apex phase: vertical velocity becomes momentarily zero, but horizontal velocity remains nearly constant in the ideal model."
              : "Descent phase: gravity increases the downward vertical component while the horizontal component stays essentially unchanged in the idealized case."}
        </div>
        <div className="ngv-projectile-stage">
          <div className={`ngv-projectile-ground phase-${phase}`} />
          <div className={`ngv-projectile-body phase-${phase}`} />
          <div className="ngv-projectile-arc" />
          <div className="ngv-projectile-vector launch">u</div>
          <div className="ngv-projectile-vector gravity">g</div>
        </div>
      </div>
    );
  }

  if (simulation === "force-balance") {
    return (
      <div className="ngv-sim ngv-sim-force" aria-label="Force balance simulation">
        <div className="ngv-sim-caption">
          {phase === 1
            ? "Balanced state: equal and opposite horizontal forces give zero net force, so acceleration becomes zero."
            : "Unbalanced state: when one horizontal force is larger, the object accelerates in the direction of the net force."}
        </div>
        <div className={`ngv-force-stage ${phase === 1 ? "is-balanced" : "is-unbalanced"}`}>
          <div className={`ngv-force-block phase-${phase}`} />
          <div className={`ngv-force-arrow left ${phase === 1 ? "balanced" : "weak"}`}>F1</div>
          <div className={`ngv-force-arrow right ${phase === 1 ? "balanced" : "strong"}`}>F2</div>
          <div className="ngv-force-arrow up">N</div>
          <div className="ngv-force-arrow down">mg</div>
        </div>
      </div>
    );
  }

  if (simulation === "equilibrium-shift") {
    return (
      <div className="ngv-sim ngv-sim-equilibrium" aria-label="Equilibrium shift simulation">
        <div className="ngv-sim-caption">
          {phase === 1
            ? "Product-favored shift: adding reactants or removing products pushes the equilibrium toward product formation."
            : "Reactant-favored shift: adding products or reversing the stress drives the equilibrium back toward reactants."}
        </div>
        <div className={`ngv-equilibrium-stage shift-${phase === 1 ? "right" : "left"}`}>
          <div className={`ngv-equilibrium-chamber left ${phase === 1 ? "" : "is-emphasis"}`}>
            <span className="particle a" />
            <span className="particle b" />
            <span className="particle c" />
          </div>
          <div className="ngv-equilibrium-axis">
            <span className="forward">{"<->"}</span>
            <span className="shift">{phase === 1 ? "right" : "left"}</span>
          </div>
          <div className={`ngv-equilibrium-chamber right ${phase === 1 ? "is-emphasis" : ""}`}>
            <span className="particle p" />
            <span className="particle q" />
          </div>
        </div>
      </div>
    );
  }

  if (simulation === "reaction-collision") {
    return (
      <div className="ngv-sim ngv-sim-collision" aria-label="Reaction collision simulation">
        <div className="ngv-sim-caption">
          {phase === 2
            ? "Effective collision: correct orientation and sufficient activation energy allow bond rearrangement and product formation."
            : "Ineffective collision: the particles meet, but orientation or kinetic energy is still insufficient to cross the activation barrier."}
        </div>
        <div className={`ngv-collision-stage ${phase === 2 ? "is-success" : "is-attempt"}`}>
          <span className="ngv-collision-particle left" />
          <span className="ngv-collision-particle right" />
          <div className="ngv-collision-barrier" />
          <div className="ngv-collision-flash" />
        </div>
      </div>
    );
  }

  if (simulation === "circulation-loop") {
    return (
      <div className="ngv-sim ngv-sim-circulation" aria-label="Circulation loop simulation">
        <div className="ngv-sim-caption">
          {phase === 1
            ? "Pulmonary loop: deoxygenated blood moves from the heart to the lungs for gas exchange and returns oxygenated."
            : "Systemic loop: oxygenated blood is pumped from the heart to body tissues and returns deoxygenated."}
        </div>
        <div className={`ngv-circulation-stage mode-${phase === 1 ? "pulmonary" : "systemic"}`}>
          <div className="ngv-circulation-heart">Heart</div>
          <div className={`ngv-circulation-lungs ${phase === 1 ? "is-emphasis" : ""}`}>Lungs</div>
          <div className={`ngv-circulation-body ${phase === 1 ? "" : "is-emphasis"}`}>Body</div>
          <span className="ngv-flow-dot pulmonary" />
          <span className="ngv-flow-dot systemic" />
        </div>
      </div>
    );
  }

  if (simulation === "synapse-signal") {
    return (
      <div className="ngv-sim ngv-sim-synapse" aria-label="Synaptic transmission simulation">
        <div className="ngv-sim-caption">
          {phase === 0
            ? "Impulse arrival: depolarization reaches the presynaptic terminal and opens voltage-gated calcium channels."
            : phase === 1
              ? "Vesicle release: calcium-triggered fusion releases neurotransmitter into the synaptic cleft."
              : "Receptor binding: transmitter diffuses across the cleft and binds receptors on the postsynaptic membrane."}
        </div>
        <div className={`ngv-synapse-stage stage-${phase}`}>
          <div className="ngv-neuron pre" />
          <div className="ngv-synapse-gap" />
          <div className="ngv-neuron post" />
          <span className="ngv-signal-impulse" />
          <span className="ngv-neurotransmitter t1" />
          <span className="ngv-neurotransmitter t2" />
          <span className="ngv-neurotransmitter t3" />
        </div>
      </div>
    );
  }

  if (simulation === "gene-expression") {
    return (
      <div className="ngv-sim ngv-sim-gene" aria-label="Gene expression simulation">
        <div className="ngv-sim-caption">
          {phase === 0
            ? "Transcription: RNA polymerase reads the DNA template and synthesizes a complementary RNA transcript."
            : phase === 1
              ? "RNA processing: the primary transcript is edited into mature mRNA before export for translation."
              : "Translation: ribosomes read the mRNA codons and assemble the polypeptide in the correct amino acid order."}
        </div>
        <div className={`ngv-gene-stage stage-${phase}`}>
          <div className={`ngv-gene-node dna ${phase === 0 ? "is-emphasis" : ""}`}>DNA</div>
          <div className="ngv-gene-link" />
          <div className={`ngv-gene-node mrna ${phase === 1 ? "is-emphasis" : ""}`}>mRNA</div>
          <div className="ngv-gene-link" />
          <div className={`ngv-gene-node protein ${phase === 2 ? "is-emphasis" : ""}`}>Protein</div>
          <span className="ngv-gene-cursor" />
        </div>
      </div>
    );
  }

  return null;
}

function AnimatedLearningHud({
  theme,
  animation,
  steps,
  activeStep,
}: {
  theme: NeetGuruVisualTheme;
  animation: NeetGuruVisualAnimation;
  steps: EnrichedNeetGuruVisualStep[];
  activeStep: number;
}) {
  const current = steps[activeStep] ?? steps[0];

  if (!current) return null;

  if (animation === "reaction" || theme === "chemistry" || theme === "organic-chemistry") {
    return (
      <div className="ngv-hud ngv-hud-reaction" aria-hidden="true">
        <div className="ngv-reactor-bubble left">{current.split.cause || current.title}</div>
        <div className="ngv-reactor-core">
          <span className="ngv-reactor-ring" />
          <span className="ngv-reactor-spark a" />
          <span className="ngv-reactor-spark b" />
          <span className="ngv-reactor-spark c" />
        </div>
        <div className="ngv-reactor-bubble right">{current.split.effect || current.cue}</div>
      </div>
    );
  }

  if (animation === "force" || theme === "physics" || theme === "mechanics") {
    return (
      <div className="ngv-hud ngv-hud-force" aria-hidden="true">
        <div className="ngv-force-board">
          {[0, 1, 2].map((lane) => (
            <div key={lane} className="ngv-force-lane">
              <span className={`ngv-force-vector lane-${lane}`} />
            </div>
          ))}
        </div>
        <div className="ngv-force-copy">{current.cue}: {current.title}</div>
      </div>
    );
  }

  return (
    <div className="ngv-hud ngv-hud-flow" aria-hidden="true">
      <div className="ngv-flow-track">
        {steps.map((step, index) => (
          <div key={`${step.title}-${index}`} className={`ngv-flow-cell ${index === activeStep ? "is-active" : ""}`}>
            <span className="ngv-flow-pulse" />
          </div>
        ))}
      </div>
      <div className="ngv-flow-copy">{current.cue}: {current.title}</div>
    </div>
  );
}

function GenericScene({
  steps,
  themeMeta,
  activeStep,
  onSelectStep,
}: {
  steps: EnrichedNeetGuruVisualStep[];
  themeMeta: ReturnType<typeof getNeetThemeMeta>;
  activeStep: number;
  onSelectStep: (index: number) => void;
}) {
  return (
    <div className="ngv-scene-grid" role="list">
      {steps.map((step, index) => (
        <SceneNode key={`${step.title}-${index}`} step={step} index={index} themeMeta={themeMeta} active={index === activeStep} onClick={() => onSelectStep(index)} />
      ))}
    </div>
  );
}

function CompareScene({
  steps,
  themeMeta,
  activeStep,
  onSelectStep,
}: {
  steps: EnrichedNeetGuruVisualStep[];
  themeMeta: ReturnType<typeof getNeetThemeMeta>;
  activeStep: number;
  onSelectStep: (index: number) => void;
}) {
  const left = steps.filter((_, index) => index % 2 === 0);
  const right = steps.filter((_, index) => index % 2 === 1);

  return (
    <div className="ngv-compare-shell">
      <div className="ngv-compare-column" role="list">
        {left.map((step, index) => (
          <SceneNode key={`${step.title}-${index}`} step={step} index={index} themeMeta={themeMeta} className="span-12" active={index === activeStep} onClick={() => onSelectStep(index)} />
        ))}
      </div>
      <div className="ngv-compare-divider" aria-hidden="true">
        <span />
      </div>
      <div className="ngv-compare-column" role="list">
        {right.map((step, index) => (
          <SceneNode key={`${step.title}-${index + left.length}`} step={step} index={index + left.length} themeMeta={themeMeta} className="span-12" active={index + left.length === activeStep} onClick={() => onSelectStep(index + left.length)} />
        ))}
      </div>
    </div>
  );
}

function CycleScene({
  steps,
  themeMeta,
  activeStep,
  onSelectStep,
}: {
  steps: EnrichedNeetGuruVisualStep[];
  themeMeta: ReturnType<typeof getNeetThemeMeta>;
  activeStep: number;
  onSelectStep: (index: number) => void;
}) {
  return (
    <div className="ngv-cycle-shell" role="list">
      {steps.map((step, index) => (
        <div key={`${step.title}-${index}`} className="ngv-cycle-item">
          <div className="ngv-cycle-orbit" aria-hidden="true" />
          <SceneNode step={step} index={index} themeMeta={themeMeta} className="span-12" active={index === activeStep} onClick={() => onSelectStep(index)} />
          {index < steps.length - 1 ? (
            <div className="ngv-scene-connector ngv-scene-connector-vertical" style={buildConnectorStyle(index)} aria-hidden="true">
              <span />
            </div>
          ) : (
            <div className="ngv-cycle-return" aria-hidden="true">
              <span />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function LayersScene({
  steps,
  themeMeta,
  activeStep,
  onSelectStep,
}: {
  steps: EnrichedNeetGuruVisualStep[];
  themeMeta: ReturnType<typeof getNeetThemeMeta>;
  activeStep: number;
  onSelectStep: (index: number) => void;
}) {
  return (
    <div className="ngv-layers-shell" role="list">
      {steps.map((step, index) => (
        <div key={`${step.title}-${index}`} className="ngv-layer-card" style={{ ["--layer-index" as string]: `${index}` } as CSSProperties}>
          <SceneNode step={step} index={index} themeMeta={themeMeta} className="span-12" active={index === activeStep} onClick={() => onSelectStep(index)} />
        </div>
      ))}
    </div>
  );
}

function BiologyScene({ steps, themeMeta, activeStep, onSelectStep }: { steps: EnrichedNeetGuruVisualStep[]; themeMeta: ReturnType<typeof getNeetThemeMeta>; activeStep: number; onSelectStep: (index: number) => void }) {
  const [hero, ...rest] = steps;
  return (
    <div className="ngv-scene-biology">
      {hero ? (
        <div className="ngv-scene-hero">
          <SceneNode step={hero} index={0} themeMeta={themeMeta} className="span-12 is-hero" active={activeStep === 0} onClick={() => onSelectStep(0)} />
        </div>
      ) : null}
      {rest.length ? (
        <div className="ngv-scene-grid" role="list">
          {rest.map((step, index) => (
            <SceneNode key={`${step.title}-${index + 1}`} step={step} index={index + 1} themeMeta={themeMeta} className="span-4" active={index + 1 === activeStep} onClick={() => onSelectStep(index + 1)} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ChainScene({
  steps,
  themeMeta,
  className,
  activeStep,
  onSelectStep,
}: {
  steps: EnrichedNeetGuruVisualStep[];
  themeMeta: ReturnType<typeof getNeetThemeMeta>;
  className: string;
  activeStep: number;
  onSelectStep: (index: number) => void;
}) {
  return (
    <div className={className} role="list">
      {steps.map((step, index) => (
        <div key={`${step.title}-${index}`} className="ngv-chain-item">
          <SceneNode step={step} index={index} themeMeta={themeMeta} className="span-12 is-horizontal" active={index === activeStep} onClick={() => onSelectStep(index)} />
          {index < steps.length - 1 ? (
            <div className="ngv-scene-connector ngv-scene-connector-vertical" style={buildConnectorStyle(index)} aria-hidden="true">
              <span />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function PhysiologySemanticScene({ visual }: { visual: NeetGuruVisualSchema }) {
  const nodes = visual.nodes ?? [];
  const inputs = nodes.filter((node) => ["input", "pressure", "molecule"].includes(node.kind ?? "process"));
  const organs = nodes.filter((node) => (node.kind ?? "process") === "organ");
  const outcomes = nodes.filter((node) => ["output", "outcome", "process"].includes(node.kind ?? "process"));

  return (
    <div className="ngv-semantic ngv-semantic-triad">
      <SemanticColumn title="Inputs" nodes={inputs} />
      <SemanticDivider />
      <SemanticColumn title="Organs / systems" nodes={organs} />
      <SemanticDivider />
      <SemanticColumn title="Effects" nodes={outcomes} />
    </div>
  );
}

function ChemistrySemanticScene({ visual }: { visual: NeetGuruVisualSchema }) {
  const nodes = visual.nodes ?? [];
  return (
    <div className="ngv-semantic ngv-semantic-chain">
      <div className="ngv-semantic-lane" role="list">
        {nodes.map((node, index) => (
          <div key={node.id} className="ngv-semantic-lane-item" role="listitem">
            <SemanticNode node={node} />
            {index < nodes.length - 1 ? (
              <div className="ngv-semantic-link ngv-semantic-link-horizontal" aria-hidden="true">
                <span />
                <small>{visual.edges?.[index]?.label || ""}</small>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function PhysicsSemanticScene({ visual }: { visual: NeetGuruVisualSchema }) {
  const nodes = visual.nodes ?? [];
  const inputs = nodes.filter((node) => ["input", "force", "pressure"].includes(node.kind ?? "process"));
  const process = nodes.filter((node) => ["process", "concept"].includes(node.kind ?? "process"));
  const outputs = nodes.filter((node) => ["output", "outcome"].includes(node.kind ?? "process"));

  return (
    <div className="ngv-semantic ngv-semantic-triad">
      <SemanticColumn title="Variables" nodes={inputs} />
      <SemanticDivider />
      <SemanticColumn title="Relation" nodes={process} />
      <SemanticDivider />
      <SemanticColumn title="Effect" nodes={outputs} />
    </div>
  );
}

function GeneticsSemanticScene({ visual }: { visual: NeetGuruVisualSchema }) {
  const nodes = visual.nodes ?? [];
  return (
    <div className="ngv-semantic ngv-semantic-vertical" role="list">
      {nodes.map((node, index) => (
        <div key={node.id} className="ngv-semantic-process-item" role="listitem">
          <SemanticNode node={node} />
          {index < nodes.length - 1 ? (
            <div className="ngv-semantic-link ngv-semantic-link-vertical" aria-hidden="true">
              <span />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function EcologySemanticScene({ visual }: { visual: NeetGuruVisualSchema }) {
  const nodes = visual.nodes ?? [];
  const drivers = nodes.filter((node) => ["input", "pressure", "process"].includes(node.kind ?? "process"));
  const zones = nodes.filter((node) => ["concept", "organ"].includes(node.kind ?? "process"));
  const outcomes = nodes.filter((node) => ["outcome", "output"].includes(node.kind ?? "process"));

  return (
    <div className="ngv-semantic ngv-semantic-triad">
      <SemanticColumn title="Drivers" nodes={drivers} />
      <SemanticDivider />
      <SemanticColumn title="System zone" nodes={zones} />
      <SemanticDivider />
      <SemanticColumn title="Ecological effects" nodes={outcomes} />
    </div>
  );
}

function SemanticColumn({ title, nodes }: { title: string; nodes: NeetGuruVisualNode[] }) {
  return (
    <div className="ngv-semantic-column">
      <div className="ngv-semantic-column-title">{title}</div>
      <div className="ngv-semantic-stack" role="list">
        {nodes.map((node) => (
          <div key={node.id} role="listitem">
            <SemanticNode node={node} />
          </div>
        ))}
      </div>
    </div>
  );
}

function SemanticDivider() {
  return (
    <div className="ngv-semantic-route" aria-hidden="true">
      <span />
    </div>
  );
}

export function NeetGuruVisualExplainer({ visual }: { visual: NeetGuruVisualSchema }) {
  const theme = visual.theme === "generic" ? inferNeetTheme(visual) : (visual.theme ?? inferNeetTheme(visual));
  const view = visual.view ?? inferNeetView(visual);
  const animation = visual.animation && visual.animation !== "auto" ? visual.animation : inferNeetAnimation({ ...visual, theme, view });
  const simulation = visual.simulation && visual.simulation !== "none" ? visual.simulation : inferNeetSimulation({ ...visual, theme });
  const themeMeta = getNeetThemeMeta(theme);
  const focus = deriveNeetFocus(visual, themeMeta);
  const highlights = deriveNeetHighlights(visual);
  const memoryHooks = deriveMemoryHooks(visual);
  const steps = enrichNeetSteps(visual, view);
  const semantic = hasSemanticScene(visual);
  const [activeStep, setActiveStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const stepCount = steps.length;
  const semanticNodes = visual.nodes ?? [];

  useEffect(() => {
    setActiveStep(0);
    setSelectedNodeId(null);
    setIsPlaying(true);
  }, [visual.title, stepCount, animation]);

  useEffect(() => {
    if (!isPlaying || stepCount <= 1) return;
    const timer = window.setInterval(() => {
      setActiveStep((current) => (current + 1) % stepCount);
    }, animation === "compare" ? 2600 : animation === "reaction" ? 2000 : 2300);

    return () => window.clearInterval(timer);
  }, [animation, isPlaying, stepCount]);

  const activeStepSafe = useMemo(() => Math.min(activeStep, Math.max(stepCount - 1, 0)), [activeStep, stepCount]);
  const activeNode = useMemo(
    () => semanticNodes.find((node) => node.id === selectedNodeId) ?? semanticNodes[0] ?? null,
    [selectedNodeId, semanticNodes],
  );
  const activeStepData = steps[activeStepSafe] ?? null;
  const stepSummary = activeStepData
    ? `${activeStepData.split.cause}${activeStepData.split.effect ? ` → ${activeStepData.split.effect}` : ""}`
    : "";

  return (
    <section className={`ngv-shell ${getThemeClass(theme)} view-${view} animation-${animation}`} aria-label={`${visual.title} dynamic view`}>
      <div className="ngv-head">
        <div className="ngv-kicker">{themeMeta.eyebrow}</div>
        <h3 className="ngv-title">{visual.title}</h3>
        {visual.summary ? <p className="ngv-summary">{visual.summary}</p> : null}
        <div className="ngv-meta">
          <div className="ngv-focus">
            <span className="ngv-focus-label">{themeMeta.focusLabel}</span>
            <span className="ngv-focus-value">{focus}</span>
          </div>
          {highlights.length ? (
            <div className="ngv-highlights" role="list" aria-label="Visual highlights">
              {highlights.map((item) => (
                <span key={item} className="ngv-chip" role="listitem">
                  {item}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        {steps.length ? (
          <div className="ngv-progress-rail" aria-label="Learning progression">
            {steps.map((step, index) => (
              <button
                type="button"
                key={`${step.title}-${index}`}
                className={`ngv-progress-stop ${index === activeStepSafe ? "is-active" : ""}`}
                style={buildNodeStyle(index, step.accent)}
                title={step.title}
                onClick={() => {
                  setActiveStep(index);
                  setIsPlaying(false);
                }}
              >
                <span className="ngv-progress-dot" />
                <span className="ngv-progress-text">{step.cue}</span>
              </button>
            ))}
          </div>
        ) : null}
        {steps.length ? (
          <div className="ngv-controls">
            <button type="button" className="ngv-control-btn" onClick={() => { setIsPlaying((current) => !current); }} aria-label={isPlaying ? "Pause animation" : "Play animation"}>
              {isPlaying ? "Pause" : "Play"}
            </button>
            <button type="button" className="ngv-control-btn" onClick={() => { setActiveStep((current) => (current - 1 + stepCount) % stepCount); setIsPlaying(false); }} aria-label="Previous step">
              Prev
            </button>
            <button type="button" className="ngv-control-btn" onClick={() => { setActiveStep((current) => (current + 1) % stepCount); setIsPlaying(false); }} aria-label="Next step">
              Next
            </button>
            <div className="ngv-control-status">Step {activeStepSafe + 1} / {stepCount}</div>
          </div>
        ) : null}
      </div>

      <div className="ngv-stage">
        <div className="ngv-backdrop ngv-backdrop-a" />
        <div className="ngv-backdrop ngv-backdrop-b" />
        <div className="ngv-backdrop ngv-backdrop-c" />
        <div className="ngv-scanline" aria-hidden="true" />
        <AnimatedLearningHud theme={theme} animation={animation} steps={steps} activeStep={activeStepSafe} />
        <SimulationLab simulation={simulation} activeStep={activeStepSafe} />
        {semantic && theme === "human-physiology" ? (
          <PhysiologySemanticScene visual={visual} />
        ) : semantic && (theme === "chemistry" || theme === "organic-chemistry") ? (
          <ChemistrySemanticScene visual={visual} />
        ) : semantic && (theme === "physics" || theme === "mechanics") ? (
          <PhysicsSemanticScene visual={visual} />
        ) : semantic && theme === "genetics" ? (
          <GeneticsSemanticScene visual={visual} />
        ) : semantic && theme === "ecology" ? (
          <EcologySemanticScene visual={visual} />
        ) : theme === "biology" ? (
          <BiologyScene steps={steps} themeMeta={themeMeta} activeStep={activeStepSafe} onSelectStep={(index) => { setActiveStep(index); setIsPlaying(false); }} />
        ) : theme === "human-physiology" ? (
          <ChainScene steps={steps} themeMeta={themeMeta} className="ngv-scene-system" activeStep={activeStepSafe} onSelectStep={(index) => { setActiveStep(index); setIsPlaying(false); }} />
        ) : theme === "chemistry" ? (
          <ChainScene steps={steps} themeMeta={themeMeta} className="ngv-scene-chemistry" activeStep={activeStepSafe} onSelectStep={(index) => { setActiveStep(index); setIsPlaying(false); }} />
        ) : theme === "organic-chemistry" ? (
          <ChainScene steps={steps} themeMeta={themeMeta} className="ngv-scene-organic" activeStep={activeStepSafe} onSelectStep={(index) => { setActiveStep(index); setIsPlaying(false); }} />
        ) : theme === "physics" ? (
          <GenericScene steps={steps} themeMeta={themeMeta} activeStep={activeStepSafe} onSelectStep={(index) => { setActiveStep(index); setIsPlaying(false); }} />
        ) : theme === "mechanics" ? (
          <ChainScene steps={steps} themeMeta={themeMeta} className="ngv-scene-mechanics" activeStep={activeStepSafe} onSelectStep={(index) => { setActiveStep(index); setIsPlaying(false); }} />
        ) : theme === "genetics" ? (
          <ChainScene steps={steps} themeMeta={themeMeta} className="ngv-scene-genetics" activeStep={activeStepSafe} onSelectStep={(index) => { setActiveStep(index); setIsPlaying(false); }} />
        ) : view === "compare" ? (
          <CompareScene steps={steps} themeMeta={themeMeta} activeStep={activeStepSafe} onSelectStep={(index) => { setActiveStep(index); setIsPlaying(false); }} />
        ) : view === "cycle" ? (
          <CycleScene steps={steps} themeMeta={themeMeta} activeStep={activeStepSafe} onSelectStep={(index) => { setActiveStep(index); setIsPlaying(false); }} />
        ) : view === "layers" ? (
          <LayersScene steps={steps} themeMeta={themeMeta} activeStep={activeStepSafe} onSelectStep={(index) => { setActiveStep(index); setIsPlaying(false); }} />
        ) : theme === "ecology" ? (
          <GenericScene steps={steps} themeMeta={themeMeta} activeStep={activeStepSafe} onSelectStep={(index) => { setActiveStep(index); setIsPlaying(false); }} />
        ) : (
          <GenericScene steps={steps} themeMeta={themeMeta} activeStep={activeStepSafe} onSelectStep={(index) => { setActiveStep(index); setIsPlaying(false); }} />
        )}
        {activeStepData ? (
          <DetailPanel
            heading="Current step"
            title={`${activeStepData.cue}: ${activeStepData.title}`}
            body={stepSummary || activeStepData.detail}
            tone={`tone-${activeStepData.animation}`}
          />
        ) : null}
        {activeNode ? (
          <div className="ngv-node-picker" role="list" aria-label="Semantic nodes">
            {semanticNodes.map((node) => (
              <button
                type="button"
                key={node.id}
                className={`ngv-node-pill ${selectedNodeId === node.id || (!selectedNodeId && activeNode.id === node.id) ? "is-active" : ""}`}
                onClick={() => setSelectedNodeId(node.id)}
                role="listitem"
              >
                {node.label}
              </button>
            ))}
          </div>
        ) : null}
        {activeNode ? (
          <DetailPanel
            heading="Focused node"
            title={activeNode.label}
            body={activeNode.detail || activeNode.zone || getNodeKindLabel(activeNode.kind ?? "process")}
            tone={getNodeToneClass(activeNode.kind ?? "process")}
          />
        ) : null}
        {memoryHooks.length ? (
          <div className="ngv-memory-dock" role="list" aria-label="Memory hooks">
            {memoryHooks.map((hook, index) => (
              <div key={`${hook}-${index}`} className="ngv-memory-card" role="listitem" style={buildNodeStyle(index, steps[index % Math.max(steps.length, 1)]?.accent ?? "cyan")}>
                <span className="ngv-memory-label">Memory hook</span>
                <strong>{hook}</strong>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <style jsx>{`
        .ngv-shell {
          --ngv-accent: #89d5ff;
          --ngv-accent-soft: rgba(137, 213, 255, 0.14);
          --ngv-accent-strong: rgba(137, 213, 255, 0.24);
          --ngv-node-glow: rgba(137, 213, 255, 0.18);
          position: relative;
          margin-top: 18px;
          overflow: hidden;
          border-radius: 26px;
          border: 1px solid rgba(255, 255, 255, 0.07);
          background:
            radial-gradient(circle at 0% 0%, rgba(255, 255, 255, 0.06), transparent 32%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.02));
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
        }

        .ngv-shell.theme-biology {
          --ngv-accent: #7ee0a4;
          --ngv-accent-soft: rgba(126, 224, 164, 0.14);
          --ngv-accent-strong: rgba(126, 224, 164, 0.24);
        }

        .ngv-shell.theme-human-physiology {
          --ngv-accent: #ff9cbc;
          --ngv-accent-soft: rgba(255, 156, 188, 0.14);
          --ngv-accent-strong: rgba(255, 156, 188, 0.24);
        }

        .ngv-shell.theme-chemistry {
          --ngv-accent: #89d5ff;
          --ngv-accent-soft: rgba(137, 213, 255, 0.14);
          --ngv-accent-strong: rgba(137, 213, 255, 0.24);
        }

        .ngv-shell.theme-organic-chemistry {
          --ngv-accent: #ffb270;
          --ngv-accent-soft: rgba(255, 178, 112, 0.14);
          --ngv-accent-strong: rgba(255, 178, 112, 0.24);
        }

        .ngv-shell.theme-physics,
        .ngv-shell.theme-mechanics {
          --ngv-accent: #ffd47b;
          --ngv-accent-soft: rgba(255, 212, 123, 0.14);
          --ngv-accent-strong: rgba(255, 212, 123, 0.24);
        }

        .ngv-shell.theme-genetics {
          --ngv-accent: #cab0ff;
          --ngv-accent-soft: rgba(202, 176, 255, 0.14);
          --ngv-accent-strong: rgba(202, 176, 255, 0.24);
        }

        .ngv-shell.theme-ecology {
          --ngv-accent: #79d99b;
          --ngv-accent-soft: rgba(121, 217, 155, 0.14);
          --ngv-accent-strong: rgba(121, 217, 155, 0.24);
        }

        .ngv-head,
        .ngv-stage {
          position: relative;
          z-index: 1;
        }

        .ngv-head {
          padding: 18px 18px 0;
        }

        .ngv-kicker {
          display: inline-flex;
          align-items: center;
          padding: 6px 10px;
          border-radius: 999px;
          background: var(--ngv-accent-soft);
          border: 1px solid var(--ngv-accent-strong);
          color: var(--ngv-accent);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .ngv-title {
          margin: 12px 0 8px;
          color: #fff;
          font-size: 22px;
          line-height: 1.15;
          letter-spacing: -0.03em;
        }

        .ngv-summary {
          margin: 0;
          color: rgba(255, 255, 255, 0.82);
          font-size: 14px;
          line-height: 1.7;
        }

        .ngv-meta {
          display: grid;
          gap: 12px;
          margin-top: 14px;
        }

        .ngv-progress-rail {
          display: flex;
          flex-wrap: wrap;
          gap: 8px 14px;
          margin-top: 16px;
          padding-top: 14px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }

        .ngv-progress-stop {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: transparent;
          border: none;
          padding: 0;
          cursor: pointer;
          color: rgba(255, 255, 255, 0.74);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          animation: fadeLift 0.45s ease both;
        }

        .ngv-controls {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 12px;
        }

        .ngv-control-btn,
        .ngv-node-pill {
          min-height: 34px;
          padding: 8px 12px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.04);
          color: rgba(255,255,255,0.9);
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.2s, border-color 0.2s, transform 0.2s;
        }

        .ngv-control-btn:hover,
        .ngv-node-pill:hover {
          background: rgba(255,255,255,0.08);
          border-color: rgba(255,255,255,0.16);
          transform: translateY(-1px);
        }

        .ngv-control-status {
          display: inline-flex;
          align-items: center;
          min-height: 34px;
          padding: 8px 12px;
          border-radius: 12px;
          color: rgba(255,255,255,0.68);
          font-size: 12px;
          font-weight: 700;
        }

        .ngv-progress-stop.is-active .ngv-progress-text {
          color: rgba(255, 255, 255, 0.96);
        }

        .ngv-progress-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: var(--ngv-accent);
          box-shadow: 0 0 0 0 var(--ngv-node-glow);
          animation: pulseDot 2.6s ease-in-out infinite;
        }

        .ngv-progress-text {
          white-space: nowrap;
        }

        .ngv-focus {
          display: grid;
          gap: 4px;
        }

        .ngv-focus-label,
        .ngv-scene-panel-label,
        .ngv-semantic-column-title,
        .ngv-semantic-node-kind {
          color: rgba(255, 255, 255, 0.54);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .ngv-focus-value {
          color: rgba(255, 255, 255, 0.94);
          font-size: 13px;
          font-weight: 700;
        }

        .ngv-highlights {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .ngv-chip {
          display: inline-flex;
          align-items: center;
          min-height: 34px;
          padding: 8px 12px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: rgba(255, 255, 255, 0.9);
          font-size: 12px;
          font-weight: 700;
        }

        .ngv-stage {
          padding: 18px;
        }

        .ngv-backdrop {
          position: absolute;
          inset: auto;
          border-radius: 999px;
          filter: blur(34px);
          opacity: 0.5;
          pointer-events: none;
        }

        .ngv-backdrop-a {
          width: 180px;
          height: 180px;
          right: -60px;
          top: -10px;
          background: var(--ngv-accent-soft);
        }

        .ngv-backdrop-b {
          width: 120px;
          height: 120px;
          left: -50px;
          bottom: 10px;
          background: rgba(255, 255, 255, 0.06);
        }

        .ngv-backdrop-c {
          width: 220px;
          height: 70px;
          left: 12%;
          top: 36%;
          background: linear-gradient(90deg, transparent, var(--ngv-accent-soft), transparent);
          filter: blur(28px);
          opacity: 0.45;
        }

        .ngv-scanline {
          position: absolute;
          left: 0;
          right: 0;
          top: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, var(--ngv-accent), transparent);
          opacity: 0.55;
          animation: scanStage 4.8s ease-in-out infinite;
          pointer-events: none;
        }

        .ngv-hud {
          position: relative;
          display: grid;
          margin-bottom: 14px;
          padding: 12px 14px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.08);
          background: linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.02));
          overflow: hidden;
        }

        .ngv-hud-flow {
          gap: 10px;
        }

        .ngv-flow-track {
          display: grid;
          grid-template-columns: repeat(${Math.max(steps.length || 1, 1)}, minmax(0, 1fr));
          gap: 8px;
        }

        .ngv-flow-cell {
          position: relative;
          height: 14px;
          border-radius: 999px;
          background: rgba(255,255,255,0.06);
          overflow: hidden;
        }

        .ngv-flow-cell.is-active {
          background: var(--ngv-accent-soft);
        }

        .ngv-flow-pulse {
          position: absolute;
          inset: 2px auto 2px -18px;
          width: 22px;
          border-radius: 999px;
          background: linear-gradient(90deg, transparent, var(--ngv-accent), transparent);
          animation: flowPulse 2.2s linear infinite;
        }

        .ngv-flow-copy,
        .ngv-force-copy {
          color: rgba(255,255,255,0.86);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.03em;
        }

        .ngv-hud-reaction {
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: 12px;
        }

        .ngv-reactor-bubble {
          padding: 12px 14px;
          border-radius: 14px;
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.86);
          font-size: 12px;
          font-weight: 700;
          line-height: 1.5;
        }

        .ngv-reactor-core {
          position: relative;
          width: 62px;
          height: 62px;
          display: grid;
          place-items: center;
        }

        .ngv-reactor-ring {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          border: 2px solid var(--ngv-accent);
          box-shadow: 0 0 22px var(--ngv-accent-soft);
          animation: spinRing 4s linear infinite;
        }

        .ngv-reactor-spark {
          position: absolute;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--ngv-accent);
          box-shadow: 0 0 16px var(--ngv-accent);
        }

        .ngv-reactor-spark.a { animation: orbitSparkA 2s linear infinite; }
        .ngv-reactor-spark.b { animation: orbitSparkB 2.6s linear infinite; }
        .ngv-reactor-spark.c { animation: orbitSparkC 1.7s linear infinite; }

        .ngv-hud-force {
          gap: 10px;
        }

        .ngv-sim {
          display: grid;
          gap: 10px;
          margin-bottom: 14px;
          padding: 14px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.08);
          background: linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.02));
          overflow: hidden;
        }

        .ngv-sim-caption {
          color: rgba(255,255,255,0.72);
          font-size: 12px;
          line-height: 1.6;
        }

        .ngv-projectile-stage,
        .ngv-force-stage,
        .ngv-equilibrium-stage,
        .ngv-collision-stage,
        .ngv-circulation-stage,
        .ngv-synapse-stage,
        .ngv-gene-stage {
          position: relative;
          min-height: 110px;
          border-radius: 16px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          overflow: hidden;
        }

        .ngv-projectile-ground {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 18px;
          height: 2px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent);
        }

        .ngv-projectile-ground.phase-1 {
          opacity: 0.72;
        }

        .ngv-projectile-ground.phase-2 {
          opacity: 0.92;
        }

        .ngv-projectile-body {
          position: absolute;
          left: 14px;
          bottom: 20px;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--ngv-accent);
          box-shadow: 0 0 18px var(--ngv-accent-soft);
          animation: projectileArc 2.8s ease-in-out infinite;
        }

        .ngv-projectile-arc {
          position: absolute;
          left: 18px;
          right: 36px;
          bottom: 24px;
          height: 64px;
          border-top: 2px dashed rgba(255,255,255,0.18);
          border-right: 2px dashed rgba(255,255,255,0.1);
          border-radius: 0 90% 0 0;
          opacity: 0.65;
        }

        .ngv-projectile-vector {
          position: absolute;
          color: rgba(255,255,255,0.82);
          font-size: 11px;
          font-weight: 800;
        }

        .ngv-projectile-vector.launch { left: 28px; bottom: 62px; }
        .ngv-projectile-vector.gravity { right: 24px; top: 18px; }

        .ngv-force-block {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 52px;
          height: 34px;
          border-radius: 10px;
          background: rgba(255,255,255,0.12);
          transform: translate(-50%, -50%);
        }

        .ngv-force-arrow {
          position: absolute;
          color: rgba(255,255,255,0.88);
          font-size: 11px;
          font-weight: 800;
        }

        .ngv-force-arrow.left { left: 20px; top: 50%; transform: translateY(-50%); }
        .ngv-force-arrow.right { right: 20px; top: 50%; transform: translateY(-50%); }
        .ngv-force-arrow.up { left: 50%; top: 12px; transform: translateX(-50%); }
        .ngv-force-arrow.down { left: 50%; bottom: 12px; transform: translateX(-50%); }
        .ngv-force-arrow.balanced { opacity: 0.9; }
        .ngv-force-arrow.weak { opacity: 0.62; }
        .ngv-force-arrow.strong { font-size: 13px; text-shadow: 0 0 12px rgba(255,255,255,0.2); }

        .ngv-equilibrium-stage {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: 10px;
          padding: 14px;
        }

        .ngv-equilibrium-chamber {
          position: relative;
          min-height: 84px;
          border-radius: 14px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
        }

        .ngv-equilibrium-chamber.is-emphasis,
        .ngv-circulation-lungs.is-emphasis,
        .ngv-circulation-body.is-emphasis,
        .ngv-gene-node.is-emphasis {
          box-shadow: 0 0 0 1px rgba(255,255,255,0.08), 0 0 18px var(--ngv-accent-soft);
          background: rgba(255,255,255,0.1);
        }

        .ngv-equilibrium-axis {
          display: grid;
          gap: 6px;
          justify-items: center;
          color: rgba(255,255,255,0.8);
          font-size: 12px;
          font-weight: 800;
        }

        .particle {
          position: absolute;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: var(--ngv-accent);
          box-shadow: 0 0 12px var(--ngv-accent-soft);
        }

        .particle.a { left: 18px; top: 18px; animation: driftA 2.4s ease-in-out infinite; }
        .particle.b { left: 44px; bottom: 20px; animation: driftB 2.2s ease-in-out infinite; }
        .particle.c { right: 18px; top: 28px; animation: driftC 2.6s ease-in-out infinite; }
        .particle.p { left: 22px; top: 30px; animation: driftB 2.5s ease-in-out infinite; }
        .particle.q { right: 22px; bottom: 24px; animation: driftA 2.3s ease-in-out infinite; }

        .ngv-collision-stage {
          display: grid;
          place-items: center;
        }

        .ngv-collision-stage.is-success .ngv-collision-flash {
          filter: blur(6px);
        }

        .ngv-collision-particle {
          position: absolute;
          top: 50%;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: var(--ngv-accent);
          box-shadow: 0 0 14px var(--ngv-accent-soft);
        }

        .ngv-collision-particle.left { left: 18px; animation: collideLeft 2.1s ease-in-out infinite; }
        .ngv-collision-particle.right { right: 18px; animation: collideRight 2.1s ease-in-out infinite; }

        .ngv-collision-barrier {
          width: 2px;
          height: 78px;
          background: linear-gradient(180deg, transparent, rgba(255,255,255,0.45), transparent);
        }

        .ngv-collision-flash {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: rgba(255,255,255,0.9);
          filter: blur(4px);
          transform: translate(-50%, -50%) scale(0.2);
          animation: collisionFlash 2.1s ease-in-out infinite;
        }

        .ngv-circulation-stage {
          display: grid;
          grid-template-columns: 1fr 1fr;
          grid-template-rows: auto auto;
          gap: 10px;
          padding: 14px;
        }

        .ngv-circulation-heart,
        .ngv-circulation-lungs,
        .ngv-circulation-body,
        .ngv-gene-node {
          display: grid;
          place-items: center;
          border-radius: 14px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.88);
          font-size: 12px;
          font-weight: 800;
        }

        .ngv-circulation-heart { grid-column: 1 / 2; grid-row: 1 / 3; }
        .ngv-circulation-lungs { grid-column: 2 / 3; grid-row: 1 / 2; }
        .ngv-circulation-body { grid-column: 2 / 3; grid-row: 2 / 3; }

        .ngv-flow-dot {
          position: absolute;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          box-shadow: 0 0 12px rgba(255,255,255,0.18);
        }

        .ngv-flow-dot.pulmonary {
          background: #8bd3ff;
          animation: pulmonaryLoop 3.2s linear infinite;
        }

        .ngv-flow-dot.systemic {
          background: #ff9cbc;
          animation: systemicLoop 3.6s linear infinite;
        }

        .ngv-neuron {
          position: absolute;
          top: 50%;
          width: 36%;
          height: 18px;
          border-radius: 999px;
          background: rgba(255,255,255,0.12);
          transform: translateY(-50%);
        }

        .ngv-neuron.pre { left: 10%; }
        .ngv-neuron.post { right: 10%; }
        .ngv-synapse-gap {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 12%;
          height: 46px;
          border: 1px dashed rgba(255,255,255,0.16);
          transform: translate(-50%, -50%);
          border-radius: 12px;
        }

        .ngv-signal-impulse {
          position: absolute;
          left: 14%;
          top: 50%;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: var(--ngv-accent);
          transform: translateY(-50%);
          animation: impulseTravel 2.4s ease-in-out infinite;
        }

        .ngv-neurotransmitter {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #ffd47b;
          opacity: 0;
        }

        .ngv-neurotransmitter.t1 { animation: transmitter1 2.4s ease-in-out infinite; }
        .ngv-neurotransmitter.t2 { animation: transmitter2 2.4s ease-in-out infinite; }
        .ngv-neurotransmitter.t3 { animation: transmitter3 2.4s ease-in-out infinite; }

        .ngv-gene-stage {
          display: grid;
          grid-template-columns: 1fr auto 1fr auto 1fr;
          align-items: center;
          gap: 10px;
          padding: 14px;
        }

        .ngv-gene-link {
          width: 36px;
          height: 2px;
          background: linear-gradient(90deg, var(--ngv-accent), rgba(255,255,255,0.18));
          border-radius: 999px;
        }

        .ngv-gene-cursor {
          position: absolute;
          left: 14%;
          top: 50%;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: var(--ngv-accent);
          transform: translateY(-50%);
          animation: geneTravel 3.1s linear infinite;
        }

        .ngv-force-board {
          display: grid;
          gap: 8px;
        }

        .ngv-force-lane {
          position: relative;
          height: 14px;
          border-radius: 999px;
          background: rgba(255,255,255,0.06);
          overflow: hidden;
        }

        .ngv-force-vector {
          position: absolute;
          top: 50%;
          left: -24px;
          width: 32px;
          height: 4px;
          border-radius: 999px;
          background: var(--ngv-accent);
          transform: translateY(-50%);
        }

        .ngv-force-vector::after {
          content: "";
          position: absolute;
          right: -2px;
          top: 50%;
          width: 9px;
          height: 9px;
          border-top: 2px solid var(--ngv-accent);
          border-right: 2px solid var(--ngv-accent);
          transform: translateY(-50%) rotate(45deg);
        }

        .ngv-force-vector.lane-0 { animation: forceTravel 1.7s ease-in-out infinite; }
        .ngv-force-vector.lane-1 { animation: forceTravel 2.3s ease-in-out infinite reverse; }
        .ngv-force-vector.lane-2 { animation: forceTravel 1.9s ease-in-out infinite; }

        .ngv-scene-grid {
          display: grid;
          grid-template-columns: repeat(12, minmax(0, 1fr));
          gap: 12px;
        }

        .ngv-scene-biology,
        .ngv-scene-system,
        .ngv-scene-chemistry,
        .ngv-scene-organic,
        .ngv-scene-mechanics,
        .ngv-scene-genetics,
        .ngv-cycle-shell,
        .ngv-layers-shell {
          display: grid;
          gap: 12px;
        }

        .ngv-compare-shell {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          gap: 14px;
          align-items: start;
        }

        .ngv-compare-column {
          display: grid;
          gap: 12px;
        }

        .ngv-compare-divider {
          min-width: 26px;
          min-height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .ngv-compare-divider span {
          width: 2px;
          height: 100%;
          min-height: 180px;
          border-radius: 999px;
          background: linear-gradient(180deg, transparent, var(--ngv-accent), transparent);
        }

        .ngv-cycle-item {
          position: relative;
          display: grid;
          gap: 12px;
        }

        .ngv-cycle-orbit {
          position: absolute;
          inset: -6px;
          border-radius: 28px;
          border: 1px dashed rgba(255, 255, 255, 0.08);
          opacity: 0.7;
          pointer-events: none;
        }

        .ngv-cycle-return {
          display: flex;
          justify-content: center;
          padding-top: 6px;
        }

        .ngv-cycle-return span {
          width: 52px;
          height: 20px;
          border-left: 2px solid var(--ngv-accent);
          border-bottom: 2px solid var(--ngv-accent);
          border-radius: 0 0 0 18px;
          opacity: 0.75;
        }

        .ngv-layer-card {
          position: relative;
          transform: translateX(calc(var(--layer-index) * 8px));
        }

        .ngv-chain-item {
          display: grid;
          gap: 12px;
        }

        .ngv-scene-node,
        .ngv-semantic-node {
          position: relative;
          min-height: 100%;
          padding: 16px;
          border-radius: 22px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.025));
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
          animation: fadeLift 0.45s ease both;
        }

        .ngv-scene-node.is-active {
          border-color: var(--ngv-accent-strong);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 1px var(--ngv-accent-soft), 0 18px 36px rgba(0,0,0,0.18);
          transform: translateY(-2px);
        }

        .ngv-scene-node::before,
        .ngv-semantic-node::before {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          pointer-events: none;
          box-shadow: inset 0 0 0 1px var(--ngv-node-glow);
          opacity: 0.9;
        }

        .ngv-scene-node-top,
        .ngv-semantic-node-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 12px;
        }

        .ngv-scene-node-index,
        .ngv-scene-node-cue {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 34px;
          min-height: 34px;
          padding: 0 10px;
          border-radius: 12px;
          background: var(--ngv-accent-soft);
          color: var(--ngv-accent);
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.06em;
        }

        .ngv-scene-node-title,
        .ngv-semantic-node-label {
          margin-bottom: 8px;
          color: #fff;
          font-size: 15px;
          font-weight: 800;
          line-height: 1.35;
        }

        .ngv-scene-node-text,
        .ngv-scene-panel-text,
        .ngv-semantic-node-detail {
          margin: 0;
          color: rgba(255, 255, 255, 0.8);
          font-size: 13px;
          line-height: 1.7;
        }

        .ngv-scene-node-panels {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          gap: 10px;
          align-items: center;
        }

        .ngv-scene-panel {
          display: grid;
          gap: 6px;
        }

        .ngv-scene-panel-connector,
        .ngv-scene-connector,
        .ngv-semantic-link,
        .ngv-semantic-route {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .ngv-scene-panel-connector span,
        .ngv-scene-connector span,
        .ngv-semantic-link span,
        .ngv-semantic-route span {
          display: block;
          border-radius: 999px;
          background: linear-gradient(90deg, var(--ngv-accent), rgba(255, 255, 255, 0.15));
        }

        .ngv-scene-connector-vertical span,
        .ngv-semantic-link-vertical span {
          width: 2px;
          height: 24px;
          background: linear-gradient(180deg, var(--ngv-accent), rgba(255, 255, 255, 0.15));
        }

        .ngv-scene-panel-connector span,
        .ngv-semantic-link-horizontal span,
        .ngv-semantic-route span {
          width: 36px;
          height: 2px;
        }

        .ngv-semantic-link-horizontal,
        .ngv-semantic-link-vertical {
          flex-direction: column;
          gap: 6px;
        }

        .ngv-semantic-link small {
          color: rgba(255, 255, 255, 0.52);
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .ngv-semantic {
          display: grid;
          gap: 14px;
        }

        .ngv-semantic-triad {
          grid-template-columns: 1fr auto 1fr auto 1fr;
          align-items: start;
        }

        .ngv-semantic-chain .ngv-semantic-lane {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          align-items: stretch;
        }

        .ngv-semantic-lane-item {
          display: flex;
          align-items: center;
          gap: 12px;
          flex: 1 1 220px;
        }

        .ngv-semantic-column,
        .ngv-semantic-stack,
        .ngv-semantic-vertical {
          display: grid;
          gap: 12px;
        }

        .ngv-semantic-route {
          min-width: 40px;
          min-height: 100%;
        }

        .ngv-semantic-node-zone {
          color: var(--ngv-accent);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .ngv-memory-dock {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 10px;
          margin-top: 16px;
        }

        .ngv-detail-panel {
          display: grid;
          gap: 6px;
          margin-top: 14px;
          padding: 14px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.08);
          background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.025));
        }

        .ngv-detail-heading {
          color: rgba(255,255,255,0.54);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .ngv-detail-title {
          color: #fff;
          font-size: 14px;
          font-weight: 800;
          line-height: 1.4;
        }

        .ngv-detail-body {
          margin: 0;
          color: rgba(255,255,255,0.8);
          font-size: 13px;
          line-height: 1.7;
        }

        .ngv-node-picker {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 14px;
        }

        .ngv-node-pill.is-active {
          background: var(--ngv-accent-soft);
          color: var(--ngv-accent);
          border-color: var(--ngv-accent-strong);
        }

        .ngv-memory-card {
          position: relative;
          display: grid;
          gap: 6px;
          min-height: 78px;
          padding: 14px;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.025));
          animation: fadeLift 0.45s ease both;
        }

        .ngv-memory-label {
          color: rgba(255,255,255,0.54);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .ngv-memory-card strong {
          color: rgba(255,255,255,0.92);
          font-size: 13px;
          line-height: 1.5;
        }

        .span-4 {
          grid-column: span 4;
        }

        .span-6 {
          grid-column: span 6;
        }

        .span-8 {
          grid-column: span 8;
        }

        .span-12 {
          grid-column: span 12;
        }

        .accent-mint { --ngv-node-glow: rgba(126,224,164,0.2); }
        .accent-cyan { --ngv-node-glow: rgba(137,213,255,0.2); }
        .accent-amber { --ngv-node-glow: rgba(255,212,123,0.2); }
        .accent-rose { --ngv-node-glow: rgba(255,156,188,0.2); }
        .accent-violet { --ngv-node-glow: rgba(202,176,255,0.22); }

        .tone-organ,
        .tone-process,
        .tone-force,
        .tone-reaction,
        .tone-pressure,
        .tone-input,
        .tone-output,
        .tone-outcome,
        .ngv-semantic-node {
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.065), rgba(255, 255, 255, 0.03));
        }

        @keyframes fadeLift {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes pulseDot {
          0%, 100% {
            box-shadow: 0 0 0 0 var(--ngv-node-glow);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 0 8px rgba(255,255,255,0);
            transform: scale(1.08);
          }
        }

        @keyframes flowPulse {
          from { transform: translateX(0); }
          to { transform: translateX(calc(100% + 46px)); }
        }

        @keyframes spinRing {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @keyframes orbitSparkA {
          0% { transform: translate(0, -22px); }
          25% { transform: translate(22px, 0); }
          50% { transform: translate(0, 22px); }
          75% { transform: translate(-22px, 0); }
          100% { transform: translate(0, -22px); }
        }

        @keyframes orbitSparkB {
          0% { transform: translate(18px, 0); }
          25% { transform: translate(0, 18px); }
          50% { transform: translate(-18px, 0); }
          75% { transform: translate(0, -18px); }
          100% { transform: translate(18px, 0); }
        }

        @keyframes orbitSparkC {
          0% { transform: translate(-16px, -16px); }
          25% { transform: translate(16px, -16px); }
          50% { transform: translate(16px, 16px); }
          75% { transform: translate(-16px, 16px); }
          100% { transform: translate(-16px, -16px); }
        }

        @keyframes forceTravel {
          0% { transform: translate(-8px, -50%) scaleX(0.7); opacity: 0.45; }
          50% { transform: translate(calc(320% + 12px), -50%) scaleX(1); opacity: 1; }
          100% { transform: translate(calc(720% + 24px), -50%) scaleX(0.7); opacity: 0.45; }
        }

        @keyframes projectileArc {
          0% { transform: translate(0, 0); }
          35% { transform: translate(70px, -58px); }
          70% { transform: translate(142px, -36px); }
          100% { transform: translate(198px, 0); }
        }

        @keyframes driftA {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(4px, -5px); }
        }

        @keyframes driftB {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(-5px, 4px); }
        }

        @keyframes driftC {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(3px, 5px); }
        }

        @keyframes collideLeft {
          0%, 100% { transform: translate(0, -50%); }
          45% { transform: translate(108px, -50%); }
          55% { transform: translate(122px, -50%); }
        }

        @keyframes collideRight {
          0%, 100% { transform: translate(0, -50%); }
          45% { transform: translate(-108px, -50%); }
          55% { transform: translate(-122px, -50%); }
        }

        @keyframes collisionFlash {
          0%, 40%, 100% { opacity: 0; transform: translate(-50%, -50%) scale(0.2); }
          50% { opacity: 1; transform: translate(-50%, -50%) scale(1.4); }
        }

        @keyframes pulmonaryLoop {
          0% { left: 22%; top: 68%; }
          50% { left: 72%; top: 26%; }
          100% { left: 22%; top: 68%; }
        }

        @keyframes systemicLoop {
          0% { left: 26%; top: 40%; }
          50% { left: 74%; top: 74%; }
          100% { left: 26%; top: 40%; }
        }

        @keyframes impulseTravel {
          0% { left: 14%; opacity: 0.3; }
          45% { left: 42%; opacity: 1; }
          100% { left: 46%; opacity: 0; }
        }

        @keyframes transmitter1 {
          0%, 42%, 100% { opacity: 0; transform: translate(0, 0); }
          55% { opacity: 1; transform: translate(-6px, -10px); }
          75% { opacity: 0.8; transform: translate(12px, -2px); }
        }

        @keyframes transmitter2 {
          0%, 44%, 100% { opacity: 0; transform: translate(0, 0); }
          58% { opacity: 1; transform: translate(0, 8px); }
          78% { opacity: 0.8; transform: translate(14px, 6px); }
        }

        @keyframes transmitter3 {
          0%, 46%, 100% { opacity: 0; transform: translate(0, 0); }
          60% { opacity: 1; transform: translate(3px, -4px); }
          80% { opacity: 0.8; transform: translate(16px, -8px); }
        }

        @keyframes geneTravel {
          0% { left: 12%; }
          35% { left: 36%; }
          70% { left: 59%; }
          100% { left: 84%; }
        }

        @keyframes scanStage {
          0%, 100% {
            transform: translateY(0);
            opacity: 0;
          }
          15%, 85% {
            opacity: 0.55;
          }
          50% {
            transform: translateY(100%);
          }
        }

        @media (max-width: 860px) {
          .ngv-scene-grid,
          .ngv-semantic-triad,
          .ngv-compare-shell {
            grid-template-columns: 1fr;
          }

          .ngv-hud-reaction {
            grid-template-columns: 1fr;
          }

          .ngv-equilibrium-stage,
          .ngv-gene-stage {
            grid-template-columns: 1fr;
          }

          .ngv-controls {
            align-items: stretch;
          }

          .span-4,
          .span-6,
          .span-8,
          .span-12 {
            grid-column: span 1;
          }

          .ngv-semantic-route {
            min-height: 24px;
          }

          .ngv-semantic-route span,
          .ngv-semantic-link-horizontal span {
            width: 2px;
            height: 24px;
            background: linear-gradient(180deg, var(--ngv-accent), rgba(255, 255, 255, 0.15));
          }

          .ngv-semantic-lane {
            flex-direction: column;
          }

          .ngv-semantic-lane-item {
            flex-direction: column;
            align-items: stretch;
          }

          .ngv-compare-divider span {
            width: 100%;
            min-height: 2px;
            height: 2px;
          }

          .ngv-scene-node-panels {
            grid-template-columns: 1fr;
          }

          .ngv-scene-panel-connector span {
            width: 2px;
            height: 22px;
            background: linear-gradient(180deg, var(--ngv-accent), rgba(255, 255, 255, 0.15));
          }

          .ngv-layer-card {
            transform: none;
          }
        }
      `}</style>
    </section>
  );
}
