import { GraphData } from "../graph/GraphData.js";
import { NodeAdjacencyIndex } from "../graph/NodeAdjacencyIndex.js";
import {
  createGraphPayloadFromObjectGraph,
  isObjectGraphPayload,
} from "../graph/ObjectGraphAdapter.js";
import { GraphInteractionController } from "../interaction/GraphInteractionController.js";
import { SpatialNodeIndex } from "../interaction/SpatialNodeIndex.js";
import { Camera2D } from "../render/Camera2D.js";
import { GraphRenderer } from "../render/GraphRenderer.js";
import type {
  GraphPayload,
  GraphStyleOptions,
  GraphViewEventMap,
  GraphViewEventName,
  GraphViewOptions,
  NodeDetails,
  ObjectGraphPayload,
  RenderStyle,
  ViewState,
} from "./types.js";

/** GraphView 内部事件监听器函数。 */
type GraphEventListener = (
  payload: GraphViewEventMap[GraphViewEventName],
) => void;

/** `setData` 可选行为。 */
interface SetDataOptions {
  /** 是否在装载后自动适配视图。 */
  fit?: boolean;
}

/**
 * 无 UI 的高性能关系图入口。
 *
 * 负责数据装载、相机、WebGL 渲染、交互、标签质量降级和生命周期。
 */
export class GraphView {
  /** 当前渲染使用的 Canvas。 */
  readonly canvas: HTMLCanvasElement;
  /** 二维相机。 */
  readonly camera: Camera2D;
  /** WebGL 渲染编排器。 */
  readonly renderer: GraphRenderer;
  /** 当前图数据。 */
  data: GraphData | null;
  /** 当前 CSR 邻接索引。 */
  private adjacencyIndex: NodeAdjacencyIndex | null;
  /** 当前局部拾取索引。 */
  private nodeIndex: SpatialNodeIndex | null;
  /** DOM 交互控制器。 */
  private interaction: GraphInteractionController | null;
  /** 当前悬停节点。 */
  hoverId: number | null;
  /** 当前选中节点。 */
  selectedId: number | null;
  /** 视图是否处于可运行生命周期。 */
  private running: boolean;
  /** 下一动画帧是否需要提交渲染。 */
  private renderRequested: boolean;
  /** 是否持续按目标帧率渲染。 */
  private continuousRender: boolean;
  /** 持续渲染目标帧率。 */
  private targetFps: number;
  /** 自动适配视图的边距比例。 */
  private readonly fitPadding: number;
  /** 等待执行的动画帧句柄。 */
  private frameHandle: number | null;
  /** 最近采样窗口内的帧数。 */
  private frameCounter: number;
  /** 最近采样窗口的起始时间。 */
  private lastFpsSample: number;
  /** 下一允许渲染的时间戳。 */
  private nextRenderTime: number;
  /** 边与节点 LOD 质量倍数。 */
  private qualityScale: number;
  /** 标签 LOD 质量倍数。 */
  private labelQualityScale: number;
  /** Canvas CSS 宽度。 */
  private viewportWidth: number;
  /** Canvas CSS 高度。 */
  private viewportHeight: number;
  /** 当前设备像素比上限后的实际倍率。 */
  private pixelRatio: number;
  /** 按事件名称保存的监听器集合。 */
  private readonly listeners: Map<
    GraphViewEventName,
    Set<GraphEventListener>
  >;
  /** 观察 Canvas 尺寸变化的观察器。 */
  private readonly resizeObserver: ResizeObserver;

  /**
   * 创建关系图实例。
   *
   * @param target - Canvas 元素或 CSS 选择器。
   * @param options - 初始数据、样式、适配和持续渲染配置。
   */
  constructor(
    target: string | HTMLCanvasElement,
    options: GraphViewOptions = {},
  ) {
    this.canvas = resolveCanvas(target);
    this.camera = new Camera2D();
    this.renderer = new GraphRenderer(this.canvas);
    this.data = null;
    this.adjacencyIndex = null;
    this.nodeIndex = null;
    this.interaction = null;
    this.hoverId = null;
    this.selectedId = null;
    this.running = false;
    this.renderRequested = true;
    this.continuousRender = Boolean(options.continuousRender);
    this.targetFps = clamp(options.targetFps ?? 56, 30, 60);
    this.fitPadding = clamp(options.fitPadding ?? 0.9, 0.2, 1);
    this.frameHandle = null;
    this.frameCounter = 0;
    this.lastFpsSample = performance.now();
    this.nextRenderTime = 0;
    this.qualityScale = 1;
    this.labelQualityScale = 1;
    this.viewportWidth = 1;
    this.viewportHeight = 1;
    this.pixelRatio = 1;
    this.listeners = new Map();

    this.renderer.setStyle(options.style ?? {});
    this.#createInteraction();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas);
    this.resize();
    this.running = true;
    this.requestRender();
    if (options.data) {
      this.setData(options.data, { fit: options.fit });
    }
  }

