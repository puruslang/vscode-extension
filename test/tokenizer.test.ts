import { describe, expect, it } from "vitest";
import { KEYWORDS, tokenize } from "../src/tokenizer.js";

function kinds(source: string): string[] {
  return tokenize(source)
    .tokens.filter((t) => t.type !== "ws" && t.type !== "newline")
    .map((t) => `${t.type}:${t.value}`);
}

describe("tokenize", () => {
  it("splits keywords, identifiers, numbers and punctuation", () => {
    expect(kinds("const x be 42")).toEqual([
      "keyword:const",
      "ident:x",
      "keyword:be",
      "number:42",
    ]);
    expect(kinds("f[a; b]")).toEqual([
      "ident:f",
      "punct:[",
      "ident:a",
      "punct:;",
      "ident:b",
      "punct:]",
    ]);
  });

  it("reads hex, binary and decimal numbers", () => {
    expect(kinds("0xFF 0b101 3.14")).toEqual([
      "number:0xFF",
      "number:0b101",
      "number:3.14",
    ]);
  });

  it("recognises both string syntaxes", () => {
    const { tokens, errors } = tokenize("///a b/// //;c d;//");
    expect(
      tokens.filter((t) => t.type === "string").map((t) => t.value)
    ).toEqual(["///a b///", "//;c d;//"]);
    expect(errors).toEqual([]);
  });

  it("reports unclosed strings and block comments", () => {
    expect(tokenize("///abc").errors[0].msg).toMatch(/Unclosed string/);
    expect(tokenize("//;abc").errors[0].msg).toMatch(
      /Unclosed semicolon string/
    );
    expect(tokenize("--- never closed").errors[0].msg).toMatch(
      /Unclosed block comment/
    );
  });

  it("tokenizes comments, regexes, dots and optional chaining", () => {
    expect(kinds("-- note")).toEqual(["comment:-- note"]);
    expect(kinds("const r be /a+/gi")).toContain("regex:/a+/gi");
    expect(kinds("a.b \\.c ..d")).toEqual([
      "ident:a",
      "punct:.",
      "ident:b",
      "punct:\\.",
      "ident:c",
      "punct:..",
      "ident:d",
    ]);
  });

  it("keeps 0-based positions across lines", () => {
    const tokens = tokenize("a\n  b").tokens.filter((t) => t.type === "ident");
    expect(tokens.map((t) => [t.value, t.line, t.col])).toEqual([
      ["a", 0, 0],
      ["b", 1, 2],
    ]);
  });

  it("exposes the keyword table", () => {
    expect(KEYWORDS.has("elif")).toBe(true);
    expect(KEYWORDS.has("blank")).toBe(true);
    expect(KEYWORDS.has("foo")).toBe(false);
  });
});
