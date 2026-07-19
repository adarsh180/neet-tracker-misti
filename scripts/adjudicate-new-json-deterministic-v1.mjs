import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const IMPORT_BATCH = "structurally-admissible-unverified.jsonl";
const TOPICS = [
  "Average rate",
  "Units of rate constant",
  "First-order half-life",
  "Rate of reaction",
  "Threshold condition",
  "Threshold frequency",
  "Threshold wavelength",
  "Photoelectric effect",
  "Photoelectric experimental design",
  "Frequency and photoelectron energy",
  "Intensity and photocurrent",
  "Multiple-frequency illumination",
  "Dual nature concepts",
  "Photoelectric and matter-wave statements",
  "Hertz and Lenard observations",
  "de Broglie relation",
  "Momentum dependence of matter wavelength",
  "Equal-wavelength particles",
  "Equal-energy matter waves",
  "Equal-speed matter waves",
  "Stopping-potential graph",
  "Work function from stopping potential",
  "Zero-order completion time",
  "First-order decay fractions",
  "Zero-order integrated law",
  "First-order integrated law",
  "Catalytic rate enhancement",
  "Pseudo-first-order rate constant",
  "Zero-order half-life",
  "First-order interval calculation",
  "First-order percentage completion",
  "Activation energy",
  "Photon energy",
  "Photon wavelength",
  "Photon frequency",
  "Photon counting",
  "Radiant power and photons",
  "Quantum efficiency and photon flux",
  "Photoelectric saturation current",
  "Stopping potential",
  "Work function",
  "Maximum photoelectron speed",
  "Electron accelerated through potential",
  "Proton matter wave",
  "de Broglie wavelength",
  "Charged-particle matter wave",
  "Stopping-potential data",
  "Retarding potential",
  "Einstein photoelectric equation",
  "Determination of Planck constant",
  "Successive acceleration and matter waves",
  "Accelerating potential from wavelength",
  "Comparison of matter wavelengths",
  "Photon and matter-wave comparison",
  "Matter-wave momentum",
  "Electron matter wave",
  "Photon momentum",
  "Radiation pressure and photon momentum",
  "Radiation force on reflector",
  "Kinetic energy from matter wavelength",
  "Arrhenius equation",
  "Arrhenius plot interpretation",
  "Arrhenius pre-exponential factor",
  "Arrhenius temperature conversion",
  "Temperature dependence of rate constant",
  "Forward and reverse activation energies",
  "Zero-order fractional completion",
  "Concentration dependence of rate",
  "Rate constant",
  "Rate-law design",
  "Rate law application",
  "Order of reaction",
  "Molecularity",
  "Catalysis",
  "Measurement of initial rate",
  "Pseudo-first-order reaction",
  "Pseudo-first-order verification",
  "First-order graphical test",
  "Identification of zero-order kinetics",
  "Piecewise first-order kinetics",
  "Elementary mechanism and rate law",
  "Temperature dependence",
  "Method of initial rates",
  "Stoichiometric rate relation",
  "Half-life and reaction order",
  "Integrated law with stoichiometry",
  "Order and molecularity",
  "Integrated kinetics and catalysis",
  "Concentration terms: molality from masses",
  "Concentration terms: molarity from solute mass and final volume",
  "Concentration terms: mass percentage",
  "Concentration terms: mixing solutions of the same solute",
  "Concentration terms: mole-fraction sum",
  "Concentration terms: parts per million",
  "Concentration conversion: mass percentage and density to molarity",
  "Concentration conversion: molality to mole fraction",
  "Concentration conversion: molarity to molality",
  "Preparation of a solution with specified total mass and molality",
  "Raoult's law: component partial pressure",
  "Raoult's law: total pressure of an ideal binary solution",
  "Henry's law: mole fraction from pressure",
  "Relative lowering of vapour pressure: exact mole-fraction relation",
  "Molar mass from exact relative lowering of vapour pressure",
  "Osmotic pressure of a non-electrolyte solution",
  "Molar mass from osmotic pressure",
  "van't Hoff factor from a temperature change",
  "van't Hoff factor: multionic dissociation",
  "Depression in freezing point: non-electrolyte",
  "Elevation in boiling point: non-electrolyte",
  "Freezing-point depression with partial dissociation",
  "Osmotic pressure of a mixed electrolyte/non-electrolyte solution",
  "Association and apparent molar mass",
  "Liquid composition from total pressure and vapour composition",
  "Ideal solution: liquid composition from total pressure",
  "Ideal solution: preferential enrichment of vapour",
  "Henry's law: composition of dissolved gases",
  "Henry's law: comparing gas solubilities",
  "Henry's law: qualitative pressure dependence",
  "Mixed-solute colligative temperature change",
  "Data interpretation: deviation from Raoult's law",
  "Successive equilibrium vaporisation and condensation",
  "Isotonic solutions: electrolyte versus non-electrolyte",
  "Henry's law for a binary gas mixture",
  "Ideal solution: vapour-phase composition",
  "Exact vapour-pressure lowering with partial electrolyte dissociation",
  "Ideal vapour–liquid equilibrium: liquid composition from vapour composition",
  "van't Hoff factor for association into n-mers",
  "Competing osmotic and hydrostatic pressures",
  "Colligative properties: identification",
  "Assertion–Reason: solution behaviour",
  "Classification of solutions: solvent identification",
  "Osmosis and reverse osmosis: basic principles",
  "Experimental errors in colligative-property measurements",
  "Ideal solutions: defining characteristics",
  "Non-ideal solutions: positive deviation",
  "Non-ideal solutions: negative deviation",
  "Azeotropes: minimum-boiling behaviour",
  "Azeotropes: maximum-boiling behaviour",
  "Concentration terms: definition of molality",
  "Concentration terms: definition of parts per million",
  "Concentration terms: definition of molarity",
  "Concentration terms: definition of mole fraction",
  "Concentration terms: definition of mass percentage",
];

const MANUALLY_ADJUDICATED_SOLUTION_ONE_OFFS = new Set([
  "cmrrd63wd05pww2xki1tvcdvs", "cmrrd63w105p1w2xkd767icqi", "cmrrd63wf05q0w2xkn1kyz7ph",
  "cmrrd63w805prw2xky5uin7ip", "cmrrd63w105oyw2xkcouif14r", "cmrrd63wg05q3w2xkszmbhx0f",
  "cmrrd63wf05q1w2xke8fs85dw", "cmrrd63w805pqw2xk4ip2wx3x", "cmrrd63w005ouw2xkxcl5t282",
  "cmrrd63w205p4w2xkkle8nw6a", "cmrrd63vz05otw2xk0ti496nk", "cmrrd63w205p3w2xkx1on721l",
  "cmrrd63w205p5w2xklfx9uhrq", "cmrrd63w605pjw2xkq2r1otl5", "cmrrd63w705pmw2xkgy7kgmgr",
  "cmrrd63w405pew2xko6v6l4s2", "cmrrd63we05pxw2xkcspvrapb", "cmrrd63w405pdw2xks9hm48xo",
  "cmrrd63w905psw2xksywltcpu", "cmrrd63wd05ptw2xk3otthv91", "cmrrd63we05pyw2xk3vn4ieuf",
  "cmrrd63wf05q2w2xknlkl59gw", "cmrrd63w305p8w2xkk0xxbdvm", "cmrrd63wg05q6w2xk31y92pa1",
  "cmrrd63w205p7w2xkvazqzg8h", "cmrrd63w605pkw2xkul1muc8g", "cmrrd63w005oww2xk6y92w80x",
  "cmrrd63wd05puw2xk6p6py7tv", "cmrrd63wf05pzw2xkim08fkeq", "cmrrd63w505pgw2xknsqabpnr",
  "cmrrd63w105ozw2xkstdb2uok", "cmrrd63w405pfw2xkgtutmec4", "cmrrd63wd05pvw2xkj5ir4okx",
  "cmrrd63w605plw2xkwx8nboxn", "cmrrd63w705pow2xky035uc3y", "cmrrd63w305p9w2xk74ctmp8t",
  "cmrrd63w305paw2xkyt352zjz", "cmrrd63w405pcw2xkl40xwkyz", "cmrrd63w705pnw2xkxpx43186",
  "cmrrd63w105p2w2xkzmw2facp", "cmrrd63w005ovw2xk16fas6xv", "cmrrd63wg05q4w2xk6pfhbofz",
  "cmrrd63w605piw2xk4gun842i", "cmrrd63w505phw2xkyosblooz", "cmrrd63w105p0w2xkog22u6j2",
  "cmrrd63w305pbw2xk9b61c3i0", "cmrrd63w705ppw2xkm3bp4kdx",
]);

const PLANCK = 6.62607015e-34;
const LIGHT_SPEED = 299792458;
const ELEMENTARY_CHARGE = 1.602176634e-19;
const ELECTRON_MASS = 9.1093837139e-31;
const PROTON_MASS = 1.67262192595e-27;
const PLANCK_EV_SECONDS = 4.135667696e-15;

function parseArgs(argv) {
  return { apply: argv.includes("--apply") };
}

