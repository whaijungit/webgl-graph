import type { GraphView } from "./lib/GraphView.js";
import type {
  GraphFrameMetricsEvent,
  GraphPayload,
} from "./lib/types.js";

/** 当前压测数据规模。 */
interface GraphStressInfo {
  /** 预设名称。 */
  preset: string;
  /** 节点数量。 */
  nodeCount: number;
  /** 边数量。 */
  edgeCount: number;
  /** Worker 数据生成耗时，单位毫秒。 */
  generationMs: number;
  /** Worker 加载到主线程的总耗时，单位毫秒。 */
  loadMs: number;
  /** 数据上传和索引构建耗时，单位毫秒。 */
  uploadMs: number;
}

declare global {
  /** 示例页面暴露到全局的调试接口。 */
  interface Window {
    /** 当前关系图实例。 */
    graphView?: GraphView;
    /** 销毁默认示例资源的回调。 */
    disposeGraphView?: () => void;
    /** 自定义示例数据工厂。 */
    exampleGraphPayload?: () => GraphPayload;
    /** npm 依赖示例数据工厂。 */
    npmDependencyGraphPayload?: () => GraphPayload;
    /** 当前压测数据规模与耗时。 */
    graphStressInfo?: GraphStressInfo;
    /** 高频交互或持续渲染时的最新性能采样。 */
    graphMetrics?: GraphFrameMetricsEvent;
    /** 最近一帧渲染耗时和 draw call 数量。 */
    graphLastFrame?: {
      /** CPU 帧耗时，单位毫秒。 */
      frameMs: number;
      /** draw call 数量。 */
      drawCalls: number;
    };
  }
}

export {};
