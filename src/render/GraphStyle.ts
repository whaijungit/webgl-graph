import { parseColor } from "../graph/Color.js";
import type {
  ColorInput,
  EdgeStyleName,
  GraphStyleOptions,
  NodeShapeName,
  NormalizedColor,
  RenderStyle,
} from "../lib/types.js";

/** 节点形状名称到 shader ID 的映射。 */
export const NODE_SHAPE_IDS: Readonly<Record<NodeShapeName, number>> =
  Object.freeze({
    circle: 0,
    square: 1,
    diamond: 2,
    triangle: 3,
    hexagon: 4,
    star: 5,
    mixed: 6,
    image: 7,
  });

/** 边样式名称到 shader ID 的映射。 */
export const EDGE_STYLE_IDS: Readonly<Record<EdgeStyleName, number>> =
  Object.freeze({
    straight: 0,
    curve: 1,
    dashed: 2,
  });

/**
 * 与数据无关的图样式。
 *
 * 颜色支持十六进制、十进制整数和数组形式；Renderer 只读取规范化值。
 */
export class GraphStyle {
  /** 规范化 Canvas 清屏颜色。 */
  backgroundColor: NormalizedColor;
  /** 节点形状名称。 */
  nodeShape: NodeShapeName;
  /** 边线样式名称。 */
  edgeStyle: EdgeStyleName;
  /** 规范化强调色。 */
  highlightColor: NormalizedColor;
  /** 非关联节点透明度倍数。 */
  dimOpacity: number;
  /** 非关联边透明度倍数。 */
  edgeDimOpacity: number;
  /** 节点尺寸倍数。 */
  nodeScale: number;
  /** 权重差异强度。 */
  weightStrength: number;
  /** 标签总开关。 */
  showLabels: boolean;
  /** 标签字号。 */
  labelFontSize: number;
  /** 边线宽度倍数。 */
  edgeWidthScale: number;
  /** 边线显示开关。 */
  showEdges: boolean;

  /**
   * 创建样式对象。
   *
   * @param initial - 初始样式；颜色支持字符串、整数和数组。
   */
  constructor(initial: GraphStyleOptions = {}) {
    this.backgroundColor = [0.012, 0.03, 0.047, 1];
    this.nodeShape = "image";
    this.edgeStyle = "straight";
    this.highlightColor = [0.42, 0.95, 1, 0.95];
    this.dimOpacity = 0.1;
    this.edgeDimOpacity = 0.035;
    this.nodeScale = 1;
    this.weightStrength = 1;
    this.showLabels = true;
    this.labelFontSize = 10;
    this.edgeWidthScale = 1;
    this.showEdges = true;
    this.set(initial);
  }

  /**
   * 合并样式配置。
   *
   * @param patch - 需要更新的样式字段。
   * @returns 当前样式对象。
   */
  set(patch: GraphStyleOptions = {}): this {
    if (patch.backgroundColor !== undefined) {
      this.backgroundColor = parseColor(patch.backgroundColor);
    }
    if (patch.highlightColor !== undefined) {
      this.highlightColor = parseColor(patch.highlightColor);
    }
    if (patch.nodeShape && patch.nodeShape in NODE_SHAPE_IDS) {
      this.nodeShape = patch.nodeShape;
    }
    if (patch.edgeStyle && patch.edgeStyle in EDGE_STYLE_IDS) {
      this.edgeStyle = patch.edgeStyle;
    }
    if (Number.isFinite(patch.dimOpacity)) {
      this.dimOpacity = this.#clamp(patch.dimOpacity as number, 0, 1);
    }
    if (Number.isFinite(patch.edgeDimOpacity)) {
      this.edgeDimOpacity = this.#clamp(
        patch.edgeDimOpacity as number,
        0,
        1,
      );
    }
    if (Number.isFinite(patch.nodeScale)) {
      this.nodeScale = this.#clamp(patch.nodeScale as number, 0.2, 3);
    }
    if (Number.isFinite(patch.weightStrength)) {
      this.weightStrength = this.#clamp(
        patch.weightStrength as number,
        0,
        2,
      );
    }
    if (typeof patch.showLabels === "boolean") {
      this.showLabels = patch.showLabels;
    }
    if (Number.isFinite(patch.labelFontSize)) {
      this.labelFontSize = this.#clamp(
        patch.labelFontSize as number,
        7,
        18,
      );
    }
    if (Number.isFinite(patch.edgeWidthScale)) {
      this.edgeWidthScale = this.#clamp(
        patch.edgeWidthScale as number,
        0.4,
        3,
      );
    }
    if (typeof patch.showEdges === "boolean") {
      this.showEdges = patch.showEdges;
    }
    return this;
  }

  /**
   * 转换为渲染器使用的数值样式。
   *
   * @returns 规范化样式对象。
   */
  toRenderOptions(): RenderStyle {
    return {
      backgroundColor: this.backgroundColor,
      nodeShape: NODE_SHAPE_IDS[this.nodeShape],
      edgeStyle: EDGE_STYLE_IDS[this.edgeStyle],
      highlightColor: this.highlightColor,
      dimOpacity: this.dimOpacity,
      edgeDimOpacity: this.edgeDimOpacity,
      nodeScale: this.nodeScale,
      weightStrength: this.weightStrength,
      showLabels: this.showLabels,
      labelFontSize: this.labelFontSize,
      edgeWidthScale: this.edgeWidthScale,
      showEdges: this.showEdges,
    };
  }

  /**
   * 将数值限制到指定范围。
   *
   * @param value - 输入数值。
   * @param min - 最小值。
   * @param max - 最大值。
   * @returns 限制后的数值。
   */
  #clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
