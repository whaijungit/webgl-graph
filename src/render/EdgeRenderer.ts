import { ShaderProgram } from "./ShaderProgram.js";

import type { GraphData } from "../graph/GraphData.js";
import type { NodeAdjacencyIndex } from "../graph/NodeAdjacencyIndex.js";
import type { Camera2D } from "./Camera2D.js";

/** 单帧边渲染选项。 */
interface EdgeRenderOptions {
  /** shader 边样式 ID。 */
  edgeStyle?: number;
  /** 是否启用焦点邻域高亮。 */
  highlightActive?: boolean;
  /** 非关联边透明度倍数。 */
  dimOpacity?: number;
  /** 线宽倍数。 */
  widthScale?: number;
  /** 是否绘制方向箭头。 */
  showArrows?: boolean;
  /** 节点屏幕尺寸倍数。 */
  nodeScale?: number;
  /** 节点最小屏幕尺寸。 */
  minimumSize?: number;
  /** 权重对节点尺寸的影响强度。 */
  weightStrength?: number;
  /** 当前节点形状 shader ID。 */
  nodeShape?: number;
  /** 当前是否使用 Point Sprite 节点路径。 */
  pointRendering?: boolean;
  /** 图片选中邻域覆盖层的平滑缩放倍率。 */
  highlightRadiusScale?: number;
}

const EDGE_VERTEX_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aCorner;
layout(location = 1) in vec2 aStart;
layout(location = 2) in vec2 aEnd;
layout(location = 3) in float aWidth;
layout(location = 4) in vec4 aColor;
layout(location = 5) in uint aSource;
layout(location = 6) in uint aTarget;
layout(location = 7) in uint aVisible;
layout(location = 8) in vec4 aEndpointMetrics;

uniform vec2 uViewport;
uniform vec2 uCenter;
uniform float uScale;
uniform uint uFocusId;
uniform uint uEdgeStyle;
uniform uint uHighlightActive;
uniform float uDimOpacity;
uniform float uWidthScale;
uniform float uNodeScale;
uniform float uMinimumSize;
uniform float uWeightStrength;
uniform float uHighlightRadiusScale;
uniform uint uNodeShape;
uniform uint uPointRendering;

out vec4 vColor;
out float vDashCoord;
out float vSide;
out float vGeometryWidth;
flat out float vCoreWidth;
flat out uint vStyle;
flat out uint vSolid;
flat out uint vArrow;

float endpointRadius(
  float baseSize,
  float weight,
  bool isFocus,
  bool isRelated,
  uint nodeId,
  vec2 direction
) {
  float safeWeight = clamp(weight, 0.0, 1.0);
  float weightScale = mix(
    1.0 - uWeightStrength * 0.34,
    1.0 + uWeightStrength * 1.55,
    safeWeight
  );
  float size = max(
    max(1.1, baseSize * uNodeScale * weightScale),
    uMinimumSize
  );

  if (uNodeShape == 7u && uPointRendering == 0u && isRelated) {
    // 图片选中邻域只由 HighlightOverlayRenderer 绘制，需使用同一个缩放倍率。
    size =
      (isFocus
        ? 24.0 + safeWeight * 8.0
        : 15.0 + safeWeight * 6.0) *
      uHighlightRadiusScale;
  } else if (uPointRendering == 1u) {
    if (isFocus) {
      size += 3.0;
    }
    float weightPointSize = mix(
      uMinimumSize,
      uMinimumSize * 3.0,
      clamp(pow(safeWeight, 0.7) * uWeightStrength, 0.0, 1.0)
    );
    size = max(size, weightPointSize);
    if (isFocus) {
      size = max(size * 1.5, 32.0);
    }
    if (isRelated) {
      size = max(
        size * (isFocus ? 1.2 : 1.45),
        isFocus ? 40.0 : 24.0
      );
    }
  } else if (isRelated) {
    size = max(size * (isFocus ? 1.9 : 1.45), isFocus ? 12.0 : 9.0);
    if (isFocus) {
      size += 4.5;
    }
  }

  uint shape = uNodeShape == 6u ? nodeId % 6u : uNodeShape;
  vec2 absoluteDirection = abs(direction);
  float maxAxis = max(max(absoluteDirection.x, absoluteDirection.y), 0.0001);
  float boundaryScale;
  if (shape == 1u) {
    boundaryScale = 0.72 / maxAxis;
  } else if (shape == 2u) {
    boundaryScale =
      0.9 / max(absoluteDirection.x + absoluteDirection.y, 0.0001);
  } else if (shape == 7u) {
    // 图标是带圆角和内边距的圆角方块，使用内切轮廓避免斜向留下空隙。
    boundaryScale = 0.93;
  } else if (shape == 3u) {
    boundaryScale = 1.0;
  } else if (shape == 4u) {
    boundaryScale = 0.9;
  } else if (shape == 5u) {
    boundaryScale = 0.95;
  } else {
    boundaryScale = 0.82;
  }
  return max(0.0, size * boundaryScale);
}

