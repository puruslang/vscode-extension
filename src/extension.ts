const vscode = require('vscode');
const { analyzePurus } = require('./analyzer');

function activate(context) {
  // Surround-slash command
  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand(
      'purus.surroundSlash',
      async (editor) => {
        const selection = editor.selection;
        if (selection.isEmpty) return;

        const text = editor.document.getText(selection);

        if (text.startsWith('///') && text.endsWith('///')) {
          return;
        }

        const wrapped = '/' + text + '/';

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
  const diagCollection = vscode.languages.createDiagnosticCollection('purus');
  context.subscriptions.push(diagCollection);

  let debounceTimer = null;

  function runDiagnostics(document) {
    if (document.languageId !== 'purus') return;
    diagCollection.set(document.uri, analyzePurus(document.getText()));
  }

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(runDiagnostics),
    vscode.workspace.onDidSaveTextDocument(runDiagnostics),
    vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.languageId !== 'purus') return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => runDiagnostics(e.document), 300);
    }),
    vscode.workspace.onDidCloseTextDocument(doc => diagCollection.delete(doc.uri))
  );

  vscode.workspace.textDocuments.forEach(runDiagnostics);
}

function deactivate() {}

module.exports = { activate, deactivate };
