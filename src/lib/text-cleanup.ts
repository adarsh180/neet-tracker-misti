const MOJIBAKE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\u00c2\u00a0/g, " "],
  [/\u00c2\u00b0/g, "\u00b0"],
  [/\u00c2\u00b1/g, "\u00b1"],
  [/\u00c2\u00b5/g, "\u03bc"],
  [/\u00c2\u00b7/g, "\u00b7"],
  [/\u00c3\u0097/g, "\u00d7"],
  [/\u00c3\u00b7/g, "\u00f7"],
  [/\u00e2\u20ac\u201c/g, "\u2013"],
  [/\u00e2\u20ac\u201d/g, "\u2014"],
  [/\u00e2\u20ac\u02dc/g, "'"],
  [/\u00e2\u20ac\u2122/g, "'"],
  [/\u00e2\u20ac\u0153/g, '"'],
  [/\u00e2\u20ac\u009d/g, '"'],
  [/\u00e2\u20ac\u00a6/g, "..."],
  [/\u00e2\u02c6\u2019/g, "\u2212"],
  [/\u00e2\u02c6\u2020/g, "\u0394"],
  [/\u00e2\u02c6\u017e/g, "\u221e"],
  [/\u00e2\u02c6\u0161/g, "\u221a"],
  [/\u00e2\u2030\u02c6/g, "\u2248"],
  [/\u00e2\u2030\u00a0/g, "\u2260"],
  [/\u00e2\u2030\u00a4/g, "\u2264"],
  [/\u00e2\u2030\u00a5/g, "\u2265"],
  [/\u00e2\u2020\u2019/g, "\u2192"],
  [/\u00e2\u2020\u0090/g, "\u2190"],
  [/\u00e2\u2020\u2018/g, "\u2191"],
  [/\u00e2\u2020\u2013/g, "\u2193"],
  [/\u00ce\u0094/g, "\u0394"],
  [/\u00ce\u00b1/g, "\u03b1"],
  [/\u00ce\u00b2/g, "\u03b2"],
  [/\u00ce\u00b3/g, "\u03b3"],
  [/\u00ce\u00bc/g, "\u03bc"],
  [/\u00cf\u0080/g, "\u03c0"],
  [/\u00cf\u0081/g, "\u03c1"],
  [/\u00cf\u0083/g, "\u03c3"],
  [/\u00cf\u0089/g, "\u03c9"],
];

const HTML_ENTITIES: Array<[RegExp, string]> = [
  [/&nbsp;/gi, " "],
  [/&minus;/gi, "\u2212"],
  [/&times;/gi, "\u00d7"],
  [/&divide;/gi, "\u00f7"],
  [/&Delta;/g, "\u0394"],
  [/&alpha;/g, "\u03b1"],
  [/&beta;/g, "\u03b2"],
  [/&gamma;/g, "\u03b3"],
  [/&mu;/g, "\u03bc"],
  [/&pi;/g, "\u03c0"],
  [/&rho;/g, "\u03c1"],
  [/&sigma;/g, "\u03c3"],
  [/&omega;/g, "\u03c9"],
  [/&lt;/gi, "<"],
  [/&gt;/gi, ">"],
  [/&amp;/gi, "&"],
];

function textFromObject(value: Record<string, unknown>) {
  for (const key of ["text", "value", "label", "content", "option", "answer", "body", "statement", "name"]) {
    const entry = value[key];
    if (typeof entry === "string" || typeof entry === "number") return String(entry);
  }
  const primitiveValues = Object.values(value).filter((entry) => typeof entry === "string" || typeof entry === "number");
  if (primitiveValues.length === 1) return String(primitiveValues[0]);
  return "";
}

export function cleanQuestionText(value: unknown) {
  let text =
    value && typeof value === "object" && !Array.isArray(value)
      ? textFromObject(value as Record<string, unknown>)
      : String(value ?? "");
  for (const [pattern, replacement] of HTML_ENTITIES) text = text.replace(pattern, replacement);
  for (const [pattern, replacement] of MOJIBAKE_REPLACEMENTS) text = text.replace(pattern, replacement);
  return text
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isPlaceholderText(value: unknown) {
  const text = cleanQuestionText(value);
  return !text || /^\[object Object\]$/i.test(text) || /^(?:undefined|null|nan)$/i.test(text);
}

export function hasUnreadableText(value: unknown) {
  const text = String(value ?? "");
  return /[\ufffd\u00c2\u00c3\u00e2\u00ce\u00cf][\u0080-\u00ff\u2010-\u203f]?|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(text);
}

export function cleanQuestionOptions(options: unknown[]) {
  return options.map((option) => cleanQuestionText(option));
}
