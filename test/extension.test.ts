import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  commands: new Map<string, unknown>(),
  collections: [] as {
    name: string;
    sets: [unknown, unknown[]][];
    deleted: unknown[];
  }[],
  handlers: {} as Record<string, (arg: unknown) => void>,
  textDocuments: [] as unknown[],
}));

vi.mock("vscode", () => {
  class Range {
    constructor(
      public startLine: number,
      public startCol: number,
      public endLine: number,
      public endCol: number
    ) {}
  }
  class Diagnostic {
    source?: string;
    code?: string;
    tags?: number[];
    constructor(
      public range: Range,
      public message: string,
      public severity: number
    ) {}
  }
  const subscribe = (name: string) => (handler: (arg: unknown) => void) => {
    state.handlers[name] = handler;
    return { dispose() {} };
  };
  return {
    Range,
    Diagnostic,
    Selection: class {},
    DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
    DiagnosticTag: { Unnecessary: 1, Deprecated: 2 },
    commands: {},
    languages: {
      createDiagnosticCollection(name: string) {
        const collection = {
          name,
          sets: [] as [unknown, unknown[]][],
          deleted: [] as unknown[],
          set(uri: unknown, diagnostics: unknown[]) {
            collection.sets.push([uri, diagnostics]);
          },
          delete(uri: unknown) {
            collection.deleted.push(uri);
          },
          dispose() {},
        };
        state.collections.push(collection);
        return collection;
      },
    },
    window: {},
    workspace: {
      get textDocuments() {
        return state.textDocuments;
      },
      onDidOpenTextDocument: subscribe("open"),
      onDidSaveTextDocument: subscribe("save"),
      onDidChangeTextDocument: subscribe("change"),
      onDidCloseTextDocument: subscribe("close"),
    },
  };
});

const vscode = await import("vscode");
(
  vscode.commands as unknown as {
    registerTextEditorCommand: (name: string, fn: unknown) => unknown;
  }
).registerTextEditorCommand = (name, fn) => {
  state.commands.set(name, fn);
  return { dispose() {} };
};

const { activate } = await import("../src/extension.js");

function document(text: string, languageId = "purus") {
  return { languageId, uri: { path: "a.purus" }, getText: () => text };
}

describe("extension", () => {
  beforeEach(() => {
    state.commands.clear();
    state.collections.length = 0;
    state.textDocuments = [];
  });

  it("registers the surround command and a diagnostic collection", () => {
    const context = { subscriptions: [] as unknown[] };
    activate(context as never);
    expect(state.commands.has("purus.surroundSlash")).toBe(true);
    expect(state.collections.map((c) => c.name)).toEqual(["purus"]);
    expect(context.subscriptions.length).toBeGreaterThan(3);
  });

  it("publishes converted diagnostics when a document opens", () => {
    activate({ subscriptions: [] } as never);
    state.handlers.open(document("var x be 1"));
    const [collection] = state.collections;
    const [, diagnostics] = collection.sets[0] as [
      unknown,
      { source: string; code: string; severity: number; tags?: number[] }[],
    ];
    const noVar = diagnostics.find((d) => d.code === "no-var");
    expect(noVar).toMatchObject({ source: "purus", severity: 1 });
  });

  it("maps tags to VS Code tags", () => {
    activate({ subscriptions: [] } as never);
    state.handlers.open(document("const x be nil"));
    const [, diagnostics] = state.collections[0].sets[0] as [
      unknown,
      { code: string; tags?: number[] }[],
    ];
    expect(diagnostics.find((d) => d.code === "no-nil")?.tags).toEqual([2]);
  });

  it("ignores other languages and clears diagnostics on close", () => {
    activate({ subscriptions: [] } as never);
    state.handlers.open(document("var x be 1", "javascript"));
    expect(state.collections[0].sets).toEqual([]);
    state.handlers.close(document("", "purus"));
    expect(state.collections[0].deleted).toHaveLength(1);
  });
});