  /**
   * 装载新的 SoA 图数据。
   *
   * @param payload - GraphData、SoA GraphPayload 或对象图 GraphPayload。
   * @param options - 是否在装载后自动适配视图。
   * @returns 规范化后的 GraphData。
   */
  setData(
    payload: GraphPayload | ObjectGraphPayload | GraphData,
    options: SetDataOptions = {},
  ): GraphData {
    const data =
      payload instanceof GraphData
        ? payload
        : new GraphData(
            normalizeGraphPayload(
              isObjectGraphPayload(payload)
                ? createGraphPayloadFromObjectGraph(payload)
                : payload,
            ),
          );
    const adjacencyIndex = new NodeAdjacencyIndex(
      data.nodeCount,
      data.edgeSources,
      data.edgeTargets,
    );
    this.data = data;
    this.adjacencyIndex = adjacencyIndex;
    this.selectedId = null;
    this.hoverId = null;
    this.renderer.setGraphData(data, adjacencyIndex);
    this.renderer.setQualityScale(1);
    this.qualityScale = 1;
    this.#setLabelQualityScale(1);
    this.nodeIndex = new SpatialNodeIndex(data);
    this.renderer.setSpatialNodeIndex(this.nodeIndex);
    this.interaction?.setNodeIndex(this.nodeIndex);
    this.resize();
    if (options.fit !== false) {
      this.fitView();
    }
    this.#emit("data", data);
    this.requestRender();
    return data;
  }

  /**
   * 合并图样式。
   *
   * @param patch - 需要更新的样式字段。
   * @returns 无返回值。
   */
  setStyle(patch: GraphStyleOptions): void {
    this.renderer.setStyle(patch);
    this.#emit("stylechange", this.renderer.style);
    this.requestRender();
  }

  /**
   * 读取当前规范化样式的副本。
   *
   * @returns 渲染样式副本。
   */
  getStyle(): RenderStyle {
    return { ...this.renderer.style };
  }

  /**
   * 将全部节点适配到当前视口。
   *
   * @returns 无返回值。
   */
  fitView(): void {
    if (!this.data) {
      return;
    }
    this.camera.setViewport(this.viewportWidth, this.viewportHeight);
    this.camera.fit(this.data.getBounds(), this.fitPadding);
    this.#emit("viewchange", this.getViewState());
    this.requestRender();
  }

  /**
   * 直接设置相机中心和缩放。
   *
   * @param centerX - 视口中心世界坐标 X。
   * @param centerY - 视口中心世界坐标 Y。
   * @param scale - 每世界单位对应的像素数。
   * @returns 无返回值。
   */
  setView(centerX: number, centerY: number, scale: number): void {
    this.camera.centerX = Number(centerX);
    this.camera.centerY = Number(centerY);
    this.camera.scale = Number(scale);
    this.#emit("viewchange", this.getViewState());
    this.requestRender();
  }

  /**
   * 读取当前相机与视口状态。
   *
   * @returns 视图状态快照。
   */
  getViewState(): ViewState {
    return {
      centerX: this.camera.centerX,
      centerY: this.camera.centerY,
      scale: this.camera.scale,
      viewportWidth: this.viewportWidth,
      viewportHeight: this.viewportHeight,
    };
  }

  /**
   * 设置是否按目标帧率持续渲染。
   *
   * @param enabled - 是否持续渲染。
   * @returns 无返回值。
   */
  setContinuousRender(enabled: boolean): void {
    this.continuousRender = Boolean(enabled);
    this.nextRenderTime = 0;
    this.frameCounter = 0;
    this.lastFpsSample = performance.now();
    this.requestRender();
  }

  /**
   * 设置持续渲染目标帧率并重置质量预算。
   *
   * @param fps - 目标帧率，自动限制在 30～60。
   * @returns 无返回值。
   */
  setTargetFps(fps: number): void {
    this.targetFps = clamp(fps, 30, 60);
    this.renderer.setQualityScale(1);
    this.#setLabelQualityScale(1);
    this.nextRenderTime = 0;
    this.frameCounter = 0;
    this.lastFpsSample = performance.now();
    this.requestRender();
  }

