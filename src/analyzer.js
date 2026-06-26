"use strict";

const vscode = require("vscode");
const { tokenize } = require("./tokenizer");

const STDLIB_MODULES = new Set(["p-random", "p-math", "p-string", "p-datetime", "p-json", "p-object", "p-number", "p-array", "p-error", "p-regexp", "p-promise", "p-set", "p-map"]);

const DECL_KEYWORDS = new Set(["const", "let", "var"]);

// Characters that should never appear in Purus source (outside strings/comments/regex)
const FORBIDDEN_CHARS = {
  "(": "Use `[]` for function calls and grouping, not `()`",
  ")": "Use `[]` for function calls and grouping, not `()`",
  "{": "Purus uses indentation-based blocks, not `{}`",
  "}": "Purus uses indentation-based blocks, not `{}`",
  '"': "Use `///` for strings, not double quotes",
  "'": "Use `///` for strings, not single quotes",
  "=": "Use `be` for assignment, `eq` for equality",
  "+": "Use `add` for addition",
  "*": "Use `mul` for multiplication",
  "%": "Use `mod` for modulo",
  "!": "Use `not` for logical NOT",
  "?": "Use `coal` for nullish coalescing, `\\.` for optional chaining",
  "|": "Use `or` / `bor` / `pipe` instead",
  "&": "Use `and` / `band` instead",
  "^": "Use `bxor` for bitwise XOR",
  "~": "Use `bnot` for bitwise NOT",
  "<": "Use `lt` for less-than comparison",
  ">": "Use `gt` for greater-than comparison",
  ":": "Unexpected `:` in Purus source",
  "`": "Use `///` for strings, not template literals",
  "#": "Unexpected `#` in Purus source. Private fields use `private` keyword",
  "@": "Unexpected `@` in Purus source. Decorators are not supported",
  "$": "Unexpected `$` in Purus source",
};

function diag(line, col, endLine, endCol, msg, severity, code, tags) {
  const d = new vscode.Diagnostic(
    new vscode.Range(line, col, endLine, endCol),
    msg, severity
  );
  d.source = "purus";
  if (code) d.code = code;
  if (tags) d.tags = tags;
  return d;
}

