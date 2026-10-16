import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/extension.ts"],
  format: ["cjs"],
  dts: false,
  clean: true,
  target: "node22",
  platform: "node",
  // Provided by the VS Code extension host at runtime.
  external: ["vscode"],
});
