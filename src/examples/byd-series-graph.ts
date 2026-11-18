import type { KnowledgeGraphPayload } from "../lib/types.js";
import type { DemoGraphDefinition } from "./demo-graph.js";
import bydSeriesGraphData from "./data/byd-series-knowledge-graph.json";

const bydSeriesGraph = bydSeriesGraphData as KnowledgeGraphPayload;

/** 比亚迪品牌 / 技术 → 车系 → 车型默认示例。 */
export const bydSeriesDemo: DemoGraphDefinition = {
  id: "byd-series",
  data: bydSeriesGraph,
  getDocumentTitle: (data) =>
    `比亚迪车系 · ${data.nodeCount} 节点 · ${data.edgeCount} 边 · WebGL2`,
  getAriaLabel: (data) =>
    `比亚迪品牌、技术、车系和车型关系图，共 ${data.nodeCount} 个节点和 ${data.edgeCount} 条边`,
  getStatusText: (data) =>
    `比亚迪车系 · ${data.nodeCount} 节点 · ${data.edgeCount} 边`,
};
