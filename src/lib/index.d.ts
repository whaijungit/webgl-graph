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

/** GraphView 构造参数。 */
export interface GraphViewOptions {
  /** 初始图数据。 */
  data?: GraphPayload | ObjectGraphPayload | GraphData;
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

/** 图样式配置；颜色字段均支持任意 ColorInput。 */
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
  /** 标签字号，单位 CSS 像素。 */
  labelFontSize?: number;
  /** 边线整体宽度倍数。 */
  edgeWidthScale?: number;
  /** 边线显示总开关。 */
  showEdges?: boolean;
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
  /** 标签字号。 */
  labelFontSize: number;
  /** 边宽倍数。 */
  edgeWidthScale: number;
  /** 边显示开关。 */
  showEdges: boolean;
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

/** 可直接传给 GraphView.setData() 的对象图格式。 */
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

/**
 * 可由 Worker、JSON 或业务代码构造的 SoA 图数据。
 *
 * 颜色字段既可传扁平 RGBA 字节数组，也可按节点传任意 ColorInput。
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
  /** 节点社区索引。 */
  nodeGroups: ArrayLike<number>;
  /** 节点权重；缺省时使用连接度。 */
  nodeWeights?: ArrayLike<number> | null;
  /** 节点图标图集索引；缺省时按索引轮换。 */
  nodeIconIds?: ArrayLike<number> | null;
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

/** 二维坐标点。 */
export interface Point2D {
  /** 坐标 X。 */
  x: number;
  /** 坐标 Y。 */
  y: number;
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

/** GraphView 公开的渲染器状态。 */
export interface GraphRendererHandle {
  /** WebGL2 上下文。 */
  readonly gl: WebGL2RenderingContext;
  /** 最近一帧 CPU 渲染耗时。 */
  readonly lastFrameMs: number;
  /** 最近一帧 draw call 数量。 */
  readonly lastDrawCalls: number;
  /** 当前交互渲染状态。 */
  readonly interactionActive: boolean;
}

/** 无 UI 的高性能关系图入口。 */
export class GraphView {
  /**
   * 创建关系图。
   *
   * @param target - Canvas 元素或 CSS 选择器。
   * @param options - 初始数据、样式和渲染配置。
   */
  constructor(
    target: string | HTMLCanvasElement,
    options?: GraphViewOptions,
  );
  /** 当前 Canvas。 */
  readonly canvas: HTMLCanvasElement;
  /** 当前二维相机。 */
  readonly camera: Camera2D;
  /** 当前渲染器状态。 */
  readonly renderer: GraphRendererHandle;
  /** 当前图数据。 */
  data: GraphData | null;
  /** 当前悬停节点。 */
  hoverId: number | null;
  /** 当前选中节点。 */
  selectedId: number | null;
  /**
   * 装载图数据。
   *
   * @param payload - GraphData 或 SoA 图数据。
   * @param options - 是否自动适配视图。
   * @returns 规范化后的 GraphData。
   */
  setData(
    payload: GraphPayload | ObjectGraphPayload | GraphData,
    options?: {
      /** 是否自动适配视图。 */
      fit?: boolean;
    },
  ): GraphData;
  /**
   * 合并图样式。
   *
   * @param patch - 需要更新的样式字段。
   * @returns 无返回值。
   */
  setStyle(patch: GraphStyleOptions): void;
  /** 读取当前规范化样式。 */
  getStyle(): RenderStyle;
  /** 将全部节点适配到视口。 */
  fitView(): void;
  /** 读取当前视图状态。 */
  getViewState(): ViewState;
  /**
   * 设置相机中心和缩放。
   *
   * @param centerX - 视口中心世界坐标 X。
   * @param centerY - 视口中心世界坐标 Y。
   * @param scale - 每世界单位像素数。
   * @returns 无返回值。
   */
  setView(centerX: number, centerY: number, scale: number): void;
  /**
   * 设置持续渲染。
   *
   * @param enabled - 是否持续渲染。
   * @returns 无返回值。
   */
  setContinuousRender(enabled: boolean): void;
  /**
   * 设置目标帧率。
   *
   * @param fps - 目标帧率。
   * @returns 无返回值。
   */
  setTargetFps(fps: number): void;
  /**
   * 选择节点或清空选择。
   *
   * @param nodeId - 节点索引或 `null`。
   * @returns 无返回值。
   */
  select(nodeId: number | null): void;
  /**
   * 查询直接邻居。
   *
   * @param nodeId - 节点索引。
   * @returns 直接邻居详情。
   */
  getRelatedNodes(nodeId: number | null): NodeDetails[];
  /**
   * 订阅类型安全事件。
   *
   * @param event - 事件名称。
   * @param listener - 事件监听器。
   * @returns 取消订阅函数。
   */
  on<K extends GraphViewEventName>(
    event: K,
    listener: (payload: GraphViewEventMap[K]) => void,
  ): () => void;
  /**
   * 取消订阅事件。
   *
   * @param event - 事件名称。
   * @param listener - 原监听器。
   * @returns 无返回值。
   */
  off<K extends GraphViewEventName>(
    event: K,
    listener: (payload: GraphViewEventMap[K]) => void,
  ): void;
  /**
   * 导出 WebGL 和标签合成图片。
   *
   * @param type - 目标 MIME 类型。
   * @returns 图片 Blob 或 `null`。
   */
  exportImage(type?: string): Promise<Blob | null>;
  /** 同步 Canvas、相机和 drawing buffer 尺寸。 */
  resize(): void;
  /** 请求下一动画帧渲染。 */
  requestRender(): void;
  /**
   * 立即渲染一帧。
   *
   * @param time - 渲染时间戳。
   * @returns 无返回值。
   */
  renderNow(time?: number): void;
  /** 销毁图实例并释放资源。 */
  dispose(): void;
}

/** 校验并持有连续 SoA TypedArray 图数据。 */
export class GraphData {
  /** 节点数量。 */
  readonly nodeCount: number;
  /** 边数量。 */
  readonly edgeCount: number;
  /** 社区数量。 */
  readonly clusterCount: number;
  /** 节点标签。 */
  readonly nodeLabels: string[] | null;
  /** 节点坐标。 */
  readonly nodePositions: Float32Array;
  /** 节点尺寸。 */
  readonly nodeSizes: Float32Array;
  /** 节点 RGBA 颜色字节。 */
  readonly nodeColors: Uint8Array;
  /** 节点社区索引。 */
  readonly nodeGroups: Uint16Array;
  /** 节点图标索引。 */
  readonly nodeIconIds: Uint8Array;
  /** 节点原始权重。 */
  readonly rawNodeWeights: Float32Array;
  /** 归一化节点权重。 */
  readonly nodeWeights: Float32Array;
  /** 边起点。 */
  readonly edgeSources: Uint32Array;
  /** 边终点。 */
  readonly edgeTargets: Uint32Array;
  /** 边端点坐标。 */
  readonly edgePositions: Float32Array;
  /** 边线宽。 */
  readonly edgeWidths: Float32Array;
  /** 边 RGBA 颜色字节。 */
  readonly edgeColors: Uint8Array;
  /**
   * 读取节点详情。
   *
   * @param index - 节点索引。
   * @returns 节点详情或 `null`。
   */
  getNodeDetails(index: number): NodeDetails | null;
  /** 读取世界坐标边界。 */
  getBounds(): GraphBounds;
  /** 读取主要 TypedArray 总字节数。 */
  getByteLength(): number;
}

/** 与数据无关的图样式对象。 */
export class GraphStyle {
  /**
   * 创建样式。
   *
   * @param initial - 初始样式。
   */
  constructor(initial?: GraphStyleOptions);
  /**
   * 合并样式配置。
   *
   * @param patch - 需要更新的字段。
   * @returns 当前实例。
   */
  set(patch?: GraphStyleOptions): this;
  /** 转换为渲染器使用的规范化样式。 */
  toRenderOptions(): RenderStyle;
}

/** 二维相机。 */
export class Camera2D {
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
  /**
   * 设置视口尺寸。
   *
   * @param width - 视口宽度。
   * @param height - 视口高度。
   * @returns 无返回值。
   */
  setViewport(width: number, height: number): void;
  /**
   * 适配世界边界。
   *
   * @param bounds - 世界边界。
   * @param padding - 可用视口比例。
   * @returns 无返回值。
   */
  fit(bounds: GraphBounds, padding?: number): void;
  /**
   * 将屏幕坐标转换为世界坐标。
   *
   * @param screenX - 屏幕 X。
   * @param screenY - 屏幕 Y。
   * @returns 世界坐标点。
   */
  screenToWorld(
    screenX: number,
    screenY: number,
  ): Point2D;
}

/** CSR 无向邻接和关联边索引。 */
export class NodeAdjacencyIndex {
  /** 节点数量。 */
  readonly nodeCount: number;
  /** 邻居起始偏移。 */
  readonly offsets: Uint32Array;
  /** 直接邻居索引。 */
  readonly neighbors: Uint32Array;
  /** 关联边起始偏移。 */
  readonly incidentEdgeOffsets: Uint32Array;
  /** 关联边索引。 */
  readonly incidentEdges: Uint32Array;
  /**
   * 读取直接邻居区间。
   *
   * @param nodeId - 节点索引。
   * @returns 起止偏移。
   */
  getNeighborRange(nodeId: number): [number, number];
  /**
   * 读取关联边区间。
   *
   * @param nodeId - 节点索引。
   * @returns 起止偏移。
   */
  getIncidentEdgeRange(nodeId: number): [number, number];
}
