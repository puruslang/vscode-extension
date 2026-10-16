import * as vscode from "vscode";
import { analyzePurus } from "./analyzer.js";
import type { Finding, FindingTag, Severity } from "./analyzer.js";

const SEVERITY: Record<Severity, vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  information: vscode.DiagnosticSeverity.Information,
  hint: vscode.DiagnosticSeverity.Hint,
};

const TAG: Record<FindingTag, vscode.DiagnosticTag> = {
  deprecated: vscode.DiagnosticTag.Deprecated,
  unnecessary: vscode.DiagnosticTag.Unnecessary,
};

function toDiagnostic(finding: Finding): vscode.Diagnostic {
  const diagnostic = new vscode.Diagnostic(
    new vscode.Range(
      finding.line,
      finding.col,
      finding.endLine,
      finding.endCol
    ),
    finding.message,
    SEVERITY[finding.severity]
  );
  diagnostic.source = "purus";
  if (finding.code) diagnostic.code = finding.code;
  if (finding.tags) diagnostic.tags = finding.tags.map((tag) => TAG[tag]);
  return diagnostic;
}

export function activate(context: vscode.ExtensionContext): void {
  // Surround-slash command
  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand(
      "purus.surroundSlash",
      async (editor) => {
        const selection = editor.selection;
        if (selection.isEmpty) return;

        const text = editor.document.getText(selection);

        if (text.startsWith("///") && text.endsWith("///")) {
          return;
        }

        const wrapped = "/" + text + "/";

        const success = await editor.edit((editBuilder) => {
          editBuilder.replace(selection, wrapped);
        });

        if (success) {
          const start = selection.start;
          const startOffset = editor.document.offsetAt(start);
          editor.selection = new vscode.Selection(
            start,
            editor.document.positionAt(startOffset + wrapped.length)
          );
        }
      }
    )
  );

  // Diagnostics
  const diagCollection = vscode.languages.createDiagnosticCollection("purus");
  context.subscriptions.push(diagCollection);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function runDiagnostics(document: vscode.TextDocument): void {
    if (document.languageId !== "purus") return;
    diagCollection.set(
      document.uri,
      analyzePurus(document.getText()).map(toDiagnostic)
    );
  }

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(runDiagnostics),
    vscode.workspace.onDidSaveTextDocument(runDiagnostics),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.languageId !== "purus") return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => runDiagnostics(e.document), 300);
    }),
    vscode.workspace.onDidCloseTextDocument((doc) =>
      diagCollection.delete(doc.uri)
    )
  );

  vscode.workspace.textDocuments.forEach(runDiagnostics);
}

export function deactivate(): void {}
