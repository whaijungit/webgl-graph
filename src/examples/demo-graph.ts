import type { GraphData } from "../graph/GraphData.js";
import type { GraphView } from "../lib/GraphView.js";
import type {
  GraphPayload,
  KnowledgeGraphPayload,
  ObjectGraphPayload,
} from "../lib/types.js";

/** 示例页可装载的图数据。 */
export type DemoGraphData =
  | GraphPayload
  | ObjectGraphPayload
  | KnowledgeGraphPayload;

/** 单个内置图示例的完整定义。 */
export interface DemoGraphDefinition {
  /** 稳定示例 ID。 */
  id: string;
  /** 图数据。 */
  data: DemoGraphData;
  /** 装载后默认选中的节点索引。 */
  selectedNodeIndex?: number;
  /** 浏览器标题。 */
  getDocumentTitle: (data: GraphData) => string;
  /** Canvas 无障碍描述。 */
  getAriaLabel: (data: GraphData) => string;
  /** 配置面板状态文本。 */
  getStatusText: (data: GraphData) => string;
}

/** 示例装载后的页面信息。 */
export interface DemoGraphLoadResult {
  /** 已装载图数据。 */
  data: GraphData;
  /** 写入 `window.graphStressInfo` 的调试信息。 */
  info: {
    preset: string;
    nodeCount: number;
    edgeCount: number;
    generationMs: number;
    loadMs: number;
    uploadMs: number;
  };
  /** 浏览器标题。 */
  documentTitle: string;
  /** Canvas 无障碍描述。 */
  ariaLabel: string;
  /** 配置面板状态文本。 */
  statusText: string;
}

/**
 * 装载一个内置示例，并生成页面需要显示的信息。
 *
 * @param graphView - 当前 GraphView。
 * @param demo - 示例定义。
 * @param loadStartedAt - 页面开始装载数据的时间戳。
 * @returns 装载结果。
 */
export function loadDemoGraph(
  graphView: GraphView,
  demo: DemoGraphDefinition,
  loadStartedAt: number,
): DemoGraphLoadResult {
  const uploadStartedAt = performance.now();
  const data = graphView.setData(demo.data);
  if (demo.selectedNodeIndex !== undefined) {
    graphView.select(demo.selectedNodeIndex);
  }
  const uploadMs = performance.now() - uploadStartedAt;
  return {
    data,
    info: {
      preset: demo.id,
      nodeCount: data.nodeCount,
      edgeCount: data.edgeCount,
      generationMs: 0,
      loadMs: performance.now() - loadStartedAt,
      uploadMs,
    },
    documentTitle: demo.getDocumentTitle(data),
    ariaLabel: demo.getAriaLabel(data),
    statusText: demo.getStatusText(data),
  };
}
