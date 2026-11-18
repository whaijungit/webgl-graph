import type { GraphData } from "../graph/GraphData.js";

/** 三通道 RGB 元组，每个通道可传 0～255 或 0～1。 */
export type RgbTuple = readonly [number, number, number];

/** 四通道 RGBA 元组，每个通道可传 0～255 或 0～1。 */
export type RgbaTuple = readonly [number, number, number, number];

/** 规范化的 RGBA 元组，所有通道范围均为 0～1。 */
export type NormalizedColor = [number, number, number, number];

/**
 * 可接受的颜色表示。
 *
 * 支持 `#RGB`、`#RGBA`、`#RRGGBB`、`#RRGGBBAA`、`0xRRGGBB`、
 * `0xRRGGBBAA`、CSS `rgb()/rgba()`、十进制整数以及 RGB/RGBA 数组。
 */
export type ColorInput = string | number | RgbTuple | RgbaTuple;

/** 节点形状名称。 */
export type NodeShapeName =
  | "circle"
  | "square"
  | "diamond"
  | "triangle"
  | "hexagon"
  | "star"
  | "mixed"
  | "image";

/** 边线样式名称。 */
export type EdgeStyleName = "straight" | "curve" | "dashed";

/** 图数据的世界坐标边界。 */
export interface GraphBounds {
  /** 最小 X 坐标。 */
  minX: number;
  /** 最小 Y 坐标。 */
  minY: number;
  /** 最大 X 坐标。 */
  maxX: number;
  /** 最大 Y 坐标。 */
  maxY: number;
}

/** GraphView 对外暴露的节点详情。 */
export interface NodeDetails {
  /** 节点在 SoA 数组中的索引。 */
  index: number;
  /** 节点世界坐标 X。 */
  x: number;
  /** 节点世界坐标 Y。 */
  y: number;
  /** 节点基础尺寸。 */
  size: number;
  /** 节点社区索引。 */
  group: number;
  /** 社区标签；未提供时为 `null`。 */
  groupLabel: string | null;
  /** 无向连接度。 */
  degree: number;
  /** 业务传入的原始权重。 */
  rawWeight: number;
  /** 用于尺寸映射的归一化权重。 */
  weight: number;
  /** 节点显示标签；未提供时为 `null`。 */
  label: string | null;
  /** 节点类型文本；未提供时为 `null`。 */
  kind: string | null;
  /** 节点 RGBA 字节颜色。 */
  color: [number, number, number, number];
}

/** 对象图分组。 */
export interface ObjectGraphGroup {
  /** 分组唯一 ID。 */
  id: string;
  /** 分组显示名称。 */
  label?: string | null;
}

/** 对象图节点。 */
export interface ObjectGraphNode {
  /** 节点唯一 ID；边通过该值引用节点。 */
  id: string;
  /** 节点名称。 */
  name?: string | null;
  /** 节点显示标签。 */
  label?: string | null;
  /** 业务版本号。 */
  version?: string | null;
  /** 许可证或业务附加文本。 */
  license?: string | null;
  /** 节点类型。 */
  kind?: string | null;
  /** 节点所属分组 ID。 */
  group?: string | null;
  /** 兼容依赖图格式的分组字段。 */
  branch?: string | null;
  /** 可选世界坐标 X；未提供时自动布局。 */
  x?: number;
  /** 可选世界坐标 Y；未提供时自动布局。 */
  y?: number;
  /** 可选节点基础尺寸。 */
  size?: number;
  /** 可选节点权重。 */
  weight?: number;
  /** 可选节点颜色。 */
  color?: ColorInput;
  /** 可选节点图标索引。 */
  iconId?: number;
  /** 可选节点自定义图标 URL 或 Data URL。 */
  icon?: string | null;
}

/** 对象图中的关系边。 */
export interface ObjectGraphEdge {
  /** 起点节点 ID。 */
  source: string;
  /** 终点节点 ID。 */
  target: string;
  /** 关系类型。 */
  kind?: string | null;
  /** 关系显示标签。 */
  label?: string | null;
  /** 可选边宽度。 */
  width?: number;
  /** 可选边颜色。 */
  color?: ColorInput;
}

