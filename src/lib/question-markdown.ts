const MATH_SEGMENT = /\$\$([\s\S]+?)\$\$|\$([^$\n]+)\$/g;
const BARE_TEX_COMMAND = /\\(?:ce|d?frac|mathrm|mathbf|mathit|operatorname|overline|underline|sqrt|text|vec|hat|bar|dot|ddot|times|cdot|div|pm|mp|leq?|geq?|neq|approx|propto|infty|sum|prod|int|lim|Delta|delta|theta|alpha|beta|gamma|lambda|mu|nu|pi|rho|sigma|omega)\b/;

function repairBareTexRuns(value: string) {
  let text = value;

  // A few imports split a single equation into adjacent/empty dollar spans,
  // e.g. `$\\cos\\theta=$\\frac{1}{2}$$`.
  text = text.replace(/(?<!\$)\$([^$\n]{1,80}=)\$((?:\\(?:d?frac|sqrt)|-?\d)[^$\n]{0,80})\$\$(?!\$)/g, (_match, left: string, right: string) => `$${left}${right}$`);

  // Preserve genuine currency rather than letting a single dollar sign start
  // an unterminated math span.
  text = text.replace(/\b(US|USD)\s+\$(?=\d)/gi, (_match, currency: string) => `${currency} \\$`);

  // Close the small class of legacy one-sided `$...` spans before protecting
  // the already-valid math regions below.
  const dollars = [...text.matchAll(/(?<!\\)\$/g)];
  if (dollars.length % 2 === 1) {
    const start = dollars.at(-1)?.index ?? -1;
    const tail = text.slice(start + 1);
    if (start >= 0 && /[\\_^{}=+\-*/()]|^\s*\d/.test(tail)) {
      const sentenceBoundary = tail.search(/[.;:?!](?=\s+[A-Z]|$)/);
      const end = sentenceBoundary >= 0 ? start + 1 + sentenceBoundary : text.length;
      text = `${text.slice(0, end)}$${text.slice(end)}`;
    }
  }

  // Bare-expression repairs must never operate inside an already-delimited
  // expression. Protect those spans while repairing the surrounding prose.
  const protectedMath: string[] = [];
  text = text.replace(MATH_SEGMENT, (segment) => {
    const token = `\uE000MATH${protectedMath.length}\uE001`;
    protectedMath.push(segment);
    return token;
  });

  // Parenthesised scientific expressions are safe to isolate as inline math.
  text = text.replace(/\(([^()\n]*\\(?:lambda|overline|cdot|times|d?frac|sqrt)[^()\n]*)\)/g, (_match, expression: string) => `($${expression}$)`);

  // Common Boolean expressions found outside delimiters.
  text = text.replace(/\bY\s*=\s*\\overline\{(?:[^{}]|\{[^{}]*\})*\}/g, (expression) => `$${expression}$`);
  text = text.replace(/\bY\s*=\s*[A-Za-z]\s*\\cdot\s*[A-Za-z]\b/g, (expression) => `$${expression}$`);

  // DBE formulae followed by prose (`where` / `For`) need only the equation
  // wrapped, not the explanatory sentence around it.
  text = text.replace(/\bDBE\s*=\s*[^.\n]*?(?=\s+(?:where|For)\b|[.;]|$)/g, (expression) => BARE_TEX_COMMAND.test(expression) ? `$${expression.trim()}$` : expression);

  // The DBE repair above can create new, valid math spans. Protect those too
  // before the generic fraction fallback so it cannot introduce nested dollar
  // delimiters inside an equation that has already been repaired.
  text = text.replace(MATH_SEGMENT, (segment) => {
    const token = `\uE000MATH${protectedMath.length}\uE001`;
    protectedMath.push(segment);
    return token;
  });

  // If a long prose explanation contains an additional standalone fraction,
  // render that complete fraction without turning the surrounding prose into
  // math. Nested one-level groups cover scientific subscripts and exponents.
  text = text.replace(/\\d?frac\{(?:[^{}]|\{[^{}]*\})*\}\{(?:[^{}]|\{[^{}]*\})*\}/g, (expression) => `$${expression}$`);

  // A standalone numerical/formula option can safely be treated wholly as
  // math. Prose is deliberately excluded from this conservative repair.
  if (!text.includes("$") && BARE_TEX_COMMAND.test(text) && text.length <= 160 && !/[?]|\b(?:the|which|where|because|therefore)\b/i.test(text)) {
    text = `$${text.trim()}$`;
  }

  return text.replace(/\uE000MATH(\d+)\uE001/g, (_token, index: string) => protectedMath[Number(index)] ?? "");
}

/** Repair a small set of mechanically damaged TeX forms without changing the
 * underlying numbers, operators, variables, or scientific meaning. */
export function normalizeTexExpression(value: string) {
  let expression = String(value ?? "")
    .replace(/\\\\(?=[A-Za-z])/g, "\\")
    .replace(/(^|[^A-Za-z\\])rac(?=\s*\{)/g, "$1\\frac")
    .replace(/(^|[^A-Za-z\\])ext(?=\s*\{)/g, "$1\\text")
    .replace(/(^|[^A-Za-z\\])qrt(?=\s*\{)/g, "$1\\sqrt")
    .replace(/(^|[^A-Za-z\\])egin(?=\s*\{)/g, "$1\\begin")
    .replace(/_\\(max|min)\b/g, "_{\\$1}");

  // `\\text{m s^{-1}}` is invalid because text mode cannot contain a TeX
  // exponent. Roman math preserves both the unit typography and the exponent.
  expression = expression.replace(/\\text\{((?:[^{}]|\{[^{}]*\})*)\}/g, (whole, inner: string) => {
    const trimmed = inner.trim();
    if (/^\\[A-Za-z]+$/.test(trimmed)) return trimmed;
    if (/[_^]/.test(trimmed)) return `\\mathrm{${trimmed.replace(/\s+/g, "\\,")}}`;
    return whole;
  });
  return expression;
}

/**
 * Normalize all supported scientific-question markup for remark-math/KaTeX.
 * This handles standard TeX delimiters, legacy bare expressions and known
 * mechanical escape damage while leaving ordinary prose and values intact.
 */
export function normalizeQuestionMarkdown(value: string) {
  const standardizedDelimiters = String(value ?? "")
    .replace(/\\\[/g, () => "\n$$\n")
    .replace(/\\\]/g, () => "\n$$\n")
    .replace(/\\\(/g, () => "$")
    .replace(/\\\)/g, () => "$");
  const delimited = repairBareTexRuns(standardizedDelimiters);

  return delimited.replace(MATH_SEGMENT, (whole, display: string | undefined, inline: string | undefined) => {
    const expression = normalizeTexExpression(display ?? inline ?? "");
    return display !== undefined ? `$$${expression}$$` : `$${expression}$`;
  });
}
