const LABEL_FONT_FAMILY =
  'Arial, "PingFang SC", "Microsoft YaHei", sans-serif';
const DEFAULT_LABEL_FONT_SIZE = 10;
const LABEL_GAP = 6;
const COLLISION_PADDING = 3;
const AUTO_OPTIMIZE_NODE_COUNT = 200;
const GROUP_BOUNDARY_PADDING = 18;
const GROUP_BOUNDARY_RECOMPUTE_LIMIT = 10_000;
const GROUP_LABEL_FONT_SIZE = 11;

import type { GraphData } from "../graph/GraphData.js";
import type { Camera2D } from "./Camera2D.js";
import { getHighlightNodeRadius } from "./HighlightOverlayRenderer.js";

/** 单帧标签渲染选项。 */
interface LabelRenderOptions {
  /** 标签总开关。 */
  enabled?: boolean;
  /** 是否显示分组包围圈与组名。 */
  showGroupBounds?: boolean;
  /** 0～1 标签质量预算。 */
  performanceScale?: number;
  /** 节点邻域标记。 */
  highlightMask?: Uint8Array | null;
  /** 必须绘制的焦点和邻居标签。 */
  forceLabelIds?: readonly number[];
  /** 节点尺寸倍数。 */
  nodeScale?: number;
  /** 节点最小屏幕尺寸。 */
  minimumSize?: number;
  /** 当前是否处于拖拽或缩放。 */
  interactionActive?: boolean;
  /** 图片选中邻域的平滑缩放倍率。 */
  highlightRadiusScale?: number;
  /** 标签字号。 */
  fontSize?: number;
}

/** 已测量标签缓存。 */
interface MeasuredLabel {
  /** 最终绘制文本。 */
  text: string;
  /** 文本缩放档位。 */
  textScale: number;
  /** 是否使用完整标签。 */
  useFullLabel: boolean;
  /** 文本像素宽度。 */
  width: number;
}

/** 标签背景矩形。 */
interface LabelRect {
  /** 左边界。 */
  left: number;
  /** 上边界。 */
  top: number;
  /** 右边界。 */
  right: number;
  /** 下边界。 */
  bottom: number;
}

/** 分组在当前相机中的世界坐标边界。 */
interface GroupWorldBounds {
  /** 分组索引。 */
  groupIndex: number;
  /** 分组显示名称。 */
  label: string;
  /** 世界坐标最小 X。 */
  minX: number;
  /** 世界坐标最小 Y。 */
  minY: number;
  /** 世界坐标最大 X。 */
  maxX: number;
  /** 世界坐标最大 Y。 */
  maxY: number;
  /** 分组内节点数量。 */
  nodeCount: number;
}

/**
 * 使用单个 Canvas 2D 图层绘制节点标签。
 *
 * 小图显示全部标签；大图自动启用碰撞过滤和 FPS 可见预算。
 */
export class NodeLabelRenderer {
  /** 叠加在 WebGL Canvas 上的标签 Canvas。 */
  readonly canvas: HTMLCanvasElement;
  /** 标签 Canvas 2D 上下文。 */
  readonly context: CanvasRenderingContext2D;
  /** 当前图数据。 */
  private data: GraphData | null;
  /** 节点标签数组。 */
  private labels: string[] | null;
  /** 是否为没有业务标签的大图启用按需回退标签。 */
  private automaticLabels: boolean;
  /** 按标签优先级排列的节点索引。 */
  private labelOrder: Uint32Array | null;
  /** 是否启用大图自动优化。 */
  private autoOptimize: boolean;
  /** 本帧已经绘制标签的节点标记。 */
  private drawnMask: Uint8Array | null;
  /** 标签文本测量缓存。 */
  private measuredLabels: MeasuredLabel[];
  /** 本帧已占用矩形，用于碰撞过滤。 */
  private placedRects: LabelRect[];
  /** 分组边界的世界坐标缓存。 */
  private groupWorldBounds: GroupWorldBounds[];
  /** Canvas CSS 宽度。 */
  private cssWidth: number;
  /** Canvas CSS 高度。 */
  private cssHeight: number;
  /** 标签层设备像素比。 */
  private pixelRatio: number;
  /** 当前标签字号。 */
  private labelFontSize: number;
  /** 当前 Canvas 字体字符串。 */
  private labelFont: string;
  /** 标签背景高度。 */
  private labelHeight: number;
  private activeHighlightMask: Uint8Array | null;
  private activeSelectedId: number | null;
  private focusNodeCircle: {
    x: number;
    y: number;
    radius: number;
  } | null;
  /** 最近一次标签绘制耗时。 */
  lastLabelMs: number;
  /** 最近一次实际绘制的标签数量。 */
  lastLabelCount: number;