/**
 * 可直接传给 `GraphView.setData()` 的对象图格式。
 *
 * 适配器会把字符串节点 ID 转换为连续索引，并在缺少位置信息时
 * 根据 groups 自动生成确定性的分组布局。
 */
export interface ObjectGraphPayload {
  /** 分组数组；缺省时根据节点 group/branch 推导。 */
  groups?: readonly ObjectGraphGroup[] | null;
  /** 节点数组。 */
  nodes: readonly ObjectGraphNode[];
  /** 关系边数组。 */
  edges: readonly ObjectGraphEdge[];
  /** 外部数据生成耗时，单位毫秒。 */
  generationMs?: number;
}

/** 平台无关知识图谱分组。 */
export interface KnowledgeGraphGroup {
  /** 分组唯一 ID。 */
  id: string;
  /** 分组显示名称。 */
  label: string;
  /** 分组类别。 */
  type?: string;
  /** 分组说明。 */
  description?: string;
}

/** 平台无关知识图谱实体。 */
export interface KnowledgeGraphEntity {
  /** 实体唯一 ID。 */
  id: string;
  /** 实体类型。 */
  type: string;
  /** 实体名称。 */
  name: string;
  /** 显示标签。 */
  label?: string;
  /** 实体说明。 */
  description?: string;
  /** 别名列表。 */
  aliases?: readonly string[];
  /** 所属分组 ID。 */
  groupIds?: readonly string[];
  /** 来源 ID。 */
  sourceIds?: readonly string[];
  /** 领域属性。 */
  attributes?: Readonly<Record<string, unknown>>;
}

/** 平台无关知识图谱关系。 */
export interface KnowledgeGraphRelation {
  /** 关系唯一 ID。 */
  id: string;
  /** 关系类型。 */
  type: string;
  /** 起点实体 ID。 */
  source: string;
  /** 终点实体 ID。 */
  target: string;
  /** 关系显示标签。 */
  label?: string;
  /** 是否为有向关系；缺省视为有向。 */
  directed?: boolean;
  /** 来源 ID。 */
  sourceIds?: readonly string[];
  /** 关系属性。 */
  attributes?: Readonly<Record<string, unknown>>;
}

/** 平台无关知识图谱来源。 */
export interface KnowledgeGraphSource {
  /** 来源唯一 ID。 */
  id: string;
  /** 来源标题。 */
  title: string;
  /** 发布者。 */
  publisher?: string;
  /** 来源 URL。 */
  url?: string;
  /** 访问日期。 */
  accessedAt?: string;
  /** DOI、档案号等标识。 */
  identifier?: string;
  /** 来源说明。 */
  notes?: string;
}

/** 平台无关知识图谱数据。 */
export interface KnowledgeGraphPayload {
  /** 数据结构版本。 */
  schemaVersion: "1.0";
  /** 图谱标题。 */
  title: string;
  /** 图谱范围、方法和注意事项。 */
  description?: string;
  /** 实体数组。 */
  entities: readonly KnowledgeGraphEntity[];
  /** 关系数组。 */
  relations: readonly KnowledgeGraphRelation[];
  /** 分组数组。 */
  groups?: readonly KnowledgeGraphGroup[];
  /** 来源数组。 */
  sources?: readonly KnowledgeGraphSource[];
  /** 图谱级属性。 */
  attributes?: Readonly<Record<string, unknown>>;
}

/**
 * 可由 Worker、JSON 或业务代码构造的 SoA 图数据。
 *
 * 颜色字段既可传扁平 RGBA 字节数组，也可按节点传任意 `ColorInput`。
 */
