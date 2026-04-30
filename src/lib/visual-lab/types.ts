export type VisualSubject = "maths" | "physics" | "chemistry" | "nuclear";

export type VisualMode = "guided" | "custom";
export type VisualSceneMode = "learn" | "experiment" | "exam" | "compare";

export type VisualRendererKind =
  | "math-2d"
  | "math-3d"
  | "projectile"
  | "shm"
  | "pendulum"
  | "double-pendulum"
  | "wave-motion"
  | "wave-optics"
  | "ray-optics"
  | "electric-field"
  | "chemistry-steps"
  | "equilibrium"
  | "collision-theory"
  | "titration"
  | "electrochemical-cell"
  | "vsepr-geometry"
  | "nuclear-decay"
  | "half-life"
  | "nuclear-event"
  | "circular-motion"
  | "spring-mass"
  | "work-energy"
  | "energy-profile"
  | "radiation-penetration"
  | "template-preview";

export type VariableDef = {
  key: string;
  label: string;
  unit?: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
};

export type VisualObject = {
  id: string;
  label: string;
  kind: string;
  description: string;
  formulaConnection: string;
  neetTakeaway: string;
  commonMistake: string;
};

export type VisualStep = {
  id: string;
  label: string;
  detail: string;
  t: number;
};

export type VisualCinematicBeat = VisualStep & {
  formula?: string;
  focus?: string;
  examCue?: string;
  accent?: string;
};

export type VisualCinematic = {
  version: 2;
  duration?: number;
  accent?: string;
  formula?: string;
  examFocus?: string;
  beats: VisualCinematicBeat[];
};

export type VisualPreset = {
  id: string;
  label: string;
  description: string;
  values?: VariableValues;
  equations?: string[];
  surfaceExpression?: string;
};

export type VisualExamCheck = {
  id: string;
  prompt: string;
  answer: string;
  explanation: string;
};

export type ReactionTemplate = {
  reactants: string[];
  products: string[];
  balancedEquation: string;
  ionicEquation?: string;
  energyProfile?: string;
  verifiedLimitations: string[];
};

export type VisualConcept = {
  id: string;
  title: string;
  subject: VisualSubject;
  chapter: string;
  difficulty: "Foundation" | "NEET Core" | "Advanced NEET";
  readiness?: "working" | "template-ready" | "preview";
  description: string;
  formulas: string[];
  variables: VariableDef[];
  renderer: VisualRendererKind;
  defaultEquations?: string[];
  defaultSurface?: string;
  verifiedFacts: string[];
  neetTakeaways: string[];
  commonMistakes: string[];
  visualObjects: VisualObject[];
  steps: VisualStep[];
  cinematic?: VisualCinematic;
  presets?: VisualPreset[];
  examChecks?: VisualExamCheck[];
  reactionTemplate?: ReactionTemplate;
  aiContext: {
    constraints: string[];
    sourceOfTruth: string;
  };
};

export type VariableValues = Record<string, number>;

export type SelectedVisualObject = VisualObject & {
  x?: number;
  y?: number;
};

export type TutorRequestPayload = {
  concept: Pick<
    VisualConcept,
    | "id"
    | "title"
    | "subject"
    | "chapter"
    | "difficulty"
    | "description"
    | "formulas"
    | "verifiedFacts"
    | "neetTakeaways"
    | "commonMistakes"
  >;
  currentStep: VisualStep | null;
  selectedObject: SelectedVisualObject | null;
  variables: VariableValues;
  equations: string[];
  surfaceExpression?: string;
  sceneMode?: VisualSceneMode;
  currentBeat?: VisualCinematicBeat | null;
  activeSnapshot?: {
    label: string;
    conceptId: string;
    values: VariableValues;
    equations: string[];
    surfaceExpression?: string;
  } | null;
  snapshotDiff?: string[];
  validationErrors?: string[];
  missionStatus?: {
    activeStep: string;
    completedSteps: string[];
    mastery: number;
  };
  practiceContext?: {
    attempts: number;
    correct: number;
    lastQuestion?: string;
    lastCorrect?: boolean;
  };
  notebookContext?: {
    noteCount: number;
    latestNote?: string;
  };
  studentLevel: "NCERT" | "NEET" | "Deep";
  mode: "why" | "how" | "deep" | "practice";
  question: string;
};