  /**
   * 创建标签 Canvas 并挂到图 Canvas 后。
   *
   * @param graphCanvas - WebGL 图 Canvas。
   */
  constructor(graphCanvas: HTMLCanvasElement) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "node-label-layer";
    this.canvas.setAttribute("aria-hidden", "true");
    this.canvas.hidden = true;
    Object.assign(this.canvas.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: "1",
    });
    const parent = graphCanvas.parentElement;
    if (parent) {
      if (getComputedStyle(parent).position === "static") {
        parent.style.position = "relative";
      }
      parent.insertBefore(this.canvas, graphCanvas.nextSibling);
    }
    const context = this.canvas.getContext("2d");
    if (!context) {
      throw new Error("无法创建节点标签 Canvas 上下文");
    }
    this.context = context;
    this.data = null;
    this.labels = null;
    this.automaticLabels = false;
    this.labelOrder = null;
    this.autoOptimize = false;
    this.drawnMask = null;
    this.measuredLabels = [];
    this.placedRects = [];
    this.groupWorldBounds = [];
    this.cssWidth = 1;
    this.cssHeight = 1;
    this.pixelRatio = 1;
    this.labelFontSize = DEFAULT_LABEL_FONT_SIZE;
    this.labelFont = `${DEFAULT_LABEL_FONT_SIZE}px ${LABEL_FONT_FAMILY}`;
    this.labelHeight = Math.ceil(DEFAULT_LABEL_FONT_SIZE * 1.6);
    this.activeHighlightMask = null;
    this.activeSelectedId = null;
    this.focusNodeCircle = null;
    this.lastLabelMs = 0;
    this.lastLabelCount = 0;
  }

  /**
   * 装载标签文本和标签优先级。
   *
   * @param data - 当前图数据。
   * @returns 无返回值。
   */
  upload(data: GraphData): void {
    this.data = data;
    this.labels = data.nodeLabels;
    this.groupWorldBounds = this.#createGroupWorldBounds(data);
    this.automaticLabels = this.labels === null;
    this.drawnMask =
      this.labels ||
      this.automaticLabels ||
      this.groupWorldBounds.length > 0
        ? new Uint8Array(data.nodeCount)
        : null;
    this.measuredLabels = [];
    this.autoOptimize =
      this.labels !== null && data.nodeCount > AUTO_OPTIMIZE_NODE_COUNT;
    this.labelOrder = this.labels
      ? this.autoOptimize
        ? this.#createLabelOrder(data.nodeWeights)
        : this.#createNaturalOrder(data.nodeCount)
      : null;
    this.canvas.hidden =
      !this.labels && this.groupWorldBounds.length === 0;
    if (!this.labels && this.groupWorldBounds.length === 0) {
      this.context.clearRect(0, 0, this.cssWidth, this.cssHeight);
    }
  }

  /**
   * 同步标签层 CSS 尺寸和 drawing buffer。
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
    this.cssWidth = Math.max(1, cssWidth);
    this.cssHeight = Math.max(1, cssHeight);
    this.pixelRatio = Math.min(2, Math.max(1, pixelRatio));
    const width = Math.max(1, Math.round(this.cssWidth * this.pixelRatio));
    const height = Math.max(1, Math.round(this.cssHeight * this.pixelRatio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    this.context.setTransform(
      this.pixelRatio,
      0,
      0,
      this.pixelRatio,
      0,
      0,
    );
  }

  /**
   * 绘制符合当前质量预算的节点标签。
   *
   * @param camera - 当前相机。
   * @param hoverId - 当前悬停节点。
   * @param selectedId - 当前选中节点。
   * @param options - 标签开关、质量、邻域和尺寸选项。
   * @returns 无返回值。
   */
  draw(
    camera: Camera2D,
    hoverId: number | null,
    selectedId: number | null,
    options: LabelRenderOptions = {},
  ): void {
    const startedAt = performance.now();
    const {
      enabled = true,
      showGroupBounds = true,
      performanceScale = 1,
    } = options;
    const {
      highlightMask = null,
      forceLabelIds = [],
      nodeScale = 1,
      minimumSize = 5,
      interactionActive = false,
      highlightRadiusScale = 1,
      fontSize = DEFAULT_LABEL_FONT_SIZE,
    } = options;
    const hasForcedLabels = forceLabelIds.length > 0;
    const hasGroupBounds =
      showGroupBounds && this.groupWorldBounds.length > 0;
    if (
      (!enabled && !hasForcedLabels) ||
      (performanceScale <= 0.04 && !hasForcedLabels)
    ) {
      if (!this.canvas.hidden) {
        this.context.clearRect(0, 0, this.cssWidth, this.cssHeight);
        this.canvas.hidden = true;
      }
      this.lastLabelMs = 0;
      this.lastLabelCount = 0;
      return;
    }

    if (!this.labels && !this.automaticLabels && !hasGroupBounds) {
      this.lastLabelMs = 0;
      this.lastLabelCount = 0;
      return;
    }
    if (!this.labels && !hasForcedLabels && !hasGroupBounds) {
      if (!this.canvas.hidden) {
        this.context.clearRect(0, 0, this.cssWidth, this.cssHeight);
        this.canvas.hidden = true;
      }
      this.lastLabelMs = 0;
      this.lastLabelCount = 0;
      return;
    }
    this.canvas.hidden = false;

    const context = this.context;
    context.clearRect(0, 0, this.cssWidth, this.cssHeight);
    if (!enabled) {
      this.lastLabelMs = performance.now() - startedAt;
      this.lastLabelCount = 0;
      return;
    }
    this.lastLabelCount = 0;

    const highlightActive = highlightMask !== null;
    this.activeHighlightMask = highlightMask;
    this.activeSelectedId = selectedId;
    this.focusNodeCircle = null;
    if (
      highlightActive &&
      this.data &&
      selectedId !== null &&
      selectedId !== undefined
    ) {
      const focusX =
        (this.data.nodePositions[selectedId * 2] - camera.centerX) *
          camera.scale +
        camera.viewportWidth * 0.5;
      const focusY =
        (this.data.nodePositions[selectedId * 2 + 1] -
          camera.centerY) *
          camera.scale +
        camera.viewportHeight * 0.5;
      this.focusNodeCircle = {
        x: focusX,
        y: focusY,
        radius: this.#getNodeExtent(
          selectedId,
          nodeScale,
          minimumSize,
          highlightRadiusScale,
        ),
      };
    }
    const fullPerformance = performanceScale >= 0.999;
    const optimizeLabels = this.autoOptimize || !fullPerformance;
    const labelCount =
      this.labels?.length ??
      (hasForcedLabels ? forceLabelIds.length : 0);
    const baseLabelLimit = this.autoOptimize
      ? interactionActive
        ? 48
        : this.cssWidth < 760
          ? 72
          : 140
      : labelCount;
    const maxLabels = Math.min(
      labelCount,
      performanceScale <= 0.04
        ? 0
        : fullPerformance
        ? this.autoOptimize
          ? baseLabelLimit
          : labelCount
        : Math.max(
            8,
            Math.round(baseLabelLimit * performanceScale),
          ),
    );
    const candidateLimit =
      !this.labelOrder || labelCount === 0
        ? 0
        : optimizeLabels
          ? labelCount <= 1_000
            ? labelCount
            : Math.min(labelCount, maxLabels * 36)
          : labelCount;

    this.drawnMask?.fill(0);
    this.placedRects.length = 0;
    const nextFontSize = Math.max(
      7,
      Math.min(18, Number(fontSize) || DEFAULT_LABEL_FONT_SIZE),
    );
    if (nextFontSize !== this.labelFontSize) {
      this.labelFontSize = nextFontSize;
      this.labelFont = `${nextFontSize}px ${LABEL_FONT_FAMILY}`;
      this.labelHeight = Math.ceil(nextFontSize * 1.6);
      this.measuredLabels = [];
    }
    context.font = this.labelFont;
    context.textBaseline = "middle";
    context.lineJoin = "round";
    if (this.data) {
      if (
        this.data.nodeCount <= GROUP_BOUNDARY_RECOMPUTE_LIMIT
      ) {
        this.groupWorldBounds = this.#createGroupWorldBounds(this.data);
      }
      if (showGroupBounds) {
        this.#drawGroupBounds(
          camera,
          highlightMask,
          nodeScale,
          minimumSize,
          highlightRadiusScale,
        );
      }
    }

    for (const nodeIndex of forceLabelIds) {
      if (
        nodeIndex === hoverId ||
        nodeIndex === selectedId ||
        this.drawnMask[nodeIndex] === 1
      ) {
        continue;
      }
      if (
        this.#drawLabel(
          nodeIndex,
          camera,
          nodeScale,
          minimumSize,
          highlightRadiusScale,
          0.96,
          1,
          false,
          true,
        )
      ) {
        this.drawnMask[nodeIndex] = 1;
        this.lastLabelCount += 1;
      }
    }

    for (
      let orderIndex = 0;
      this.labelOrder &&
      orderIndex < candidateLimit &&
      this.lastLabelCount < maxLabels;
      orderIndex += 1
    ) {
      const nodeIndex = this.labelOrder[orderIndex];
      if (
        nodeIndex === hoverId ||
        nodeIndex === selectedId ||
        this.drawnMask[nodeIndex] === 1
      ) {
        continue;
      }

      const isRelated = highlightMask?.[nodeIndex] === 1;
      if (
        this.#drawLabel(
          nodeIndex,
          camera,
          nodeScale,
          minimumSize,
          highlightRadiusScale,
          highlightActive && !isRelated ? 0.16 : 0.9,
          highlightActive && !isRelated ? 0.7 : 1,
          false,
          !optimizeLabels,
        )
      ) {
        this.drawnMask[nodeIndex] = 1;
        this.lastLabelCount += 1;
      }
    }

    for (const forcedId of [selectedId, hoverId]) {
      if (
        forcedId === null ||
        forcedId === undefined ||
        this.drawnMask[forcedId] === 1
      ) {
        continue;
      }
      if (
        this.#drawLabel(
          forcedId,
          camera,
          nodeScale,
          minimumSize,
          highlightRadiusScale,
          1,
          1.08,
          true,
          true,
        )
      ) {
        this.drawnMask[forcedId] = 1;
        this.lastLabelCount += 1;
      }
    }

    this.lastLabelMs = performance.now() - startedAt;
  }

  /**
   * 根据节点世界坐标建立每个分组的包围范围。
   *
   * @param data - 当前图数据。
   * @returns 仅包含实际拥有节点的分组。
   */
  #createGroupWorldBounds(data: GraphData): GroupWorldBounds[] {
    const groups = Array.from(
      { length: data.clusterCount },
      (_, groupIndex): GroupWorldBounds => ({
        groupIndex,
        label: data.groupLabels?.[groupIndex] ?? `分组 ${groupIndex + 1}`,
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity,
        nodeCount: 0,
      }),
    );

    for (let nodeIndex = 0; nodeIndex < data.nodeCount; nodeIndex += 1) {
      const group = data.nodeGroups[nodeIndex];
      const bounds = groups[group];
      if (!bounds) continue;
      const x = data.nodePositions[nodeIndex * 2];
      const y = data.nodePositions[nodeIndex * 2 + 1];
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
      bounds.nodeCount += 1;
    }

    return groups.filter((group) => group.nodeCount > 0);
  }

  /**
   * 绘制分组包围气泡和组名。
   *
   * @param camera - 当前相机。
   * @param highlightMask - 当前节点邻域标记。
   * @param nodeScale - 节点尺寸倍数。
   * @param minimumSize - 节点最小屏幕尺寸。
   * @param highlightRadiusScale - 选中邻域放大倍率。
   * @returns 无返回值。
   */
  #drawGroupBounds(
    camera: Camera2D,
    highlightMask: Uint8Array | null,
    nodeScale: number,
    minimumSize: number,
    highlightRadiusScale: number,
  ): void {
    const data = this.data;
    if (!data || this.groupWorldBounds.length === 0) return;
    const context = this.context;
    const relatedGroups = new Set<number>();
    if (highlightMask) {
      for (let nodeIndex = 0; nodeIndex < data.nodeCount; nodeIndex += 1) {
        if (highlightMask[nodeIndex] === 1) {
          relatedGroups.add(data.nodeGroups[nodeIndex]);
        }
      }
    }
    const groupNodeExtents = new Float32Array(data.clusterCount);
    if (data.nodeCount <= GROUP_BOUNDARY_RECOMPUTE_LIMIT) {
      for (let nodeIndex = 0; nodeIndex < data.nodeCount; nodeIndex += 1) {
        const groupIndex = data.nodeGroups[nodeIndex];
        groupNodeExtents[groupIndex] = Math.max(
          groupNodeExtents[groupIndex],
          this.#getNodeExtent(
            nodeIndex,
            nodeScale,
            minimumSize,
            highlightRadiusScale,
          ),
        );
      }
    } else {
      groupNodeExtents.fill(
        Math.max(minimumSize, 8) + GROUP_BOUNDARY_PADDING,
      );
    }

    const orderedGroups = this.groupWorldBounds
      .slice()
      .sort((left, right) => right.nodeCount - left.nodeCount);
    const boundaryPadding = Math.min(
      GROUP_BOUNDARY_PADDING,
      Math.max(4, camera.scale * 90),
    );

    context.save();
    context.font = `600 ${GROUP_LABEL_FONT_SIZE}px ${LABEL_FONT_FAMILY}`;
    context.textBaseline = "middle";
    context.lineJoin = "round";

    for (const group of orderedGroups) {
      const left =
        (group.minX - camera.centerX) * camera.scale +
        camera.viewportWidth * 0.5;
      const right =
        (group.maxX - camera.centerX) * camera.scale +
        camera.viewportWidth * 0.5;
      const top =
        (group.minY - camera.centerY) * camera.scale +
        camera.viewportHeight * 0.5;
      const bottom =
        (group.maxY - camera.centerY) * camera.scale +
        camera.viewportHeight * 0.5;
      const centerX = (left + right) * 0.5;
      const centerY = (top + bottom) * 0.5;
      const nodeExtent = groupNodeExtents[group.groupIndex] ?? 0;
      const radiusX = Math.max(
        2,
        (right - left) * 0.5 + nodeExtent + boundaryPadding,
      );
      const radiusY = Math.max(
        2,
        (bottom - top) * 0.5 + nodeExtent + boundaryPadding,
      );

      if (
        centerX + radiusX < 0 ||
        centerX - radiusX > this.cssWidth ||
        centerY + radiusY < 0 ||
        centerY - radiusY > this.cssHeight
      ) {
        continue;
      }

      const highlighted =
        relatedGroups.size === 0 || relatedGroups.has(group.groupIndex);
      const hue = (group.groupIndex * 137.508) % 360;
      context.globalAlpha = highlighted ? 0.82 : 0.16;
      context.fillStyle = `hsla(${hue}, 78%, 55%, 0.055)`;
      context.strokeStyle = `hsla(${hue}, 82%, 68%, 0.62)`;
      context.lineWidth = highlighted ? 1.5 : 1;
      context.beginPath();
      context.ellipse(
        centerX,
        centerY,
        radiusX,
        radiusY,
        0,
        0,
        Math.PI * 2,
      );
      context.fill();
      context.stroke();

      let label = group.label;
      const maxWidth = Math.min(220, Math.max(90, radiusX * 1.55));
      let labelWidth = context.measureText(label).width;
      while (label.length > 2 && labelWidth > maxWidth) {
        label = `${label.slice(0, -2)}…`;
        labelWidth = context.measureText(label).width;
      }
      const labelHeight = 18;
      const labelLeft = Math.max(
        6,
        Math.min(this.cssWidth - labelWidth - 14, centerX - labelWidth * 0.5 - 5),
      );
      const preferredTop = centerY - radiusY - labelHeight - 3;
      const labelTop = Math.max(
        6,
        Math.min(
          this.cssHeight - labelHeight - 6,
          preferredTop < 6 ? centerY - radiusY + 5 : preferredTop,
        ),
      );
      const rect: LabelRect = {
        left: labelLeft,
        top: labelTop,
        right: labelLeft + labelWidth + 10,
        bottom: labelTop + labelHeight,
      };
      this.placedRects.push(rect);
      context.globalAlpha = highlighted ? 1 : 0.28;
      context.fillStyle = `hsla(${hue}, 52%, 15%, 0.94)`;
      context.strokeStyle = `hsla(${hue}, 82%, 72%, 0.78)`;
      context.beginPath();
      context.roundRect(
        rect.left,
        rect.top,
        rect.right - rect.left,
        labelHeight,
        9,
      );
      context.fill();
      context.stroke();
      context.fillStyle = "rgba(232, 248, 255, 0.96)";
      context.fillText(
        label,
        rect.left + 5,
        labelTop + labelHeight * 0.53,
      );
    }

    context.restore();
  }

  /**
   * 移除标签 Canvas 并清理引用。
   *
   * @returns 无返回值。
   */
  dispose(): void {
    this.canvas.remove();
    this.data = null;
    this.labels = null;
    this.labelOrder = null;
    this.measuredLabels = [];
  }

  /**
   * 绘制单个节点标签。
   *
   * @param nodeIndex - 节点索引。
   * @param camera - 当前相机。
   * @param nodeScale - 节点尺寸倍数。
   * @param minimumSize - 节点最小尺寸。
   * @param highlightRadiusScale - 图片邻域覆盖层缩放倍率。
   * @param opacity - 标签透明度。
   * @param textScale - 文本尺寸档位。
   * @param useFullLabel - 是否强制完整标签。
   * @param showAll - 是否忽略碰撞过滤。
   * @returns 是否成功绘制。
   */
  #drawLabel(
    nodeIndex: number,
    camera: Camera2D,
    nodeScale: number,
    minimumSize: number,
    highlightRadiusScale: number,
    opacity: number,
    textScale: number,
    useFullLabel: boolean = false,
    showAll: boolean = false,
  ): boolean {
    const data = this.data;
    const screenX =
      (data.nodePositions[nodeIndex * 2] - camera.centerX) *
        camera.scale +
      camera.viewportWidth * 0.5;
    const screenY =
      (data.nodePositions[nodeIndex * 2 + 1] - camera.centerY) *
        camera.scale +
      camera.viewportHeight * 0.5;

    if (
      screenX < -80 ||
      screenX > this.cssWidth + 80 ||
      screenY < 24 ||
      screenY > this.cssHeight - 24
    ) {
      return false;
    }

    const nodeSize = this.#getNodeExtent(
      nodeIndex,
      nodeScale,
      minimumSize,
      highlightRadiusScale,
    );
    const measured = this.#measureLabel(
      nodeIndex,
      textScale,
      useFullLabel,
    );
    const candidates = this.#createLabelCandidates(
      screenX,
      screenY,
      nodeSize,
      measured.width,
    );
    let rect = null;
    for (const candidate of candidates) {
      if (
        !this.#overlapsFocus(candidate, nodeIndex) &&
        (showAll || useFullLabel || !this.#collides(candidate))
      ) {
        rect = candidate;
        break;
      }
    }

    if (!rect && !useFullLabel && !showAll) {
      return false;
    }
    if (!rect) {
      rect =
        candidates.find(
          (candidate) => !this.#overlapsFocus(candidate, nodeIndex),
        ) ?? candidates[0];
    }
    if (!useFullLabel && !showAll) {
      this.placedRects.push(rect);
    }

    const context = this.context;
    context.globalAlpha = opacity;
    context.fillStyle = "rgba(255, 255, 255, 0.9)";
    context.beginPath();
    context.roundRect(
      rect.left - 4,
      rect.top,
      measured.width + 8,
      this.labelHeight,
      5,
    );
    context.fill();
    context.strokeStyle = "rgba(42, 60, 70, 0.18)";
    context.lineWidth = 1;
    context.stroke();
    context.fillStyle = "#27343d";
    context.fillText(
      measured.text,
      rect.left,
      rect.top + this.labelHeight * 0.54,
    );
    context.globalAlpha = 1;
    return true;
  }

  /**
   * 计算高亮节点在标签定位时使用的实际屏幕半径。
   *
   * @param nodeIndex - 节点索引。
   * @param nodeScale - 节点尺寸倍数。
   * @param minimumSize - 普通节点最小屏幕尺寸。
   * @param highlightRadiusScale - 图片邻域覆盖层缩放倍率。
   * @returns 节点当前绘制半径。
   */
  #getNodeExtent(
    nodeIndex: number,
    nodeScale: number,
    minimumSize: number,
    highlightRadiusScale: number,
  ): number {
    const data = this.data;
    const weight = data.nodeWeights[nodeIndex] ?? 0;
    let extent = Math.max(
      minimumSize,
      data.nodeSizes[nodeIndex] *
        nodeScale *
        (0.66 + weight * 1.89),
    );
    if (this.activeHighlightMask?.[nodeIndex] !== 1) {
      return extent;
    }

    const isFocus = nodeIndex === this.activeSelectedId;
    extent = Math.max(
      getHighlightNodeRadius(weight, isFocus, highlightRadiusScale),
      extent * (isFocus ? 1.9 : 1.45),
      isFocus ? 12 : 9,
    );
    return isFocus ? extent + 4.5 : extent;
  }

  /**
   * 判断标签是否会覆盖当前焦点图标。
   *
   * @param rect - 候选标签矩形。
   * @param nodeIndex - 候选标签对应的节点。
   * @returns 是否与焦点图标相交。
   */
  #overlapsFocus(rect: LabelRect, nodeIndex: number): boolean {
    const focus = this.focusNodeCircle;
    if (
      !focus ||
      nodeIndex === this.activeSelectedId
    ) {
      return false;
    }

    const nearestX = Math.max(
      rect.left,
      Math.min(focus.x, rect.right),
    );
    const nearestY = Math.max(
      rect.top,
      Math.min(focus.y, rect.bottom),
    );
    const deltaX = nearestX - focus.x;
    const deltaY = nearestY - focus.y;
    return deltaX * deltaX + deltaY * deltaY < focus.radius * focus.radius;
  }

  /**
   * 测量并缓存标签文本。
   *
   * @param nodeIndex - 节点索引。
   * @param textScale - 文本尺寸档位。
   * @param useFullLabel - 是否使用完整标签。
   * @returns 测量结果。
   */
  #measureLabel(
    nodeIndex: number,
    textScale: number,
    useFullLabel: boolean,
  ): MeasuredLabel {
    const cached = this.measuredLabels[nodeIndex];
    if (
      cached &&
      cached.textScale === textScale &&
      cached.useFullLabel === useFullLabel
    ) {
      return cached;
    }

    const fullLabel =
      this.labels?.[nodeIndex] ?? this.#createFallbackLabel(nodeIndex);
    const label = useFullLabel
      ? fullLabel
      : this.#createShortLabel(fullLabel);
    const maxWidth = useFullLabel
      ? Math.round(this.labelFontSize * 26)
      : Math.round(this.labelFontSize * 14);
    let text = label;
    let width = this.context.measureText(text).width;

    if (width > maxWidth) {
      let end = text.length;
      while (end > 4 && width > maxWidth - 12) {
        end -= 1;
        text = `${label.slice(0, end)}…`;
        width = this.context.measureText(text).width;
      }
    }

    const measured = {
      text,
      textScale,
      useFullLabel,
      width: Math.ceil(width),
    };
    this.measuredLabels[nodeIndex] = measured;
    return measured;
  }

  /**
   * 检查标签矩形是否与已绘制标签碰撞。
   *
   * @param rect - 待检查矩形。
   * @returns 是否发生碰撞。
   */
  #collides(rect: LabelRect): boolean {
    for (const placed of this.placedRects) {
      if (
        rect.left < placed.right + COLLISION_PADDING &&
        rect.right + COLLISION_PADDING > placed.left &&
        rect.top < placed.bottom + COLLISION_PADDING &&
        rect.bottom + COLLISION_PADDING > placed.top
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * 生成节点周围的标签候选位置。
   *
   * @param screenX - 节点屏幕 X。
   * @param screenY - 节点屏幕 Y。
   * @param nodeSize - 节点屏幕尺寸。
   * @param width - 标签宽度。
   * @returns 按优先级排列的候选矩形。
   */
  #createLabelCandidates(
    screenX: number,
    screenY: number,
    nodeSize: number,
    width: number,
  ): LabelRect[] {
    const right = screenX + nodeSize + LABEL_GAP;
    const left = screenX - nodeSize - LABEL_GAP - width;
    const centeredLeft = screenX - width * 0.5;
    const centerTop = screenY - this.labelHeight * 0.5;
    const top = screenY - nodeSize - this.labelHeight - 2;
    const bottom = screenY + nodeSize + 2;
    const positions = [
      [right, centerTop],
      [left, centerTop],
      [centeredLeft, top],
      [centeredLeft, bottom],
      [right, top],
      [right, bottom],
      [left, top],
      [left, bottom],
    ];
    const candidates = [];

    for (const [leftPosition, topPosition] of positions) {
      const left = Math.max(
        8,
        Math.min(this.cssWidth - width - 8, leftPosition),
      );
      const top = Math.max(
        8,
        Math.min(this.cssHeight - this.labelHeight - 8, topPosition),
      );
      candidates.push({
        left,
        top,
        right: left + width,
        bottom: top + this.labelHeight,
      });
    }

    return candidates;
  }

  /**
   * 去掉包版本并缩短作用域包前缀。
   *
   * @param label - 原始包标签。
   * @returns 短标签文本。
   */
  #createShortLabel(label: string): string {
    const versionIndex = label.lastIndexOf("@");
    const packageName =
      versionIndex > 0 ? label.slice(0, versionIndex) : label;

    if (packageName.startsWith("@rollup/")) {
      return packageName.slice("@rollup/".length);
    }
    if (packageName.startsWith("@esbuild/")) {
      return packageName.slice("@esbuild/".length);
    }
    return packageName;
  }

  /**
   * 为没有业务标签的大图节点生成按需回退标签。
   *
   * @param nodeIndex - 节点索引。
   * @returns 可显示的节点标签文本。
   */
  #createFallbackLabel(nodeIndex: number): string {
    return `N${nodeIndex + 1}`;
  }

  /**
   * 按权重从高到低建立标签绘制顺序。
   *
   * @param weights - 归一化节点权重。
   * @returns 节点索引绘制顺序。
   */
  #createLabelOrder(weights: Float32Array): Uint32Array {
    const nodeCount = weights.length;
    const order = new Uint32Array(nodeCount);
    const bucketByNode = new Uint8Array(nodeCount);
    const bucketCounts = new Uint32Array(256);

    for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex += 1) {
      const bucket = Math.min(
        255,
        Math.max(0, Math.round(weights[nodeIndex] * 255)),
      );
      bucketByNode[nodeIndex] = bucket;
      bucketCounts[bucket] += 1;
    }

    const bucketOffsets = new Uint32Array(256);
    let offset = 0;
    for (let bucket = 255; bucket >= 0; bucket -= 1) {
      bucketOffsets[bucket] = offset;
      offset += bucketCounts[bucket];
    }

    const bucketCursors = bucketOffsets.slice();
    for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex += 1) {
      const bucket = bucketByNode[nodeIndex];
      order[bucketCursors[bucket]] = nodeIndex;
      bucketCursors[bucket] += 1;
    }
    return order;
  }

  /**
   * 创建自然节点顺序。
   *
   * @param nodeCount - 节点数量。
   * @returns 0～N-1 的节点索引。
   */
  #createNaturalOrder(nodeCount: number): Uint32Array {
    const order = new Uint32Array(nodeCount);
    for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex += 1) {
      order[nodeIndex] = nodeIndex;
    }
    return order;
  }
}