export interface GraphPayload {
  /** 节点数量。 */
  nodeCount: number;
  /** 边数量。 */
  edgeCount: number;
  /** 社区数量；缺省时根据节点分组推导。 */
  clusterCount?: number;
  /** Worker 生成耗时，单位毫秒。 */
  generationMs?: number;
  /** 节点世界坐标，布局为 `[x0, y0, x1, y1, ...]`。 */
  nodePositions: ArrayLike<number>;
  /** 节点基础尺寸。 */
  nodeSizes: ArrayLike<number>;
  /** 节点颜色，支持扁平字节或逐节点颜色输入。 */
  nodeColors: ArrayLike<ColorInput>;
  /** 可选节点颜色覆盖标记；值为 1 时选中图片节点使用该节点自定义颜色。 */
  nodeColorOverrides?: ArrayLike<number> | null;
  /** 节点社区索引。 */
  nodeGroups: ArrayLike<number>;
  /** 节点权重；缺省时使用连接度。 */
  nodeWeights?: ArrayLike<number> | null;
  /** 节点图标图集索引；缺省时按索引轮换。 */
  nodeIconIds?: ArrayLike<number> | null;
  /** 可选逐节点自定义图标 URL 或 Data URL。 */
  nodeIconSources?: readonly (string | null)[] | null;
  /** 节点标签；缺省时不显示标签。 */
  nodeLabels?: readonly string[] | null;
  /** 节点类型文本。 */
  nodeKinds?: readonly string[] | null;
  /** 社区标签。 */
  groupLabels?: readonly string[] | null;
  /** 边起点节点索引。 */
  edgeSources: ArrayLike<number>;
  /** 边终点节点索引。 */
  edgeTargets: ArrayLike<number>;
  /** 边端点世界坐标，布局为 `[sx, sy, tx, ty, ...]`。 */
  edgePositions: ArrayLike<number>;
  /** 边基础线宽。 */
  edgeWidths: ArrayLike<number>;
  /** 边颜色，支持扁平字节或逐边颜色输入。 */
  edgeColors: ArrayLike<ColorInput>;
  /** 边关系类型文本。 */
  edgeKinds?: readonly string[] | null;
}

/** 图样式配置；颜色字段均支持任意 `ColorInput`。 */
export interface GraphStyleOptions {
  /** Canvas 清屏颜色。 */
  backgroundColor?: ColorInput;
  /** 选中、悬停和高亮使用的强调色。 */
  highlightColor?: ColorInput;
  /** 节点形状。 */
  nodeShape?: NodeShapeName;
  /** 边线样式。 */
  edgeStyle?: EdgeStyleName;
  /** 无邻域关联时节点的透明度倍数。 */
  dimOpacity?: number;
  /** 无邻域关联时边的透明度倍数。 */
  edgeDimOpacity?: number;
  /** 节点整体尺寸倍数。 */
  nodeScale?: number;
  /** 节点最小屏幕尺寸（CSS 像素），用于保证低权重节点可见。 */
  minimumNodeSize?: number;
  /** 权重对节点尺寸差异的影响强度。 */
  weightStrength?: number;
  /** 标签总开关。 */
  showLabels?: boolean;
  /** 是否显示分组包围圈和分组标签。 */
  showGroupBounds?: boolean;
  /** 标签字号，单位 CSS 像素。 */
  labelFontSize?: number;
  /** 边线整体宽度倍数。 */
  edgeWidthScale?: number;
  /** 边线显示总开关。 */
  showEdges?: boolean;
  /** 是否在每条有向边的目标端绘制方向箭头。 */
  showEdgeArrows?: boolean;
}

/** 交给渲染器的规范化样式。 */
export interface RenderStyle {
  /** 已规范化的清屏 RGBA。 */
  backgroundColor: NormalizedColor;
  /** 节点 shader 形状 ID。 */
  nodeShape: number;
  /** 边 shader 样式 ID。 */
  edgeStyle: number;
  /** 已规范化的高亮 RGBA。 */
  highlightColor: NormalizedColor;
  /** 非关联节点透明度倍数。 */
  dimOpacity: number;
  /** 非关联边透明度倍数。 */
  edgeDimOpacity: number;
  /** 节点尺寸倍数。 */
  nodeScale: number;
  /** 节点最小屏幕尺寸（CSS 像素）。 */
  minimumNodeSize: number;
  /** 权重影响强度。 */
  weightStrength: number;
  /** 标签总开关。 */
  showLabels: boolean;
  /** 是否显示分组包围圈和分组标签。 */
  showGroupBounds: boolean;
  /** 标签字号。 */
  labelFontSize: number;
  /** 边宽倍数。 */
  edgeWidthScale: number;
  /** 边显示开关。 */
  showEdges: boolean;
  /** 边方向箭头显示开关。 */
  showEdgeArrows: boolean;
}

