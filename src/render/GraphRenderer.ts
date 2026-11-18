import { EdgeRenderer } from "./EdgeRenderer.js";
import { GraphHighlightMask } from "./GraphHighlightMask.js";
import { GraphStyle } from "./GraphStyle.js";
import { HighlightOverlayRenderer } from "./HighlightOverlayRenderer.js";
import { NodeRenderer } from "./NodeRenderer.js";
import { NodeLabelRenderer } from "./NodeLabelRenderer.js";
import { GraphData } from "../graph/GraphData.js";
import { NodeAdjacencyIndex } from "../graph/NodeAdjacencyIndex.js";
import type { SpatialNodeIndex } from "../interaction/SpatialNodeIndex.js";
import type { Camera2D } from "./Camera2D.js";
import type {
  GraphBounds,
  GraphStyleOptions,
  RenderStyle,
} from "../lib/types.js";

/**
 * 编排边、节点、图标高亮和标签的 WebGL2 渲染。
 */
export class GraphRenderer {
  /** 目标 Canvas。 */
  readonly canvas: HTMLCanvasElement;
  /** WebGL2 上下文。 */
  readonly gl: WebGL2RenderingContext;
  /** 边实例化渲染器。 */
  readonly edgeRenderer: EdgeRenderer;
  /** 节点实例化渲染器。 */
  readonly nodeRenderer: NodeRenderer;
  /** 共享 Canvas 标签层。 */
  readonly labelRenderer: NodeLabelRenderer;
  /** 关联节点原图标覆盖层。 */
  readonly highlightOverlay: HighlightOverlayRenderer;
  /** 当前图数据。 */
  graphData: GraphData | null;
  /** 是否已装载可绘制数据。 */
  hasData: boolean;
  /** 最近一帧 CPU 渲染耗时。 */
  lastFrameMs: number;
  /** 最近一帧 draw call 数量。 */
  lastDrawCalls: number;
  /** 当前是否处于拖拽或缩放交互中。 */
  interactionActive: boolean;
  /** 边和节点 LOD 质量倍数。 */
  qualityScale: number;
  /** 标签 LOD 质量倍数。 */
  labelQualityScale: number;
  /** 业务样式对象。 */
  readonly graphStyle: GraphStyle;
  /** 当前规范化渲染样式。 */
  style: RenderStyle;
  /** 焦点邻域标记。 */
  highlightMask: GraphHighlightMask | null;
  /** 节点可见掩码。 */
  visibilityMask: Uint8Array;
  /** 边可见掩码。 */
  edgeVisibilityMask: Uint8Array;
  /** 上次可见性抽样使用的相机与预算键。 */
  visibilityKey: string;
  /** 当前空间索引。 */
  spatialNodeIndex: SpatialNodeIndex | null;
  /** 当前实际绘制的边索引。 */
  visibleEdgeIds: number[];

