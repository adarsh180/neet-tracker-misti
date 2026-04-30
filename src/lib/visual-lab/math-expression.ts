type Token =
  | { type: "number"; value: number }
  | { type: "identifier"; value: string }
  | { type: "operator"; value: Operator }
  | { type: "leftParen" }
  | { type: "rightParen" }
  | { type: "comma" };

type RpnToken =
  | { type: "number"; value: number }
  | { type: "variable"; value: string }
  | { type: "operator"; value: Operator }
  | { type: "function"; value: FunctionName };

type Operator = "+" | "-" | "*" | "/" | "^" | "neg";
type FunctionName = "sin" | "cos" | "tan" | "exp" | "log" | "sqrt" | "abs";

const FUNCTIONS = new Set<FunctionName>(["sin", "cos", "tan", "exp", "log", "sqrt", "abs"]);
const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

const PRECEDENCE: Record<Operator, number> = {
  "+": 1,
  "-": 1,
  "*": 2,
  "/": 2,
  "neg": 3,
  "^": 4,
};

const RIGHT_ASSOCIATIVE = new Set<Operator>(["^", "neg"]);

export class MathExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MathExpressionError";
  }
}

export type CompiledExpression = {
  source: string;
  evaluate: (vars: Record<string, number>) => number;
};

function isAlpha(char: string) {
  return /^[a-z]$/i.test(char);
}

function isDigit(char: string) {
  return /^[0-9]$/.test(char);
}

function needsImplicitMultiply(prev: Token | undefined, next: Token) {
  if (!prev) return false;
  if (prev.type === "identifier" && FUNCTIONS.has(prev.value as FunctionName) && next.type !== "leftParen") {
    throw new MathExpressionError(`Function "${prev.value}" must be called with parentheses.`);
  }
  const prevCanClose =
    prev.type === "number" || prev.type === "identifier" || prev.type === "rightParen";
  const nextCanOpen =
    next.type === "number" || next.type === "identifier" || next.type === "leftParen";
  if (!prevCanClose || !nextCanOpen) return false;
  if (prev.type === "identifier" && FUNCTIONS.has(prev.value as FunctionName) && next.type === "leftParen") {
    return false;
  }
  return true;
}

function tokenize(input: string): Token[] {
  const normalized = input.toLowerCase().replace(/\s+/g, "");
  if (!normalized) throw new MathExpressionError("Enter an equation first.");
  if (normalized.length > 120) throw new MathExpressionError("Expression is too long for safe plotting.");

  const raw: Token[] = [];
  let index = 0;

  while (index < normalized.length) {
    const char = normalized[index];

    if (isDigit(char) || char === ".") {
      let end = index + 1;
      while (end < normalized.length && /[0-9.]/.test(normalized[end])) end += 1;
      const value = Number(normalized.slice(index, end));
      if (!Number.isFinite(value)) throw new MathExpressionError("Invalid number in expression.");
      raw.push({ type: "number", value });
      index = end;
      continue;
    }

    if (isAlpha(char)) {
      let end = index + 1;
      while (end < normalized.length && /[a-z0-9]/i.test(normalized[end])) end += 1;
      const value = normalized.slice(index, end);
      raw.push({ type: "identifier", value });
      index = end;
      continue;
    }

    if ("+-*/^".includes(char)) {
      raw.push({ type: "operator", value: char as Operator });
      index += 1;
      continue;
    }

    if (char === "(") {
      raw.push({ type: "leftParen" });
      index += 1;
      continue;
    }

    if (char === ")") {
      raw.push({ type: "rightParen" });
      index += 1;
      continue;
    }

    if (char === ",") {
      raw.push({ type: "comma" });
      index += 1;
      continue;
    }

    throw new MathExpressionError(`Unsupported character "${char}".`);
  }

  const withImplicit: Token[] = [];
  for (const token of raw) {
    const prev = withImplicit[withImplicit.length - 1];
    if (needsImplicitMultiply(prev, token)) withImplicit.push({ type: "operator", value: "*" });
    withImplicit.push(token);
  }

  return withImplicit;
}