/** Worker 合成图生成参数。 */
export interface GraphGenerationOptions {
  /** 节点数量。 */
  nodeCount: number;
  /** 边数量。 */
  edgeCount: number;
  /** 社区数量。 */
  clusterCount?: number;
  /** 可复现随机种子。 */
  seed?: number;
  /** 世界布局宽高比。 */
  layoutAspect?: number;
}

/** GraphView 构造参数。 */
export interface GraphViewOptions {
  /** 初始图数据。 */
  data?:
    | GraphPayload
    | ObjectGraphPayload
    | KnowledgeGraphPayload
    | GraphData;
  /** 初始样式。 */
  style?: GraphStyleOptions;
  /** 设置数据后是否自动适配视图。 */
  fit?: boolean;
  /** 自动适配时保留的边距比例。 */
  fitPadding?: number;
  /** 是否以目标帧率持续渲染。 */
  continuousRender?: boolean;
  /** 持续渲染目标帧率，范围 30～60。 */
  targetFps?: number;
}

/** 相机视图状态。 */
export interface ViewState {
  /** 视口中心世界坐标 X。 */
  centerX: number;
  /** 视口中心世界坐标 Y。 */
  centerY: number;
  /** 每世界单位对应的像素数。 */
  scale: number;
  /** 视口 CSS 宽度。 */
  viewportWidth: number;
  /** 视口 CSS 高度。 */
  viewportHeight: number;
}

/** 悬停事件数据。 */
export interface GraphHoverEvent {
  /** 悬停节点；空白处为 `null`。 */
  nodeId: number | null;
  /** 悬停节点详情。 */
  node: NodeDetails | null;
  /** 指针客户端 X 坐标。 */
  clientX: number;
  /** 指针客户端 Y 坐标。 */
  clientY: number;
}

/** 选择事件数据。 */
export interface GraphSelectEvent {
  /** 选中节点；清空选择时为 `null`。 */
  nodeId: number | null;
  /** 选中节点详情。 */
  node: NodeDetails | null;
  /** 全部直接邻居。 */
  related: NodeDetails[];
}

/** 节点拖拽事件数据。 */
export interface GraphNodeDragEvent {
  /** 被拖拽节点索引。 */
  nodeId: number;
  /** 新世界坐标 X。 */
  x: number;
  /** 新世界坐标 Y。 */
  y: number;
  /** 拖拽后的节点详情。 */
  node: NodeDetails | null;
}

/** 单帧性能统计。 */
export interface GraphFrameMetricsEvent {
  /** 采样窗口平均 FPS。 */
  fps: number;
  /** 最近一帧渲染耗时，单位毫秒。 */
  frameMs: number;
  /** 最近一帧 draw call 数量。 */
  drawCalls: number;
}

/** 普通渲染帧完成事件。 */
export interface GraphFrameEvent {
  /** 当前帧 CPU 渲染耗时，单位毫秒。 */
  frameMs: number;
  /** 当前帧 draw call 数量。 */
  drawCalls: number;
}

/** GraphView 支持的事件映射。 */
export interface GraphViewEventMap {
  /** 指针悬停变化。 */
  hover: GraphHoverEvent;
  /** 节点选择变化。 */
  select: GraphSelectEvent;
  /** 节点位置变化。 */
  nodedrag: GraphNodeDragEvent;
  /** 相机视图变化。 */
  viewchange: ViewState;
  /** 样式变化。 */
  stylechange: RenderStyle;
  /** 性能采样结果。 */
  framemetrics: GraphFrameMetricsEvent;
  /** 普通帧完成通知。 */
  frame: GraphFrameEvent;
  /** 新图数据装载完成。 */
  data: GraphData;
}

/** GraphView 事件名称。 */
export type GraphViewEventName = keyof GraphViewEventMap;