  /**
   * 选择节点并发布直接邻域。
   *
   * @param nodeId - 节点索引；`null` 表示清空选择。
   * @returns 无返回值。
   */
  select(nodeId: number | null): void {
    this.selectedId = nodeId;
    const details =
      nodeId === null ? null : this.data?.getNodeDetails(nodeId) ?? null;
    this.#emit("select", {
      nodeId,
      node: details,
      related: this.getRelatedNodes(nodeId),
    });
    this.requestRender();
  }

  /**
   * 查询节点的全部直接邻居。
   *
   * @param nodeId - 节点索引。
   * @returns 直接邻居详情数组。
   */
  getRelatedNodes(nodeId: number | null): NodeDetails[] {
    if (
      nodeId === null ||
      nodeId === undefined ||
      !this.adjacencyIndex ||
      !this.data
    ) {
      return [];
    }

    const [start, end] =
      this.adjacencyIndex.getNeighborRange(nodeId);
    const related = [];
    const seen = new Set<number>();
    for (let index = start; index < end; index += 1) {
      const relatedId = this.adjacencyIndex.neighbors[index];
      if (seen.has(relatedId)) {
        continue;
      }
      seen.add(relatedId);
      related.push(this.data.getNodeDetails(relatedId));
    }
    return related;
  }

  /**
   * 订阅图事件。
   *
   * @param eventName - 事件名称。
   * @param listener - 类型安全的事件监听器。
   * @returns 取消订阅函数。
   */
  on<K extends GraphViewEventName>(
    eventName: K,
    listener: (payload: GraphViewEventMap[K]) => void,
  ): () => void {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    this.listeners.get(eventName).add(listener);
    return () => this.off(eventName, listener);
  }

  /**
   * 取消订阅图事件。
   *
   * @param eventName - 事件名称。
   * @param listener - 原监听器函数。
   * @returns 无返回值。
   */
  off<K extends GraphViewEventName>(
    eventName: K,
    listener: (payload: GraphViewEventMap[K]) => void,
  ): void {
    this.listeners.get(eventName)?.delete(listener);
  }

  /**
   * 导出 WebGL 与标签合成后的图片。
   *
   * @param type - 目标 MIME 类型。
   * @returns PNG 等图片 Blob；浏览器无法编码时为 `null`。
   */
  exportImage(type: string = "image/png"): Promise<Blob | null> {
    this.renderer.render(
      this.camera,
      this.hoverId,
      this.selectedId,
    );
    const output = document.createElement("canvas");
    output.width = this.canvas.width;
    output.height = this.canvas.height;
    const context = output.getContext("2d");
    context.drawImage(this.canvas, 0, 0);
    const labelCanvas = this.renderer.labelRenderer.canvas;
    if (!labelCanvas.hidden) {
      context.drawImage(
        labelCanvas,
        0,
        0,
        output.width,
        output.height,
      );
    }
    return new Promise((resolve) => output.toBlob(resolve, type));
  }

  /**
   * 同步 Canvas、相机、GPU drawing buffer 和标签层尺寸。
   *
   * @returns 无返回值。
   */
  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const nextWidth = Math.max(1, rect.width);
    const nextHeight = Math.max(1, rect.height);
    const nodeCount = this.data?.nodeCount ?? 0;
    const maxPixelRatio =
      nodeCount >= 250_000 ? 1 : nodeCount >= 100_000 ? 1.5 : 2;
    const nextPixelRatio = Math.min(
      window.devicePixelRatio || 1,
      maxPixelRatio,
    );
    const changed =
      nextWidth !== this.viewportWidth ||
      nextHeight !== this.viewportHeight ||
      nextPixelRatio !== this.pixelRatio;
    this.viewportWidth = nextWidth;
    this.viewportHeight = nextHeight;
    this.pixelRatio = nextPixelRatio;
    this.camera.setViewport(this.viewportWidth, this.viewportHeight);
    this.renderer.resize(
      this.viewportWidth,
      this.viewportHeight,
      this.pixelRatio,
    );
    if (changed && this.running && this.data) {
      this.renderer.render(
        this.camera,
        this.hoverId,
        this.selectedId,
      );
      this.renderRequested = false;
    }
    this.requestRender();
  }

  /**
   * 请求下一动画帧至少渲染一次。
   *
   * @returns 无返回值。
   */
  requestRender(): void {
    this.renderRequested = true;
    if (!this.running || this.frameHandle !== null) {
      return;
    }
    this.frameHandle = requestAnimationFrame((time) =>
      this.renderFrame(time),
    );
  }

  /**
   * 立即执行一帧渲染。
   *
   * @param time - 用于帧率控制的时间戳。
   * @returns 无返回值。
   */
  renderNow(time: number = performance.now()): void {
    this.renderFrame(time);
  }

  /**
   * 执行动画帧渲染、性能采样和后续帧调度。
   *
   * @param time - requestAnimationFrame 提供的时间戳。
   * @returns 无返回值。
   */
  renderFrame(time: number): void {
    this.frameHandle = null;
    if (!this.running) {
      return;
    }
    const isFrameLimited =
      this.continuousRender || this.renderer.interactionActive;
    if (this.renderRequested && (!isFrameLimited || time >= this.nextRenderTime)) {
      this.renderRequested = false;
      this.renderer.render(this.camera, this.hoverId, this.selectedId);
      this.frameCounter += 1;
      if (isFrameLimited) {
        const interval = 1000 / this.targetFps;
        this.nextRenderTime =
          this.nextRenderTime === 0
            ? time + interval
            : this.nextRenderTime + interval;
        if (this.nextRenderTime < time) {
          this.nextRenderTime = time + interval;
        }
      }
      this.#samplePerformance(time, isFrameLimited);
      this.#emit("frame", {
        frameMs: this.renderer.lastFrameMs,
        drawCalls: this.renderer.lastDrawCalls,
      });
    }
    if (this.continuousRender) {
      this.renderRequested = true;
      this.requestRender();
    } else if (this.renderRequested && isFrameLimited) {
      this.requestRender();
    }
  }

  /**
   * 停止渲染并释放 DOM、GPU 和事件资源。
   *
   * @returns 无返回值。
   */
  dispose(): void {
    this.running = false;
    if (this.frameHandle !== null) {
      cancelAnimationFrame(this.frameHandle);
    }
    this.resizeObserver?.disconnect();
    this.interaction?.dispose();
    this.renderer.dispose();
    this.listeners.clear();
  }

  /**
   * 创建 Canvas 交互控制器并连接到 GraphView 状态。
   *
   * @returns 无返回值。
   */
  #createInteraction(): void {
    this.interaction = new GraphInteractionController(
      this.canvas,
      this.camera,
      {
        onHover: (nodeId, clientX, clientY) => {
          this.hoverId = nodeId;
          this.#emit("hover", {
            nodeId,
            node:
              nodeId === null
                ? null
                : this.data?.getNodeDetails(nodeId) ?? null,
            clientX,
            clientY,
          });
          this.requestRender();
        },
        onSelect: (nodeId) => this.select(nodeId),
        onNodeDrag: (nodeId, x, y) => this.#dragNode(nodeId, x, y),
        onNodeDragEnd: () => this.requestRender(),
        onFitView: () => this.fitView(),
        onViewChange: () => {
          this.hoverId = null;
          this.#emit("viewchange", this.getViewState());
          this.requestRender();
        },
        onInteractionStart: () => {
          this.renderer.setInteractionActive(true);
          this.nextRenderTime = 0;
          this.frameCounter = 0;
          this.lastFpsSample = performance.now();
          this.requestRender();
        },
        onInteractionEnd: () => {
          this.renderer.setInteractionActive(false);
          this.#setLabelQualityScale(1);
          this.requestRender();
        },
      },
    );
  }

  /**
   * 更新节点空间索引、节点 GPU 坐标和关联边 GPU 坐标。
   *
   * @param nodeId - 节点索引。
   * @param x - 新世界坐标 X。
   * @param y - 新世界坐标 Y。
   * @returns 无返回值。
   */
  #dragNode(nodeId: number, x: number, y: number): void {
    if (!this.data || !this.nodeIndex || !this.adjacencyIndex) {
      return;
    }
    const previousX = this.data.nodePositions[nodeId * 2];
    const previousY = this.data.nodePositions[nodeId * 2 + 1];
    this.nodeIndex.updateNodePosition(
      nodeId,
      previousX,
      previousY,
      x,
      y,
    );
    this.renderer.updateNodePosition(
      nodeId,
      x,
      y,
      this.adjacencyIndex,
    );
    this.#emit("nodedrag", {
      nodeId,
      x,
      y,
      node: this.data.getNodeDetails(nodeId),
    });
    this.requestRender();
  }

  /**
   * 采样帧率并自动调节边、节点和标签预算。
   *
   * @param time - 当前帧时间戳。
   * @param isTracking - 当前是否处于高频或持续渲染。
   * @returns 无返回值。
   */
  #samplePerformance(time: number, isTracking: boolean): void {
    if (!isTracking) {
      return;
    }
    const duration = time - this.lastFpsSample;
    if (this.frameCounter <= 1 || duration < 500) {
      return;
    }
    const fps = (this.frameCounter * 1000) / duration;
    if (fps < this.targetFps * 0.82) {
      this.qualityScale = Math.max(0.18, this.qualityScale * 0.78);
      this.renderer.setQualityScale(this.qualityScale);
    }
    this.#updateLabelQuality(fps);
    this.#emit("framemetrics", {
      fps,
      frameMs: this.renderer.lastFrameMs,
      drawCalls: this.renderer.lastDrawCalls,
    });
    this.frameCounter = 0;
    this.lastFpsSample = time;
  }

  /**
   * 根据实时 FPS 计算标签质量目标。
   *
   * @param fps - 当前采样窗口平均帧率。
   * @returns 无返回值。
   */
  #updateLabelQuality(fps: number): void {
    const ratio = fps / this.targetFps;
    const target = clamp((ratio - 0.6) / 0.3, 0, 1);
    const next =
      target <= this.labelQualityScale
        ? target
        : this.labelQualityScale * 0.88 + target * 0.12;
    this.#setLabelQualityScale(next <= 0.04 ? 0 : next);
  }

  /**
   * 更新标签质量并同步到渲染器。
   *
   * @param scale - 0～1 标签质量倍数。
   * @returns 无返回值。
   */
  #setLabelQualityScale(scale: number): void {
    this.labelQualityScale = clamp(scale, 0, 1);
    this.renderer.setLabelQualityScale(this.labelQualityScale);
  }

  /**
   * 向全部事件监听器发布类型安全负载。
   *
   * @param eventName - 事件名称。
   * @param payload - 对应事件负载。
   * @returns 无返回值。
   */
  #emit<K extends GraphViewEventName>(
    eventName: K,
    payload: GraphViewEventMap[K],
  ): void {
    for (const listener of this.listeners.get(eventName) ?? []) {
      listener(payload);
    }
  }
}