void main() {
  bool isFocused = aSource == uFocusId || aTarget == uFocusId;
  bool isVisible = aVisible > 0u || isFocused;

  if (!isVisible) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    vColor = vec4(0.0);
    vDashCoord = 0.0;
    vSide = 0.0;
    vGeometryWidth = 1.0;
    vCoreWidth = 1.0;
    vStyle = uEdgeStyle;
    vSolid = 0u;
    vArrow = aCorner.z > 0.5 ? 1u : 0u;
    return;
  }

  float coreWidth = max(aWidth, 1.4) * uWidthScale;
  if (isFocused) {
    coreWidth = max(coreWidth + 0.8, 2.2);
  }
  float geometryWidth = coreWidth + 2.0;

  vec2 rawA = (aStart - uCenter) * uScale + uViewport * 0.5;
  vec2 rawB = (aEnd - uCenter) * uScale + uViewport * 0.5;
  vec2 rawDirection = rawB - rawA;
  float rawLength = max(length(rawDirection), 0.0001);
  vec2 rawUnit = rawDirection / rawLength;
  bool edgeFocused =
    uFocusId != 0xffffffffu &&
    (aSource == uFocusId || aTarget == uFocusId);
  float sourceRadius = endpointRadius(
    aEndpointMetrics.x,
    aEndpointMetrics.z,
    aSource == uFocusId,
    edgeFocused,
    aSource,
    rawUnit
  );
  float targetRadius = endpointRadius(
    aEndpointMetrics.y,
    aEndpointMetrics.w,
    aTarget == uFocusId,
    edgeFocused,
    aTarget,
    rawUnit
  );
  vec2 screenA =
    rawA + rawUnit * min(sourceRadius, rawLength * 0.42);
  vec2 screenB =
    rawB - rawUnit * min(targetRadius, rawLength * 0.42);
  vec2 direction = screenB - screenA;
  float chordLength = max(length(direction), 0.0001);
  float approximateLength = chordLength;
  vec2 control = vec2(0.0);

  if (uEdgeStyle == 1u) {
    vec2 chordNormal = vec2(-direction.y, direction.x) / chordLength;
    control =
      (screenA + screenB) * 0.5 +
      chordNormal * clamp(chordLength * 0.2, 4.0, 72.0);
    approximateLength =
      length(control - screenA) + length(screenB - control);
  }

  bool isArrow = aCorner.z > 0.5;
  float t;
  if (isArrow) {
    float safeLength = max(approximateLength, 1.0);
    float headLength = clamp(coreWidth * 3.0 + 8.0, 12.0, 26.0);
    float headT = min(headLength / safeLength, 0.42);
    t = aCorner.x < 2.5 ? 1.0 : 1.0 - headT;
  } else {
    t = (aCorner.x + 1.0) * 0.5;
  }

  vec2 lineCenter;
  vec2 tangent;
  if (uEdgeStyle == 1u) {
    float inverseT = 1.0 - t;
    lineCenter =
      inverseT * inverseT * screenA +
      2.0 * inverseT * t * control +
      t * t * screenB;
    tangent =
      2.0 * inverseT * (control - screenA) +
      2.0 * t * (screenB - control);
  } else {
    lineCenter = mix(screenA, screenB, t);
    tangent = direction;
  }

  float tangentLength = max(length(tangent), 0.0001);
  vec2 normal = vec2(-tangent.y, tangent.x) / tangentLength;
  vec2 screenPosition =
    lineCenter + normal * aCorner.y * geometryWidth * 0.5;
  vec2 clipPosition = screenPosition / uViewport * 2.0 - 1.0;

  gl_Position = vec4(clipPosition.x, -clipPosition.y, 0.0, 1.0);
  vColor = aColor;
  if (isFocused) {
    vColor.a = max(vColor.a, 0.92);
  }
  if (uHighlightActive == 1u && !isFocused) {
    vColor.a *= uDimOpacity;
  }
  vDashCoord = t * approximateLength;
  vSide = aCorner.y;
  vGeometryWidth = geometryWidth;
  vCoreWidth = coreWidth;
  vStyle = uEdgeStyle;
  vSolid = isFocused ? 1u : 0u;
  vArrow = isArrow ? 1u : 0u;
}
`;

const EDGE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec4 vColor;
in float vDashCoord;
in float vSide;
in float vGeometryWidth;
flat in float vCoreWidth;
flat in uint vStyle;
flat in uint vSolid;
flat in uint vArrow;
out vec4 outColor;

void main() {
  if (vArrow != 0u) {
    outColor = vColor;
    return;
  }

  float distanceFromCenter =
    abs(vSide) * vGeometryWidth * 0.5;
  float halfCoreWidth = vCoreWidth * 0.5;
  float coverage =
    1.0 - smoothstep(
      halfCoreWidth - 0.65,
      halfCoreWidth + 0.65,
      distanceFromCenter
    );

  if (coverage <= 0.002) {
    discard;
  }

  float dashMask = 1.0;
  if (vStyle == 2u && vSolid == 0u) {
    dashMask = step(fract(vDashCoord / 14.0), 0.62);
  }

  outColor = vec4(
    vColor.rgb,
    vColor.a * coverage * dashMask
  );
}
`;

