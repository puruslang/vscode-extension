"use strict";

const KEYWORDS = new Set([
  "const", "let", "var", "be",
  "fn", "async", "return", "to", "gives",
  "if", "elif", "else", "unless", "then",
  "while", "until", "do", "for", "in", "range",
  "match", "when", "switch", "case",
  "try", "catch", "finally", "throw",
  "import", "from", "export", "default", "require", "use", "namespace", "public", "all", "with",
  "add", "sub", "mul", "div", "mod", "neg", "pow",
  "eq", "neq", "lt", "gt", "le", "ge",
  "and", "or", "not", "pipe", "coal",
  "band", "bor", "bxor", "bnot", "shl", "shr", "ushr",
  "as", "of", "typeof", "instanceof", "type",
  "new", "delete", "this", "await", "yield",
  "class", "extends", "super", "static", "private", "protected", "get", "set",
  "true", "false", "null", "nil", "undefined", "nan", "infinity",
  "break", "continue",
  "list", "object",
  "function",
  "blank",
]);

function tokenize(source) {
  const tokens = [];
  const errors = [];
  let i = 0;
  let line = 0;
  let col = 0;
  const len = source.length;

  while (i < len) {
    const sl = line;
    const sc = col;

    // Newline
    if (source[i] === "\n") {
      tokens.push({ type: "newline", line: sl, col: sc });
      i++; line++; col = 0;
      continue;
    }
    if (source[i] === "\r") { i++; continue; }

    // Whitespace
    if (source[i] === " " || source[i] === "\t") {
      const start = i;
      while (i < len && (source[i] === " " || source[i] === "\t")) { i++; col++; }
      tokens.push({ type: "ws", value: source.slice(start, i), line: sl, col: sc });
      continue;
    }

    // Block comment ---
    if (source[i] === "-" && source[i + 1] === "-" && source[i + 2] === "-") {
      let end = source.indexOf("---", i + 3);
      if (end === -1) {
        errors.push({ line: sl, col: sc, endLine: line, endCol: col + (len - i), msg: "Unclosed block comment `---`" });
        end = len;
      } else {
        end += 3;
      }
      const val = source.slice(i, end);
      for (const ch of val) { if (ch === "\n") { line++; col = 0; } else { col++; } }
      tokens.push({ type: "block-comment", value: val, line: sl, col: sc });
      i = end;
      continue;
    }

    // Line comment --
    if (source[i] === "-" && source[i + 1] === "-") {
      let end = source.indexOf("\n", i);
      if (end === -1) end = len;
      tokens.push({ type: "comment", value: source.slice(i, end), line: sl, col: sc });
      col += end - i; i = end;
      continue;
    }

    // String ///
    if (source[i] === "/" && source[i + 1] === "/" && source[i + 2] === "/") {
      let j = i + 3; col += 3;
      let closed = false;
      while (j < len) {
        if (source[j] === "\\" && j + 1 < len) { j += 2; col += 2; continue; }
        if (source[j] === "/" && source[j + 1] === "/" && source[j + 2] === "/") {
          j += 3; col += 3; closed = true; break;
        }
        if (source[j] === "\n") { line++; col = 0; } else { col++; }
        j++;
      }
      if (!closed) {
        errors.push({ line: sl, col: sc, endLine: line, endCol: col, msg: "Unclosed string `///`" });
      }
      tokens.push({ type: "string", value: source.slice(i, j), line: sl, col: sc, endLine: line, endCol: col });
      i = j;
      continue;

    // Semicolon string //;...;//
    } else if (source[i] === "/" && source[i + 1] === "/" && source[i + 2] === ";") {
      let j = i + 3; col += 3;
      let closed = false;
      while (j < len) {
        if (source[j] === "\\" && j + 1 < len) { j += 2; col += 2; continue; }
        if (source[j] === ";" && source[j + 1] === "/" && source[j + 2] === "/") {
          j += 3; col += 3; closed = true; break;
        }
        if (source[j] === "\n") { line++; col = 0; } else { col++; }
        j++;
      }
      if (!closed) {
        errors.push({ line: sl, col: sc, endLine: line, endCol: col, msg: "Unclosed semicolon string `//;`" });
      }
      tokens.push({ type: "string", value: source.slice(i, j), line: sl, col: sc, endLine: line, endCol: col });
      i = j;
      continue;
    }

    // Regex /pattern/flags (single slash, not part of ///)
    if (source[i] === "/" && source[i + 1] !== "/") {
      const prev = tokens.filter(t => t.type !== "ws" && t.type !== "newline").pop();
      const isRegexCtx = !prev || prev.type === "keyword" || prev.type === "punct"
        || prev.value === "be" || prev.value === "[" || prev.value === ";" || prev.value === ",";
      if (isRegexCtx) {
        let j = i + 1; let c2 = col + 1;
        let closed = false;
        while (j < len && source[j] !== "\n") {
          if (source[j] === "\\" && j + 1 < len) { j += 2; c2 += 2; continue; }
          if (source[j] === "/") { j++; c2++; closed = true; break; }
          j++; c2++;
        }
        if (closed) {
          while (j < len && /[gimsuy]/.test(source[j])) { j++; c2++; }
          tokens.push({ type: "regex", value: source.slice(i, j), line: sl, col: sc });
          i = j; col = c2;
          continue;
        }
      }
    }

    // Punctuation
    if ("[],;".includes(source[i])) {
      tokens.push({ type: "punct", value: source[i], line: sl, col: sc });
      i++; col++;
      continue;
    }

    // Optional chaining \.
    if (source[i] === "\\" && source[i + 1] === ".") {
      tokens.push({ type: "punct", value: "\\.", line: sl, col: sc });
      i += 2; col += 2;
      continue;
    }

    // Backslash
    if (source[i] === "\\") {
      tokens.push({ type: "punct", value: "\\", line: sl, col: sc });
      i++; col++;
      continue;
    }

    // Dots
    if (source[i] === ".") {
      if (source[i + 1] === "." && source[i + 2] === ".") {
        tokens.push({ type: "punct", value: "...", line: sl, col: sc });
        i += 3; col += 3;
      } else if (source[i + 1] === ".") {
        tokens.push({ type: "punct", value: "..", line: sl, col: sc });
        i += 2; col += 2;
      } else {
        tokens.push({ type: "punct", value: ".", line: sl, col: sc });
        i++; col++;
      }
      continue;
    }

    // Word (identifier or keyword)
    if (/[a-zA-Z_]/.test(source[i])) {
      const start = i;
      while (i < len && /[a-zA-Z0-9_-]/.test(source[i])) { i++; col++; }
      const word = source.slice(start, i);
      tokens.push({ type: KEYWORDS.has(word) ? "keyword" : "ident", value: word, line: sl, col: sc, len: word.length });
      continue;
    }

    // Number (decimal, binary 0b, hex 0x)
    if (/[0-9]/.test(source[i])) {
      const start = i;
      if (source[i] === "0" && i + 1 < len && (source[i + 1] === "b" || source[i + 1] === "B")) {
        i += 2; col += 2;
        while (i < len && /[01]/.test(source[i])) { i++; col++; }
      } else if (source[i] === "0" && i + 1 < len && (source[i + 1] === "x" || source[i + 1] === "X")) {
        i += 2; col += 2;
        while (i < len && /[0-9a-fA-F]/.test(source[i])) { i++; col++; }
      } else {
        while (i < len && /[0-9]/.test(source[i])) { i++; col++; }
        if (i < len && source[i] === "." && i + 1 < len && /[0-9]/.test(source[i + 1])) {
          i++; col++;
          while (i < len && /[0-9]/.test(source[i])) { i++; col++; }
        }
      }
      tokens.push({ type: "number", value: source.slice(start, i), line: sl, col: sc });
      continue;
    }

    // Shebang (only at start of file)
    if (i === 0 && source[i] === "#" && source[i + 1] === "!") {
      let end = source.indexOf("\n", i);
      if (end === -1) end = len;
      tokens.push({ type: "shebang", value: source.slice(i, end), line: sl, col: sc });
      col += end - i; i = end;
      continue;
    }

    // Everything else (potentially forbidden)
    tokens.push({ type: "other", value: source[i], line: sl, col: sc });
    i++; col++;
  }

  return { tokens, errors };
}

module.exports = { tokenize, KEYWORDS };
