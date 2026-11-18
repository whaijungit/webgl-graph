import { ShaderProgram } from "./ShaderProgram.js";

import type { NodeIconAtlas } from "./NodeIconAtlas.js";
import type { GraphData } from "../graph/GraphData.js";
import type { Camera2D } from "./Camera2D.js";

/**
 * 计算高亮节点覆盖层的屏幕半径。
 *
 * @param weight - 0 到 1 的归一化节点权重。
 * @param isFocus - 是否为当前焦点节点。
 * @param zoomScale - 相机缩放带来的平滑尺寸倍率。
 * @returns CSS 像素单位下的图标半径。
 */
export function getHighlightNodeRadius(
  weight: number,
  isFocus: boolean,
  zoomScale: number = 1,
): number {
  const safeWeight = Math.max(0, Math.min(1, Number(weight) || 0));
  const safeZoomScale = Math.max(1, Math.min(2.5, Number(zoomScale) || 1));
  const baseRadius = isFocus
    ? 24 + safeWeight * 8
    : 15 + safeWeight * 6;
  return baseRadius * safeZoomScale;
}

const VERTEX_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec2 aPosition;
layout(location = 2) in float aRadius;
layout(location = 3) in float aAccent;
layout(location = 4) in float aIconIndex;
layout(location = 5) in float aUseColor;
layout(location = 6) in vec4 aColorOverride;

uniform vec2 uViewport;
uniform vec2 uCenter;
uniform float uScale;

out vec2 vCorner;
out float vAccent;
flat out float vIconIndex;
flat out float vUseColor;
flat out vec4 vColorOverride;