/**
 * 使用实例化四边形绘制直线、曲线和虚线边。
 */
export class EdgeRenderer {
  /** WebGL2 上下文。 */
  readonly gl: WebGL2RenderingContext;
  /** 边着色器程序。 */
  readonly program: ShaderProgram;
  /** 边长条 VAO。 */
  private vao: WebGLVertexArrayObject | null;
  /** 边长条几何顶点缓冲。 */
  private quadBuffer: WebGLBuffer | null;
  /** 需要统一释放的实例缓冲。 */
  private instanceBuffers: WebGLBuffer[];
  /** 当前边数量。 */
  edgeCount: number;
  /** 当前压缩缓冲中的可见边数量。 */
  private activeEdgeCount: number;
  /** 当前单实例线段顶点数量。 */
  private vertexCount: number;
  /** 当前单实例箭头顶点数量。 */
  private arrowVertexCount: number;
  /** 当前几何是否为曲线细分。 */
  private isCurvedGeometry: boolean | null;
  /** 边可见性缓冲。 */
  private visibilityBuffer: WebGLBuffer | null;
  /** 边端点位置缓冲。 */
  private positionBuffer: WebGLBuffer | null;
  /** 边宽实例缓冲。 */
  private widthBuffer: WebGLBuffer | null;
  /** 边颜色实例缓冲。 */
  private colorBuffer: WebGLBuffer | null;
  /** 边起点实例缓冲。 */
  private sourceBuffer: WebGLBuffer | null;
  /** 边终点实例缓冲。 */
  private targetBuffer: WebGLBuffer | null;
  /** 边起止节点屏幕半径实例缓冲。 */
  private endpointMetricsBuffer: WebGLBuffer | null;
  /** 全量边索引到压缩缓冲索引的映射。 */
  private compactIndexByEdge: Uint32Array | null;
  /** 全量边对应的压缩缓冲版本号。 */
  private compactGeneration: Uint32Array | null;
  /** 当前压缩缓冲版本号。 */
  private compactGenerationId: number;
  /** 边起点索引。 */
  private edgeSources: Uint32Array | null;
  /** 边终点索引。 */
  private edgeTargets: Uint32Array | null;