  /**
   * 创建 WebGL2 上下文及各子渲染器。
   *
   * @param canvas - 用于创建 WebGL2 上下文的 Canvas。
   */
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
      premultipliedAlpha: false,
    });
    if (!gl) {
      throw new Error("当前浏览器或显卡不支持 WebGL2");
    }
    this.gl = gl;
    this.edgeRenderer = new EdgeRenderer(gl);
    this.nodeRenderer = new NodeRenderer(gl);
    this.labelRenderer = new NodeLabelRenderer(canvas);
    this.highlightOverlay = new HighlightOverlayRenderer(
      gl,
      this.nodeRenderer.iconAtlas,
    );
    this.graphData = null;
    this.hasData = false;
    this.lastFrameMs = 0;
    this.lastDrawCalls = 0;
    this.interactionActive = false;
    this.qualityScale = 1;
    this.labelQualityScale = 1;
    this.graphStyle = new GraphStyle();
    this.style = this.graphStyle.toRenderOptions();
    this.highlightMask = null;
    this.visibilityMask = new Uint8Array(0);
    this.edgeVisibilityMask = new Uint8Array(0);
    this.visibilityKey = "";
    this.spatialNodeIndex = null;
    this.visibleEdgeIds = [];

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  }

  /**
   * 上传图数据并重建可见性与邻域状态。
   *
   * @param data - 已规范化的图数据。
   * @param adjacencyIndex - CSR 邻接索引。
   * @returns 无返回值。
   */
  setGraphData(
    data: GraphData,
    adjacencyIndex: NodeAdjacencyIndex,
  ): void {
    this.highlightMask?.dispose();
    this.graphData = data;
    this.edgeRenderer.upload(data);
    this.nodeRenderer.upload(data);
    this.labelRenderer.upload(data);
    this.visibilityMask = new Uint8Array(data.nodeCount);
    this.edgeVisibilityMask = new Uint8Array(data.edgeCount);
    this.visibilityKey = "";
    this.visibleEdgeIds = [];
    this.highlightMask = new GraphHighlightMask(
      this.gl,
      data.nodeCount,
      adjacencyIndex,
    );
    this.hasData = true;
  }

  /**
   * 合并渲染样式。
   *
   * @param patch - 业务样式配置。
   * @returns 无返回值。
   */
  setStyle(patch: GraphStyleOptions): void {
    this.graphStyle.set(patch);
    this.style = this.graphStyle.toRenderOptions();
  }

  /**
   * 设置交互渲染状态。
   *
   * @param active - 是否处于拖拽、缩放等高频交互。
   * @returns 无返回值。
   */
  setInteractionActive(active: boolean): void {
    this.interactionActive = active;
  }

  /**
   * 设置边和节点的 LOD 质量倍数。
   *
   * @param scale - 0.18～1 的质量倍数。
   * @returns 无返回值。
   */
  setQualityScale(scale: number): void {
    this.qualityScale = Math.max(0.18, Math.min(1, scale));
  }

  /**
   * 设置标签质量倍数。
   *
   * @param scale - 0～1 的标签质量倍数。
   * @returns 无返回值。
   */
  setLabelQualityScale(scale: number): void {
    this.labelQualityScale = Math.max(0, Math.min(1, scale));
  }

  /**
   * 切换用于视口节点查询的空间索引。
   *
   * @param index - 新空间索引。
   * @returns 无返回值。
   */
  setSpatialNodeIndex(index: SpatialNodeIndex): void {
    this.spatialNodeIndex = index;
    this.visibilityKey = "";
  }

  /**
   * 局部更新被拖拽节点及关联边的 GPU 坐标。
   *
   * @param nodeId - 节点索引。
   * @param x - 新世界坐标 X。
   * @param y - 新世界坐标 Y。
   * @param adjacencyIndex - 节点关联边 CSR 索引。
   * @returns 无返回值。
   */
  updateNodePosition(
    nodeId: number,
    x: number,
    y: number,
    adjacencyIndex: NodeAdjacencyIndex,
  ): void {
    if (!this.graphData) {
      return;
    }

    this.graphData.nodePositions[nodeId * 2] = x;
    this.graphData.nodePositions[nodeId * 2 + 1] = y;
    const bounds = this.graphData.bounds;
    bounds.minX = Math.min(bounds.minX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.maxY = Math.max(bounds.maxY, y);

    this.nodeRenderer.updateNodePosition(nodeId, x, y);
    this.edgeRenderer.updateNodePosition(
      nodeId,
      x,
      y,
      this.graphData,
      adjacencyIndex,
    );

    if (this.highlightMask && this.highlightMask.focusId !== null) {
      this.highlightOverlay.update(
        this.highlightMask.focusId,
        this.highlightMask.previousIds,
        this.graphData,
      );
    }
    this.visibilityKey = "";
  }

  /**
   * 同步 Canvas drawing buffer、GL 视口和标签层尺寸。
   *
   * @param cssWidth - Canvas CSS 宽度。
   * @param cssHeight - Canvas CSS 高度。
   * @param pixelRatio - 设备像素比。
   * @returns 无返回值。
   */
  resize(
    cssWidth: number,
    cssHeight: number,
    pixelRatio: number,
  ): void {
    const width = Math.max(1, Math.round(cssWidth * pixelRatio));
    const height = Math.max(1, Math.round(cssHeight * pixelRatio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    this.gl.viewport(0, 0, width, height);
    this.labelRenderer.resize(cssWidth, cssHeight, pixelRatio);
  }

  /**
   * 提交一帧 WebGL 与标签绘制。
   *
   * @param camera - 当前二维相机。
   * @param hoverId - 当前悬停节点。
   * @param selectedId - 当前选中节点。
   * @returns 无返回值。
   */
  render(
    camera: Camera2D,
    hoverId: number | null,
    selectedId: number | null,
  ): void {
    const startedAt = performance.now();
    const gl = this.gl;
    gl.clearColor(...this.style.backgroundColor);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (this.hasData) {
      const focusId = selectedId;
      const highlightActive = focusId !== null;
      const usesPointRendering =
        this.nodeRenderer.nodeCount >= 100_000;
      const edgeBudget = this.#calculateEdgeBudget(camera);
      const nodeBudget = this.#calculateNodeBudget(camera);
      const nodeStride = Math.max(
        1,
        Math.ceil(this.nodeRenderer.nodeCount / nodeBudget),
      );
      this.#updateVisibilityMask(
        camera,
        nodeBudget,
        nodeStride,
        edgeBudget,
        focusId,
      );
      if (this.highlightMask?.update(focusId)) {
        this.nodeRenderer.updateHighlightMask(this.highlightMask.mask);
        if (!usesPointRendering) {
          this.highlightOverlay.update(
            focusId,
            this.highlightMask.previousIds,
            this.graphData,
          );
        }
      }
      if (this.style.showEdges) {
        this.edgeRenderer.draw(
          camera,
          focusId,
          {
            edgeStyle: this.style.edgeStyle,
            highlightActive,
            dimOpacity: this.style.edgeDimOpacity,
            widthScale: this.style.edgeWidthScale,
          },
        );
      }
      const nodeScale =
        this.#calculateNodeScale(camera) * this.style.nodeScale;
      const minimumNodeSize =
        this.#calculateMinimumNodeSize(camera);
      this.nodeRenderer.draw(
        camera,
        hoverId,
        selectedId,
        {
          nodeScale,
          minimumSize: minimumNodeSize,
          nodeStride,
          nodeShape: this.style.nodeShape,
          highlightMask: highlightActive ? this.highlightMask : null,
          highlightColor: this.style.highlightColor,
          dimOpacity: this.style.dimOpacity,
          weightStrength: this.style.weightStrength,
        },
      );

      if (highlightActive && !usesPointRendering) {
        this.highlightOverlay.draw(camera);
      }
      this.labelRenderer.draw(camera, hoverId, selectedId, {
        enabled: this.style.showLabels,
        performanceScale: this.labelQualityScale,
        fontSize: this.style.labelFontSize,
        highlightMask: highlightActive
          ? this.highlightMask?.mask ?? null
          : null,
        forceLabelIds: highlightActive
          ? this.highlightMask.previousIds
          : [],
        nodeScale,
        minimumSize: minimumNodeSize,
        interactionActive: this.interactionActive,
      });

      this.lastDrawCalls =
        (this.style.showEdges ? 1 : 0) +
        1 +
        (highlightActive && !usesPointRendering ? 1 : 0);
    } else {
      this.lastDrawCalls = 0;
    }

    this.lastFrameMs = performance.now() - startedAt;
  }

  /**
   * 读取当前 WebGL GPU 描述。
   *
   * @returns 可用时返回未遮蔽 GPU 名称，否则返回 `WebGL2`。
   */
  getGpuDescription(): string {
    const gl = this.gl;
    const extension = gl.getExtension("WEBGL_debug_renderer_info");
    if (!extension) {
      return "WebGL2";
    }
    return gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) || "WebGL2";
  }

  /**
   * 释放 GPU 与标签资源。
   *
   * @returns 无返回值。
   */
  dispose(): void {
    this.highlightMask?.dispose();
    this.highlightOverlay.dispose();
    this.labelRenderer.dispose();
    this.edgeRenderer.dispose();
    this.nodeRenderer.dispose();
  }

  /**
   * 更新节点和边的 LOD 可见性，并保证边端点可见。
   *
   * @param camera - 当前相机。
   * @param nodeBudget - 节点可见预算。
   * @param nodeStride - 节点实例抽样步长。
   * @param edgeBudget - 边可见预算。
   * @param focusId - 当前选中节点。
   * @returns 无返回值。
   */
  #updateVisibilityMask(
    camera: Camera2D,
    nodeBudget: number,
    nodeStride: number,
    edgeBudget: number,
    focusId: number | null,
  ): void {
    const {
      nodeCount,
      nodeWeights,
      edgeCount,
      edgeSources,
      edgeTargets,
    } = this.graphData;
    const mask = this.visibilityMask;
    const viewportBounds = this.#getViewportBounds(camera);
    const coversWholeGraph =
      this.spatialNodeIndex?.coversBounds(viewportBounds) ?? true;
    const selectionKey = coversWholeGraph
      ? `all:${edgeBudget}:focus:${focusId ?? -1}`
      : `${this.#createVisibilityKey(camera, nodeBudget, edgeBudget)}:focus:${focusId ?? -1}`;
    if (selectionKey === this.visibilityKey) {
      return;
    }
    const viewportNodes = coversWholeGraph
      ? null
      : this.spatialNodeIndex?.collectInBounds(viewportBounds) ?? null;

    mask.fill(0);
    if (viewportNodes) {
      for (const nodeIndex of viewportNodes) {
        mask[nodeIndex] = 1;
      }
    } else {
      mask.fill(1);
    }
    const forceNodeIds = this.#collectFocusNodeIds(focusId);
    for (const nodeId of forceNodeIds) {
      mask[nodeId] = 1;
    }
    this.#selectEdges(
      mask,
      edgeSources,
      edgeTargets,
      edgeCount,
      edgeBudget,
      focusId,
    );
    this.edgeRenderer.updateVisibleEdges(this.visibleEdgeIds, this.graphData);
    this.visibilityKey = selectionKey;
    this.#appendVisibleEdgeEndpoints(
      forceNodeIds,
      edgeSources,
      edgeTargets,
    );
    this.nodeRenderer.updateVisibilityMask(
      mask,
      nodeBudget,
      forceNodeIds,
    );
  }

  /**
   * 收集选中节点和全部直接邻居，供 Point Sprite 抽样强制保留。
   *
   * @param focusId - 当前选中节点。
   * @returns 强制绘制节点索引。
   */
  #collectFocusNodeIds(focusId: number | null): number[] {
    const adjacencyIndex = this.highlightMask?.adjacencyIndex;
    if (focusId === null || !adjacencyIndex) {
      return [];
    }
    const nodeIds = [focusId];
    const seen = new Set<number>([focusId]);
    const [start, end] = adjacencyIndex.getNeighborRange(focusId);
    for (let index = start; index < end; index += 1) {
      const neighborId = adjacencyIndex.neighbors[index];
      if (seen.has(neighborId)) {
        continue;
      }
      seen.add(neighborId);
      nodeIds.push(neighborId);
    }
    return nodeIds;
  }

  /**
   * 将当前已绘制边的两个端点加入强制节点集合。
   *
   * 边和节点使用不同的抽样策略，若端点未单独保留，就会出现只有线
   * 没有端点的视觉缺失。
   *
   * @param nodeIds - 待追加的节点索引数组。
   * @param edgeSources - 全量边起点。
   * @param edgeTargets - 全量边终点。
   * @returns 无返回值。
   */
  #appendVisibleEdgeEndpoints(
    nodeIds: number[],
    edgeSources: Uint32Array,
    edgeTargets: Uint32Array,
  ): void {
    for (const edgeIndex of this.visibleEdgeIds) {
      nodeIds.push(edgeSources[edgeIndex], edgeTargets[edgeIndex]);
    }
  }

  /**
   * 从与可见节点相连的候选边中抽样。
   *
   * @param mask - 节点可见掩码。
   * @param edgeSources - 边起点。
   * @param edgeTargets - 边终点。
   * @param edgeCount - 边数量。
   * @param edgeBudget - 边可见预算。
   * @param focusId - 当前选中节点。
   * @returns 无返回值。
   */
  #selectEdges(
    mask: Uint8Array,
    edgeSources: Uint32Array,
    edgeTargets: Uint32Array,
    edgeCount: number,
    edgeBudget: number,
    focusId: number | null,
  ): void {
    const edgeMask = this.edgeVisibilityMask;
    edgeMask.fill(0);
    this.visibleEdgeIds = [];

    // 只从与可见节点相连的边中抽样，避免破坏图的关联结构。
    let candidateCount = 0;
    for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex += 1) {
      if (
        mask[edgeSources[edgeIndex]] === 1 ||
        mask[edgeTargets[edgeIndex]] === 1
      ) {
        candidateCount += 1;
      }
    }

    const sampleStep = Math.max(
      1,
      Math.ceil(candidateCount / Math.max(1, edgeBudget)),
    );
    let candidateIndex = 0;

    for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex += 1) {
      const source = edgeSources[edgeIndex];
      const target = edgeTargets[edgeIndex];
      if (mask[source] !== 1 && mask[target] !== 1) {
        continue;
      }

      if (candidateIndex % sampleStep === 0) {
        edgeMask[edgeIndex] = 1;
        this.visibleEdgeIds.push(edgeIndex);
        mask[source] = 1;
        mask[target] = 1;
      }
      candidateIndex += 1;
    }

    const adjacencyIndex = this.highlightMask?.adjacencyIndex;
    if (focusId !== null && adjacencyIndex) {
      const [start, end] =
        adjacencyIndex.getIncidentEdgeRange(focusId);
      for (let index = start; index < end; index += 1) {
        const edgeIndex = adjacencyIndex.incidentEdges[index];
        if (edgeMask[edgeIndex] === 0) {
          edgeMask[edgeIndex] = 1;
          this.visibleEdgeIds.push(edgeIndex);
        }
      }
    }
  }

  /**
   * 计算带屏幕边距的当前视口世界边界。
   *
   * @param camera - 当前相机。
   * @returns 视口世界坐标范围。
   */
  #getViewportBounds(camera: Camera2D): GraphBounds {
    const margin = 96;
    const topLeft = camera.screenToWorld(-margin, -margin);
    const bottomRight = camera.screenToWorld(
      camera.viewportWidth + margin,
      camera.viewportHeight + margin,
    );
    return {
      minX: Math.min(topLeft.x, bottomRight.x),
      minY: Math.min(topLeft.y, bottomRight.y),
      maxX: Math.max(topLeft.x, bottomRight.x),
      maxY: Math.max(topLeft.y, bottomRight.y),
    };
  }

  /**
   * 创建用于复用边抽样的相机与预算键。
   *
   * @param camera - 当前相机。
   * @param nodeBudget - 节点预算。
   * @param edgeBudget - 边预算。
   * @returns 可见性缓存键。
   */
  #createVisibilityKey(
    camera: Camera2D,
    nodeBudget: number,
    edgeBudget: number,
  ): string {
    const cellSize = this.spatialNodeIndex?.cellSize ?? 1;
    const snapSize = Math.max(cellSize * 4, 1);
    return [
      nodeBudget,
      edgeBudget,
      Math.floor(camera.centerX / snapSize),
      Math.floor(camera.centerY / snapSize),
      Math.round(Math.log2(Math.max(camera.scale, 0.001)) * 8),
    ].join(":");
  }

  /**
   * 计算当前相机与交互状态下的边预算。
   *
   * @param camera - 当前相机。
   * @returns 可见边预算。
   */
  #calculateEdgeBudget(camera: Camera2D): number {
    const edgeCount = this.edgeRenderer.edgeCount;
    const isHeavyGraph = edgeCount >= 250_000;
    const baseTarget = this.interactionActive
      ? isHeavyGraph
        ? 10_000
        : 20_000
      : camera.scale >= 1.45
        ? isHeavyGraph
          ? 100_000
          : 120_000
        : camera.scale < 0.75
          ? isHeavyGraph
            ? 24_000
            : 40_000
          : isHeavyGraph
            ? 40_000
            : 90_000;
    const cappedTarget =
      edgeCount >= 50_000
        ? Math.min(baseTarget, 6_000)
        : baseTarget;
    const targetVisibleEdges = Math.max(
      4_000,
      cappedTarget * this.qualityScale,
    );
    return Math.max(1, Math.round(targetVisibleEdges));
  }

  /**
   * 计算当前相机与数据规模下的节点预算。
   *
   * @param camera - 当前相机。
   * @returns 节点可见预算。
   */
  #calculateNodeBudget(camera: Camera2D): number {
    const nodeCount = this.nodeRenderer.nodeCount;
    const isHeavyGraph = nodeCount >= 250_000;
    const baseTarget = this.interactionActive
      ? isHeavyGraph
        ? 10_000
        : 25_000
      : camera.scale >= 1.45
        ? isHeavyGraph
          ? 100_000
          : 120_000
        : isHeavyGraph
          ? 10_000
          : 40_000;
    const cappedTarget =
      nodeCount >= 100_000
        ? Math.min(baseTarget, 10_000)
        : baseTarget;
    const targetVisibleNodes =
      camera.scale >= 1.45 && isHeavyGraph
        ? cappedTarget
        : Math.max(5_000, cappedTarget * this.qualityScale);
    return Math.max(1, Math.round(targetVisibleNodes));
  }

  /**
   * 计算与数据规模和缩放相关的节点尺寸倍数。
   *
   * @param camera - 当前相机。
   * @returns 节点尺寸倍数。
   */
  #calculateNodeScale(camera: Camera2D): number {
    const nodeCount = this.nodeRenderer.nodeCount;
    let densityScale = 0.9;

    if (nodeCount <= 1_000) {
      densityScale = 2.8;
    } else if (nodeCount >= 300_000) {
      densityScale = 0.64;
    } else if (nodeCount >= 100_000) {
      densityScale = 0.74;
    } else if (nodeCount >= 20_000) {
      densityScale = 0.84;
    }

    const zoomProgress = Math.max(
      0,
      Math.min(1, (camera.scale - 0.45) / 1.1),
    );
    if (nodeCount <= 1_000) {
      return densityScale * (1 + zoomProgress * 0.25);
    }

    return densityScale + (1 - densityScale) * zoomProgress;
  }

  /**
   * 计算远景节点最小屏幕尺寸。
   *
   * @param camera - 当前相机。
   * @returns 最小节点尺寸。
   */
  #calculateMinimumNodeSize(camera: Camera2D): number {
    const nodeCount = this.nodeRenderer.nodeCount;
    const isImage = this.style.nodeShape === 7;

    if (nodeCount >= 100_000 && camera.scale < 0.7) {
      return isImage ? 2.0 : 1.2;
    }

    if (nodeCount >= 100_000 && camera.scale < 1.45) {
      return isImage ? 3.2 : 1.8;
    }

    return isImage ? 5.0 : 2.4;
  }
}