function analyzePurus(text) {
  const { tokens, errors: tokenErrors } = tokenize(text);
  const diagnostics = [];
  const lines = text.split("\n");

  // Tokenizer-level errors (unclosed strings, comments)
  for (const err of tokenErrors) {
    diagnostics.push(diag(
      err.line, err.col, err.endLine ?? err.line, err.endCol ?? err.col + 1,
      err.msg, vscode.DiagnosticSeverity.Error
    ));
  }

  // Build significant token list (skip whitespace, newlines, comments)
  const sig = tokens.filter(t =>
    t.type !== "ws" && t.type !== "newline" &&
    t.type !== "comment" && t.type !== "block-comment" && t.type !== "shebang"
  );

  // Collect mutable-declared variables (let, for-loop vars, catch vars)
  const mutableVars = new Set();
  const constVars = new Set();
  for (let i = 0; i < sig.length; i++) {
    // `let <ident>`
    if (sig[i].type === "keyword" && sig[i].value === "let" && sig[i + 1]?.type === "ident") {
      mutableVars.add(sig[i + 1].value);
    }
    // `const <ident>`
    if (sig[i].type === "keyword" && sig[i].value === "const" && sig[i + 1]?.type === "ident") {
      constVars.add(sig[i + 1].value);
    }
    // `for <ident> in` or `for <ident>; <ident> in`
    if (sig[i].type === "keyword" && sig[i].value === "for") {
      for (let j = i + 1; j < sig.length && j <= i + 5; j++) {
        if (sig[j].type === "keyword" && sig[j].value === "in") break;
        if (sig[j].type === "ident") mutableVars.add(sig[j].value);
      }
    }
    // `catch <ident>`
    if (sig[i].type === "keyword" && sig[i].value === "catch" && sig[i + 1]?.type === "ident") {
      mutableVars.add(sig[i + 1].value);
    }
  }

  // ---- Pre-pass: Multi-character JS operator patterns ----
  const jsOpSkip = new Set();
  const seenStdlibs = new Set();
  for (let i = 0; i < sig.length; i++) {
    const t = sig[i];
    if (t.type !== "other") continue;
    const n1 = i + 1 < sig.length ? sig[i + 1] : null;
    const n2 = i + 2 < sig.length ? sig[i + 2] : null;
    // Three-char patterns
    if (n1?.type === "other" && n2?.type === "other") {
      const tri = t.value + n1.value + n2.value;
      if (tri === "===") {
        diagnostics.push(diag(t.line, t.col, n2.line, n2.col + 1, "`===` is not valid in Purus. Use `eq` for equality", vscode.DiagnosticSeverity.Error, "js-operator"));
        jsOpSkip.add(i); jsOpSkip.add(i + 1); jsOpSkip.add(i + 2); i += 2; continue;
      }
      if (tri === "!==") {
        diagnostics.push(diag(t.line, t.col, n2.line, n2.col + 1, "`!==` is not valid in Purus. Use `neq` for inequality", vscode.DiagnosticSeverity.Error, "js-operator"));
        jsOpSkip.add(i); jsOpSkip.add(i + 1); jsOpSkip.add(i + 2); i += 2; continue;
      }
    }
    // Two-char patterns
    if (n1?.type === "other") {
      const pair = t.value + n1.value;
      // //; is the start of a semicolon string //;...;// — skip the whole token range
      if (pair === "//" && n2?.type === "punct" && n2.value === ";") {
        jsOpSkip.add(i); jsOpSkip.add(i + 1);
        // Scan forward and skip all tokens until we find ; followed by //
        let k = i + 2;
        while (k < sig.length) {
          jsOpSkip.add(k);
          const sk = sig[k];
          const sk1 = k + 1 < sig.length ? sig[k + 1] : null;
          const sk2 = k + 2 < sig.length ? sig[k + 2] : null;
          if (sk.type === "punct" && sk.value === ";" &&
              sk1?.type === "other" && sk1.value === "/" &&
              sk2?.type === "other" && sk2.value === "/") {
            jsOpSkip.add(k + 1); jsOpSkip.add(k + 2);
            k += 3;
            break;
          }
          k++;
        }
        i = k - 1;
        continue;
      }
      const JS_OPS = {
        "!=": "`!=` is not valid in Purus. Use `neq` for inequality",
        "==": "`==` is not valid in Purus. Use `eq` for equality",
        "=>": "`=>` arrow function is not valid in Purus. Use `fn name args to body`",
        "&&": "`&&` is not valid in Purus. Use `and` for logical AND",
        "||": "`||` is not valid in Purus. Use `or` for logical OR",
        "++": "`++` is not valid in Purus. Use `x be x add 1`",
        "+=": "`+=` is not valid in Purus. Use `x be x add ...`",
        "-=": "`-=` is not valid in Purus. Use `x be x sub ...`",
        "*=": "`*=` is not valid in Purus. Use `x be x mul ...`",
        "**": "`**` is not valid in Purus. Use `pow` for exponentiation",
        "//": "`//` is not a comment in Purus. Use `--` for comments, `///` for strings",
        "<<": "`<<` is not valid in Purus. Use `shl` for left shift",
        ">>": "`>>` is not valid in Purus. Use `shr` for right shift",
      };
      if (JS_OPS[pair]) {
        diagnostics.push(diag(t.line, t.col, n1.line, n1.col + 1, JS_OPS[pair], vscode.DiagnosticSeverity.Error, "js-operator"));
        jsOpSkip.add(i); jsOpSkip.add(i + 1); i += 1; continue;
      }
    }
  }

  for (let ti = 0; ti < sig.length; ti++) {
    const tok = sig[ti];
    const prev = ti > 0 ? sig[ti - 1] : null;
    const next = ti + 1 < sig.length ? sig[ti + 1] : null;
    const next2 = ti + 2 < sig.length ? sig[ti + 2] : null;
    const tokEnd = tok.col + (tok.len || tok.value?.length || 1);

    // ---- ERRORS: Forbidden JS characters ----
    if (tok.type === "other" && FORBIDDEN_CHARS[tok.value] && !jsOpSkip.has(ti)) {
      diagnostics.push(diag(
        tok.line, tok.col, tok.line, tok.col + 1,
        FORBIDDEN_CHARS[tok.value],
        vscode.DiagnosticSeverity.Error, "forbidden-char"
      ));
    }

    // ---- ERRORS: JS keywords used instead of Purus equivalents ----

    // `function` — use `fn`
    if (tok.type === "ident" && tok.value === "function") {
      diagnostics.push(diag(
        tok.line, tok.col, tok.line, tokEnd,
        "`function` is not valid in Purus. Use `fn` to declare functions",
        vscode.DiagnosticSeverity.Error, "js-function"
      ));
    }

    // ---- ERRORS: Removed keywords ----

    // `is` — removed in v0.9.0
    if (tok.type === "ident" && tok.value === "is" && prev &&
      (prev.type === "ident" || prev.type === "number" || prev.type === "string" || prev.value === "]")) {
      diagnostics.push(diag(
        tok.line, tok.col, tok.line, tokEnd,
        "`is` was removed in v0.9.0. Use `eq` instead",
        vscode.DiagnosticSeverity.Error, "removed-is",
        [vscode.DiagnosticTag.Deprecated]
      ));
    }

    // `witch` — renamed to `switch` in v0.8.1
    if (tok.type === "ident" && tok.value === "witch") {
      diagnostics.push(diag(
        tok.line, tok.col, tok.line, tokEnd,
        "`witch` was renamed to `switch` in v0.8.1",
        vscode.DiagnosticSeverity.Error, "removed-witch"
      ));
    }

    // `pub` — replaced by `public` in v0.8.0
    if (tok.type === "ident" && tok.value === "pub") {
      diagnostics.push(diag(
        tok.line, tok.col, tok.line, tokEnd,
        "`pub` was replaced by `public` in v0.8.0",
        vscode.DiagnosticSeverity.Error, "removed-pub"
      ));
    }

    // `ne` as operator — renamed to `neq` in v0.4.0
    if (tok.type === "ident" && tok.value === "ne" && prev &&
      (prev.type === "ident" || prev.type === "number" || prev.type === "string" || prev.value === "]")) {
      diagnostics.push(diag(
        tok.line, tok.col, tok.line, tokEnd,
        "`ne` was renamed to `neq` in v0.4.0. Use `neq` or `not eq`",
        vscode.DiagnosticSeverity.Error, "removed-ne"
      ));
    }

    // ---- ERRORS: `use` statement validation ----

    if (tok.type === "keyword" && tok.value === "use") {
      if (next?.type === "ident") {
        // `use <ident> . <ident>` — dot-path import (removed)
        if (next2?.value === ".") {
          const dotEnd = ti + 3 < sig.length ? sig[ti + 3] : next2;
          diagnostics.push(diag(
            tok.line, tok.col, dotEnd.line, dotEnd.col + (dotEnd.len || dotEnd.value?.length || 1),
            "Dot-path import is removed. Use `use <module> as <name>`",
            vscode.DiagnosticSeverity.Error, "removed-dotpath"
          ));
        }
        // `use <unknown> [as <name>]` — unknown stdlib module
        else if (!STDLIB_MODULES.has(next.value)) {
          diagnostics.push(diag(
            next.line, next.col, next.line, next.col + next.value.length,
            "Unknown stdlib module `" + next.value + "`. Available: " + [...STDLIB_MODULES].join(", "),
            vscode.DiagnosticSeverity.Error, "unknown-stdlib"
          ));
        }
      }
    }

    // ---- ERRORS: `from ... use` (removed in v0.9.0) ----
    if (tok.type === "keyword" && tok.value === "from") {
      for (let j = ti + 1; j < Math.min(ti + 6, sig.length); j++) {
        if (sig[j].type === "keyword" && sig[j].value === "use") {
          diagnostics.push(diag(
            tok.line, tok.col, sig[j].line, sig[j].col + 3,
            "`from...use` is removed. Use `from ///mod/// import ...` or `use <module> as <name>`",
            vscode.DiagnosticSeverity.Error, "removed-from-use"
          ));
          break;
        }
        if (sig[j].type === "keyword" && sig[j].value === "import") break;
        if (sig[j].type === "keyword" && ["const", "let", "var", "fn", "if", "for", "while", "class"].includes(sig[j].value)) break;
      }
    }

    // ---- WARNINGS: Style issues ----

    // `else if` — deprecated, use `elif`
    if (tok.type === "keyword" && tok.value === "else" && next?.type === "keyword" && next.value === "if") {
      diagnostics.push(diag(
        tok.line, tok.col, next.line, next.col + 2,
        "`else if` is deprecated. Use `elif` instead",
        vscode.DiagnosticSeverity.Warning, "deprecated-else-if",
        [vscode.DiagnosticTag.Deprecated]
      ));
    }

    // ---- WARNINGS: Deprecated features ----

    // `var` — use const or let
    if (tok.type === "keyword" && tok.value === "var") {
      diagnostics.push(diag(
        tok.line, tok.col, tok.line, tokEnd,
        "Avoid `var`; use `const` or `let` instead",
        vscode.DiagnosticSeverity.Warning, "no-var"
      ));
    }

    // `nil` — use null
    if (tok.type === "keyword" && tok.value === "nil") {
      diagnostics.push(diag(
        tok.line, tok.col, tok.line, tokEnd,
        "Use `null` instead of `nil`",
        vscode.DiagnosticSeverity.Warning, "no-nil",
        [vscode.DiagnosticTag.Deprecated]
      ));
    }

    // `match` — deprecated, use switch
    if (tok.type === "keyword" && tok.value === "match") {
      diagnostics.push(diag(
        tok.line, tok.col, tok.line, tokEnd,
        "`match` is deprecated. Use `switch` instead",
        vscode.DiagnosticSeverity.Warning, "deprecated-match",
        [vscode.DiagnosticTag.Deprecated]
      ));
    }

    // `when` — deprecated, use case
    if (tok.type === "keyword" && tok.value === "when") {
      diagnostics.push(diag(
        tok.line, tok.col, tok.line, tokEnd,
        "`when` is deprecated. Use `case` instead",
        vscode.DiagnosticSeverity.Warning, "deprecated-when",
        [vscode.DiagnosticTag.Deprecated]
      ));
    }

    // `function` — deprecated, use fn
    if (tok.type === "keyword" && tok.value === "function") {
      diagnostics.push(diag(
        tok.line, tok.col, tok.line, tokEnd,
        "`function` is deprecated. Use `fn` instead",
        vscode.DiagnosticSeverity.Warning, "deprecated-function",
        [vscode.DiagnosticTag.Deprecated]
      ));
    }

    // `protected` — deprecated, use private
    if (tok.type === "keyword" && tok.value === "protected") {
      diagnostics.push(diag(
        tok.line, tok.col, tok.line, tokEnd,
        "`protected` is deprecated. Use `private` instead",
        vscode.DiagnosticSeverity.Warning, "deprecated-protected",
        [vscode.DiagnosticTag.Deprecated]
      ));
    }

    // `do` — deprecated, use while/until
    if (tok.type === "keyword" && tok.value === "do") {
      diagnostics.push(diag(
        tok.line, tok.col, tok.line, tokEnd,
        "`do...while` is deprecated. Use `while` or `until` instead",
        vscode.DiagnosticSeverity.Warning, "deprecated-do",
        [vscode.DiagnosticTag.Deprecated]
      ));
    }

    // `yield` — deprecated, generators are a JS concept
    if (tok.type === "keyword" && tok.value === "yield") {
      diagnostics.push(diag(
        tok.line, tok.col, tok.line, tokEnd,
        "`yield` is deprecated. Consider using async/await or callbacks instead",
        vscode.DiagnosticSeverity.Warning, "deprecated-yield",
        [vscode.DiagnosticTag.Deprecated]
      ));
    }

    // Bare assignment: `ident be expr` without const/let/var
    if (tok.type === "keyword" && tok.value === "be") {
      // Check if `be` is inside brackets (object literal / function args)
      let bracketDepth = 0;
      for (let j = 0; j < ti; j++) {
        if (sig[j].value === "[") bracketDepth++;
        else if (sig[j].value === "]") bracketDepth--;
      }
      if (prev && prev.type === "ident" && bracketDepth <= 0) {
        // Walk back to see if there's a const/let/var before this ident
        // (skip over type annotations like `ident of Type be ...`)
        let hasDeclKeyword = false;
        for (let j = ti - 1; j >= 0; j--) {
          const t = sig[j];
          if (t.type === "keyword" && (DECL_KEYWORDS.has(t.value) || t.value === "private")) { hasDeclKeyword = true; break; }
          // Stop at statement boundaries
          if (t.type === "keyword" && ["fn", "if", "for", "while", "do", "class", "return", "import", "from",
            "use", "export", "public", "try", "catch", "throw", "switch", "match", "case", "when",
            "else", "elif", "default", "unless", "until", "namespace", "type", "static", "async",
            "get", "set"].includes(t.value)) break;
          // Stop if we see `be` (previous statement)
          if (t.type === "keyword" && t.value === "be") break;
          // Stop at newline-significant tokens (the `be` is on the same line as the ident)
          if (t.value === "]") break;
          // Keep walking over ident, `of`, type names
          if (t.type === "ident" || (t.type === "keyword" && t.value === "of")) continue;
          break;
        }
        // Check it's a simple ident assignment (not obj.prop be or arr[\i] be)
        const prevPrev = ti >= 2 ? sig[ti - 2] : null;
        const isPropertyAccess = prevPrev && (prevPrev.value === "." || prevPrev.value === "\\." || prevPrev.value === "]");
        if (!hasDeclKeyword && !isPropertyAccess && !mutableVars.has(prev.value)) {
          if (constVars.has(prev.value)) {
            diagnostics.push(diag(
              prev.line, prev.col, tok.line, tokEnd,
              "Cannot reassign `const` variable `" + prev.value + "`. Use `let` if you need to reassign",
              vscode.DiagnosticSeverity.Error, "const-reassign"
            ));
          } else {
            diagnostics.push(diag(
              prev.line, prev.col, tok.line, tokEnd,
              "Bare identifier assignment is not supported. Use `const " + prev.value + " be ...` or `let " + prev.value + " be ...`",
              vscode.DiagnosticSeverity.Error, "bare-assignment"
            ));
          }
        }
      }
    }

    // ---- WARNINGS: Duplicate `use` imports ----
    // Tracked during the loop
    if (tok.type === "keyword" && tok.value === "use" && next?.type === "ident") {
      if (seenStdlibs.has(next.value)) {
        diagnostics.push(diag(
          tok.line, tok.col, next.line, next.col + next.value.length,
          "Duplicate `use " + next.value + "` import",
          vscode.DiagnosticSeverity.Warning, "duplicate-use"
        ));
      } else {
        seenStdlibs.add(next.value);
      }
    }

    // ---- INFO: `use` without `as` ----
    if (tok.type === "keyword" && tok.value === "use" && next?.type === "ident" && STDLIB_MODULES.has(next.value)) {
      const afterModule = ti + 2 < sig.length ? sig[ti + 2] : null;
      if (!afterModule || afterModule.value !== "as") {
        diagnostics.push(diag(
          tok.line, tok.col, next.line, next.col + next.value.length,
          "Consider adding an alias: `use " + next.value + " as <name>`",
          vscode.DiagnosticSeverity.Information, "use-no-alias"
        ));
      }
    }
  }

  // ---- Bracket matching ----
  const bracketStack = [];
  for (const tok of tokens) {
    if (tok.type === "string" || tok.type === "comment" || tok.type === "block-comment" ||
        tok.type === "shebang" || tok.type === "regex") continue;
    if (tok.value === "[") {
      bracketStack.push(tok);
    } else if (tok.value === "]") {
      if (bracketStack.length > 0) {
        bracketStack.pop();
      } else {
        diagnostics.push(diag(
          tok.line, tok.col, tok.line, tok.col + 1,
          "Unmatched `]`",
          vscode.DiagnosticSeverity.Error, "unmatched-bracket"
        ));
      }
    }
  }
  for (const tok of bracketStack) {
    diagnostics.push(diag(
      tok.line, tok.col, tok.line, tok.col + 1,
      "Unclosed `[`",
      vscode.DiagnosticSeverity.Error, "unclosed-bracket"
    ));
  }

  // ---- Line-level checks ----
  for (let li = 0; li < lines.length; li++) {
    const ln = lines[li];

    // Trailing whitespace (only on non-empty lines)
    if (ln.trim().length > 0) {
      const trail = ln.match(/(\s+)$/);
      if (trail) {
        const startCol = ln.length - trail[1].length;
        diagnostics.push(diag(
          li, startCol, li, ln.length,
          "Trailing whitespace",
          vscode.DiagnosticSeverity.Hint, "trailing-ws",
          [vscode.DiagnosticTag.Unnecessary]
        ));
      }
    }

    // Indentation: should be multiple of 2 spaces
    const indent = ln.match(/^( +)/);
    if (indent && indent[1].length % 2 !== 0) {
      diagnostics.push(diag(
        li, 0, li, indent[1].length,
        "Indentation should be a multiple of 2 spaces (found " + indent[1].length + ")",
        vscode.DiagnosticSeverity.Warning, "indent-size"
      ));
    }

    // Tab indentation
    const tabs = ln.match(/^(\t+)/);
    if (tabs) {
      diagnostics.push(diag(
        li, 0, li, tabs[1].length,
        "Use spaces for indentation, not tabs",
        vscode.DiagnosticSeverity.Warning, "no-tabs"
      ));
    }
  }

  return diagnostics;
}

module.exports = { analyzePurus };
