import { describe, expect, it } from "vitest";
import { analyzePurus } from "../src/analyzer.js";

function codes(source: string): string[] {
  return analyzePurus(source).map((f) => f.code ?? f.message);
}

describe("analyzePurus", () => {
  it("accepts valid code without errors or warnings", () => {
    const findings = analyzePurus(
      ["const x be 42", "let y be x add 1", "console.log[y]", ""].join("\n")
    );
    expect(findings.filter((f) => f.severity !== "hint")).toEqual([]);
  });

  it("flags forbidden JavaScript characters", () => {
    expect(codes("const x be (1)")).toContain("forbidden-char");
    expect(codes("const x be {}")).toContain("forbidden-char");
  });

  it("flags JavaScript operators", () => {
    expect(codes("a === b")).toContain("js-operator");
    expect(codes("a && b")).toContain("js-operator");
    expect(codes("a => b")).toContain("js-operator");
  });

  it("does not flag characters inside strings or comments", () => {
    expect(
      analyzePurus("const s be ///a (b) {c}///\n-- (comment) {x}\n").filter(
        (f) => f.severity === "error"
      )
    ).toEqual([]);
  });

  it("reports bare assignment and const reassignment", () => {
    expect(codes("x be 1")).toContain("bare-assignment");
    expect(codes("const a be 1\na be 2")).toContain("const-reassign");
    expect(codes("let a be 1\na be 2")).not.toContain("const-reassign");
  });

  it("warns about deprecated keywords", () => {
    const findings = analyzePurus("var a be nil");
    expect(findings.map((f) => f.code)).toEqual(
      expect.arrayContaining(["no-var", "no-nil"])
    );
    expect(findings.find((f) => f.code === "no-nil")?.tags).toEqual([
      "deprecated",
    ]);
  });

  it("validates use statements", () => {
    expect(codes("use p-nope as n")).toContain("unknown-stdlib");
    expect(codes("use p-array as a\nuse p-array as b")).toContain(
      "duplicate-use"
    );
    expect(codes("use p-array")).toContain("use-no-alias");
    expect(codes("use p-array as a")).not.toContain("use-no-alias");
  });

  it("matches brackets", () => {
    expect(codes("f[1")).toContain("unclosed-bracket");
    expect(codes("f[1]]")).toContain("unmatched-bracket");
  });

  it("checks whitespace and indentation", () => {
    expect(codes("const x be 1  ")).toContain("trailing-ws");
    expect(codes("if a\n   b")).toContain("indent-size");
    expect(codes("if a\n\tb")).toContain("no-tabs");
  });

  it("reports tokenizer errors as errors with ranges", () => {
    const [finding] = analyzePurus("///open");
    expect(finding.severity).toBe("error");
    expect(finding.line).toBe(0);
  });

  it("uses 0-based ranges", () => {
    const finding = analyzePurus("var x be 1").find((f) => f.code === "no-var");
    expect(finding).toMatchObject({ line: 0, col: 0, endLine: 0, endCol: 3 });
  });
});
