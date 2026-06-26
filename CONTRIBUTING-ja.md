# Purus VS Code Extension への貢献ガイド

ご興味をお持ちいただきありがとうございます！

[English version](https://github.com/puruslang/vscode-extension/blob/main/CONTRIBUTING.md)

## このリポジトリについて

VS Code language support for Purus.

## 必要な環境

- [Node.js](https://nodejs.org/) >= 22
- [Git](https://git-scm.com/)

## 始め方

```sh
git clone https://github.com/puruslang/vscode-extension.git
cd vscode-extension
npm install
npx vsce package
```

## 開発

| コマンド | 説明 |
|---|---|
| `npx vsce package` | .vsix のビルド |
| `npx vsce publish` | Marketplace へ公開 |

## プルリクエストの提出

1. リポジトリをフォークし、`main` からブランチを作成
2. 変更を加える
3. テストを実行し、パスすることを確認
4. 明確な説明を添えて PR を提出

## リリース

`v*` タグ（例: `v1.1.0`）をプッシュすると自動的にリリースされます。

## 行動規範

[CODE_OF_CONDUCT-ja.md](CODE_OF_CONDUCT-ja.md) を参照してください。

## ライセンス

貢献いただいたコードは [Apache 2.0 ライセンス](LICENSE) のもとで公開されます。