void main() {
  vec2 screenCenter =
    (aPosition - uCenter) * uScale + uViewport * 0.5;
  vec2 screenPosition = screenCenter + aCorner * aRadius;
  vec2 clipPosition = screenPosition / uViewport * 2.0 - 1.0;
  gl_Position = vec4(clipPosition.x, -clipPosition.y, 0.0, 1.0);
  vCorner = aCorner;
  vAccent = aAccent;
  vIconIndex = aIconIndex;
  vUseColor = aUseColor;
  vColorOverride = aColorOverride;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vCorner;
in float vAccent;
flat in float vIconIndex;
flat in float vUseColor;
flat in vec4 vColorOverride;
uniform sampler2D uIconAtlas;
out vec4 outColor;

void main() {
  float iconIndex = min(floor(vIconIndex + 0.5), 255.0);
  float column = mod(iconIndex, 16.0);
  float row = floor(iconIndex / 16.0);
  vec2 localUv = (vCorner + 1.0) * 0.5;
  vec2 atlasUv =
    (vec2(column, row) + localUv) / vec2(16.0, 16.0);
  vec4 imageColor = texture(uIconAtlas, atlasUv);
  if (imageColor.a <= 0.01) {
    discard;
  }

  float glyphMask = smoothstep(
    0.7,
    0.95,
    min(imageColor.r, min(imageColor.g, imageColor.b))
  );
  vec3 imageOutput = vUseColor > 0.5
    ? mix(vColorOverride.rgb, vec3(1.0), glyphMask)
    : imageColor.rgb;
  float alphaScale = vUseColor > 0.5 ? vColorOverride.a : 1.0;
  outColor = vec4(
    imageOutput,
    imageColor.a * alphaScale * mix(0.92, 1.0, vAccent)
  );
}
`;

/**
 * 图片节点模式下，用每个邻居自己的原始图标放大绘制选中邻域。
 */
export class HighlightOverlayRenderer {
  /** WebGL2 上下文。 */
  readonly gl: WebGL2RenderingContext;
  /** 共享节点图标图集。 */
  readonly iconAtlas: NodeIconAtlas;
  /** 原图标覆盖层着色器。 */
  readonly program: ShaderProgram;
  /** 覆盖层 VAO。 */
  private vao: WebGLVertexArrayObject | null;
  /** 单位四边形顶点缓冲。 */
  private quadBuffer: WebGLBuffer | null;
  /** 动态节点位置缓冲。 */
  private positionBuffer: WebGLBuffer | null;
  /** 动态半径、强调和图标索引缓冲。 */
  private metaBuffer: WebGLBuffer | null;
  /** CPU 端节点位置暂存。 */
  private positions: Float32Array;
  /** CPU 端元数据暂存。 */
  private metadata: Float32Array;
  /** 当前实例缓冲容量。 */
  private capacity: number;
  /** 当前需要绘制的邻居数量。 */
  private count: number;

  /**
   * 创建关联节点图标覆盖层。
   *
   * @param gl - WebGL2 上下文。
   * @param iconAtlas - 节点共享图标图集。
   */
  constructor(gl: WebGL2RenderingContext, iconAtlas: NodeIconAtlas) {
    this.gl = gl;
    this.iconAtlas = iconAtlas;
    this.program = new ShaderProgram(
      gl,
      VERTEX_SHADER,
      FRAGMENT_SHADER,
    );
    this.vao = null;
    this.quadBuffer = null;
    this.positionBuffer = null;
    this.metaBuffer = null;
    this.positions = new Float32Array(0);
    this.metadata = new Float32Array(0);
    this.capacity = 0;
    this.count = 0;
    this.#createGeometry();
  }

  /**
   * 更新焦点和直接邻居的覆盖实例。
   *
   * @param focusId - 焦点节点索引。
   * @param activeIds - 焦点和全部直接邻居。
   * @param graphData - 当前图数据。
   * @param zoomScale - 相机缩放带来的平滑尺寸倍率。
   * @returns 无返回值。
   */
  update(
    focusId: number | null,
    activeIds: readonly number[],
    graphData: GraphData,
    zoomScale: number = 1,
  ): void {
    if (focusId === null || activeIds.length === 0) {
      this.count = 0;
      return;
    }

    // activeIds 通常已包含焦点；额外加一可兼容调用方只传邻居的路径。
    this.#ensureCapacity(activeIds.length + 1);
    const positions = this.positions;
    const metadata = this.metadata;
    const sourcePositions = graphData.nodePositions;
    const weights = graphData.nodeWeights;
    const iconIds = graphData.nodeIconIds;
    const colors = graphData.nodeColors;
    const colorOverrides = graphData.nodeColorOverrides;

    // 焦点实例最后提交，确保它与邻居重叠时始终绘制在最上层。
    let targetIndex = 0;
    for (const nodeId of activeIds) {
      if (nodeId === focusId) {
        continue;
      }
      positions[targetIndex * 2] = sourcePositions[nodeId * 2];
      positions[targetIndex * 2 + 1] = sourcePositions[nodeId * 2 + 1];

      const weight = weights[nodeId] ?? 0;
      const metadataOffset = targetIndex * 8;
      metadata[metadataOffset] = getHighlightNodeRadius(
        weight,
        false,
        zoomScale,
      );
      metadata[metadataOffset + 1] = 0.7;
      metadata[metadataOffset + 2] = iconIds[nodeId] ?? 0;
      metadata[metadataOffset + 3] = colorOverrides[nodeId] ?? 0;
      metadata[metadataOffset + 4] = (colors[nodeId * 4] ?? 255) / 255;
      metadata[metadataOffset + 5] =
        (colors[nodeId * 4 + 1] ?? 255) / 255;
      metadata[metadataOffset + 6] =
        (colors[nodeId * 4 + 2] ?? 255) / 255;
      metadata[metadataOffset + 7] =
        (colors[nodeId * 4 + 3] ?? 255) / 255;
      targetIndex += 1;
    }
    positions[targetIndex * 2] = sourcePositions[focusId * 2];
    positions[targetIndex * 2 + 1] = sourcePositions[focusId * 2 + 1];
    const focusOffset = targetIndex * 8;
    metadata[focusOffset] = getHighlightNodeRadius(
      weights[focusId] ?? 0,
      true,
      zoomScale,
    );
    metadata[focusOffset + 1] = 1;
    metadata[focusOffset + 2] = iconIds[focusId] ?? 0;
    metadata[focusOffset + 3] = colorOverrides[focusId] ?? 0;
    metadata[focusOffset + 4] = (colors[focusId * 4] ?? 255) / 255;
    metadata[focusOffset + 5] =
      (colors[focusId * 4 + 1] ?? 255) / 255;
    metadata[focusOffset + 6] =
      (colors[focusId * 4 + 2] ?? 255) / 255;
    metadata[focusOffset + 7] =
      (colors[focusId * 4 + 3] ?? 255) / 255;
    targetIndex += 1;

    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferSubData(
      gl.ARRAY_BUFFER,
      0,
      positions.subarray(0, targetIndex * 2),
    );
    gl.bindBuffer(gl.ARRAY_BUFFER, this.metaBuffer);
    gl.bufferSubData(
      gl.ARRAY_BUFFER,
      0,
      metadata.subarray(0, targetIndex * 8),
    );
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.count = targetIndex;
  }

  /**
   * 绘制关联节点原图标覆盖层。
   *
   * @param camera - 当前相机。
   * @returns 无返回值。
   */
  draw(camera: Camera2D): void {
    if (!this.count) {
      return;
    }

    const gl = this.gl;
    const program = this.program;
    program.use();
    gl.uniform2f(
      program.uniform("uViewport"),
      camera.viewportWidth,
      camera.viewportHeight,
    );
    gl.uniform2f(program.uniform("uCenter"), camera.centerX, camera.centerY);
    gl.uniform1f(program.uniform("uScale"), camera.scale);
    gl.uniform1i(program.uniform("uIconAtlas"), 0);
    this.iconAtlas.bind(0);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.count);
    gl.bindVertexArray(null);
  }

  /**
   * 释放覆盖层资源。
   *
   * @returns 无返回值。
   */
  dispose(): void {
    const gl = this.gl;
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.quadBuffer) gl.deleteBuffer(this.quadBuffer);
    if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer);
    if (this.metaBuffer) gl.deleteBuffer(this.metaBuffer);
    this.program.dispose();
  }

  /**
   * 创建覆盖层 VAO 与实例属性布局。
   *
   * @returns 无返回值。
   */
  #createGeometry(): void {
    const gl = this.gl;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.vertexAttribDivisor(0, 0);

    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 8, 0);
    gl.vertexAttribDivisor(1, 1);

    this.metaBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.metaBuffer);

    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 32, 0);
    gl.vertexAttribDivisor(2, 1);

    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 32, 4);
    gl.vertexAttribDivisor(3, 1);

    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 32, 8);
    gl.vertexAttribDivisor(4, 1);

    gl.enableVertexAttribArray(5);
    gl.vertexAttribPointer(5, 1, gl.FLOAT, false, 32, 12);
    gl.vertexAttribDivisor(5, 1);

    gl.enableVertexAttribArray(6);
    gl.vertexAttribPointer(6, 4, gl.FLOAT, false, 32, 16);
    gl.vertexAttribDivisor(6, 1);

    gl.bindVertexArray(null);
  }

  /**
   * 确保动态实例缓冲可容纳指定数量。
   *
   * @param required - 需要容纳的实例数量。
   * @returns 无返回值。
   */
  #ensureCapacity(required: number): void {
    if (required <= this.capacity) {
      return;
    }

    let capacity = Math.max(16, this.capacity);
    while (capacity < required) {
      capacity *= 2;
    }

    this.capacity = capacity;
    this.positions = new Float32Array(capacity * 2);
    this.metadata = new Float32Array(capacity * 8);

    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.positions, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.metaBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.metadata, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }
}