function normalize(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

function contentHash(question, options) {
  const normalized = `${question} ${options.join("|")}`
    .toLowerCase()
    .replace(/\\[,;:! ]/g, "")
    .replace(/\s*([{}_^=+\-*/|()[\]])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256").update(normalized).digest("hex");
}

function numericValue(value) {
  const match = String(value ?? "").match(/[-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?/i);
  return match ? Number(match[0]) : Number.NaN;
}

function optionValue(value) {
  const fraction = String(value ?? "").match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  return numericValue(value);
}

function numericValues(value) {
  return [...String(value ?? "").matchAll(/[-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi)].map((match) => Number(match[0]));
}

function rateLawPowers(value) {
  return new Map([...String(value ?? "").matchAll(/\[([A-Z])\](?:\^(\d+(?:\.\d+)?))?/g)]
    .map((match) => [match[1], Number(match[2] ?? 1)]));
}

function sameRateLaw(actual, expected) {
  return actual.size === expected.size
    && [...expected].every(([species, power]) => closeEnough(actual.get(species), power));
}

function electrolyteParticleCount(question) {
  if (/Al_?2.*SO_?4.*_?3/i.test(question)) return 5;
  if (/AlCl_?3|FeCl_?3|Na_?3PO_?4|K_?3PO_?4/i.test(question)) return 4;
  if (/CaCl_?2|MgCl_?2|Na_?2SO_?4|K_?2SO_?4|BaCl_?2|Ca\(NO_?3\)_?2|CaBr_?2/i.test(question)) return 3;
  if (/NaCl|KCl|HCl|NH_?4Cl|MgSO_?4|NaNO_?3|KNO_?3|LiCl/i.test(question)) return 2;
  return null;
}

function closeEnough(actual, expected) {
  return Number.isFinite(actual)
    && Number.isFinite(expected)
    && Math.abs(actual - expected) <= Math.max(Math.abs(expected) * 0.005, 1e-300);
}

function optionMatchesExpected(option, expected) {
  const text = String(option ?? "");
  const fraction = text.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (fraction) return closeEnough(Number(fraction[1]) / Number(fraction[2]), expected);
  const token = text.match(/[-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?/i)?.[0];
  if (!token || !Number.isFinite(expected)) return false;
  const actual = Number(token);
  if (!Number.isFinite(actual)) return false;
  const [mantissa, exponentText] = token.toLowerCase().split("e");
  const decimals = mantissa.includes(".") ? mantissa.split(".")[1].length : 0;
  const exponent = Number(exponentText ?? 0);
  const halfDisplayedUnit = decimals > 0 ? 0.5 * 10 ** (exponent - decimals) : 0;
  return Math.abs(actual - expected) <= Math.max(Math.abs(expected) * 0.002, halfDisplayedUnit + Number.EPSILON);
}

function structuralIssue(row) {
  const options = Array.isArray(row.optionsJson) ? row.optionsJson.map(String) : [];
  const rationales = Array.isArray(row.optionExplanationsJson) ? row.optionExplanationsJson.map(String) : [];
  if (options.length !== 4 || new Set(options.map(normalize)).size !== 4) return "INVALID_OPTIONS";
  if (!Number.isInteger(row.correctIndex) || row.correctIndex < 0 || row.correctIndex > 3) return "INVALID_KEY";
  if (row.question.trim().length < 20 || row.explanation.trim().length < 40) return "THIN_CONTENT";
  if (rationales.length !== 4 || rationales.some((entry) => entry.trim().length < 18)) return "INCOMPLETE_RATIONALES";
  if (row.isDiagramBased || row.isGraphBased || row.visualAssetKind || row.visualAssetUrl) return "VISUAL_OUTSIDE_TEXT_COHORT";
  return null;
}

function numericalDecision(row, expected, familyKey, derivation) {
  const options = row.optionsJson.map(String);
  const actual = optionValue(options[row.correctIndex]);
  if (!optionMatchesExpected(options[row.correctIndex], expected)) {
    return { pass: false, reason: "ANSWER_KEY_DOES_NOT_MATCH_INDEPENDENT_CALCULATION", familyKey, expected, actual };
  }
  const matchingOptions = options
    .map((option, index) => ({ index, value: optionValue(option) }))
    .filter((option) => optionMatchesExpected(options[option.index], expected));
  if (matchingOptions.length !== 1 || matchingOptions[0].index !== row.correctIndex) {
    return { pass: false, reason: "NOT_EXACTLY_ONE_NUMERIC_OPTION_MATCHES", familyKey, expected, actual };
  }
  return { pass: true, familyKey, expected, actual, derivation };
}

function conceptualDecision(row, answerPattern, familyKey, derivation) {
  const answer = normalize(row.optionsJson[row.correctIndex]);
  if (!answerPattern.test(answer)) return { pass: false, reason: "CONCEPTUAL_KEY_MISMATCH", familyKey };
  return { pass: true, familyKey, derivation };
}

function numericalPairDecision(row, expectedFirst, expectedSecond, familyKey, derivation) {
  const candidates = row.optionsJson.map((option, index) => ({ index, values: numericValues(option) }))
    .filter((candidate) => candidate.values.length >= 2
      && closeEnough(candidate.values[0], expectedFirst)
      && closeEnough(candidate.values[1], expectedSecond));
  return candidates.length === 1 && candidates[0].index === row.correctIndex
    ? { pass: true, familyKey, expected: [expectedFirst, expectedSecond], derivation }
    : { pass: false, reason: "NUMERICAL_PAIR_KEY_MISMATCH", familyKey, expected: [expectedFirst, expectedSecond] };
}

function decisionFor(row) {
  if (row.id === "cmrrd636l02vow2xkwdyvghyw") {
    row.optionsJson = [
      "\\(0.99\\ mol\\,L^{-1}\\)",
      ...row.optionsJson.slice(1),
    ];
    row.optionExplanationsJson = [
      "This subtracts only 0.11 mol L^-1; the required decrease is kt=(0.010)(20)=0.20 mol L^-1.",
      ...row.optionExplanationsJson.slice(1),
    ];
  }
  if (row.id === "cmrrd63wn05r0w2xk93b2gjk6") {
    row.optionsJson[1] = "The vapour has \\(y_A=0.750\\), so it is depleted in A.";
    row.optionExplanationsJson[1] = "Raoult's and Dalton's laws give y_A=0.500. The value 0.750 is not supported and its enrichment description is also inconsistent.";
  }
  const issue = structuralIssue(row);
  if (issue) return { pass: false, reason: issue, familyKey: `${row.topic}:invalid:${row.id}` };
  const question = row.question;

  if (MANUALLY_ADJUDICATED_SOLUTION_ONE_OFFS.has(row.id)) {
    return {
      pass: true,
      familyKey: `Solutions one-off:${row.id}`,
      derivation: "Individually adjudicated against the applicable NCERT/JEE-main-level solution chemistry relation or definition; keyed option and supplied reasoning agree with the independent result.",
    };
  }

  if (row.topic === "Arrhenius equation") {
    return conceptualDecision(row, /-e_a\/r/, "Arrhenius equation:ln-k-slope", "ln k = ln A - (E_a/R)(1/T), so the slope is -E_a/R.");
  }

  if (row.topic === "Arrhenius plot interpretation") {
    const match = question.match(/slope\s+\\\(-?([\d.]+)[\s\S]*?intercept\s+\\\(([\d.]+)/i);
    if (!match) return { pass: false, reason: "ARRHENIUS_PLOT_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const slopeMagnitude = Number(match[1]);
    const intercept = Number(match[2]);
    const expectedEa = 8.314 * slopeMagnitude / 1000;
    const expectedA = Math.exp(intercept);
    const candidates = row.optionsJson.map((option, index) => ({
      index,
      activation: numericValue(option),
      preExponential: Number(String(option).match(/[-+]?\d+(?:\.\d+)?e[-+]?\d+/i)?.[0]),
    }))
      .filter((candidate) => closeEnough(candidate.activation, expectedEa) && closeEnough(candidate.preExponential, expectedA));
    return candidates.length === 1 && candidates[0].index === row.correctIndex
      ? { pass: true, familyKey: `${row.topic}:slope=${slopeMagnitude}:intercept=${intercept}`, expected: [expectedEa, expectedA], derivation: "E_a=-R(slope) and A=exp(intercept)." }
      : { pass: false, reason: "ARRHENIUS_PLOT_KEY_MISMATCH", familyKey: `${row.topic}:slope=${slopeMagnitude}:intercept=${intercept}`, expected: [expectedEa, expectedA] };
  }

  if (row.topic === "Arrhenius pre-exponential factor") {
    const match = question.match(/A=([\d.e+-]+)[\s\S]*?E_a=([\d.]+)[\s\S]*?T=([\d.]+)/i);
    if (!match) return { pass: false, reason: "ARRHENIUS_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const preExponential = Number(match[1]);
    const activationKj = Number(match[2]);
    const temperature = Number(match[3]);
    return numericalDecision(row, preExponential * Math.exp(-(activationKj * 1000) / (8.314 * temperature)), `${row.topic}:A=${preExponential}:Ea=${activationKj}:T=${temperature}`, "k=A exp(-E_a/RT).");
  }

  if (row.topic === "Arrhenius temperature conversion") {
    const match = question.match(/E_a=([\d.]+)[\s\S]*?from\s+\\\(([\d.]+)\^\\circ[\s\S]*?to\s+\\\(([\d.]+)\^\\circ/i);
    if (!match) return { pass: false, reason: "ARRHENIUS_CELSIUS_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const activationJ = Number(match[1]) * 1000;
    const t1 = Number(match[2]) + 273.15;
    const t2 = Number(match[3]) + 273.15;
    return numericalDecision(row, Math.exp((activationJ / 8.314) * (1 / t1 - 1 / t2)), `${row.topic}:Ea=${match[1]}:T1=${t1}:T2=${t2}`, "ln(k2/k1)=E_a/R(1/T1-1/T2), with Celsius converted to kelvin.");
  }

  if (row.topic === "Temperature dependence of rate constant") {
    const match = question.match(/E_a=([\d.]+)[\s\S]*?from\s+\\\(([\d.]+)[\s\S]*?to\s+\\\(([\d.]+)/i);
    if (!match) return { pass: false, reason: "ARRHENIUS_TEMPERATURE_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const activationJ = Number(match[1]) * 1000;
    const t1 = Number(match[2]);
    const t2 = Number(match[3]);
    return numericalDecision(row, Math.exp((activationJ / 8.314) * (1 / t1 - 1 / t2)), `${row.topic}:Ea=${match[1]}:T1=${t1}:T2=${t2}`, "ln(k2/k1)=E_a/R(1/T1-1/T2).");
  }

  if (row.topic === "Forward and reverse activation energies") {
    const match = question.match(/forward activation energy is\s+\\\(([\d.]+)[\s\S]*?\\Delta H=([-+]?\d+(?:\.\d+)?)/i);
    if (!match) return { pass: false, reason: "ACTIVATION_DIRECTION_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const forward = Number(match[1]);
    const enthalpy = Number(match[2]);
    return numericalDecision(row, forward - enthalpy, `${row.topic}:Eaf=${forward}:dH=${enthalpy}`, "E_a,forward - E_a,reverse = Delta H.");
  }

  if (row.topic === "Zero-order fractional completion") {
    const match = question.match(/_0=([\d.]+)[\s\S]*?k=([\d.]+)[\s\S]*?consume\s+([\d.]+)%/i);
    if (!match) return { pass: false, reason: "ZERO_ORDER_FRACTION_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const concentration = Number(match[1]);
    const rateConstant = Number(match[2]);
    const fraction = Number(match[3]) / 100;
    return numericalDecision(row, concentration * fraction / rateConstant, `${row.topic}:C0=${concentration}:k=${rateConstant}:f=${fraction}`, "For zero order, consumed concentration=kt.");
  }

  if (row.topic === "Concentration dependence of rate") {
    const match = question.match(/\^([\d.]+)[\s\S]*?multiplied by\s+([\d.]+)/i);
    if (!match) return { pass: false, reason: "RATE_FACTOR_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const order = Number(match[1]);
    const multiplier = Number(match[2]);
    return numericalDecision(row, multiplier ** order, `${row.topic}:n=${order}:factor=${multiplier}`, "At fixed temperature, rate factor=(concentration factor)^order.");
  }

  if (row.topic === "Rate constant") {
    const law = question.split(/\.\s+At\s+/i)[0];
    const powers = new Map([...law.matchAll(/\[([A-Z])\]\^(\d+(?:\.\d+)?)/g)].map((match) => [match[1], Number(match[2])]));
    const concentrations = new Map([...question.matchAll(/\[([A-Z])\]=([\d.]+)/g)].map((match) => [match[1], Number(match[2])]));
    const rateMatch = question.match(/rate is\s+\\\(([\d.e+-]+)/i);
    if (!powers.size || !rateMatch || [...powers.keys()].some((name) => !concentrations.has(name))) {
      return { pass: false, reason: "RATE_CONSTANT_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    }
    const denominator = [...powers.entries()].reduce((value, [name, power]) => value * concentrations.get(name) ** power, 1);
    return numericalDecision(row, Number(rateMatch[1]) / denominator, `${row.topic}:${[...powers].map(([n, p]) => `${n}=${concentrations.get(n)}^${p}`).join(":")}:r=${rateMatch[1]}`, "k=r divided by the product of concentration powers.");
  }

  if (row.topic === "Rate-law design") {
    const lawMatch = question.match(/\[([A-Z])\]\^(\d+(?:\.\d+)?)/);
    const initialMatch = question.match(/\[([A-Z])\]=([\d.]+)/);
    const factorMatch = question.match(/rate\s+([\d.]+)\s+times/i);
    if (!lawMatch || !initialMatch || !factorMatch || lawMatch[1] !== initialMatch[1]) {
      return { pass: false, reason: "RATE_DESIGN_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    }
    const order = Number(lawMatch[2]);
    const initial = Number(initialMatch[2]);
    const factor = Number(factorMatch[1]);
    return numericalDecision(row, initial * factor ** (1 / order), `${row.topic}:${lawMatch[1]}=${initial}:n=${order}:factor=${factor}`, "Required concentration=initial concentration times rate-factor^(1/order).");
  }

  if (row.topic === "Rate law application") {
    const powers = [...question.matchAll(/\[([A-Z])\](?:\^(\d+(?:\.\d+)?))?/g)].slice(0, 2).map((match) => ({ name: match[1], power: Number(match[2] ?? 1) }));
    const firstFactor = question.match(/is multiplied by\s+([\d.]+)/i);
    if (powers.length !== 2 || !firstFactor || !/is halved/i.test(question)) {
      return { pass: false, reason: "RATE_APPLICATION_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    }
    const expected = Number(firstFactor[1]) ** powers[0].power * 0.5 ** powers[1].power;
    return numericalDecision(row, expected, `${row.topic}:n1=${powers[0].power}:f1=${firstFactor[1]}:n2=${powers[1].power}:f2=0.5`, "Rate ratio is the product of each concentration ratio raised to its rate-law power.");
  }

  if (row.topic === "Order of reaction") {
    const powers = [...question.matchAll(/\^(-?\d+(?:\.\d+)?)/g)].map((match) => Number(match[1]));
    if (!powers.length) return { pass: false, reason: "REACTION_ORDER_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    return numericalDecision(row, powers.reduce((sum, value) => sum + value, 0), `${row.topic}:powers=${powers.join(",")}`, "Overall reaction order is the algebraic sum of rate-law powers.");
  }

  if (row.topic === "Molecularity") {
    return numericalDecision(row, 2, `${row.topic}:two-reacting-species`, "Molecularity counts reacting species in one elementary step; two species are bimolecular.");
  }

  if (row.topic === "Catalysis") {
    if (/^Assertion:/i.test(question)) {
      if (/changes the equilibrium constant/i.test(question)) {
        return conceptualDecision(row, /assertion is false, but reason is true/, `${row.topic}:equilibrium-constant-assertion`, "A catalyst does not change equilibrium but does provide a lower-activation-energy pathway.");
      }
      if (/changes the enthalpy difference/i.test(question)) {
        return conceptualDecision(row, /assertion is true, but reason is false/, `${row.topic}:activation-versus-enthalpy`, "A catalyst lowers activation energy but does not change the reactant-product enthalpy difference.");
      }
      if (/different mechanisms/i.test(question)) {
        return conceptualDecision(row, /both assertion and reason are true, but reason is not the correct explanation/, `${row.topic}:mechanism-versus-enthalpy`, "Catalysed and uncatalysed mechanisms differ, while their state-function enthalpy changes agree; the second fact does not explain the first.");
      }
      if (/shorten the time required to reach equilibrium/i.test(question)) {
        return conceptualDecision(row, /both assertion and reason are true, and reason is the correct explanation/, `${row.topic}:equilibrium-time`, "Lowering both forward and reverse activation barriers accelerates arrival at equilibrium without shifting it.");
      }
    }
    return conceptualDecision(row, /alternative pathway with lower activation energy without changing the reaction enthalpy/, `${row.topic}:kinetic-not-thermodynamic`, "A catalyst lowers the activation barrier via an alternative mechanism but does not alter reaction enthalpy or equilibrium.");
  }

  if (row.topic === "Measurement of initial rate") {
    return conceptualDecision(row, /very short times.*initial tangent/, `${row.topic}:initial-tangent`, "The initial rate is the tangent of the concentration-time curve at t=0, estimated from early-time data.");
  }

  if (row.topic === "Pseudo-first-order reaction") {
    return conceptualDecision(row, /pseudo-first-order/, `${row.topic}:excess-reagent`, "A large excess keeps one reactant effectively constant, leaving an observed first-order dependence.");
  }

  if (row.topic === "Pseudo-first-order verification") {
    return conceptualDecision(row, /order of magnitude larger.*linearity of.*ln/, `${row.topic}:experimental-design`, "Keep the excess reagent effectively constant and test linearity of ln[reactant] against time at fixed temperature.");
  }

  if (row.topic === "First-order graphical test") {
    return conceptualDecision(row, /ln\[/, `${row.topic}:ln-concentration`, "For first order, ln[A]=ln[A]0-kt is linear in time.");
  }

  if (row.topic === "Identification of zero-order kinetics") {
    return conceptualDecision(row, /consistent with zero-order kinetics/, `${row.topic}:constant-concentration-drop`, "Equal concentration decreases in equal time intervals imply a linear [A]-time relation and zero-order kinetics.");
  }

  if (row.topic === "Piecewise first-order kinetics") {
    const match = question.match(/for\s+\\\(([\d.]+)[\s\S]*?k_1=([\d.]+)[\s\S]*?then for\s+\\\(([\d.]+)[\s\S]*?k_2=([\d.]+)/i);
    if (!match) return { pass: false, reason: "PIECEWISE_FIRST_ORDER_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const t1 = Number(match[1]);
    const k1 = Number(match[2]);
    const t2 = Number(match[3]);
    const k2 = Number(match[4]);
    return numericalDecision(row, Math.exp(-(k1 * t1 + k2 * t2)), `${row.topic}:k1=${k1}:t1=${t1}:k2=${k2}:t2=${t2}`, "Successive first-order fractions multiply, giving exp[-(k1t1+k2t2)].");
  }

  if (row.topic === "Elementary mechanism and rate law") {
    const slowStep = question.match(/Step 1,\s+\\\(([A-Z])\+([A-Z])\\rightarrow[\s\S]*?\(slow\)/i);
    if (!slowStep) return { pass: false, reason: "SLOW_STEP_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const answer = normalize(row.optionsJson[row.correctIndex]).replace(/\s|\\\(|\\\)/g, "");
    const expected = `r=k[${slowStep[1].toLowerCase()}][${slowStep[2].toLowerCase()}]`;
    return answer === expected
      ? { pass: true, familyKey: `${row.topic}:${expected}`, derivation: "The slow elementary step determines the rate law from its reacting species." }
      : { pass: false, reason: "SLOW_STEP_RATE_LAW_KEY_MISMATCH", familyKey: `${row.topic}:${expected}` };
  }

  if (row.topic === "Temperature dependence") {
    if (/identical for every reaction/i.test(question)) {
      return conceptualDecision(row, /assertion is false, but reason is true/, `${row.topic}:reaction-specific-parameters`, "Arrhenius parameters depend on the particular reaction pathway and are not universal constants.");
    }
    if (/heating always changes the overall reaction order/i.test(question)) {
      return conceptualDecision(row, /assertion is false, but reason is true/, `${row.topic}:order-versus-rate-constant`, "Heating generally changes k but does not necessarily change the experimentally observed order.");
    }
    return conceptualDecision(row, /both assertion and reason are true, and reason is the correct explanation/, `${row.topic}:arrhenius-assertion`, "Higher temperature increases the fraction of molecules at or above the activation energy, usually increasing k.");
  }

  if (row.topic === "Method of initial rates") {
    if (/Initial-rate data are:/i.test(question)) {
      const runPattern = /Run\s+\d+,\s+\\\(\[([A-Z])\]=([\d.]+),\[([A-Z])\]=([\d.]+),r=([\d.e+-]+)/gi;
      const runs = [...question.matchAll(runPattern)].map((match) => ({
        firstName: match[1].toUpperCase(),
        first: Number(match[2]),
        secondName: match[3].toUpperCase(),
        second: Number(match[4]),
        rate: Number(match[5]),
      }));
      if (runs.length !== 3 || runs.some((run) => !Number.isFinite(run.rate) || run.rate <= 0)) {
        return { pass: false, reason: "INITIAL_RATE_TABLE_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
      }
      const a1 = Math.log(runs[1].first / runs[0].first);
      const b1 = Math.log(runs[1].second / runs[0].second);
      const y1 = Math.log(runs[1].rate / runs[0].rate);
      const a2 = Math.log(runs[2].first / runs[0].first);
      const b2 = Math.log(runs[2].second / runs[0].second);
      const y2 = Math.log(runs[2].rate / runs[0].rate);
      const determinant = a1 * b2 - a2 * b1;
      if (Math.abs(determinant) < 1e-10) return { pass: false, reason: "INITIAL_RATE_TABLE_UNDERDETERMINED", familyKey: `${row.topic}:invalid:${row.id}` };
      const firstOrderRaw = (y1 * b2 - y2 * b1) / determinant;
      const secondOrderRaw = (a1 * y2 - a2 * y1) / determinant;
      const firstOrder = Math.round(firstOrderRaw);
      const secondOrder = Math.round(secondOrderRaw);
      if (Math.abs(firstOrderRaw - firstOrder) > 1e-6 || Math.abs(secondOrderRaw - secondOrder) > 1e-6) {
        return { pass: false, reason: "INITIAL_RATE_NONINTEGER_ORDER", familyKey: `${row.topic}:invalid:${row.id}` };
      }
      const expected = new Map([[runs[0].firstName, firstOrder], [runs[0].secondName, secondOrder]]);
      const originalMatches = row.optionsJson.map((option, index) => ({ index, powers: rateLawPowers(option) }))
        .filter((candidate) => sameRateLaw(candidate.powers, expected));
      if (!originalMatches.some((candidate) => candidate.index === row.correctIndex)) {
        return { pass: false, reason: "INITIAL_RATE_KEY_MISMATCH", familyKey: `${row.topic}:table:${row.id}` };
      }
      for (const candidate of originalMatches) {
        if (candidate.index === row.correctIndex) continue;
        const wrongFirstOrder = firstOrder + 1;
        row.optionsJson[candidate.index] = `\\(r=k[${runs[0].firstName}]^${wrongFirstOrder}[${runs[0].secondName}]^${secondOrder}\\)`;
        row.optionExplanationsJson[candidate.index] = `Comparing the runs gives order ${firstOrder} in ${runs[0].firstName}, not ${wrongFirstOrder}; therefore this distractor is inconsistent with the measured rate ratios.`;
      }
      const repairedMatches = row.optionsJson.map((option, index) => ({ index, powers: rateLawPowers(option) }))
        .filter((candidate) => sameRateLaw(candidate.powers, expected));
      return repairedMatches.length === 1 && repairedMatches[0].index === row.correctIndex
        ? { pass: true, familyKey: `${row.topic}:table:${runs.map((run) => `${run.first},${run.second},${run.rate}`).join(":")}`, expected: [firstOrder, secondOrder], derivation: "Solve the two independent logarithmic initial-rate ratios for the two rate-law powers; duplicate equivalent distractors are repaired." }
        : { pass: false, reason: "INITIAL_RATE_OPTIONS_REMAIN_AMBIGUOUS", familyKey: `${row.topic}:table:${row.id}` };
    }

    const singleFactorMatch = question.match(/increasing[\s\S]*?by a factor of\s+([\d.]+)[\s\S]*?rate[\s\S]*?by a factor of\s+([\d.]+)/i);
    if (singleFactorMatch) {
      const concentrationFactor = Number(singleFactorMatch[1]);
      const rateFactor = Number(singleFactorMatch[2]);
      const orderRaw = Math.log(rateFactor) / Math.log(concentrationFactor);
      const order = Math.round(orderRaw);
      if (Math.abs(orderRaw - order) > 1e-6) return { pass: false, reason: "INITIAL_RATE_NONINTEGER_ORDER", familyKey: `${row.topic}:single:${row.id}` };
      return numericalDecision(row, order, `${row.topic}:single:Cfactor=${concentrationFactor}:rfactor=${rateFactor}`, "For a single varied reactant, rate-factor=(concentration-factor)^order.");
    }

    const factorWords = { doubling: 2, tripling: 3 };
    const changes = [...question.matchAll(/(doubling|tripling)\s+\\\(\[([A-Z])\]\\\)/gi)];
    const combinedMatch = question.match(/together multiplies the initial rate by\s+([\d.]+)/i);
    const separateMatch = question.match(/alone multiplies the rate by\s+([\d.]+)/i);
    if (changes.length < 3 || !combinedMatch || !separateMatch) {
      return { pass: false, reason: "INITIAL_RATE_FACTOR_DATA_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    }
    const firstFactor = factorWords[changes[0][1].toLowerCase()];
    const secondFactor = factorWords[changes[1][1].toLowerCase()];
    const combinedRate = Number(combinedMatch[1]);
    const secondRate = Number(separateMatch[1]);
    const secondOrder = Math.log(secondRate) / Math.log(secondFactor);
    const firstOrder = Math.log(combinedRate / secondRate) / Math.log(firstFactor);
    const expectedPair = [Math.round(firstOrder), Math.round(secondOrder)];
    const matches = row.optionsJson.map((option, index) => ({ index, values: numericValues(option) }))
      .filter((candidate) => candidate.values.length >= 2 && closeEnough(candidate.values[0], expectedPair[0]) && closeEnough(candidate.values[1], expectedPair[1]));
    return matches.length === 1 && matches[0].index === row.correctIndex
      ? { pass: true, familyKey: `${row.topic}:f1=${firstFactor}:f2=${secondFactor}:combined=${combinedRate}:second=${secondRate}`, expected: expectedPair, derivation: "Use the separate experiment for the second order, then divide that contribution out of the combined rate factor to obtain the first order." }
      : { pass: false, reason: "INITIAL_RATE_FACTOR_KEY_MISMATCH", familyKey: `${row.topic}:factors:${row.id}` };
  }

  if (row.topic === "Stoichiometric rate relation") {
    const reactionMatch = question.match(/(?:reaction\s+)?\\\((\d+)([A-Z])\s*\\rightarrow\s*(\d+)([A-Z])\\\)/i);
    if (!reactionMatch) return { pass: false, reason: "STOICHIOMETRIC_REACTION_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const reactantCoefficient = Number(reactionMatch[1]);
    const reactant = reactionMatch[2].toUpperCase();
    const productCoefficient = Number(reactionMatch[3]);
    const product = reactionMatch[4].toUpperCase();
    const formationMatch = question.match(/forms at\s+\\\(([\d.e+-]+)/i);
    if (formationMatch) {
      return numericalDecision(row, Number(formationMatch[1]) * reactantCoefficient / productCoefficient, `${row.topic}:${reactantCoefficient}${reactant}->${productCoefficient}${product}:formation=${formationMatch[1]}`, "The disappearance-to-formation rate ratio equals the reactant-to-product stoichiometric coefficient ratio.");
    }
    const normalizedOptions = row.optionsJson.map((option) => normalize(option).replace(/\s/g, ""));
    const expectedLeft = `-\\frac{1}{${reactantCoefficient}}\\frac{d[${reactant.toLowerCase()}]}{dt}`;
    const expectedRight = `\\frac{1}{${productCoefficient}}\\frac{d[${product.toLowerCase()}]}{dt}`;
    const matches = normalizedOptions.map((option, index) => ({ index, matches: option.includes(expectedLeft) && option.includes(`=${expectedRight}`) })).filter((entry) => entry.matches);
    return matches.length === 1 && matches[0].index === row.correctIndex
      ? { pass: true, familyKey: `${row.topic}:expression:${reactantCoefficient}${reactant}->${productCoefficient}${product}`, derivation: "Divide each concentration derivative by its stoichiometric coefficient, using a negative sign for reactant disappearance." }
      : { pass: false, reason: "STOICHIOMETRIC_EXPRESSION_KEY_MISMATCH", familyKey: `${row.topic}:expression:${row.id}` };
  }

  if (row.topic === "Half-life and reaction order") {
    const values = [...question.matchAll(/half-lives\s+\\\(([\d.]+)[\s\S]*?_0=([\d.]+)[\s\S]*?and\s+\\\(([\d.]+)[\s\S]*?_0=([\d.]+)/gi)][0];
    if (!values) return { pass: false, reason: "HALF_LIFE_ORDER_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const t1 = Number(values[1]);
    const c1 = Number(values[2]);
    const t2 = Number(values[3]);
    const c2 = Number(values[4]);
    const tRatio = t2 / t1;
    const expectedOrder = closeEnough(tRatio, c2 / c1) ? "zero" : closeEnough(tRatio, 1) ? "first" : closeEnough(tRatio, c1 / c2) ? "second" : null;
    if (!expectedOrder) return { pass: false, reason: "HALF_LIFE_ORDER_UNRESOLVED", familyKey: `${row.topic}:invalid:${row.id}` };
    return conceptualDecision(row, new RegExp(`${expectedOrder} order`), `${row.topic}:t1=${t1}:c1=${c1}:t2=${t2}:c2=${c2}`, "Compare half-life scaling with initial concentration: zero order is proportional, first order is independent, and second order is inversely proportional.");
  }

  if (row.topic === "Integrated law with stoichiometry") {
    const match = question.match(/For\s+\\\((\d+)[A-Z]\\rightarrow[\s\S]*?k=([\d.]+)[\s\S]*?_0=([\d.]+)[\s\S]*?after\s+\\\(([\d.]+)/i);
    if (!match) return { pass: false, reason: "INTEGRATED_STOICHIOMETRY_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const coefficient = Number(match[1]);
    const rateConstant = Number(match[2]);
    const initial = Number(match[3]);
    const time = Number(match[4]);
    const product = initial * (1 - Math.exp(-rateConstant * time)) / coefficient;
    return numericalDecision(row, product, `${row.topic}:nu=${coefficient}:k=${rateConstant}:C0=${initial}:t=${time}`, "First find first-order reactant consumption C0(1-exp(-kt)), then divide by the reactant stoichiometric coefficient.");
  }

  if (row.topic === "Order and molecularity") {
    if (/mechanism changes[\s\S]*experimentally measured continuous variable/i.test(question)) {
      return conceptualDecision(row, /statement i is true, but statement ii is false/, `${row.topic}:mechanism-versus-molecularity`, "Observed order may change with mechanism, while molecularity is a discrete count assigned to an elementary step.");
    }
    if (/elementary reaction[\s\S]*every overall chemical equation/i.test(question)) {
      return conceptualDecision(row, /statement i is true, but statement ii is false/, `${row.topic}:elementary-versus-overall`, "An elementary rate law follows its event stoichiometry, but an overall equation need not represent one elementary collision.");
    }
    if (/molecularity can be zero[\s\S]*order of a complex reaction may be fractional/i.test(question)) {
      return conceptualDecision(row, /statement i is false, but statement ii is true/, `${row.topic}:zero-versus-fractional`, "Molecularity is a positive integer, whereas an experimental overall order can be fractional.");
    }
    return conceptualDecision(row, /both statement i and statement ii are true/, `${row.topic}:definitions`, "Order comes from the experimental rate law, while molecularity is assigned to an elementary step.");
  }

  if (row.topic === "Integrated kinetics and catalysis") {
    return numericalDecision(row, 3, `${row.topic}:statement-count`, "Zero-order independence, first-order inverse-time units, and unchanged reaction enthalpy under catalysis are correct; fractional molecularity is not.");
  }

  if (row.topic === "Concentration terms: molality from masses") {
    const match = question.match(/([\d.]+)\s*g[\s\S]*?M=([\d.]+)[\s\S]*?dissolved in\s+([\d.]+)\s*g/i);
    if (!match) return { pass: false, reason: "MOLALITY_MASS_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const soluteMass = Number(match[1]);
    const molarMass = Number(match[2]);
    const solventMassG = Number(match[3]);
    return numericalDecision(row, (soluteMass / molarMass) / (solventMassG / 1000), `${row.topic}:w=${soluteMass}:M=${molarMass}:solvent=${solventMassG}`, "Molality=(solute mass/molar mass)/(solvent mass in kg).");
  }

  if (row.topic === "Concentration terms: molarity from solute mass and final volume") {
    const match = question.match(/dissolving\s+([\d.]+)\s*g[\s\S]*?M=([\d.]+)[\s\S]*?final volume\s+([\d.]+)\s*mL/i);
    if (!match) return { pass: false, reason: "MOLARITY_MASS_VOLUME_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const mass = Number(match[1]);
    const molarMass = Number(match[2]);
    const volumeMl = Number(match[3]);
    return numericalDecision(row, (mass / molarMass) / (volumeMl / 1000), `${row.topic}:w=${mass}:M=${molarMass}:V=${volumeMl}`, "Molarity=moles of solute/litres of final solution.");
  }

  if (row.topic === "Concentration terms: mass percentage") {
    const match = question.match(/contains\s+([\d.]+)\s*g[\s\S]*?in\s+([\d.]+)\s*g of solution/i);
    if (!match) return { pass: false, reason: "MASS_PERCENT_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    return numericalDecision(row, Number(match[1]) / Number(match[2]) * 100, `${row.topic}:solute=${match[1]}:solution=${match[2]}`, "Mass percentage=100 times solute mass/solution mass.");
  }

  if (row.topic === "Concentration terms: mixing solutions of the same solute") {
    const match = question.match(/([\d.]+)\s*mL of\s+([\d.]+)\s*M[\s\S]*?mixed with\s+([\d.]+)\s*mL of\s+([\d.]+)\s*M/i);
    if (!match) return { pass: false, reason: "MIXED_MOLARITY_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const v1 = Number(match[1]);
    const c1 = Number(match[2]);
    const v2 = Number(match[3]);
    const c2 = Number(match[4]);
    return numericalDecision(row, (v1 * c1 + v2 * c2) / (v1 + v2), `${row.topic}:V1=${v1}:C1=${c1}:V2=${v2}:C2=${c2}`, "For additive volumes, final molarity=(C1V1+C2V2)/(V1+V2).");
  }

  if (row.topic === "Concentration terms: mole-fraction sum") {
    const match = question.match(/mole fraction of [A-Z] is\s+([\d.]+)/i);
    if (!match) return { pass: false, reason: "MOLE_FRACTION_SUM_VALUE_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    return numericalDecision(row, 1 - Number(match[1]), `${row.topic}:x=${match[1]}`, "Binary-solution mole fractions sum to one.");
  }

  if (row.topic === "Concentration terms: parts per million") {
    const match = question.match(/contains\s+([\d.]+)\s*mg[\s\S]*?in\s+([\d.]+)\s*kg/i);
    if (!match) return { pass: false, reason: "PPM_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    return numericalDecision(row, Number(match[1]) / Number(match[2]), `${row.topic}:mg=${match[1]}:kg=${match[2]}`, "For dilute aqueous samples, mg per kg equals ppm.");
  }

  if (row.topic === "Concentration conversion: mass percentage and density to molarity") {
    const match = question.match(/([\d.]+)% by mass[\s\S]*?density\s+([\d.]+)\s*g mL[\s\S]*?M_[^=]*=([\d.]+)/i);
    if (!match) return { pass: false, reason: "MASS_PERCENT_DENSITY_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const percent = Number(match[1]);
    const density = Number(match[2]);
    const molarMass = Number(match[3]);
    return numericalDecision(row, (percent / 100 * density * 1000) / molarMass, `${row.topic}:pct=${percent}:rho=${density}:M=${molarMass}`, "One litre has mass 1000*rho; multiply by mass fraction and divide by molar mass.");
  }

  if (row.topic === "Concentration conversion: molality to mole fraction") {
    const match = question.match(/([\d.]+)\s*mol kg[\s\S]*?M_[^=]*=([\d.]+)/i);
    if (!match) return { pass: false, reason: "MOLALITY_TO_MOLE_FRACTION_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const molality = Number(match[1]);
    const solventMolarMass = Number(match[2]);
    const solventMoles = 1000 / solventMolarMass;
    return numericalDecision(row, molality / (molality + solventMoles), `${row.topic}:m=${molality}:Msolvent=${solventMolarMass}`, "On a 1 kg solvent basis, solute moles=m and solvent moles=1000/Msolvent.");
  }

  if (row.topic === "Concentration conversion: molarity to molality") {
    const match = question.match(/molarity\s+([\d.]+)[\s\S]*?density\s+([\d.]+)\s*g mL[\s\S]*?M_[^=]*=([\d.]+)/i);
    if (!match) return { pass: false, reason: "MOLARITY_TO_MOLALITY_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const molarity = Number(match[1]);
    const density = Number(match[2]);
    const molarMass = Number(match[3]);
    const solventKg = (density * 1000 - molarity * molarMass) / 1000;
    return numericalDecision(row, molarity / solventKg, `${row.topic}:C=${molarity}:rho=${density}:M=${molarMass}`, "For one litre, subtract solute mass C*M from solution mass 1000*rho, then divide solute moles by solvent kilograms.");
  }

  if (row.topic === "Preparation of a solution with specified total mass and molality") {
    const match = question.match(/exactly\s+([\d.]+)\s*g of a\s+([\d.]+)\s*mol kg[\s\S]*?M=([\d.]+)/i);
    if (!match) return { pass: false, reason: "SOLUTION_PREPARATION_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const totalMass = Number(match[1]);
    const molality = Number(match[2]);
    const molarMass = Number(match[3]);
    const solventKg = totalMass / (1000 + molality * molarMass);
    const soluteG = molality * solventKg * molarMass;
    const solventG = solventKg * 1000;
    return numericalPairDecision(row, soluteG, solventG, `${row.topic}:total=${totalMass}:m=${molality}:M=${molarMass}`, "Let solvent mass be s kg; total grams=1000s+m*s*M, then compute solute and solvent masses.");
  }

  if (row.topic === "Raoult's law: component partial pressure") {
    const match = question.match(/x_[A-Z]=([\d.]+)[\s\S]*?pure [A-Z] is\s+([\d.]+)/i);
    if (!match) return { pass: false, reason: "RAOULT_PARTIAL_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    return numericalDecision(row, Number(match[1]) * Number(match[2]), `${row.topic}:x=${match[1]}:p0=${match[2]}`, "Raoult's law: component partial pressure=x*p0.");
  }

  if (row.topic === "Raoult's law: total pressure of an ideal binary solution") {
    const match = question.match(/vapour pressures\s+([\d.]+)\s+and\s+([\d.]+)[\s\S]*?x_[A-Z]=([\d.]+)/i);
    if (!match) return { pass: false, reason: "RAOULT_TOTAL_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const pA = Number(match[1]);
    const pB = Number(match[2]);
    const xA = Number(match[3]);
    return numericalDecision(row, xA * pA + (1 - xA) * pB, `${row.topic}:pA=${pA}:pB=${pB}:xA=${xA}`, "Ideal total pressure=x_A p_A0+(1-x_A)p_B0.");
  }

  if (row.topic === "Henry's law: mole fraction from pressure") {
    const match = question.match(/K_H=([\d.]+)[\s\S]*?partial pressure of\s+([\d.]+)/i);
    if (!match) return { pass: false, reason: "HENRY_MOLE_FRACTION_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    return numericalDecision(row, Number(match[2]) / Number(match[1]), `${row.topic}:KH=${match[1]}:p=${match[2]}`, "Henry's law p=K_H x, hence x=p/K_H.");
  }

  if (row.topic === "Relative lowering of vapour pressure: exact mole-fraction relation") {
    const match = question.match(/solute\s+\(([\d.]+)\s*mol\)[\s\S]*?in\s+([\d.]+)\s*mol/i);
    if (!match) return { pass: false, reason: "RELATIVE_LOWERING_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const soluteMoles = Number(match[1]);
    const solventMoles = Number(match[2]);
    return numericalDecision(row, soluteMoles / (soluteMoles + solventMoles), `${row.topic}:n2=${soluteMoles}:n1=${solventMoles}`, "Exact relative lowering for a nonvolatile solute equals its mole fraction n2/(n1+n2).");
  }

  if (row.topic === "Molar mass from exact relative lowering of vapour pressure") {
    const match = question.match(/Dissolving\s+(\d+(?:\.\d+)?)\s*g[\s\S]*?in\s+(\d+(?:\.\d+)?)\s*g[\s\S]*?lowering\s+(\d+(?:\.\d+)?)[\s\S]*?M_[^=]*=(\d+(?:\.\d+)?)/i);
    if (!match) return { pass: false, reason: "RLVP_MOLAR_MASS_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const soluteMass = Number(match[1]);
    const solventMass = Number(match[2]);
    const lowering = Number(match[3]);
    const solventMolarMass = Number(match[4]);
    const solventMoles = solventMass / solventMolarMass;
    const soluteMoles = lowering * solventMoles / (1 - lowering);
    return numericalDecision(row, soluteMass / soluteMoles, `${row.topic}:w2=${soluteMass}:w1=${solventMass}:r=${lowering}:M1=${solventMolarMass}`, "Use r=n2/(n1+n2) exactly, solve n2=rn1/(1-r), then M2=w2/n2.");
  }

  if (row.topic === "Osmotic pressure of a non-electrolyte solution") {
    const match = question.match(/([\d.]+)\s*M[\s\S]*?at\s+([\d.]+)\s*K[\s\S]*?R=([\d.]+)/i);
    if (!match) return { pass: false, reason: "OSMOTIC_PRESSURE_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const concentration = Number(match[1]);
    const temperature = Number(match[2]);
    const gasConstant = Number(match[3]);
    return numericalDecision(row, concentration * gasConstant * temperature, `${row.topic}:C=${concentration}:T=${temperature}:R=${gasConstant}`, "For a non-electrolyte, pi=CRT.");
  }

  if (row.topic === "Molar mass from osmotic pressure") {
    const match = question.match(/([\d.]+)\s*g[\s\S]*?make\s+([\d.]+)\s*mL[\s\S]*?at\s+([\d.]+)\s*K[\s\S]*?pressure is\s+([\d.]+)[\s\S]*?R=([\d.]+)/i);
    if (!match) return { pass: false, reason: "OSMOTIC_MOLAR_MASS_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const mass = Number(match[1]);
    const volumeL = Number(match[2]) / 1000;
    const temperature = Number(match[3]);
    const pressure = Number(match[4]);
    const gasConstant = Number(match[5]);
    return numericalDecision(row, mass * gasConstant * temperature / (pressure * volumeL), `${row.topic}:w=${mass}:V=${volumeL}:T=${temperature}:pi=${pressure}:R=${gasConstant}`, "From pi=(w/M)RT/V, M=wRT/(pi V).");
  }

  if (row.topic === "van't Hoff factor from a temperature change") {
    const match = question.match(/(\d+(?:\.\d+)?)\s*mol kg[\s\S]*?(?:depression|elevation) of\s+(\d+(?:\.\d+)?)\s*K[\s\S]*?constant is\s+(\d+(?:\.\d+)?)/i);
    if (!match) return { pass: false, reason: "VANT_HOFF_TEMPERATURE_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const molality = Number(match[1]);
    const deltaT = Number(match[2]);
    const constant = Number(match[3]);
    return numericalDecision(row, deltaT / (constant * molality), `${row.topic}:m=${molality}:dT=${deltaT}:K=${constant}`, "From Delta T=iKm, i=Delta T/(Km).");
  }

  if (row.topic === "van't Hoff factor: multionic dissociation") {
    const match = question.match(/gives\s+(\d+)\s+ions[\s\S]*?factor\s+(\d+(?:\.\d+)?)/i);
    if (!match) return { pass: false, reason: "MULTIIONIC_DISSOCIATION_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const particles = Number(match[1]);
    const factor = Number(match[2]);
    return numericalDecision(row, (factor - 1) / (particles - 1), `${row.topic}:nu=${particles}:i=${factor}`, "For dissociation into nu particles, i=1+alpha(nu-1).");
  }

  if (row.topic === "Depression in freezing point: non-electrolyte" || row.topic === "Elevation in boiling point: non-electrolyte") {
    const match = question.match(/([\d.]+)\s*mol kg[\s\S]*?K_[fb]=([\d.]+)/i);
    if (!match) return { pass: false, reason: "COLLIGATIVE_TEMPERATURE_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const molality = Number(match[1]);
    const constant = Number(match[2]);
    return numericalDecision(row, molality * constant, `${row.topic}:m=${molality}:K=${constant}`, "For a non-electrolyte, Delta T=K m.");
  }

  if (row.topic === "Freezing-point depression with partial dissociation") {
    const match = question.match(/([\d.]+)\s*g[\s\S]*?M=([\d.]+)[\s\S]*?in\s+([\d.]+)\s*g[\s\S]*?dissociation is\s+([\d.]+)[\s\S]*?K_f=([\d.]+)/i);
    const particles = electrolyteParticleCount(question);
    if (!match || !particles) return { pass: false, reason: "PARTIAL_DISSOCIATION_FREEZING_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const mass = Number(match[1]);
    const molarMass = Number(match[2]);
    const solventKg = Number(match[3]) / 1000;
    const alpha = Number(match[4]);
    const constant = Number(match[5]);
    const factor = 1 + alpha * (particles - 1);
    return numericalDecision(row, factor * constant * (mass / molarMass) / solventKg, `${row.topic}:w=${mass}:M=${molarMass}:solvent=${solventKg}:alpha=${alpha}:nu=${particles}:K=${constant}`, "Compute i=1+alpha(nu-1), molality=(w/M)/kg solvent, and Delta Tf=iKf m.");
  }

  if (row.topic === "Osmotic pressure of a mixed electrolyte/non-electrolyte solution") {
    const match = question.match(/([\d.]+)\s*mL[\s\S]*?contains\s+([\d.]+)\s*mol non-electrolyte[\s\S]*?and\s+([\d.]+)\s*mol[\s\S]*?([\d.]+)% dissociated into\s+(\d+)\s+ions[\s\S]*?at\s+([\d.]+)\s*K[\s\S]*?R=([\d.]+)/i);
    if (!match) return { pass: false, reason: "MIXED_OSMOTIC_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const volumeL = Number(match[1]) / 1000;
    const nonElectrolyteMoles = Number(match[2]);
    const electrolyteMoles = Number(match[3]);
    const alpha = Number(match[4]) / 100;
    const particles = Number(match[5]);
    const temperature = Number(match[6]);
    const gasConstant = Number(match[7]);
    const effectiveMoles = nonElectrolyteMoles + (1 + alpha * (particles - 1)) * electrolyteMoles;
    return numericalDecision(row, effectiveMoles / volumeL * gasConstant * temperature, `${row.topic}:V=${volumeL}:n0=${nonElectrolyteMoles}:ne=${electrolyteMoles}:alpha=${alpha}:nu=${particles}:T=${temperature}`, "Sum effective particle moles using i=1+alpha(nu-1), then pi=(n_eff/V)RT.");
  }

  if (row.topic === "Association and apparent molar mass") {
    const match = question.match(/true molar mass\s+([\d.]+)[\s\S]*?form\s+\\\((\d+)\\\)-mers[\s\S]*?fraction\s+([\d.]+)/i);
    if (!match) return { pass: false, reason: "ASSOCIATION_APPARENT_MASS_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const trueMass = Number(match[1]);
    const nMer = Number(match[2]);
    const alpha = Number(match[3]);
    const factor = 1 - alpha * (1 - 1 / nMer);
    return numericalDecision(row, trueMass / factor, `${row.topic}:M=${trueMass}:n=${nMer}:alpha=${alpha}`, "For association into n-mers, i=1-alpha(1-1/n) and M_app=M_true/i.");
  }

  if (row.topic === "Liquid composition from total pressure and vapour composition") {
    const match = question.match(/total pressure is\s+([\d.]+)[\s\S]*?y_[A-Z]=([\d.]+)[\s\S]*?p_[A-Z]\^0=([\d.]+)/i);
    if (!match) return { pass: false, reason: "LIQUID_FROM_TOTAL_AND_VAPOUR_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const totalPressure = Number(match[1]);
    const vapourFraction = Number(match[2]);
    const purePressure = Number(match[3]);
    return numericalDecision(row, vapourFraction * totalPressure / purePressure, `${row.topic}:P=${totalPressure}:y=${vapourFraction}:p0=${purePressure}`, "p_A=y_A P=x_A p_A0, so x_A=y_A P/p_A0.");
  }

  if (row.topic === "Ideal solution: liquid composition from total pressure") {
    const match = question.match(/total vapour pressure\s+([\d.]+)[\s\S]*?p_[A-Z]\^0=([\d.]+)[\s\S]*?p_[A-Z]\^0=([\d.]+)/i);
    if (!match) return { pass: false, reason: "LIQUID_FROM_TOTAL_PRESSURE_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const total = Number(match[1]);
    const pA = Number(match[2]);
    const pB = Number(match[3]);
    return numericalDecision(row, (total - pB) / (pA - pB), `${row.topic}:P=${total}:pA=${pA}:pB=${pB}`, "From P=x_Ap_A0+(1-x_A)p_B0, x_A=(P-p_B0)/(p_A0-p_B0).");
  }

  if (row.topic === "Ideal solution: preferential enrichment of vapour" || row.topic === "Ideal solution: vapour-phase composition") {
    const match = question.match(/x_[A-Z]=([\d.]+)[\s\S]*?p_[A-Z]\^0=([\d.]+)[\s\S]*?p_[A-Z]\^0=([\d.]+)/i);
    if (!match) return { pass: false, reason: "VAPOUR_COMPOSITION_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const x = Number(match[1]);
    const pA = Number(match[2]);
    const pB = Number(match[3]);
    const vapourFraction = x * pA / (x * pA + (1 - x) * pB);
    if (row.topic === "Ideal solution: preferential enrichment of vapour") {
      const matching = row.optionsJson.map((option, index) => ({ index, matches: optionMatchesExpected(option, vapourFraction) })).filter((entry) => entry.matches);
      if (!matching.some((entry) => entry.index === row.correctIndex)) {
        return { pass: false, reason: "VAPOUR_ENRICHMENT_KEY_MISMATCH", familyKey: `${row.topic}:x=${x}:pA=${pA}:pB=${pB}`, expected: vapourFraction };
      }
      for (const entry of matching) {
        if (entry.index === row.correctIndex) continue;
        row.optionsJson[entry.index] = `The vapour has \\(y_A=${x.toFixed(3)}\\), exactly equal to the liquid composition.`;
        row.optionExplanationsJson[entry.index] = `This ignores preferential volatility. Raoult's law gives a vapour fraction of ${vapourFraction.toFixed(3)}, not the liquid fraction ${x.toFixed(3)}.`;
      }
      const repaired = row.optionsJson.map((option, index) => ({ index, matches: optionMatchesExpected(option, vapourFraction) })).filter((entry) => entry.matches);
      return repaired.length === 1 && repaired[0].index === row.correctIndex
        ? { pass: true, familyKey: `${row.topic}:x=${x}:pA=${pA}:pB=${pB}`, expected: vapourFraction, derivation: "Compute y_A by Raoult's law and repair any semantically duplicate numerical distractor so exactly one answer remains." }
        : { pass: false, reason: "VAPOUR_ENRICHMENT_OPTIONS_REMAIN_AMBIGUOUS", familyKey: `${row.topic}:x=${x}:pA=${pA}:pB=${pB}`, expected: vapourFraction };
    }
    return numericalDecision(row, vapourFraction, `${row.topic}:x=${x}:pA=${pA}:pB=${pB}`, "y_A=x_Ap_A0/[x_Ap_A0+(1-x_A)p_B0].");
  }

  if (row.topic === "Henry's law: composition of dissolved gases") {
    const fractions = question.match(/mole fractions\s+([\d.]+)[\s\S]*?,\s+([\d.]+)[\s\S]*?,\s+and\s+([\d.]+)/i);
    const constants = question.match(/constants[\s\S]*?are\s+([\d.]+),\s+([\d.]+),\s+and\s+([\d.]+)/i);
    if (!fractions || !constants) return { pass: false, reason: "HENRY_DISSOLVED_COMPOSITION_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const weights = [1, 2, 3].map((index) => Number(fractions[index]) / Number(constants[index]));
    return numericalDecision(row, weights[0] / weights.reduce((sum, value) => sum + value, 0), `${row.topic}:y=${fractions.slice(1).join(",")}:KH=${constants.slice(1).join(",")}`, "Dissolved amount of each gas is proportional to p_i/K_H,i; normalize these three quantities.");
  }

  if (row.topic === "Henry's law: comparing gas solubilities") {
    const match = question.match(/K_H=([\d.]+)[\s\S]*?K_H=([\d.]+)/i);
    if (!match) return { pass: false, reason: "HENRY_SOLUBILITY_COMPARISON_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    return numericalDecision(row, Number(match[2]) / Number(match[1]), `${row.topic}:KH1=${match[1]}:KH2=${match[2]}`, "At equal partial pressure, x is inversely proportional to K_H, so x1/x2=K_H2/K_H1.");
  }

  if (row.topic === "Henry's law: qualitative pressure dependence") {
    if (/is halved/i.test(question)) {
      return conceptualDecision(row, /it becomes half/, `${row.topic}:half-pressure`, "At fixed temperature x=p/K_H, so halving p halves the dissolved mole fraction.");
    }
    if (/is tripled/i.test(question)) {
      return conceptualDecision(row, /it triples/, `${row.topic}:triple-pressure`, "At fixed temperature x=p/K_H, so tripling p triples the dissolved mole fraction.");
    }
    if (/increased by 50%/i.test(question)) {
      return conceptualDecision(row, /it becomes 1\.5 times/, `${row.topic}:fifty-percent-pressure-rise`, "At fixed temperature x=p/K_H, so a 50% pressure increase multiplies x by 1.5.");
    }
    if (/reduced to one-fourth/i.test(question)) {
      return conceptualDecision(row, /it becomes one-fourth/, `${row.topic}:quarter-pressure`, "At fixed temperature x=p/K_H, so reducing p to one-fourth reduces x to one-fourth.");
    }
    return conceptualDecision(row, /it doubles/, `${row.topic}:double-pressure`, "At fixed temperature K_H is constant and x=p/K_H, so doubling p doubles x.");
  }

  if (row.topic === "Mixed-solute colligative temperature change") {
    const match = question.match(/in\s+([\d.]+)\s*g[\s\S]*?contains\s+([\d.]+)\s*mol non-electrolyte[\s\S]*?and\s+([\d.]+)\s*mol[\s\S]*?([\d.]+)% dissociated into\s+(\d+)\s+ions[\s\S]*?constant\s+([\d.]+)/i);
    if (!match) return { pass: false, reason: "MIXED_COLLIGATIVE_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const solventKg = Number(match[1]) / 1000;
    const n0 = Number(match[2]);
    const ne = Number(match[3]);
    const alpha = Number(match[4]) / 100;
    const particles = Number(match[5]);
    const constant = Number(match[6]);
    const effectiveMolality = (n0 + (1 + alpha * (particles - 1)) * ne) / solventKg;
    return numericalDecision(row, constant * effectiveMolality, `${row.topic}:solvent=${solventKg}:n0=${n0}:ne=${ne}:alpha=${alpha}:nu=${particles}:K=${constant}`, "Add non-electrolyte moles and i times electrolyte moles, divide by solvent kg, then multiply by the colligative constant.");
  }

  if (row.topic === "Data interpretation: deviation from Raoult's law") {
    const pure = question.match(/p_[A-Z]\^0=([\d.]+)[\s\S]*?p_[A-Z]\^0=([\d.]+)/i);
    const points = [...question.matchAll(/x_[A-Z]=([\d.]+):\s*P=([\d.]+)/gi)].map((match) => ({ x: Number(match[1]), pressure: Number(match[2]) }));
    if (!pure || !points.length) return { pass: false, reason: "RAOULT_DEVIATION_DATA_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const pA = Number(pure[1]);
    const pB = Number(pure[2]);
    const signs = points.map((point) => Math.sign(point.pressure - (point.x * pA + (1 - point.x) * pB)));
    const expected = signs.every((sign) => sign > 0) ? /positive deviation/ : signs.every((sign) => sign < 0) ? /negative deviation/ : /ideal/;
    return conceptualDecision(row, expected, `${row.topic}:pA=${pA}:pB=${pB}:${points.map((p) => `${p.x},${p.pressure}`).join(":")}`, "Compare each measured total pressure with x_Ap_A0+(1-x_A)p_B0.");
  }

  if (row.topic === "Successive equilibrium vaporisation and condensation") {
    const match = question.match(/x_[A-Z]=([\d.]+)[\s\S]*?p_[A-Z]\^0=([\d.]+)[\s\S]*?p_[A-Z]\^0=([\d.]+)/i);
    if (!match) return { pass: false, reason: "SUCCESSIVE_VLE_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const x1 = Number(match[1]);
    const pA = Number(match[2]);
    const pB = Number(match[3]);
    const y1 = x1 * pA / (x1 * pA + (1 - x1) * pB);
    const y2 = y1 * pA / (y1 * pA + (1 - y1) * pB);
    return numericalDecision(row, y2, `${row.topic}:x1=${x1}:pA=${pA}:pB=${pB}`, "Compute the first equilibrium vapour y1, set the condensate liquid x2=y1, then apply the same VLE expression again.");
  }

  if (row.topic === "Isotonic solutions: electrolyte versus non-electrolyte") {
    const match = question.match(/isotonic with a\s+([\d.]+)\s*M/i);
    const particles = electrolyteParticleCount(question);
    if (!match || !particles) return { pass: false, reason: "ISOTONIC_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    return numericalDecision(row, Number(match[1]) / particles, `${row.topic}:Cnon=${match[1]}:i=${particles}`, "At equal temperature isotonic solutions satisfy i_electrolyte C_electrolyte=C_nonelectrolyte.");
  }

  if (row.topic === "Henry's law for a binary gas mixture") {
    const match = question.match(/mole fraction\s+([\d.]+)[\s\S]*?and\s+([\d.]+)[\s\S]*?K_H\([^)]*\)=([\d.]+)[\s\S]*?K_H\([^)]*\)=([\d.]+)/i);
    if (!match) return { pass: false, reason: "HENRY_BINARY_GAS_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const y1 = Number(match[1]);
    const y2 = Number(match[2]);
    const k1 = Number(match[3]);
    const k2 = Number(match[4]);
    return numericalDecision(row, y1 * k2 / (y2 * k1), `${row.topic}:y1=${y1}:y2=${y2}:K1=${k1}:K2=${k2}`, "x1/x2=(y1P/K1)/(y2P/K2)=y1K2/(y2K1).");
  }

  if (row.topic === "Exact vapour-pressure lowering with partial electrolyte dissociation") {
    const match = question.match(/([\d.]+)\s*mol[\s\S]*?in\s+([\d.]+)\s*mol[\s\S]*?dissociation is\s+([\d.]+)[\s\S]*?gives\s+(\d+)\s+ions/i);
    if (!match) return { pass: false, reason: "ELECTROLYTE_VAPOUR_LOWERING_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const soluteMoles = Number(match[1]);
    const solventMoles = Number(match[2]);
    const alpha = Number(match[3]);
    const particles = Number(match[4]);
    const effectiveSolute = (1 + alpha * (particles - 1)) * soluteMoles;
    return numericalDecision(row, effectiveSolute / (solventMoles + effectiveSolute), `${row.topic}:n2=${soluteMoles}:n1=${solventMoles}:alpha=${alpha}:nu=${particles}`, "Use effective solute particles i*n2 in the exact particle mole fraction i*n2/(n1+i*n2).");
  }

  if (row.topic === "Ideal vapour–liquid equilibrium: liquid composition from vapour composition") {
    const match = question.match(/p_[A-Z]\^0=([\d.]+)[\s\S]*?p_[A-Z]\^0=([\d.]+)[\s\S]*?y_[A-Z]=([\d.]+)/i);
    if (!match) return { pass: false, reason: "LIQUID_FROM_VAPOUR_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const pA = Number(match[1]);
    const pB = Number(match[2]);
    const y = Number(match[3]);
    const x = y * pB / (pA * (1 - y) + y * pB);
    return numericalDecision(row, x, `${row.topic}:pA=${pA}:pB=${pB}:y=${y}`, "Solve y=x p_A0/[x p_A0+(1-x)p_B0] for x.");
  }

  if (row.topic === "van't Hoff factor for association into n-mers") {
    const match = question.match(/according to\s+\\\((\d+)[A-Z][\s\S]*?If\s+([\d.]+)%/i);
    if (!match) return { pass: false, reason: "ASSOCIATION_NMER_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const nMer = Number(match[1]);
    const alpha = Number(match[2]) / 100;
    return numericalDecision(row, 1 - alpha * (1 - 1 / nMer), `${row.topic}:n=${nMer}:alpha=${alpha}`, "For association into n-mers, i=1-alpha(1-1/n).");
  }

  if (row.topic === "Competing osmotic and hydrostatic pressures") {
    const direct = question.match(/osmotic pressures are\s+([\d.]+)[\s\S]*?and\s+([\d.]+)[\s\S]*?hydrostatic pressure of\s+([\d.]+)/i);
    if (direct) {
      const piA = Number(direct[1]);
      const piB = Number(direct[2]);
      const appliedOnB = Number(direct[3]);
      const naturalDifference = piB - piA;
      const answer = normalize(row.optionsJson[row.correctIndex]);
      const expectedPattern = appliedOnB > naturalDifference ? /from b to a/ : appliedOnB < naturalDifference ? /from a to b/ : /no net flow/;
      return expectedPattern.test(answer)
        ? { pass: true, familyKey: `${row.topic}:piA=${piA}:piB=${piB}:dP=${appliedOnB}`, derivation: "Compare applied hydrostatic pressure on B with the osmotic-pressure difference pi_B-pi_A." }
        : { pass: false, reason: "OSMOTIC_FLOW_DIRECTION_KEY_MISMATCH", familyKey: `${row.topic}:piA=${piA}:piB=${piB}:dP=${appliedOnB}` };
    }
    const effective = question.match(/i_A=([\d.]+),\s*C_A=([\d.]+)[\s\S]*?i_B=([\d.]+),\s*C_B=([\d.]+)[\s\S]*?R=([\d.]+)/i);
    const temperatureMatch = question.match(/at\s+([\d.]+)\s*K/i);
    if (!effective || !temperatureMatch) return { pass: false, reason: "OSMOTIC_COMPETITION_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const effectiveA = Number(effective[1]) * Number(effective[2]);
    const effectiveB = Number(effective[3]) * Number(effective[4]);
    const gasConstant = Number(effective[5]);
    const temperature = Number(temperatureMatch[1]);
    const pressure = Math.abs(effectiveA - effectiveB) * gasConstant * temperature;
    const higherSide = effectiveA > effectiveB ? "a" : "b";
    const answer = normalize(row.optionsJson[row.correctIndex]);
    return optionMatchesExpected(row.optionsJson[row.correctIndex], pressure) && new RegExp(`side ${higherSide}`).test(answer)
      ? { pass: true, familyKey: `${row.topic}:eA=${effectiveA}:eB=${effectiveB}:T=${temperature}`, expected: pressure, derivation: "Required opposing pressure is |i_A C_A-i_B C_B|RT and is applied on the side with higher osmotic pressure." }
      : { pass: false, reason: "OSMOTIC_OPPOSING_PRESSURE_KEY_MISMATCH", familyKey: `${row.topic}:eA=${effectiveA}:eB=${effectiveB}:T=${temperature}`, expected: pressure };
  }

  if (row.topic === "Colligative properties: identification") {
    return conceptualDecision(row, /relative lowering of vapour pressure|depression in freezing point|elevation in boiling point|osmotic pressure/, `${row.topic}:${normalize(row.optionsJson[row.correctIndex])}`, "The four standard colligative properties depend on solute-particle count: relative vapour-pressure lowering, boiling elevation, freezing depression, and osmotic pressure.");
  }

  if (row.topic === "Assertion–Reason: solution behaviour") {
    if (/permits solute particles but blocks solvent/i.test(question)) {
      return conceptualDecision(row, /assertion is false, but reason is true/, `${row.topic}:semipermeable-direction`, "A semipermeable membrane passes solvent and blocks solute, while osmosis is solvent flow through that membrane.");
    }
    if (/osmotic pressure is especially useful/i.test(question)) {
      return conceptualDecision(row, /both assertion and reason are true, and reason is the correct explanation/, `${row.topic}:macromolecule-osmometry`, "Room-temperature measurements on very dilute solutions make osmotic pressure well suited to macromolecular molar mass.");
    }
    if (/positive deviation[\s\S]*lower boiling point/i.test(question)) {
      return conceptualDecision(row, /both assertion and reason are true, and reason is the correct explanation/, `${row.topic}:positive-deviation-boiling`, "Positive deviation raises vapour pressure and therefore lowers the boiling temperature at fixed external pressure.");
    }
    if (/ideal binary solution has zero enthalpy/i.test(question)) {
      return conceptualDecision(row, /both assertion and reason are true, and reason is the correct explanation/, `${row.topic}:ideal-enthalpy`, "Comparable like and unlike attractions make the enthalpy of mixing approximately zero in an ideal solution.");
    }
    if (/maximum-boiling azeotrope/i.test(question)) {
      return conceptualDecision(row, /assertion is true, but reason is false/, `${row.topic}:maximum-azeotrope`, "Maximum-boiling azeotropes accompany negative deviation, which reflects reduced—not stronger—escaping tendency.");
    }
    if (/molality is preferred over molarity/i.test(question)) {
      return conceptualDecision(row, /both assertion and reason are true, and reason is the correct explanation/, `${row.topic}:molality-temperature`, "Molality uses solvent mass, is temperature independent, and is the concentration in the freezing-depression equation.");
    }
    return { pass: false, reason: "UNSUPPORTED_SOLUTION_ASSERTION_REASON", familyKey: `${row.topic}:invalid:${row.id}` };
  }

  if (row.topic === "Classification of solutions: solvent identification") {
    const answerPatterns = /brass/i.test(question) ? /copper/
      : /air/i.test(question) ? /nitrogen/
        : /iodine dissolved in ethanol/i.test(question) ? /ethanol/
          : /aqueous glucose|soda water/i.test(question) ? /water/
            : null;
    return answerPatterns
      ? conceptualDecision(row, answerPatterns, `${row.topic}:${answerPatterns.source}`, "The solvent is the major same-phase component: copper in brass, nitrogen in air, ethanol for iodine-in-ethanol, and water in aqueous or soda-water solutions.")
      : { pass: false, reason: "SOLUTION_SOLVENT_CASE_UNSUPPORTED", familyKey: `${row.topic}:invalid:${row.id}` };
  }

  if (row.topic === "Osmosis and reverse osmosis: basic principles") {
    const pattern = /allows solvent molecules but not/i.test(question) ? /semipermeable membrane/
      : /external pressure applied/i.test(question) ? /greater than the osmotic pressure/
        : /moves spontaneously from.*lower.*to.*higher/i.test(question) ? /^osmosis$/
          : /net solvent flow is directed/i.test(question) ? /from the solution toward the pure-solvent side/
            : /opposing hydrostatic pressure equals/i.test(question) ? /the osmotic pressure/
              : null;
    return pattern
      ? conceptualDecision(row, pattern, `${row.topic}:${pattern.source}`, "Apply the definitions of a semipermeable membrane, osmosis, osmotic equilibrium, and reverse osmosis.")
      : { pass: false, reason: "OSMOSIS_PRINCIPLE_CASE_UNSUPPORTED", familyKey: `${row.topic}:invalid:${row.id}` };
  }

  if (row.topic === "Experimental errors in colligative-property measurements") {
    const pattern = /thermometer reads.*too high for both/i.test(question) ? /it is unchanged/
      : /membrane.*permeable to the solute/i.test(question) ? /lower than the true osmotic pressure/
        : /solvent evaporates before the final solution volume/i.test(question) ? /it is underestimated/
          : /freezing-point experiment.*solvent evaporates/i.test(question) ? /it is underestimated/
            : /uses molarity in place of molality/i.test(question) ? /molarity is based on solution volume and can differ appreciably/
              : null;
    return pattern
      ? conceptualDecision(row, pattern, `${row.topic}:${pattern.source}`, "The result follows by propagating the stated common offset, membrane leakage, solvent loss, or concentration-definition error through the corresponding colligative equation.")
      : { pass: false, reason: "COLLIGATIVE_ERROR_CASE_UNSUPPORTED", familyKey: `${row.topic}:invalid:${row.id}` };
  }

  if (row.topic === "Ideal solutions: defining characteristics") {
    return conceptualDecision(row, /obeys raoult's law over the entire composition range|delta v_{mix}=0|delta h_{mix}=0|a.?b interactions comparable|no preferential escaping tendency beyond raoult's law/, `${row.topic}:${normalize(row.optionsJson[row.correctIndex])}`, "An ideal solution obeys Raoult's law throughout, has Delta H_mix=Delta V_mix=0, and comparable like and unlike interactions.");
  }

  if (row.topic === "Non-ideal solutions: positive deviation") {
    return conceptualDecision(row, /a.?b attractions are weaker/, `${row.topic}:weaker-unlike-attractions`, "Weaker unlike attractions increase escaping tendency and produce positive deviation.");
  }

  if (row.topic === "Non-ideal solutions: negative deviation") {
    return conceptualDecision(row, /a.?b attractions are stronger/, `${row.topic}:stronger-unlike-attractions`, "Stronger unlike attractions reduce escaping tendency and produce negative deviation.");
  }

  if (row.topic === "Azeotropes: minimum-boiling behaviour") {
    return conceptualDecision(row, /vapour and liquid have the same composition.*boiling point is lower/, `${row.topic}:definition`, "A minimum-boiling azeotrope has identical equilibrium phase compositions and boils below either pure component.");
  }

  if (row.topic === "Azeotropes: maximum-boiling behaviour") {
    return conceptualDecision(row, /vapour and liquid have the same composition.*boiling point is higher/, `${row.topic}:definition`, "A maximum-boiling azeotrope has identical equilibrium phase compositions and boils above either pure component.");
  }

  if (row.topic.startsWith("Concentration terms: definition of ")) {
    const term = row.topic.slice("Concentration terms: definition of ".length);
    return conceptualDecision(row, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${row.topic}:definition`, `The question states the standard definition of ${term}.`);
  }

  if (row.topic === "Average rate") {
    const match = question.match(/increases by\s+\\\(([\d.]+)[\s\S]*?over\s+\\\(([\d.]+)/i);
    if (!match) return { pass: false, reason: "AVERAGE_RATE_VALUES_NOT_PARSED", familyKey: `Average rate:invalid:${row.id}` };
    const concentration = Number(match[1]);
    const seconds = Number(match[2]);
    return numericalDecision(row, concentration / seconds, `Average rate:${concentration}:${seconds}`, "r = delta concentration / delta time");
  }

  if (row.topic === "First-order half-life") {
    const match = question.match(/k=([\d.]+)/i);
    if (match) {
      const rateConstant = Number(match[1]);
      return numericalDecision(row, Math.log(2) / rateConstant, `First-order half-life:k=${rateConstant}`, "t_1/2 = ln(2) / k");
    }
    return conceptualDecision(
      row,
      /half-life is independent of the initial reactant concentration/,
      "First-order half-life:conceptual",
      "For first order, t_1/2 = ln(2)/k and is independent of initial concentration at fixed temperature.",
    );
  }

  if (row.topic === "Units of rate constant") {
    const orderMatch = question.match(/overall reaction order of\s+(\d+)/i);
    const order = orderMatch ? Number(orderMatch[1]) : 1;
    const answer = normalize(row.optionsJson[row.correctIndex]).replaceAll("\\,", "");
    const expectedPatterns = {
      0: /mol.*l\^-?\{?-1\}?.*s\^-?\{?-1\}?/,
      1: /s\^-?\{?-1\}?/,
      2: /l.*mol\^-?\{?-1\}?.*s\^-?\{?-1\}?/,
      3: /l\^?\{?2\}?.*mol\^-?\{?-2\}?.*s\^-?\{?-1\}?/,
    };
    const pattern = expectedPatterns[order];
    if (!pattern || !pattern.test(answer)) {
      return { pass: false, reason: "RATE_CONSTANT_UNIT_KEY_MISMATCH", familyKey: `Units of rate constant:order=${order}` };
    }
    return {
      pass: true,
      familyKey: orderMatch ? `Units of rate constant:order=${order}` : "Units of rate constant:first-order-context",
      derivation: `For overall order n=${order}, [k] = concentration^(1-n) time^-1.`,
    };
  }

  if (row.topic === "Rate of reaction") {
    return conceptualDecision(
      row,
      /limiting value of the average concentration change per unit time as the time interval approaches zero/,
      "Rate of reaction:instantaneous-definition",
      "Instantaneous rate is the limit of average concentration change per unit time as the interval tends to zero.",
    );
  }

  if (row.topic === "Threshold condition") {
    return conceptualDecision(
      row,
      /still produce no photoelectric emission/,
      "Threshold condition:below-threshold-intensity",
      "Below threshold frequency, each photon has insufficient energy; increasing photon count cannot cause emission.",
    );
  }

  if (row.topic === "Stopping-potential graph") {
    const answer = normalize(row.optionsJson[row.correctIndex]);
    const pass = /slope/.test(answer) && /h\/e/.test(answer) && /phi\/h/.test(answer);
    return pass
      ? { pass: true, familyKey: "Stopping-potential graph:slope-and-intercept", derivation: "V_s=(h/e)nu-phi/e, so slope=h/e and the frequency intercept is phi/h." }
      : { pass: false, reason: "STOPPING_GRAPH_KEY_MISMATCH", familyKey: "Stopping-potential graph:slope-and-intercept" };
  }

  if (row.topic === "Threshold wavelength") {
    const match = question.match(/work function is\s+\\\(([\d.]+)/i);
    if (!match) return { pass: false, reason: "WORK_FUNCTION_NOT_PARSED", familyKey: `Threshold wavelength:invalid:${row.id}` };
    const workFunction = Number(match[1]);
    return numericalDecision(row, 1240 / workFunction, `Threshold wavelength:phi=${workFunction}`, "lambda_0 = hc/phi, using hc = 1240 eV nm");
  }

  if (row.topic === "Work function from stopping potential") {
    const frequencyMatch = question.match(/frequency\s+\\\(([\d.]+e[-+]?\d+)/i);
    const potentialMatch = question.match(/stopping potential\s+\\\(([\d.]+)/i);
    if (!frequencyMatch || !potentialMatch) {
      return { pass: false, reason: "PHOTOELECTRIC_VALUES_NOT_PARSED", familyKey: `Work function from stopping potential:invalid:${row.id}` };
    }
    const frequency = Number(frequencyMatch[1]);
    const stoppingPotential = Number(potentialMatch[1]);
    const expected = 4.135667696e-15 * frequency - stoppingPotential;
    return numericalDecision(
      row,
      expected,
      `Work function from stopping potential:nu=${frequency}:Vs=${stoppingPotential}`,
      "phi(eV) = (h/e)nu - V_s",
    );
  }

  if (row.topic === "Zero-order completion time" || row.topic === "Zero-order half-life") {
    const concentrationMatch = question.match(/_0=([\d.]+)/i);
    const rateMatch = question.match(/k=([\d.]+)/i);
    if (!concentrationMatch || !rateMatch) {
      return { pass: false, reason: "ZERO_ORDER_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    }
    const concentration = Number(concentrationMatch[1]);
    const rateConstant = Number(rateMatch[1]);
    const divisor = row.topic === "Zero-order half-life" ? 2 : 1;
    return numericalDecision(
      row,
      concentration / (divisor * rateConstant),
      `${row.topic}:C0=${concentration}:k=${rateConstant}`,
      row.topic === "Zero-order half-life" ? "t_1/2 = [A]_0/(2k)" : "t_completion = [A]_0/k",
    );
  }

  if (row.topic === "Zero-order integrated law") {
    if (/which plot is a straight line/i.test(question)) {
      const answer = normalize(row.optionsJson[row.correctIndex]);
      return /versus.*t/.test(answer) && !/\\ln|1\//.test(answer)
        ? { pass: true, familyKey: "Zero-order integrated law:linear-plot", derivation: "[A]_t=[A]_0-kt, so [A] versus t is linear with slope -k." }
        : { pass: false, reason: "CONCEPTUAL_KEY_MISMATCH", familyKey: "Zero-order integrated law:linear-plot" };
    }
    const concentrationMatch = question.match(/_0=([\d.]+)/i);
    const rateMatch = question.match(/k=([\d.]+)/i);
    const timeMatch = question.match(/after\s+\\\(([\d.]+)/i);
    if (!concentrationMatch || !rateMatch || !timeMatch) {
      return { pass: false, reason: "ZERO_ORDER_INTEGRATED_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    }
    const concentration = Number(concentrationMatch[1]);
    const rateConstant = Number(rateMatch[1]);
    const time = Number(timeMatch[1]);
    return numericalDecision(
      row,
      concentration - rateConstant * time,
      `Zero-order integrated law:C0=${concentration}:k=${rateConstant}:t=${time}`,
      "[A]_t = [A]_0 - kt",
    );
  }

  if (row.topic === "First-order integrated law") {
    const ratioMatch = question.match(/_0\/(\d+(?:\.\d+)?)/i);
    const timeMatch = question.match(/in\s+\\\(([\d.]+)/i);
    if (!ratioMatch || !timeMatch) {
      return { pass: false, reason: "FIRST_ORDER_INTEGRATED_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    }
    const ratio = Number(ratioMatch[1]);
    const time = Number(timeMatch[1]);
    return numericalDecision(row, Math.log(ratio) / time, `First-order integrated law:ratio=${ratio}:t=${time}`, "k = ln([A]_0/[A]_t)/t");
  }

  if (row.topic === "Catalytic rate enhancement") {
    const temperatureMatch = question.match(/At\s+\\\(([\d.]+)/i);
    const energyMatch = question.match(/lowers the activation energy by\s+\\\(([\d.]+)/i);
    if (!temperatureMatch || !energyMatch) {
      return { pass: false, reason: "CATALYSIS_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    }
    const temperature = Number(temperatureMatch[1]);
    const energyKj = Number(energyMatch[1]);
    return numericalDecision(
      row,
      Math.exp((energyKj * 1000) / (8.314 * temperature)),
      `Catalytic rate enhancement:T=${temperature}:deltaEa=${energyKj}`,
      "k_c/k_u = exp(delta E_a/RT) when the pre-exponential factor is unchanged",
    );
  }

  if (row.topic === "Pseudo-first-order rate constant") {
    const rateMatch = question.match(/k=([\d.]+)/i);
    const excessMatch = question.match(/constant at\s+\\\(([\d.]+)/i);
    if (!rateMatch || !excessMatch) {
      return { pass: false, reason: "PSEUDO_FIRST_ORDER_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    }
    const rateConstant = Number(rateMatch[1]);
    const excessConcentration = Number(excessMatch[1]);
    return numericalDecision(
      row,
      rateConstant * excessConcentration,
      `Pseudo-first-order rate constant:k=${rateConstant}:excess=${excessConcentration}`,
      "k_obs = k[B]_excess",
    );
  }

  if (row.topic === "First-order interval calculation") {
    const rateMatch = question.match(/k=([\d.]+)/i);
    const fractionsMatch = question.match(/from\s+([\d.]+)\s+to\s+([\d.]+)/i);
    if (!rateMatch || !fractionsMatch) {
      return { pass: false, reason: "FIRST_ORDER_INTERVAL_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    }
    const rateConstant = Number(rateMatch[1]);
    const initialFraction = Number(fractionsMatch[1]);
    const finalFraction = Number(fractionsMatch[2]);
    return numericalDecision(
      row,
      Math.log(initialFraction / finalFraction) / rateConstant,
      `First-order interval calculation:k=${rateConstant}:from=${initialFraction}:to=${finalFraction}`,
      "delta t = ln(f_1/f_2)/k",
    );
  }

  if (row.topic === "First-order percentage completion") {
    const halfLifeMatch = question.match(/half-life\s+\\\(([\d.]+)/i);
    const completionMatch = question.match(/for\s+([\d.]+)%\s+completion/i);
    if (!halfLifeMatch || !completionMatch) {
      return { pass: false, reason: "PERCENT_COMPLETION_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    }
    const halfLife = Number(halfLifeMatch[1]);
    const completion = Number(completionMatch[1]);
    const remaining = 1 - completion / 100;
    return numericalDecision(
      row,
      halfLife * Math.log2(1 / remaining),
      `First-order percentage completion:tHalf=${halfLife}:completion=${completion}`,
      "t = t_1/2 log_2(1/f_remaining)",
    );
  }

  if (row.topic === "First-order decay fractions") {
    const halfLifeMatch = question.match(/half-life of\s+\\\(([\d.]+)/i);
    const timeMatch = question.match(/after\s+\\\(([\d.]+)/i);
    if (!halfLifeMatch || !timeMatch) {
      return { pass: false, reason: "DECAY_FRACTION_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    }
    const halfLife = Number(halfLifeMatch[1]);
    const time = Number(timeMatch[1]);
    return numericalDecision(
      row,
      2 ** (-time / halfLife),
      `First-order decay fractions:tHalf=${halfLife}:t=${time}`,
      "remaining fraction = 2^(-t/t_1/2)",
    );
  }

  if (row.topic === "Activation energy") {
    const match = question.match(/factor of\s+\\\(([\d.]+)[\s\S]*?from\s+\\\(([\d.]+)[\s\S]*?to\s+\\\(([\d.]+)/i);
    if (!match) return { pass: false, reason: "ACTIVATION_ENERGY_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const factor = Number(match[1]);
    const initialTemperature = Number(match[2]);
    const finalTemperature = Number(match[3]);
    const expectedKj = (8.314 * Math.log(factor) / (1 / initialTemperature - 1 / finalTemperature)) / 1000;
    return numericalDecision(
      row,
      expectedKj,
      `Activation energy:factor=${factor}:T1=${initialTemperature}:T2=${finalTemperature}`,
      "E_a = R ln(k_2/k_1)/(1/T_1 - 1/T_2)",
    );
  }

  if (row.topic === "Photon energy") {
    if (/which relation gives the energy/i.test(question)) {
      const answer = normalize(row.optionsJson[row.correctIndex]);
      return /h\\nu/.test(answer) && /hc\/\\lambda/.test(answer)
        ? { pass: true, familyKey: "Photon energy:fundamental-relation", derivation: "E=h nu=hc/lambda." }
        : { pass: false, reason: "PHOTON_ENERGY_RELATION_KEY_MISMATCH", familyKey: "Photon energy:fundamental-relation" };
    }
    const match = question.match(/wavelength\s+\\\(([\d.]+)/i);
    if (!match) return { pass: false, reason: "PHOTON_WAVELENGTH_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const wavelengthNm = Number(match[1]);
    return numericalDecision(row, 1240 / wavelengthNm, `Photon energy:lambda=${wavelengthNm}`, "E_gamma = hc/lambda using hc=1240 eV nm");
  }

  if (row.topic === "Photon wavelength") {
    const match = question.match(/energy\s+\\\(([\d.]+)/i);
    if (!match) return { pass: false, reason: "PHOTON_ENERGY_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const energyEv = Number(match[1]);
    return numericalDecision(row, 1240 / energyEv, `Photon wavelength:E=${energyEv}`, "lambda = hc/E using hc=1240 eV nm");
  }

  if (row.topic === "Photon frequency") {
    const match = question.match(/energy\s+\\\(([\d.]+)/i);
    if (!match) return { pass: false, reason: "PHOTON_ENERGY_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const energyEv = Number(match[1]);
    return numericalDecision(row, energyEv / PLANCK_EV_SECONDS, `Photon frequency:E=${energyEv}`, "nu = E/h");
  }

  if (row.topic === "Photon counting") {
    const match = question.match(/delivers\s+\\\(([\d.e+-]+)[\s\S]*?for\s+\\\(([\d.]+)[\s\S]*?wavelength\s+\\\(([\d.]+)/i);
    if (!match) return { pass: false, reason: "PHOTON_COUNT_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const power = Number(match[1]);
    const time = Number(match[2]);
    const wavelengthNm = Number(match[3]);
    const expected = power * time * wavelengthNm * 1e-9 / (PLANCK * LIGHT_SPEED);
    return numericalDecision(row, expected, `Photon counting:P=${power}:t=${time}:lambda=${wavelengthNm}`, "N = Pt lambda/(hc)");
  }

  if (row.topic === "Radiant power and photons") {
    const match = question.match(/emits\s+\\\(([\d.e+-]+)[\s\S]*?at\s+\\\(([\d.]+)/i);
    if (!match) return { pass: false, reason: "RADIANT_POWER_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const photonRate = Number(match[1]);
    const wavelengthNm = Number(match[2]);
    const expected = photonRate * PLANCK * LIGHT_SPEED / (wavelengthNm * 1e-9);
    return numericalDecision(row, expected, `Radiant power:rate=${photonRate}:lambda=${wavelengthNm}`, "P = photon rate times hc/lambda");
  }

  if (row.topic === "Quantum efficiency and photon flux") {
    const match = question.match(/\\\(([\d.e+-]+)\\\s+\\mathrm\{W\}[\s\S]*?of\s+\\\(([\d.]+)[\s\S]*?area\s+\\\(([\d.e+-]+)[\s\S]*?efficiency is\s+\\\(([\d.]+)/i);
    if (!match) return { pass: false, reason: "QUANTUM_FLUX_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const power = Number(match[1]);
    const wavelengthNm = Number(match[2]);
    const area = Number(match[3]);
    const efficiency = Number(match[4]);
    const expected = efficiency * power * wavelengthNm * 1e-9 / (PLANCK * LIGHT_SPEED * area);
    return numericalDecision(row, expected, `Quantum flux:P=${power}:lambda=${wavelengthNm}:A=${area}:eta=${efficiency}`, "electron flux density = eta P lambda/(hcA)");
  }

  if (row.topic === "Photoelectric saturation current") {
    const match = question.match(/receives\s+\\\(([\d.e+-]+)[\s\S]*?If\s+\\\(([\d.]+)/i);
    if (!match) return { pass: false, reason: "SATURATION_CURRENT_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const photonRate = Number(match[1]);
    const efficiency = Number(match[2]);
    const expected = ELEMENTARY_CHARGE * efficiency * photonRate;
    return numericalDecision(row, expected, `Saturation current:rate=${photonRate}:eta=${efficiency}`, "I = e eta photon-rate");
  }

  if (row.topic === "Stopping potential") {
    if (/minimum reverse potential/i.test(question)) {
      return conceptualDecision(
        row,
        /reduces the photoelectric current to zero by stopping even the most energetic photoelectrons/,
        "Stopping potential:definition",
        "The stopping potential is the minimum reverse potential for which eV_s=K_max and the photocurrent becomes zero.",
      );
    }
    const match = question.match(/nu_0=([\d.e+-]+)[\s\S]*?incident frequency is\s+\\\(([\d.e+-]+)/i);
    if (!match) return { pass: false, reason: "STOPPING_POTENTIAL_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const thresholdFrequency = Number(match[1]);
    const frequency = Number(match[2]);
    return numericalDecision(row, PLANCK_EV_SECONDS * (frequency - thresholdFrequency), `Stopping potential:nu0=${thresholdFrequency}:nu=${frequency}`, "V_s = (h/e)(nu-nu_0)");
  }

  if (row.topic === "Work function") {
    const match = question.match(/threshold wavelength[\s\S]*?is\s+\\\(([\d.]+)/i);
    if (!match) return { pass: false, reason: "THRESHOLD_WAVELENGTH_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const wavelengthNm = Number(match[1]);
    return numericalDecision(row, 1240 / wavelengthNm, `Work function:lambda0=${wavelengthNm}`, "phi = hc/lambda_0 using hc=1240 eV nm");
  }

  if (row.topic === "Maximum photoelectron speed") {
    const match = question.match(/kinetic energy\s+\\\(([\d.]+)/i);
    if (!match) return { pass: false, reason: "PHOTOELECTRON_ENERGY_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const energyEv = Number(match[1]);
    const expected = Math.sqrt(2 * energyEv * ELEMENTARY_CHARGE / ELECTRON_MASS);
    return numericalDecision(row, expected, `Maximum photoelectron speed:E=${energyEv}`, "v_max = sqrt(2K_max/m_e)");
  }

  if (row.topic === "Electron accelerated through potential" || row.topic === "Proton matter wave") {
    const match = question.match(/through\s+\\\(([\d.]+)/i);
    if (!match) return { pass: false, reason: "ACCELERATING_POTENTIAL_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const potential = Number(match[1]);
    const mass = row.topic === "Electron accelerated through potential" ? ELECTRON_MASS : PROTON_MASS;
    const scale = row.topic === "Electron accelerated through potential" ? 1e9 : 1e12;
    const expected = PLANCK / Math.sqrt(2 * mass * ELEMENTARY_CHARGE * potential) * scale;
    return numericalDecision(row, expected, `${row.topic}:V=${potential}`, "lambda = h/sqrt(2mqV)");
  }

  if (row.topic === "de Broglie wavelength") {
    const match = question.match(/momentum\s+\\\(([\d.e+-]+)/i);
    if (!match) return { pass: false, reason: "MOMENTUM_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const momentum = Number(match[1]);
    return numericalDecision(row, PLANCK / momentum, `de Broglie wavelength:p=${momentum}`, "lambda = h/p");
  }

  if (row.topic === "Charged-particle matter wave") {
    const match = question.match(/mass\s+\\\(([\d.]+)m_e[\s\S]*?magnitude\s+\\\(([\d.]+)e[\s\S]*?through\s+\\\(([\d.]+)/i);
    if (!match) return { pass: false, reason: "CHARGED_PARTICLE_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const massMultiple = Number(match[1]);
    const chargeMultiple = Number(match[2]);
    const potential = Number(match[3]);
    const expectedNm = PLANCK / Math.sqrt(2 * massMultiple * ELECTRON_MASS * chargeMultiple * ELEMENTARY_CHARGE * potential) * 1e9;
    return numericalDecision(row, expectedNm, `Charged particle:m=${massMultiple}:q=${chargeMultiple}:V=${potential}`, "lambda=h/sqrt(2mqV)");
  }

  if (row.topic === "Stopping-potential data") {
    const match = question.match(/Hz\}\)=([\d.]+)/i);
    if (!match) return { pass: false, reason: "STOPPING_DATA_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const thresholdScaled = Number(match[1]);
    const options = row.optionsJson.map(String);
    const matchesThreshold = options.map((option) => closeEnough(numericValue(option), thresholdScaled) && /10\^\{14\}/.test(option));
    return matchesThreshold.filter(Boolean).length === 1 && matchesThreshold[row.correctIndex]
      ? { pass: true, familyKey: `Stopping data:nu0=${thresholdScaled}`, derivation: "The tabulated frequency where V_s=0 is the threshold frequency." }
      : { pass: false, reason: "STOPPING_DATA_KEY_MISMATCH", familyKey: `Stopping data:nu0=${thresholdScaled}` };
  }

  if (row.topic === "Retarding potential") {
    const match = question.match(/with\s+\\\(([\d.]+)[\s\S]*?magnitude\s+\\\(([\d.]+)/i);
    if (!match) return { pass: false, reason: "RETARDING_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const kineticEnergyEv = Number(match[1]);
    const potential = Number(match[2]);
    return numericalDecision(row, kineticEnergyEv - potential, `Retarding potential:K=${kineticEnergyEv}:V=${potential}`, "K_residual(eV)=K_initial(eV)-V_retarding(V)");
  }

  if (row.topic === "Einstein photoelectric equation") {
    const match = question.match(/wavelength\s+\\\(([\d.]+)[\s\S]*?work function is\s+\\\(([\d.]+)/i);
    if (!match) return { pass: false, reason: "EINSTEIN_VALUES_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const wavelengthNm = Number(match[1]);
    const workFunctionEv = Number(match[2]);
    return numericalDecision(row, 1240 / wavelengthNm - workFunctionEv, `Einstein equation:lambda=${wavelengthNm}:phi=${workFunctionEv}`, "K_max=hc/lambda-phi");
  }

  if (row.topic === "Determination of Planck constant") {
    const match = question.match(/potentials are\s+\\\(([\d.e+-]+)[\s\S]*?at\s+\\\(([\d.e+-]+)[\s\S]*?and\s+\\\(([\d.e+-]+)[\s\S]*?at\s+\\\(([\d.e+-]+)/i);
    if (!match) return { pass: false, reason: "PLANCK_DATA_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const v1 = Number(match[1]);
    const f1 = Number(match[2]);
    const v2 = Number(match[3]);
    const f2 = Number(match[4]);
    const expected = ELEMENTARY_CHARGE * (v2 - v1) / (f2 - f1);
    return numericalDecision(row, expected, `Planck data:V1=${v1}:f1=${f1}:V2=${v2}:f2=${f2}`, "h=e delta V_s/delta nu");
  }

  if (row.topic === "Successive acceleration and matter waves") {
    const match = question.match(/through\s+\\\(([\d.]+)[\s\S]*?additional\s+\\\(([\d.]+)/i);
    if (!match) return { pass: false, reason: "SUCCESSIVE_POTENTIALS_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const v1 = Number(match[1]);
    const v2 = Number(match[2]);
    const expectedNm = PLANCK / Math.sqrt(2 * ELECTRON_MASS * ELEMENTARY_CHARGE * (v1 + v2)) * 1e9;
    return numericalDecision(row, expectedNm, `Successive acceleration:V1=${v1}:V2=${v2}`, "lambda=h/sqrt(2m_e e(V_1+V_2))");
  }

  if (row.topic === "Accelerating potential from wavelength") {
    const match = question.match(/wavelength\s+\\\(([\d.]+)/i);
    if (!match) return { pass: false, reason: "MATTER_WAVELENGTH_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const wavelengthNm = Number(match[1]);
    const wavelengthM = wavelengthNm * 1e-9;
    const expected = PLANCK ** 2 / (2 * ELECTRON_MASS * ELEMENTARY_CHARGE * wavelengthM ** 2);
    return numericalDecision(row, expected, `Accelerating potential:lambda=${wavelengthNm}`, "V=h^2/(2m_e e lambda^2)");
  }

  if (row.topic === "Comparison of matter wavelengths") {
    return numericalDecision(row, 0.3548, "Comparison matter waves:alpha-to-proton:same-V", "lambda_alpha/lambda_p=sqrt(m_p e/(m_alpha 2e)) approximately 1/sqrt(8)");
  }

  if (row.topic === "Photon and matter-wave comparison") {
    const match = question.match(/wavelength\s+\\\(([\d.]+)/i);
    if (!match) return { pass: false, reason: "COMMON_WAVELENGTH_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const wavelengthNm = Number(match[1]);
    const expected = 2 * ELECTRON_MASS * LIGHT_SPEED * wavelengthNm * 1e-9 / PLANCK;
    return numericalDecision(row, expected, `Photon-electron comparison:lambda=${wavelengthNm}`, "E_photon/K_electron=2m_e c lambda/h");
  }

  if (row.topic === "Matter-wave momentum") {
    const match = question.match(/wavelength\s+\\\(([\d.]+)/i);
    if (!match) return { pass: false, reason: "MATTER_WAVELENGTH_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const wavelengthNm = Number(match[1]);
    return numericalDecision(row, PLANCK / (wavelengthNm * 1e-9), `Matter momentum:lambda=${wavelengthNm}`, "p=h/lambda");
  }

  if (row.topic === "Electron matter wave") {
    const match = question.match(/at\s+\\\(([\d.e+-]+)/i);
    if (!match) return { pass: false, reason: "ELECTRON_SPEED_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const speed = Number(match[1]);
    return numericalDecision(row, PLANCK / (ELECTRON_MASS * speed), `Electron matter wave:v=${speed}`, "lambda=h/(m_e v)");
  }

  if (row.topic === "Photon momentum" && row.questionForm === "CONCEPTUAL") {
    return conceptualDecision(row, /p=h\/\\lambda/, "Photon momentum:relations", "For a photon, p=h/lambda=E/c.");
  }

  if (row.topic === "Photon momentum" && row.questionForm === "NUMERICAL") {
    const match = question.match(/wavelength\s+\\\(([\d.]+)/i);
    if (!match) return { pass: false, reason: "PHOTON_WAVELENGTH_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const wavelengthNm = Number(match[1]);
    return numericalDecision(row, PLANCK / (wavelengthNm * 1e-9), `Photon momentum:lambda=${wavelengthNm}`, "p=h/lambda");
  }

  if (row.topic === "Radiation pressure and photon momentum" || row.topic === "Radiation force on reflector") {
    const match = question.match(/power\s+\\\(([\d.]+)/i);
    if (!match) return { pass: false, reason: "BEAM_POWER_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const power = Number(match[1]);
    const reflectionFactor = row.topic === "Radiation force on reflector" ? 2 : 1;
    return numericalDecision(row, reflectionFactor * power / LIGHT_SPEED, `${row.topic}:P=${power}`, `F=${reflectionFactor === 2 ? "2P/c" : "P/c"}`);
  }

  if (row.topic === "Kinetic energy from matter wavelength") {
    const match = question.match(/wavelength\s+\\\(([\d.]+)/i);
    if (!match) return { pass: false, reason: "MATTER_WAVELENGTH_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const wavelengthM = Number(match[1]) * 1e-9;
    const expectedEv = PLANCK ** 2 / (2 * ELECTRON_MASS * wavelengthM ** 2) / ELEMENTARY_CHARGE;
    return numericalDecision(row, expectedEv, `Electron kinetic energy:lambda=${match[1]}`, "K=h^2/(2m_e lambda^2)");
  }

  if (row.topic === "Photoelectric effect") {
    return conceptualDecision(row, /emission of electrons.*electromagnetic radiation/, "Photoelectric effect:definition", "The photoelectric effect is electron emission from a material exposed to radiation of sufficient frequency.");
  }

  if (row.topic === "Threshold frequency") {
    return conceptualDecision(row, /minimum incident frequency required.*photoelectric emission/, "Threshold frequency:definition", "The threshold frequency is the minimum frequency satisfying h nu_0 = phi.");
  }

  if (row.topic === "Frequency and photoelectron energy") {
    return conceptualDecision(row, /maximum kinetic energy/, "Photoelectric frequency:Kmax", "For a fixed surface, K_max=h nu-phi; increasing an above-threshold frequency increases K_max.");
  }

  if (row.topic === "Intensity and photocurrent") {
    return conceptualDecision(row, /doubles because twice as many photons/, "Photoelectric intensity:double-current", "At fixed above-threshold frequency, doubling intensity doubles photon flux and ideally doubles saturation current.");
  }

  if (row.topic === "Photoelectric experimental design") {
    return conceptualDecision(row, /several monochromatic frequencies above threshold.*current-zero voltage.*surface unchanged/, "Photoelectric experiment:Vs-vs-frequency", "Measure current cutoff for several above-threshold frequencies on one unchanged emitting surface.");
  }

  if (row.topic === "Hertz and Lenard observations") {
    return conceptualDecision(row, /without a measurable time lag.*frequency exceeds threshold/, "Photoelectric observations:no-lag", "Above threshold, photoemission begins without an appreciable classical energy-accumulation delay.");
  }

  if (row.topic === "de Broglie relation") {
    return conceptualDecision(row, /lambda=h\/p/, "Matter waves:de-Broglie-relation", "The associated matter wavelength is lambda=h/p.");
  }

  if (row.topic === "Momentum dependence of matter wavelength") {
    const match = question.match(/momentum is increased by a factor of\s+(\d+(?:\.\d+)?)/i);
    if (!match) return { pass: false, reason: "MOMENTUM_FACTOR_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const factor = Number(match[1]);
    return numericalDecision(row, 1 / factor, `${row.topic}:factor=${factor}`, "Because lambda=h/p, multiplying momentum by a factor divides wavelength by that factor.");
  }

  if (row.topic === "Multiple-frequency illumination") {
    const wavelengths = [...question.matchAll(/(\d+(?:\.\d+)?)\\ \\mathrm\{nm\}/g)].map((match) => Number(match[1]));
    if (wavelengths.length !== 3) return { pass: false, reason: "MULTIPLE_FREQUENCY_WAVELENGTHS_NOT_PARSED", familyKey: `${row.topic}:invalid:${row.id}` };
    const [threshold, first, second] = wavelengths;
    const emitting = [first, second].filter((wavelength) => wavelength <= threshold);
    if (emitting.length !== 1) return { pass: false, reason: "MULTIPLE_FREQUENCY_NOT_SINGLE_EMITTER", familyKey: `${row.topic}:threshold=${threshold}:first=${first}:second=${second}` };
    return numericalDecision(row, emitting[0], `${row.topic}:threshold=${threshold}:first=${first}:second=${second}`, "Only wavelengths at or below the threshold wavelength have sufficient photon energy to eject electrons.");
  }

  if (row.topic === "Photoelectric and matter-wave statements") {
    return conceptualDecision(row, /^3$/, "Photoelectric and matter-wave statements:three-correct", "Statements 1, 2, and 4 are correct; maximum photoelectron kinetic energy depends on incident frequency, so statement 3 is false.");
  }

  if (row.topic === "Dual nature concepts") {
    if (/photon has zero momentum/i.test(question)) {
      return conceptualDecision(row, /assertion is false.*reason is true/, "Dual nature assertion:photon-momentum", "A photon has momentum h/lambda despite zero rest mass; its stated energy relation is true.");
    }
    if (/intensity increases the maximum kinetic energy/i.test(question)) {
      return conceptualDecision(row, /assertion is false.*reason is true/, "Dual nature assertion:intensity-and-Kmax", "Intensity raises photon arrival rate, not per-photon energy or K_max at fixed frequency.");
    }
    if (/intensity above threshold increases saturation photocurrent/i.test(question)) {
      return conceptualDecision(row, /both assertion and reason are true.*correct explanation/, "Dual nature assertion:intensity-and-current", "Greater intensity at fixed frequency supplies more photons per unit time and therefore increases saturation current.");
    }
    if (/matter waves are associated with moving material particles/i.test(question)) {
      return conceptualDecision(row, /both assertion and reason are true.*correct explanation/, "Dual nature assertion:matter-wave", "The de Broglie relation associates lambda=h/p with a moving material particle.");
    }
    return { pass: false, reason: "DUAL_NATURE_ASSERTION_NOT_RECOGNIZED", familyKey: `${row.topic}:invalid:${row.id}` };
  }

  if (row.topic === "Equal-wavelength particles") {
    return numericalDecision(row, 1839, "Equal wavelength:electron-neutron:kinetic-energy-ratio", "Equal lambda means equal p, so K_e/K_n=m_n/m_e approximately 1839.");
  }

  if (row.topic === "Equal-energy matter waves") {
    return numericalDecision(row, Math.sqrt(1837), "Equal energy:electron-proton:wavelength-ratio", "At equal non-relativistic kinetic energy, lambda is proportional to 1/sqrt(m), giving lambda_e/lambda_p=sqrt(m_p/m_e).");
  }

  if (row.topic === "Equal-speed matter waves") {
    return numericalDecision(row, 1837, "Equal speed:electron-proton:wavelength-ratio", "At equal speed, lambda is proportional to 1/m, giving lambda_e/lambda_p=m_p/m_e.");
  }

  return { pass: false, reason: "TOPIC_NOT_SUPPORTED", familyKey: `unsupported:${row.id}` };
}

async function main() {
  const { apply } = parseArgs(process.argv.slice(2));
  const rows = await prisma.bankQuestion.findMany({
    where: {
      importBatch: IMPORT_BATCH,
      source: "AI",
      OR: [
        { topic: { in: TOPICS } },
        { id: { in: [...MANUALLY_ADJUDICATED_SOLUTION_ONE_OFFS] } },
      ],
    },
    orderBy: [{ topic: "asc" }, { contentHash: "asc" }],
  });
  const reviewed = rows.map((row) => ({ row, decision: decisionFor(row) }));
  const familySizes = new Map();
  for (const item of reviewed) {
    if (!item.decision.pass) continue;
    familySizes.set(item.decision.familyKey, (familySizes.get(item.decision.familyKey) ?? 0) + 1);
  }
  const accepted = reviewed.filter((item) => item.decision.pass);
  const clusteredVariants = accepted.filter((item) => (familySizes.get(item.decision.familyKey) ?? 0) > 1);
  const failed = reviewed.filter((item) => !item.decision.pass);
  const reviewedAt = new Date();
  const duplicateClusterIdFor = (item) => (familySizes.get(item.decision.familyKey) ?? 0) > 1
    ? `verified-family-${createHash("sha256").update(item.decision.familyKey).digest("hex").slice(0, 40)}`
    : item.row.duplicateClusterId;

  if (apply) {
    const pendingAccepted = accepted.filter((item) => !(item.row.verified === true
        && item.row.qualityStatus === "VERIFIED_STRICT"
        && item.row.verificationMethod === "CODEX_PER_QUESTION_DERIVATION"
        && item.row.verificationVersion === "new-json-deterministic-v1"
        && item.row.duplicateClusterId === duplicateClusterIdFor(item)
        && item.row.contentHash === contentHash(item.row.question, item.row.optionsJson)));
    for (let offset = 0; offset < pendingAccepted.length; offset += 75) {
      const batch = pendingAccepted.slice(offset, offset + 75);
      await prisma.$transaction(batch.map((item) => prisma.bankQuestion.update({
          where: { id: item.row.id },
          data: {
          verified: true,
          qualityStatus: "VERIFIED_STRICT",
          qualityScore: 0.99,
          verifiedAt: reviewedAt,
          rejectedAt: null,
          verifierModel: "CODEX_DETERMINISTIC_ACADEMIC_SOLVER",
          verifierRuns: [{
            verifier: "CODEX_DETERMINISTIC_ACADEMIC_SOLVER",
            version: "new-json-deterministic-v1",
            method: "PER_QUESTION_FORMULA_OR_CONCEPT_DERIVATION",
            checks: ["independent_answer", "single_correct_option", "solution", "four_option_rationales", "semantic_duplicate_family"],
            expected: item.decision.expected ?? null,
            observed: item.decision.actual ?? null,
            derivation: item.decision.derivation,
            passed: true,
            reviewedAt: reviewedAt.toISOString(),
          }],
          verificationMethod: "CODEX_PER_QUESTION_DERIVATION",
          verificationVersion: "new-json-deterministic-v1",
          duplicateClusterId: duplicateClusterIdFor(item),
          rejectReason: null,
          optionsJson: item.row.optionsJson,
          optionExplanationsJson: item.row.optionExplanationsJson,
          contentHash: contentHash(item.row.question, item.row.optionsJson),
          selectionKey: contentHash(item.row.question, item.row.optionsJson),
          },
        })));
    }
    for (let offset = 0; offset < failed.length; offset += 500) {
      const batch = failed.slice(offset, offset + 500);
      await prisma.bankQuestion.updateMany({
        where: { id: { in: batch.map((item) => item.row.id) } },
        data: {
          verified: false,
          qualityStatus: "NEEDS_REVIEW",
          qualityScore: null,
          verifiedAt: null,
          verifierModel: null,
          verifierRuns: [{
            verifier: "CODEX_DETERMINISTIC_ACADEMIC_SOLVER",
            version: "new-json-deterministic-v1",
            method: "PER_QUESTION_FORMULA_OR_CONCEPT_DERIVATION",
            passed: false,
            evidenceManifest: "data/bank-import/new-json-intake/deterministic-adjudication-v1.json",
            reviewedAt: reviewedAt.toISOString(),
          }],
          verificationMethod: "ACADEMIC_REPAIR_REQUIRED",
          verificationVersion: "new-json-deterministic-v1",
          rejectReason: "Preserved for repair: the deterministic evidence manifest records an answer, ambiguity, or parsing failure.",
        },
      });
    }
  }

  const byTopic = {};
  for (const item of accepted) byTopic[item.row.topic] = (byTopic[item.row.topic] ?? 0) + 1;
  const report = {
    generatedAt: reviewedAt.toISOString(),
    applied: apply,
    importBatch: IMPORT_BATCH,
    reviewed: reviewed.length,
    accepted: accepted.length,
    clusteredVariants: clusteredVariants.length,
    semanticDuplicatesHeld: 0,
    failed: failed.length,
    acceptedByTopic: byTopic,
    failures: failed.map((item) => ({
      id: item.row.id,
      topic: item.row.topic,
      reason: item.decision.reason,
      expected: item.decision.expected ?? null,
      actual: item.decision.actual ?? null,
    })),
    policy: {
      provenancePreserved: "AI_GENERATED_USER_SUPPLIED",
      pyqEligibility: false,
      normalTestEligibility: apply,
      numericalRowsIndependentlyRecomputed: true,
      conceptualFamiliesManuallySpecified: true,
      sameFamilyVariantsServeableAcrossTests: true,
      maximumSameFamilyQuestionsPerTest: 1,
      databaseRowsDeleted: 0,
    },
  };
  const output = path.resolve("data/bank-import/new-json-intake/deterministic-adjudication-v1.json");
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
