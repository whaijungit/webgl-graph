import type { ObjectGraphPayload } from "../lib/types.js";
import type { DemoGraphDefinition } from "./demo-graph.js";

/**
 * 当前工程平台无关构建依赖的真实子图。
 *
 * 节点版本和依赖方向来自 `pnpm-lock.yaml`；平台专用可选二进制包未展开，
 * 以避免默认视图被同一版本的多平台副本淹没。业务数据不包含坐标、尺寸
 * 或图标，这些视觉属性全部由 `ObjectGraphAdapter` 在装载阶段生成。
 */
export const packageDependencyGraph: ObjectGraphPayload = {
  groups: [
    { id: "application", label: "应用" },
    { id: "bundler", label: "构建" },
    { id: "tooling", label: "工具" },
    { id: "styles", label: "样式" },
    { id: "utilities", label: "工具库" },
    { id: "types", label: "类型定义" },
  ],
  nodes: [
    {
      id: "web-app@1.0.0",
      label: "web-app@1.0.0",
      kind: "application",
      group: "application",
    },
    {
      id: "vite@7.3.8",
      label: "vite@7.3.8",
      kind: "devDependency",
      group: "bundler",
    },
    {
      id: "typescript@5.9.3",
      label: "typescript@5.9.3",
      kind: "devDependency",
      group: "tooling",
    },
    {
      id: "stats.js@0.17.0",
      label: "stats.js@0.17.0",
      kind: "dependency",
      group: "tooling",
    },
    {
      id: "@types/node@26.6.6",
      label: "@types/node@26.6.6",
      kind: "devDependency",
      group: "types",
    },
    {
      id: "@types/stats.js@0.17.4",
      label: "@types/stats.js@0.17.4",
      kind: "devDependency",
      group: "types",
    },
    {
      id: "esbuild@0.28.2",
      label: "esbuild@0.28.2",
      kind: "dependency",
      group: "bundler",
    },
    {
      id: "rollup@4.68.2",
      label: "rollup@4.68.2",
      kind: "dependency",
      group: "bundler",
    },
    {
      id: "postcss@8.5.32",
      label: "postcss@8.5.32",
      kind: "dependency",
      group: "styles",
    },
    {
      id: "fdir@6.5.0",
      label: "fdir@6.5.0",
      kind: "dependency",
      group: "utilities",
    },
    {
      id: "tinyglobby@0.2.17",
      label: "tinyglobby@0.2.17",
      kind: "dependency",
      group: "utilities",
    },
    {
      id: "picomatch@4.0.7",
      label: "picomatch@4.0.7",
      kind: "dependency",
      group: "utilities",
    },
    {
      id: "@types/estree@1.0.10",
      label: "@types/estree@1.0.10",
      kind: "dependency",
      group: "types",
    },
    {
      id: "nanoid@3.3.20",
      label: "nanoid@3.3.20",
      kind: "dependency",
      group: "styles",
    },
    {
      id: "picocolors@1.1.1",
      label: "picocolors@1.1.1",
      kind: "dependency",
      group: "styles",
    },
    {
      id: "source-map-js@1.2.2",
      label: "source-map-js@1.2.2",
      kind: "dependency",
      group: "styles",
    },
    {
      id: "undici-types@8.9.0",
      label: "undici-types@8.9.0",
      kind: "dependency",
      group: "types",
    },
  ],
  edges: [
    { source: "web-app@1.0.0", target: "vite@7.3.8", kind: "devDependency" },
    {
      source: "web-app@1.0.0",
      target: "typescript@5.9.3",
      kind: "devDependency",
    },
    {
      source: "web-app@1.0.0",
      target: "stats.js@0.17.0",
      kind: "dependency",
    },
    {
      source: "web-app@1.0.0",
      target: "@types/node@26.6.6",
      kind: "devDependency",
    },
    {
      source: "web-app@1.0.0",
      target: "@types/stats.js@0.17.4",
      kind: "devDependency",
    },
    { source: "vite@7.3.8", target: "esbuild@0.28.2", kind: "dependency" },
    { source: "vite@7.3.8", target: "rollup@4.68.2", kind: "dependency" },
    { source: "vite@7.3.8", target: "postcss@8.5.32", kind: "dependency" },
    { source: "vite@7.3.8", target: "fdir@6.5.0", kind: "dependency" },
    { source: "vite@7.3.8", target: "picomatch@4.0.7", kind: "dependency" },
    {
      source: "vite@7.3.8",
      target: "tinyglobby@0.2.17",
      kind: "dependency",
    },
    { source: "postcss@8.5.32", target: "nanoid@3.3.20", kind: "dependency" },
    {
      source: "postcss@8.5.32",
      target: "picocolors@1.1.1",
      kind: "dependency",
    },
    {
      source: "postcss@8.5.32",
      target: "source-map-js@1.2.2",
      kind: "dependency",
    },
    {
      source: "rollup@4.68.2",
      target: "@types/estree@1.0.10",
      kind: "dependency",
    },
    { source: "fdir@6.5.0", target: "picomatch@4.0.7", kind: "dependency" },
    {
      source: "tinyglobby@0.2.17",
      target: "fdir@6.5.0",
      kind: "dependency",
    },
    {
      source: "tinyglobby@0.2.17",
      target: "picomatch@4.0.7",
      kind: "dependency",
    },
    {
      source: "@types/node@26.6.6",
      target: "undici-types@8.9.0",
      kind: "dependency",
    },
  ],
};

/** 当前工程真实 npm 构建依赖示例。 */
export const packageDependencyDemo: DemoGraphDefinition = {
  id: "package-dependencies",
  data: packageDependencyGraph,
  getDocumentTitle: (data) =>
    `${data.nodeCount} 节点 · ${data.edgeCount} 条依赖 · WebGL2`,
  getAriaLabel: (data) =>
    `${data.nodeCount} 个 npm 包节点和 ${data.edgeCount} 条依赖关系`,
  getStatusText: (data) =>
    `真实 npm 依赖 · ${data.nodeCount} 节点 · ${data.edgeCount} 条依赖`,
};