/**
 * 将 Canvas 选择器或元素解析为 HTMLCanvasElement。
 *
 * @param target - Canvas 元素或 CSS 选择器。
 * @returns 解析后的 Canvas 元素。
 */
function resolveCanvas(
  target: string | HTMLCanvasElement,
): HTMLCanvasElement {
  const canvas =
    typeof target === "string" ? document.querySelector(target) : target;
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new TypeError("GraphView requires a canvas or canvas selector");
  }
  return canvas;
}

/**
 * 将负载中的数值数组规范为适合 GPU 上传的 TypedArray。
 *
 * @param payload - 业务图数据负载。
 * @returns 保留颜色输入和文本的规范化负载。
 */
function normalizeGraphPayload(payload: GraphPayload): GraphPayload {
  return {
    ...payload,
    nodePositions: asFloat32(payload.nodePositions),
    nodeSizes: asFloat32(payload.nodeSizes),
    nodeGroups: asUint16(payload.nodeGroups),
    nodeIconIds: payload.nodeIconIds
      ? asUint8(payload.nodeIconIds)
      : null,
    nodeWeights: payload.nodeWeights
      ? asFloat32(payload.nodeWeights)
      : null,
    edgeSources: asUint32(payload.edgeSources),
    edgeTargets: asUint32(payload.edgeTargets),
    edgePositions: asFloat32(payload.edgePositions),
    edgeWidths: asFloat32(payload.edgeWidths),
  };
}

