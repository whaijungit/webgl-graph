import type {
  GraphPayload,
  ObjectGraphPayload,
} from "../lib/types.js";

/**
 * GraphView.setData() 可直接接收的关系图示例。
 *
 * 节点数组按索引 0～4 排列；边只需要通过 edgeSources 和 edgeTargets
 * 引用这些索引。edgePositions 与每条边的 source/target 节点坐标一致。
 */
export const relationshipGraphPayload: GraphPayload = {
  nodeCount: 5,
  edgeCount: 5,
  clusterCount: 3,

  // [x0, y0, x1, y1, ...]
  nodePositions: new Float32Array([
    0, -120,   // 0 网关
    160, -40,  // 1 订单服务
    80, 100,   // 2 库存服务
    -100, 100, // 3 用户服务
    -180, -20, // 4 支付服务
  ]),
  nodeSizes: new Float32Array([18, 16, 14, 14, 15]),
  nodeColors: [
    "#53e1ff",
    "#ff7f7f",
    "#5eead4",
    "#a78bfa",
    "#ffd166",
  ],
  nodeGroups: new Uint16Array([0, 1, 1, 1, 2]),
  nodeWeights: new Float32Array([5, 4, 3, 2, 3]),
  nodeIconIds: new Uint8Array([0, 1, 2, 4, 7]),
  nodeLabels: [
    "网关",
    "订单服务",
    "库存服务",
    "用户服务",
    "支付服务",
  ],
  nodeKinds: [
    "gateway",
    "service",
    "service",
    "service",
    "service",
  ],
  groupLabels: ["接入层", "业务服务", "交易支撑"],

  // 第 0 条边：节点 0 -> 节点 1
  // 第 1 条边：节点 0 -> 节点 4
  // 第 2 条边：节点 1 -> 节点 2
  // 第 3 条边：节点 1 -> 节点 3
  // 第 4 条边：节点 4 -> 节点 1
  edgeSources: new Uint32Array([0, 0, 1, 1, 4]),
  edgeTargets: new Uint32Array([1, 4, 2, 3, 1]),
  edgePositions: new Float32Array([
    0, -120, 160, -40,
    0, -120, -180, -20,
    160, -40, 80, 100,
    160, -40, -100, 100,
    -180, -20, 160, -40,
  ]),
  edgeWidths: new Float32Array([2.4, 2, 1.8, 1.6, 2]),
  edgeColors: [
    "#53e1ff",
    "#53e1ff",
    "#5eead4",
    "#a78bfa",
    "#ffd166",
  ],
  edgeKinds: [
    "网关调用",
    "网关调用",
    "服务依赖",
    "服务依赖",
    "支付回调",
  ],
};

/**
 * 与上面等价的业务对象格式。
 *
 * 不需要预先生成坐标、索引、颜色或 TypedArray；GraphView.setData()
 * 会自动转换成 relationshipGraphPayload 对应的 SoA 渲染数据。
 */
export const objectGraphInputExample: ObjectGraphPayload = {
  groups: [
    { id: "root", label: "china-transport-globe" },
    { id: "vite", label: "vite" },
    { id: "vite:rollup", label: "vite › rollup" },
  ],
  nodes: [
    {
      id: "china-transport-globe@1.0.0",
      name: "china-transport-globe",
      version: "1.0.0",
      license: "UNLICENSED",
      kind: "root",
      branch: "root",
    },
    {
      id: "vite@7.0.0",
      name: "vite",
      version: "7.0.0",
      license: "MIT",
      kind: "devDependency",
      branch: "vite",
    },
    {
      id: "rollup@4.0.0",
      name: "rollup",
      version: "4.0.0",
      license: "MIT",
      kind: "dependency",
      branch: "vite:rollup",
    },
  ],
  edges: [
    {
      source: "china-transport-globe@1.0.0",
      target: "vite@7.0.0",
      kind: "devDependency",
    },
    {
      source: "vite@7.0.0",
      target: "rollup@4.0.0",
      kind: "dependency",
    },
  ],
};