function toRpn(tokens: Token[]): RpnToken[] {
  const output: RpnToken[] = [];
  const operators: Array<{ type: "operator"; value: Operator } | { type: "function"; value: FunctionName } | { type: "leftParen" }> = [];
  let previous: Token | undefined;

  for (const token of tokens) {
    if (token.type === "number") {
      output.push(token);
    } else if (token.type === "identifier") {
      if (token.value in CONSTANTS) {
        output.push({ type: "number", value: CONSTANTS[token.value] });
      } else if (FUNCTIONS.has(token.value as FunctionName)) {
        operators.push({ type: "function", value: token.value as FunctionName });
      } else {
        output.push({ type: "variable", value: token.value });
      }
    } else if (token.type === "operator") {
      if (previous?.type === "identifier" && FUNCTIONS.has(previous.value as FunctionName)) {
        throw new MathExpressionError(`Function "${previous.value}" must be called with parentheses.`);
      }
      const unary =
        token.value === "-" &&
        (!previous ||
          previous.type === "operator" ||
          previous.type === "leftParen" ||
          previous.type === "comma");
      const op = unary ? "neg" : token.value;

      while (operators.length) {
        const top = operators[operators.length - 1];
        if (top.type === "leftParen" || top.type === "function") break;

        const shouldPop = RIGHT_ASSOCIATIVE.has(op)
          ? PRECEDENCE[op] < PRECEDENCE[top.value]
          : PRECEDENCE[op] <= PRECEDENCE[top.value];
        if (!shouldPop) break;
        output.push(operators.pop() as RpnToken);
      }

      operators.push({ type: "operator", value: op });
    } else if (token.type === "leftParen") {
      operators.push({ type: "leftParen" });
    } else if (token.type === "rightParen") {
      while (operators.length && operators[operators.length - 1].type !== "leftParen") {
        output.push(operators.pop() as RpnToken);
      }
      if (!operators.length) throw new MathExpressionError("Mismatched parentheses.");
      operators.pop();
      if (operators[operators.length - 1]?.type === "function") {
        output.push(operators.pop() as RpnToken);
      }
    }

    previous = token;
  }

  while (operators.length) {
    const top = operators.pop();
    if (!top || top.type === "leftParen") throw new MathExpressionError("Mismatched parentheses.");
    output.push(top as RpnToken);
  }

  return output;
}

function applyFunction(name: FunctionName, value: number) {
  if (name === "sin") return Math.sin(value);
  if (name === "cos") return Math.cos(value);
  if (name === "tan") {
    const out = Math.tan(value);
    return Math.abs(out) > 1e6 ? Number.NaN : out;
  }
  if (name === "exp") return Math.exp(value);
  if (name === "log") return value > 0 ? Math.log(value) : Number.NaN;
  if (name === "sqrt") return value >= 0 ? Math.sqrt(value) : Number.NaN;
  return Math.abs(value);
}

function evaluateRpn(rpn: RpnToken[], vars: Record<string, number>) {
  const stack: number[] = [];

  for (const token of rpn) {
    if (token.type === "number") {
      stack.push(token.value);
    } else if (token.type === "variable") {
      stack.push(vars[token.value] ?? vars[token.value.toUpperCase()] ?? 0);
    } else if (token.type === "function") {
      const a = stack.pop();
      if (a === undefined) throw new MathExpressionError("Function is missing an input.");
      stack.push(applyFunction(token.value, a));
    } else {
      if (token.value === "neg") {
        const a = stack.pop();
        if (a === undefined) throw new MathExpressionError("Unary minus is missing a value.");
        stack.push(-a);
        continue;
      }

      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) throw new MathExpressionError("Operator is missing a value.");
      if (token.value === "+") stack.push(a + b);
      if (token.value === "-") stack.push(a - b);
      if (token.value === "*") stack.push(a * b);
      if (token.value === "/") stack.push(Math.abs(b) < 1e-12 ? Number.NaN : a / b);
      if (token.value === "^") {
        const out = Math.pow(a, b);
        stack.push(Number.isFinite(out) && Math.abs(out) < 1e8 ? out : Number.NaN);
      }
    }
  }

  if (stack.length !== 1) throw new MathExpressionError("Expression could not be reduced to one value.");
  return stack[0];
}

export function compileExpression(source: string): CompiledExpression {
  const clean = source.trim().replace(/^y\s*=\s*/i, "").replace(/^z\s*=\s*/i, "");
  const rpn = toRpn(tokenize(clean));
  evaluateRpn(rpn, { x: 1, y: 1, a: 1, b: 1, c: 1, m: 1, n: 1, k: 1 });
  return {
    source: clean,
    evaluate(vars) {
      try {
        const value = evaluateRpn(rpn, vars);
        return Number.isFinite(value) ? value : Number.NaN;
      } catch {
        return Number.NaN;
      }
    },
  };
}

export function tryEvaluate(source: string, vars: Record<string, number>) {
  try {
    return { ok: true as const, value: compileExpression(source).evaluate(vars) };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Invalid expression." };
  }
}