/**
 * 将兼容数值输入转换为 Uint32Array。
 *
 * @param value - TypedArray 或普通数值数组。
 * @returns Uint32Array。
 */
function asUint32(value: ArrayLike<number>): Uint32Array {
  return value instanceof Uint32Array ? value : Uint32Array.from(value);
}

/**
 * 将兼容数值输入转换为 Uint8Array。
 *
 * @param value - TypedArray 或普通数值数组。
 * @returns Uint8Array。
 */
function asUint8(value: ArrayLike<number>): Uint8Array {
  return value instanceof Uint8Array ? value : Uint8Array.from(value);
}

/**
 * 将兼容数值输入转换为 Uint16Array。
 *
 * @param value - TypedArray 或普通数值数组。
 * @returns Uint16Array。
 */
function asUint16(value: ArrayLike<number>): Uint16Array {
  return value instanceof Uint16Array ? value : Uint16Array.from(value);
}

/**
 * 将兼容数值输入转换为 Float32Array。
 *
 * @param value - TypedArray 或普通数值数组。
 * @returns Float32Array。
 */
function asFloat32(value: ArrayLike<number>): Float32Array {
  return value instanceof Float32Array ? value : Float32Array.from(value);
}

/**
 * 将数值限制在指定闭区间。
 *
 * @param value - 原始数值。
 * @param min - 最小值。
 * @param max - 最大值。
 * @returns 限制后的数值。
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number(value)));
}