  /**
   * 创建边渲染器。
   *
   * @param gl - WebGL2 上下文。
   */
  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = new ShaderProgram(
      gl,
      EDGE_VERTEX_SHADER,
      EDGE_FRAGMENT_SHADER,
    );
    this.vao = null;
    this.quadBuffer = null;
    this.instanceBuffers = [];
    this.edgeCount = 0;
    this.activeEdgeCount = 0;
    this.vertexCount = 0;
    this.arrowVertexCount = 3;
    this.isCurvedGeometry = null;
    this.visibilityBuffer = null;
    this.positionBuffer = null;
    this.widthBuffer = null;
    this.colorBuffer = null;
    this.sourceBuffer = null;
    this.targetBuffer = null;
    this.endpointMetricsBuffer = null;
    this.compactIndexByEdge = null;
    this.compactGeneration = null;
    this.compactGenerationId = 0;
    this.edgeSources = null;
    this.edgeTargets = null;
    this.#createVertexArray();
  }

  /**
   * 上传边实例属性。
   *
   * @param graphData - 当前图数据。
   * @returns 无返回值。
   */
  upload(graphData: GraphData): void {
    const gl = this.gl;
    this.#deleteInstanceBuffers();
    gl.bindVertexArray(this.vao);
    this.positionBuffer = this.#createBuffer(new Float32Array(4));
    this.#configureInstanceBuffer(
      1,
      this.positionBuffer,
      2,
      gl.FLOAT,
      false,
      16,
      0,
    );
    this.#configureInstanceBuffer(
      2,
      this.positionBuffer,
      2,
      gl.FLOAT,
      false,
      16,
      8,
    );

    const widthBuffer = this.#createBuffer(new Float32Array(1));
    this.#configureInstanceBuffer(
      3,
      widthBuffer,
      1,
      gl.FLOAT,
      false,
      4,
      0,
    );
    const colorBuffer = this.#createBuffer(new Uint8Array(4));
    this.#configureInstanceBuffer(
      4,
      colorBuffer,
      4,
      gl.UNSIGNED_BYTE,
      true,
      4,
      0,
    );
    const sourceBuffer = this.#createIntegerInstanceBuffer(
      5,
      new Uint32Array(1),
    );
    const targetBuffer = this.#createIntegerInstanceBuffer(
      6,
      new Uint32Array(1),
    );
    this.visibilityBuffer = this.#createBuffer(
      new Uint8Array(1),
    );
    gl.enableVertexAttribArray(7);
    gl.vertexAttribIPointer(7, 1, gl.UNSIGNED_BYTE, 1, 0);
    gl.vertexAttribDivisor(7, 1);
    const endpointMetricsBuffer = this.#createBuffer(
      new Float32Array(4),
    );
    this.#configureInstanceBuffer(
      8,
      endpointMetricsBuffer,
      4,
      gl.FLOAT,
      false,
      16,
      0,
    );

    this.instanceBuffers.push(
      this.positionBuffer,
      widthBuffer,
      colorBuffer,
      sourceBuffer,
      targetBuffer,
      this.visibilityBuffer,
      endpointMetricsBuffer,
    );
    this.edgeCount = graphData.edgeCount;
    this.activeEdgeCount = 0;
    this.edgeSources = graphData.edgeSources;
    this.edgeTargets = graphData.edgeTargets;
    this.widthBuffer = widthBuffer;
    this.colorBuffer = colorBuffer;
    this.sourceBuffer = sourceBuffer;
    this.targetBuffer = targetBuffer;
    this.endpointMetricsBuffer = endpointMetricsBuffer;
    this.compactIndexByEdge = new Uint32Array(graphData.edgeCount);
    this.compactGeneration = new Uint32Array(graphData.edgeCount);
    this.compactGenerationId = 0;
    gl.bindVertexArray(null);
  }

  /**
   * 绘制全部可见边。
   *
   * @param camera - 当前相机。
   * @param focusId - 当前选中节点。
   * @param options - 边样式、透明度、线宽和高亮状态。
   * @returns 无返回值。
   */
  draw(
    camera: Camera2D,
    focusId: number | null,
    options: EdgeRenderOptions = {},
  ): void {
    if (!this.activeEdgeCount) {
      return;
    }

    const gl = this.gl;
    const program = this.program;
    const {
      edgeStyle = 0,
      highlightActive = false,
      dimOpacity = 0.035,
      widthScale = 1,
      showArrows = true,
      nodeScale = 1,
      minimumSize = 3,
      weightStrength = 1,
      nodeShape = 7,
      pointRendering = false,
      highlightRadiusScale = 1,
    } = options;

    this.#ensureGeometry(edgeStyle === 1);
    program.use();
    gl.uniform2f(
      program.uniform("uViewport"),
      camera.viewportWidth,
      camera.viewportHeight,
    );
    gl.uniform2f(program.uniform("uCenter"), camera.centerX, camera.centerY);
    gl.uniform1f(program.uniform("uScale"), camera.scale);
    gl.uniform1ui(program.uniform("uFocusId"), focusId ?? 0xffffffff);
    gl.uniform1ui(program.uniform("uEdgeStyle"), edgeStyle);
    gl.uniform1ui(
      program.uniform("uHighlightActive"),
      highlightActive ? 1 : 0,
    );
    gl.uniform1f(program.uniform("uDimOpacity"), dimOpacity);
    gl.uniform1f(program.uniform("uWidthScale"), widthScale);
    gl.uniform1f(program.uniform("uNodeScale"), nodeScale);
    gl.uniform1f(program.uniform("uMinimumSize"), minimumSize);
    gl.uniform1f(program.uniform("uWeightStrength"), weightStrength);
    gl.uniform1f(
      program.uniform("uHighlightRadiusScale"),
      highlightRadiusScale,
    );
    gl.uniform1ui(program.uniform("uNodeShape"), nodeShape);
    gl.uniform1ui(
      program.uniform("uPointRendering"),
      pointRendering ? 1 : 0,
    );

    gl.bindVertexArray(this.vao);
    const drawVertexCount =
      this.vertexCount + (showArrows ? this.arrowVertexCount : 0);
    gl.drawArraysInstanced(
      gl.TRIANGLES,
      0,
      drawVertexCount,
      this.activeEdgeCount,
    );
    gl.bindVertexArray(null);
  }

  /**
   * 局部更新被拖拽节点关联边的端点坐标。
   *
   * @param nodeId - 被拖拽节点索引。
   * @param x - 新世界坐标 X。
   * @param y - 新世界坐标 Y。
   * @param graphData - 当前图数据。
   * @param adjacencyIndex - 节点关联边 CSR 索引。
   * @returns 无返回值。
   */
  updateNodePosition(
    nodeId: number,
    x: number,
    y: number,
    graphData: GraphData,
    adjacencyIndex: NodeAdjacencyIndex,
  ): void {
    if (!this.positionBuffer) {
      return;
    }

    const [start, end] = adjacencyIndex.getIncidentEdgeRange(nodeId);
    const edgePositions = graphData.edgePositions;
    const gl = this.gl;
    const upload = new Float32Array(4);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);

    for (let index = start; index < end; index += 1) {
      const edgeIndex = adjacencyIndex.incidentEdges[index];
      const offset = edgeIndex * 4;
      const isSource = this.edgeSources![edgeIndex] === nodeId;
      edgePositions[offset + (isSource ? 0 : 2)] = x;
      edgePositions[offset + (isSource ? 1 : 3)] = y;
      upload[0] = edgePositions[offset];
      upload[1] = edgePositions[offset + 1];
      upload[2] = edgePositions[offset + 2];
      upload[3] = edgePositions[offset + 3];
      const compactIndex = this.#compactIndex(edgeIndex);
      if (compactIndex >= 0) {
        gl.bufferSubData(gl.ARRAY_BUFFER, compactIndex * 16, upload);
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  /**
   * 将抽样后的边压缩为紧凑实例缓冲，避免提交不可见边。
   *
   * @param edgeIds - 当前需要绘制的全量边索引。
   * @param graphData - 当前图数据。
   * @returns 无返回值。
   */
  updateVisibleEdges(
    edgeIds: readonly number[],
    graphData: GraphData,
  ): void {
    const positionBuffer = this.positionBuffer;
    const widthBuffer = this.widthBuffer;
    const colorBuffer = this.colorBuffer;
    const sourceBuffer = this.sourceBuffer;
    const targetBuffer = this.targetBuffer;
    const endpointMetricsBuffer = this.endpointMetricsBuffer;
    const visibilityBuffer = this.visibilityBuffer;
    const compactIndexByEdge = this.compactIndexByEdge;
    const compactGeneration = this.compactGeneration;
    if (
      !positionBuffer ||
      !widthBuffer ||
      !colorBuffer ||
      !sourceBuffer ||
      !targetBuffer ||
      !endpointMetricsBuffer ||
      !visibilityBuffer ||
      !compactIndexByEdge ||
      !compactGeneration
    ) {
      this.activeEdgeCount = 0;
      return;
    }

    const count = edgeIds.length;
    const positions = new Float32Array(count * 4);
    const widths = new Float32Array(count);
    const colors = new Uint8Array(count * 4);
    const sources = new Uint32Array(count);
    const targets = new Uint32Array(count);
    const endpointMetrics = new Float32Array(count * 4);
    const visibility = new Uint8Array(count);
    this.compactGenerationId += 1;
    if (this.compactGenerationId === 0xffffffff) {
      compactGeneration.fill(0);
      this.compactGenerationId = 1;
    }

    for (let compactIndex = 0; compactIndex < count; compactIndex += 1) {
      const edgeIndex = edgeIds[compactIndex];
      positions[compactIndex * 4] = graphData.edgePositions[edgeIndex * 4];
      positions[compactIndex * 4 + 1] =
        graphData.edgePositions[edgeIndex * 4 + 1];
      positions[compactIndex * 4 + 2] =
        graphData.edgePositions[edgeIndex * 4 + 2];
      positions[compactIndex * 4 + 3] =
        graphData.edgePositions[edgeIndex * 4 + 3];
      widths[compactIndex] = graphData.edgeWidths[edgeIndex];
      colors[compactIndex * 4] = graphData.edgeColors[edgeIndex * 4];
      colors[compactIndex * 4 + 1] =
        graphData.edgeColors[edgeIndex * 4 + 1];
      colors[compactIndex * 4 + 2] =
        graphData.edgeColors[edgeIndex * 4 + 2];
      colors[compactIndex * 4 + 3] =
        graphData.edgeColors[edgeIndex * 4 + 3];
      sources[compactIndex] = graphData.edgeSources[edgeIndex];
      targets[compactIndex] = graphData.edgeTargets[edgeIndex];
      const source = sources[compactIndex];
      const target = targets[compactIndex];
      endpointMetrics[compactIndex * 4] = graphData.nodeSizes[source];
      endpointMetrics[compactIndex * 4 + 1] = graphData.nodeSizes[target];
      endpointMetrics[compactIndex * 4 + 2] = graphData.nodeWeights[source];
      endpointMetrics[compactIndex * 4 + 3] = graphData.nodeWeights[target];
      visibility[compactIndex] = 1;
      compactIndexByEdge[edgeIndex] = compactIndex;
      compactGeneration[edgeIndex] = this.compactGenerationId;
    }

    this.#uploadDynamicBuffer(positionBuffer, positions);
    this.#uploadDynamicBuffer(widthBuffer, widths);
    this.#uploadDynamicBuffer(colorBuffer, colors);
    this.#uploadDynamicBuffer(sourceBuffer, sources);
    this.#uploadDynamicBuffer(targetBuffer, targets);
    this.#uploadDynamicBuffer(endpointMetricsBuffer, endpointMetrics);
    this.#uploadDynamicBuffer(visibilityBuffer, visibility);
    this.activeEdgeCount = count;
  }

  /**
   * 查询全量边在当前压缩缓冲中的索引。
   *
   * @param edgeIndex - 全量边索引。
   * @returns 压缩索引；当前不可见时返回 `-1`。
   */
  #compactIndex(edgeIndex: number): number {
    if (
      !this.compactIndexByEdge ||
      !this.compactGeneration ||
      this.compactGeneration[edgeIndex] !== this.compactGenerationId
    ) {
      return -1;
    }
    return this.compactIndexByEdge[edgeIndex];
  }

  /**
   * 以动态用途重新上传一个实例缓冲。
   *
   * @param buffer - 目标 WebGL 缓冲。
   * @param data - TypedArray 数据。
   * @returns 无返回值。
   */
  #uploadDynamicBuffer(
    buffer: WebGLBuffer,
    data: Float32Array | Uint32Array | Uint8Array,
  ): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
  }

  /**
   * 释放边渲染器资源。
   *
   * @returns 无返回值。
   */
  dispose(): void {
    const gl = this.gl;
    this.#deleteInstanceBuffers();
    if (this.vao) {
      gl.deleteVertexArray(this.vao);
    }
    if (this.quadBuffer) {
      gl.deleteBuffer(this.quadBuffer);
    }
    this.program.dispose();
  }

  /**
   * 创建边长条 VAO 和单位四边形。
   *
   * @returns 无返回值。
   */
  #createVertexArray(): void {
    const gl = this.gl;
    this.vao = gl.createVertexArray();
    if (!this.vao) {
      throw new Error("无法创建边 VAO");
    }

    gl.bindVertexArray(this.vao);
    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array(0),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    gl.vertexAttribDivisor(0, 0);
    gl.bindVertexArray(null);
  }

  /**
   * 创建静态顶点或实例缓冲并上传数据。
   *
   * @param array - CPU 端数组数据。
   * @returns 新 WebGL 缓冲。
   */
  #createBuffer(array: ArrayBufferView): WebGLBuffer {
    const gl = this.gl;
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, array, gl.STATIC_DRAW);
    return buffer;
  }

  /**
   * 按边数量和边样式更新曲线细分几何。
   *
   * @param curved - 是否使用曲线几何。
   * @returns 无返回值。
   */
  #ensureGeometry(curved: boolean): void {
    if (this.isCurvedGeometry === curved) {
      return;
    }

    const segments = curved
      ? this.edgeCount > 200_000
        ? 4
        : this.edgeCount > 50_000
          ? 8
          : 18
      : 1;
    const corners: number[] = [];

    for (let segment = 0; segment < segments; segment += 1) {
      const startT = (segment / segments) * 2 - 1;
      const endT = ((segment + 1) / segments) * 2 - 1;
      corners.push(
        startT, -1, 0,
        endT, -1, 0,
        endT, 1, 0,
        startT, -1, 0,
        endT, 1, 0,
        startT, 1, 0,
      );
    }
    corners.push(
      2, 0, 1,
      3, -4.5, 1,
      4, 4.5, 1,
    );

    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array(corners),
      gl.STATIC_DRAW,
    );
    this.vertexCount = corners.length / 3 - this.arrowVertexCount;
    this.isCurvedGeometry = curved;
  }

  /**
   * 配置一个实例化浮点属性。
   *
   * @param location - shader 属性位置。
   * @param buffer - 数据缓冲。
   * @param componentCount - 每实例分量数量。
   * @param componentType - WebGL 分量类型。
   * @param normalized - 是否规范化整数。
   * @param stride - 字节跨度。
   * @param offset - 属性字节偏移。
   * @returns 无返回值。
   */
  #configureInstanceBuffer(
    location: number,
    buffer: WebGLBuffer,
    componentCount: number,
    componentType: number,
    normalized: boolean,
    stride: number,
    offset: number,
  ): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(
      location,
      componentCount,
      componentType,
      normalized,
      stride,
      offset,
    );
    gl.vertexAttribDivisor(location, 1);
  }

  /**
   * 创建无符号整数实例缓冲并绑定整数属性。
   *
   * @param location - shader 属性位置。
   * @param array - 无符号整数数据。
   * @returns 新 WebGL 缓冲。
   */
  #createIntegerInstanceBuffer(
    location: number,
    array: Uint32Array,
  ): WebGLBuffer {
    const gl = this.gl;
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, array, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribIPointer(location, 1, gl.UNSIGNED_INT, 4, 0);
    gl.vertexAttribDivisor(location, 1);
    return buffer;
  }

  /**
   * 删除旧实例缓冲。
   *
   * @returns 无返回值。
   */
  #deleteInstanceBuffers(): void {
    for (const buffer of this.instanceBuffers) {
      this.gl.deleteBuffer(buffer);
    }
    this.instanceBuffers = [];
  }
}
