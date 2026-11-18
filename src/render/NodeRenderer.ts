import { ShaderProgram } from "./ShaderProgram.js";
import { NodeIconAtlas } from "./NodeIconAtlas.js";

import type { GraphData } from "../graph/GraphData.js";
import type { Camera2D } from "./Camera2D.js";

/** 可重排的节点实例 TypedArray。 */
type ReorderableArray =
  | Float32Array
  | Uint32Array
  | Uint16Array
  | Uint8Array;

/** 单帧节点渲染选项。 */
interface NodeRenderOptions {
  /** 节点尺寸倍数。 */
  nodeScale?: number;
  /** 实例抽样步长。 */
  nodeStride?: number;
  /** shader 节点形状 ID。 */
  nodeShape?: number;
  /** 邻域标记来源。 */
  highlightMask?: {
    /** 长度等于节点数量的 0/1 标记。 */
    readonly mask: Uint8Array;
  } | null;
  /** 规范化高亮颜色。 */
  highlightColor?: [number, number, number, number];
  /** 非关联节点透明度倍数。 */
  dimOpacity?: number;
  /** 权重差异强度。 */
  weightStrength?: number;
  /** 高亮绘制 pass。 */
  highlightPass?: number;
  /** 节点最小屏幕尺寸。 */
  minimumSize?: number;
}

const NODE_VERTEX_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec2 aPosition;
layout(location = 2) in float aSize;
layout(location = 3) in vec4 aColor;
layout(location = 4) in float aWeight;
layout(location = 5) in float aRelated;
layout(location = 6) in float aIconIndex;
layout(location = 7) in uint aVisible;
layout(location = 8) in uint aNodeId;

uniform vec2 uViewport;
uniform vec2 uCenter;
uniform float uScale;
uniform float uNodeScale;
uniform float uMinimumSize;
uniform uint uHoverId;
uniform uint uSelectedId;
uniform uint uNodeStride;
uniform uint uNodeShape;
uniform float uWeightStrength;
uniform uint uHighlightActive;
uniform uint uHighlightPass;
uniform float uDimOpacity;
uniform vec4 uHighlightColor;

out vec2 vCorner;
out vec4 vColor;
flat out uint vShape;
flat out uint vIconIndex;
flat out float vAccent;

void main() {
  uint nodeId = aNodeId;
  bool isSelected = nodeId == uSelectedId;
  bool isHovered = nodeId == uHoverId;
  bool isRelated =
    uHighlightActive == 1u && aRelated > 0.5;
  bool isPassVisible =
    uHighlightActive == 0u ||
    (uHighlightPass == 0u ? !isRelated : isRelated);

  bool isDensityVisible =
    uNodeStride <= 1u ||
    nodeId % uNodeStride == 0u ||
    aVisible > 0u ||
    isRelated ||
    aWeight >= 0.78 ||
    isSelected ||
    isHovered;

  vShape = uNodeShape == 6u ? nodeId % 6u : uNodeShape;
  vIconIndex = uint(aIconIndex + 0.5);

  if (!isDensityVisible || !isPassVisible) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    vCorner = vec2(0.0);
    vColor = vec4(0.0);
    vAccent = 0.0;
    return;
  }

  float weight = clamp(aWeight, 0.0, 1.0);
  float weightScale = mix(
    1.0 - uWeightStrength * 0.34,
    1.0 + uWeightStrength * 1.55,
    weight
  );
  float size = aSize * uNodeScale * weightScale;
  size = max(size, max(1.1, uMinimumSize));
  if (uHighlightActive == 1u && isRelated) {
    size = max(
      size * (isSelected ? 1.9 : 1.45),
      isSelected ? 12.0 : 9.0
    );
  }
  if (isSelected) {
    size += 4.5;
  } else if (isHovered) {
    size += 2.0;
  }

  vec2 screenCenter =
    (aPosition - uCenter) * uScale + uViewport * 0.5;
  vec2 screenPosition = screenCenter + aCorner * size;
  vec2 clipPosition = screenPosition / uViewport * 2.0 - 1.0;

  gl_Position = vec4(clipPosition.x, -clipPosition.y, 0.0, 1.0);
  vCorner = aCorner;
  vColor = aColor;

  if (uHighlightActive == 1u) {
    if (!isRelated) {
      vColor.a *= uDimOpacity;
    }
  }

  vAccent = 0.0;

  if (isSelected) {
    vColor.a = max(vColor.a, 0.96);
  } else if (isHovered) {
    vColor = mix(vColor, uHighlightColor, 0.5);
    vColor.a = max(vColor.a, 0.96);
  }
}
`;

const NODE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vCorner;
in vec4 vColor;
flat in uint vShape;
flat in uint vIconIndex;
flat in float vAccent;
uniform sampler2D uIconAtlas;
uniform vec4 uHighlightColor;
out vec4 outColor;

float sdBox(vec2 point, vec2 halfSize) {
  vec2 distance = abs(point) - halfSize;
  return length(max(distance, 0.0)) +
    min(max(distance.x, distance.y), 0.0);
}

float sdDiamond(vec2 point, float radius) {
  return abs(point.x) + abs(point.y) - radius;
}

float sdTriangle(vec2 point) {
  const float k = 1.732050808;
  point.x = abs(point.x) - 0.88;
  point.y = point.y + 0.508;
  if (point.x + k * point.y > 0.0) {
    point = vec2(
      point.x - k * point.y,
      -k * point.x - point.y
    ) * 0.5;
  }
  point.x -= clamp(point.x, -1.76, 0.0);
  return -length(point) * sign(point.y);
}

float sdHexagon(vec2 point, float radius) {
  const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
  point = abs(point);
  point -= 2.0 * min(dot(k.xy, point), 0.0) * k.xy;
  point -= vec2(
    clamp(point.x, -k.z * radius, k.z * radius),
    radius
  );
  return length(point) * sign(point.y);
}

float sdStar(vec2 point, float radius, float innerRadius) {
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-k1.x, k1.y);
  point.x = abs(point.x);
  point -= 2.0 * max(dot(k1, point), 0.0) * k1;
  point -= 2.0 * max(dot(k2, point), 0.0) * k2;
  point.x = abs(point.x);
  point.y -= radius;
  vec2 ba = innerRadius * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(point, ba) / dot(ba, ba), 0.0, radius);
  return length(point - ba * h);
}

void main() {
  if (vShape == 7u) {
    uint iconIndex = min(vIconIndex, 255u);
    uint column = iconIndex % 16u;
    uint row = iconIndex / 16u;
    vec2 localUv = (vCorner + 1.0) * 0.5;
    vec2 atlasUv =
      (vec2(float(column), float(row)) + localUv) /
      vec2(16.0, 16.0);
    vec4 imageColor = texture(uIconAtlas, atlasUv);
    float radialDistance = length(vCorner);
    float accentRing =
      smoothstep(0.80, 0.86, radialDistance) *
      (1.0 - smoothstep(0.94, 1.0, radialDistance)) *
      vAccent;

    if (imageColor.a <= 0.01 && accentRing <= 0.001) {
      discard;
    }

    vec3 imageOutput = mix(
      imageColor.rgb,
      imageColor.rgb * vColor.rgb,
      0.16 + vAccent * 0.5
    );
    outColor = vec4(
      mix(imageOutput, uHighlightColor.rgb, accentRing),
      max(imageColor.a * vColor.a, accentRing)
    );
    return;
  }

  float signedDistance;

  if (vShape == 1u) {
    signedDistance = sdBox(vCorner, vec2(0.72));
  } else if (vShape == 2u) {
    signedDistance = sdDiamond(vCorner, 0.9);
  } else if (vShape == 3u) {
    signedDistance = sdTriangle(vCorner);
  } else if (vShape == 4u) {
    signedDistance = sdHexagon(vCorner, 0.86);
  } else if (vShape == 5u) {
    signedDistance = sdStar(vCorner, 0.9, 0.43);
  } else {
    signedDistance = length(vCorner) - 0.82;
  }

  float antialiasWidth = max(fwidth(signedDistance), 0.012);
  float coverage =
    1.0 - smoothstep(-antialiasWidth, antialiasWidth, signedDistance);
  if (coverage <= 0.002) {
    discard;
  }

  outColor = vec4(vColor.rgb, vColor.a * coverage);
}
`;

const NODE_POINT_VERTEX_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aPosition;
layout(location = 1) in float aSize;
layout(location = 2) in vec4 aColor;
layout(location = 3) in float aWeight;
layout(location = 4) in float aRelated;
layout(location = 5) in uint aVisible;
layout(location = 6) in uint aNodeId;
layout(location = 7) in float aIconIndex;
layout(location = 8) in float aColorOverride;

uniform vec2 uViewport;
uniform vec2 uCenter;
uniform float uScale;
uniform float uNodeScale;
uniform float uMinimumSize;
uniform uint uNodeShape;
uniform uint uHoverId;
uniform uint uSelectedId;
uniform float uWeightStrength;
uniform uint uHighlightActive;
uniform float uDimOpacity;
uniform vec4 uHighlightColor;

out vec4 vColor;
flat out uint vShape;
flat out uint vIconIndex;
flat out float vUseColorOverride;

void main() {
  bool isSelected = aNodeId == uSelectedId;
  bool isHovered = aNodeId == uHoverId;
  bool isRelated =
    uHighlightActive == 1u && aRelated > 0.5;
  vShape = uNodeShape == 6u ? aNodeId % 6u : uNodeShape;
  vIconIndex = uint(aIconIndex + 0.5);
  vUseColorOverride = aColorOverride;
  if (
    aVisible == 0u &&
    !isRelated &&
    !isSelected &&
    !isHovered
  ) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    gl_PointSize = 0.0;
    vColor = vec4(0.0);
    return;
  }

  float weight = clamp(aWeight, 0.0, 1.0);
  float weightScale = mix(
    1.0 - uWeightStrength * 0.34,
    1.0 + uWeightStrength * 1.55,
    weight
  );
  float size = aSize * uNodeScale * weightScale;
  size = max(size, uMinimumSize);
  float weightPointSize = mix(
    uMinimumSize,
    uMinimumSize * 3.0,
    clamp(pow(weight, 0.7) * uWeightStrength, 0.0, 1.0)
  );
  if (isSelected) {
    size += 3.0;
  } else if (isHovered) {
    size += 1.4;
  }

  vec2 screenCenter =
    (aPosition - uCenter) * uScale + uViewport * 0.5;
  vec2 clipPosition = screenCenter / uViewport * 2.0 - 1.0;
  gl_Position = vec4(clipPosition.x, -clipPosition.y, 0.0, 1.0);
  float pointSize = max(size, weightPointSize);
  if (isSelected) {
    pointSize = max(pointSize * 1.5, 32.0);
  }
  if (isRelated) {
    pointSize = max(
      pointSize * (isSelected ? 1.2 : 1.45),
      isSelected ? 40.0 : 24.0
    );
  }
  gl_PointSize = clamp(
    pointSize,
    1.0,
    isRelated ? 60.0 : 18.0
  );
  vColor = aColor;

  if (uHighlightActive == 1u && !isRelated) {
    vColor.a *= uDimOpacity * 0.15;
  }
  if (isSelected) {
    vColor.a = max(vColor.a, 0.96);
  } else if (isHovered) {
    vColor = mix(vColor, uHighlightColor, 0.72);
    vColor.a = max(vColor.a, 0.96);
  }
}
`;

const NODE_POINT_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec4 vColor;
flat in uint vShape;
flat in uint vIconIndex;
flat in float vUseColorOverride;
uniform sampler2D uIconAtlas;
out vec4 outColor;

float sdBox(vec2 point, vec2 halfSize) {
  vec2 distance = abs(point) - halfSize;
  return length(max(distance, 0.0)) +
    min(max(distance.x, distance.y), 0.0);
}

float sdDiamond(vec2 point, float radius) {
  return abs(point.x) + abs(point.y) - radius;
}

float sdTriangle(vec2 point) {
  const float k = 1.732050808;
  point.x = abs(point.x) - 0.88;
  point.y = point.y + 0.508;
  if (point.x + k * point.y > 0.0) {
    point = vec2(
      point.x - k * point.y,
      -k * point.x - point.y
    ) * 0.5;
  }
  point.x -= clamp(point.x, -1.76, 0.0);
  return -length(point) * sign(point.y);
}

float sdHexagon(vec2 point, float radius) {
  const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
  point = abs(point);
  point -= 2.0 * min(dot(k.xy, point), 0.0) * k.xy;
  point -= vec2(
    clamp(point.x, -k.z * radius, k.z * radius),
    radius
  );
  return length(point) * sign(point.y);
}

float sdStar(vec2 point, float radius, float innerRadius) {
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-k1.x, k1.y);
  point.x = abs(point.x);
  point -= 2.0 * max(dot(k1, point), 0.0) * k1;
  point -= 2.0 * max(dot(k2, point), 0.0) * k2;
  point.x = abs(point.x);
  point.y -= radius;
  vec2 ba = innerRadius * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(point, ba) / dot(ba, ba), 0.0, radius);
  return length(point - ba * h);
}

float lineMask(float coordinate, float center, float width) {
  return 1.0 - smoothstep(
    width,
    width + 0.04,
    abs(coordinate - center)
  );
}

float circleMask(vec2 point, vec2 center, float radius) {
  return 1.0 - smoothstep(
    radius,
    radius + 0.05,
    length(point - center)
  );
}

vec3 iconBaseColor(uint iconIndex) {
  if (iconIndex == 0u) return vec3(0.169, 0.498, 1.0);
  if (iconIndex == 1u) return vec3(0.733, 0.361, 1.0);
  if (iconIndex == 2u) return vec3(1.0, 0.373, 0.529);
  if (iconIndex == 3u) return vec3(1.0, 0.690, 0.125);
  if (iconIndex == 4u) return vec3(0.239, 0.851, 0.643);
  if (iconIndex == 5u) return vec3(1.0, 0.463, 0.341);
  if (iconIndex == 6u) return vec3(0.153, 0.780, 0.929);
  return vec3(0.482, 0.827, 0.310);
}

void main() {
  vec2 point = gl_PointCoord * 2.0 - 1.0;
  if (vShape == 7u && vIconIndex >= 8u) {
    uint customIconIndex = min(vIconIndex, 255u);
    uint column = customIconIndex % 16u;
    uint row = customIconIndex / 16u;
    vec2 atlasUv =
      (vec2(float(column), float(row)) + gl_PointCoord) /
      vec2(16.0, 16.0);
    vec4 imageColor = texture(uIconAtlas, atlasUv);
    if (imageColor.a <= 0.01) {
      discard;
    }
    outColor = vec4(imageColor.rgb, imageColor.a * vColor.a);
    return;
  }

  if (vShape != 7u) {
    float signedDistance;
    if (vShape == 1u) {
      signedDistance = sdBox(point, vec2(0.72));
    } else if (vShape == 2u) {
      signedDistance = sdDiamond(point, 0.9);
    } else if (vShape == 3u) {
      signedDistance = sdTriangle(point);
    } else if (vShape == 4u) {
      signedDistance = sdHexagon(point, 0.86);
    } else if (vShape == 5u) {
      signedDistance = sdStar(point, 0.9, 0.43);
    } else {
      signedDistance = length(point) - 0.82;
    }

    float antialiasWidth = max(fwidth(signedDistance), 0.02);
    float coverage =
      1.0 - smoothstep(-antialiasWidth, antialiasWidth, signedDistance);
    if (coverage <= 0.002) {
      discard;
    }
    outColor = vec4(vColor.rgb, vColor.a * coverage);
    return;
  }

  float tile = 1.0 - smoothstep(0.82, 0.9, max(abs(point.x), abs(point.y)));
  if (tile <= 0.002) {
    discard;
  }

  uint iconIndex = min(vIconIndex, 7u);
  float glyph = 0.0;
  if (iconIndex == 0u) {
    glyph = max(
      lineMask(point.y, -0.38, 0.06),
      max(
        lineMask(point.y, 0.0, 0.06),
        lineMask(point.y, 0.38, 0.06)
      )
    ) * step(abs(point.x), 0.52);
  } else if (iconIndex == 1u) {
    glyph = max(
      circleMask(point, vec2(-0.2, 0.05), 0.25),
      circleMask(point, vec2(0.18, 0.05), 0.3)
    );
  } else if (iconIndex == 2u) {
    glyph = max(
      circleMask(point, vec2(0.0, -0.28), 0.22),
      circleMask(point, vec2(0.0, 0.48), 0.42)
    );
  } else if (iconIndex == 3u) {
    glyph = max(
      circleMask(point, vec2(0.0, -0.18), 0.32),
      lineMask(point.x, 0.0, 0.07) *
        step(0.0, point.y) *
        step(point.y, 0.7)
    );
  } else if (iconIndex == 4u) {
    glyph = max(
      lineMask(abs(point.x), 0.5, 0.055),
      lineMask(abs(point.y), 0.58, 0.055)
    );
  } else if (iconIndex == 5u) {
    glyph = max(
      lineMask(point.y, -0.06, 0.2),
      max(
        circleMask(point, vec2(-0.36, 0.34), 0.15),
        circleMask(point, vec2(0.36, 0.34), 0.15)
      )
    );
  } else if (iconIndex == 6u) {
    glyph = lineMask(point.y - point.x * 0.62, 0.0, 0.085);
  } else {
    glyph = max(
      lineMask(point.x, -0.44, 0.055),
      lineMask(point.x, 0.44, 0.055)
    );
    glyph = max(
      glyph,
      max(
        lineMask(point.y, -0.34, 0.055),
        lineMask(point.y, 0.34, 0.055)
      ) * step(abs(point.x), 0.46)
    );
  }
  vec3 tileColor = vUseColorOverride > 0.5
    ? vColor.rgb
    : iconBaseColor(min(vIconIndex, 7u));
  vec3 iconColor = mix(tileColor, vec3(1.0), glyph * 0.92);
  outColor = vec4(iconColor, tile * vColor.a);
}
`;

/**
 * 以单次实例化绘制全部节点。
 *
 * 节点按权重分桶排序，高权重节点后绘制并显示在上层。
 */
export class NodeRenderer {
  /** WebGL2 上下文。 */
  readonly gl: WebGL2RenderingContext;
  /** 节点着色器程序。 */
  readonly program: ShaderProgram;
  /** 大图远景使用的单顶点 Point Sprite 程序。 */
  readonly pointProgram: ShaderProgram;
  /** 节点共享图标图集。 */
  readonly iconAtlas: NodeIconAtlas;
  /** 节点 VAO。 */
  private vao: WebGLVertexArrayObject | null;
  /** Point Sprite VAO。 */
  private pointVao: WebGLVertexArrayObject | null;
  /** Point Sprite 节点索引缓冲。 */
  private pointIndexBuffer: WebGLBuffer | null;
  /** Point Sprite 需要绘制的节点索引数量。 */
  private pointIndexCount: number;
  /** Point Sprite 强制保留节点标记。 */
  private pointForceMark: Uint8Array | null;
  /** 单位四边形顶点缓冲。 */
  private quadBuffer: WebGLBuffer | null;
  /** 需要统一释放的实例缓冲。 */
  private instanceBuffers: WebGLBuffer[];
  /** 邻域关联标记缓冲。 */
  private highlightBuffer: WebGLBuffer | null;
  /** 节点可见标记缓冲。 */
  private visibilityBuffer: WebGLBuffer | null;
  /** 节点位置实例缓冲。 */
  private positionBuffer: WebGLBuffer | null;
  /** 按绘制顺序排列的节点自定义颜色标记。 */
  private colorOverrideBuffer: WebGLBuffer | null;
  /** 节点实例绘制顺序。 */
  private instanceOrder: Uint32Array | null;
  /** 按绘制顺序排列的关联标记。 */
  private orderedHighlightMask: Uint8Array | null;
  /** 按绘制顺序排列的可见标记。 */
  private orderedVisibilityMask: Uint8Array | null;
  /** 节点索引到实例索引的映射。 */
  private instanceIndexByNode: Uint32Array | null;
  /** 当前节点数量。 */
  nodeCount: number;
  /** 自定义图标图集更新后的通知回调。 */
  private readonly onIconsLoaded: () => void;
  /** 当前图标装载代次，防止旧图异步覆盖新图。 */
  private iconLoadGeneration: number;

  /**
   * 创建节点渲染器。
   *
   * @param gl - WebGL2 上下文。
   * @param onIconsLoaded - 自定义图标加载完成后的重绘回调。
   */
  constructor(
    gl: WebGL2RenderingContext,
    onIconsLoaded: () => void = () => {},
  ) {
    this.gl = gl;
    this.program = new ShaderProgram(
      gl,
      NODE_VERTEX_SHADER,
      NODE_FRAGMENT_SHADER,
    );
    this.pointProgram = new ShaderProgram(
      gl,
      NODE_POINT_VERTEX_SHADER,
      NODE_POINT_FRAGMENT_SHADER,
    );
    this.iconAtlas = new NodeIconAtlas(gl);
    this.vao = null;
    this.pointVao = null;
    this.pointIndexBuffer = null;
    this.pointIndexCount = 0;
    this.pointForceMark = null;
    this.quadBuffer = null;
    this.instanceBuffers = [];
    this.highlightBuffer = null;
    this.visibilityBuffer = null;
    this.positionBuffer = null;
    this.colorOverrideBuffer = null;
    this.instanceOrder = null;
    this.orderedHighlightMask = null;
    this.orderedVisibilityMask = null;
    this.instanceIndexByNode = null;
    this.nodeCount = 0;
    this.onIconsLoaded = onIconsLoaded;
    this.iconLoadGeneration = 0;
    this.#createVertexArray();
  }

  /**
   * 上传节点实例属性并按权重建立绘制顺序。
   *
   * @param graphData - 当前图数据。
   * @returns 无返回值。
   */
  upload(graphData: GraphData): void {
    const gl = this.gl;
    this.#deleteInstanceBuffers();
    const order = this.#createWeightOrder(graphData.nodeWeights);
    const instanceIndexByNode = new Uint32Array(graphData.nodeCount);
    for (
      let instanceIndex = 0;
      instanceIndex < order.length;
      instanceIndex += 1
    ) {
      instanceIndexByNode[order[instanceIndex]] = instanceIndex;
    }
    this.instanceOrder = order;
    this.instanceIndexByNode = instanceIndexByNode;
    this.orderedHighlightMask = new Uint8Array(graphData.nodeCount);
    this.orderedVisibilityMask = new Uint8Array(graphData.nodeCount);
    this.pointForceMark = new Uint8Array(graphData.nodeCount);
    gl.bindVertexArray(this.vao);

    this.positionBuffer = this.#createInstanceBuffer(
      1,
      graphData.nodePositions,
      2,
      gl.FLOAT,
      false,
      8,
      order,
      2,
    );
    const sizeBuffer = this.#createInstanceBuffer(
      2,
      graphData.nodeSizes,
      1,
      gl.FLOAT,
      false,
      4,
      order,
      1,
    );
    const colorBuffer = this.#createInstanceBuffer(
      3,
      graphData.nodeColors,
      4,
      gl.UNSIGNED_BYTE,
      true,
      4,
      order,
      4,
    );
    const weightBuffer = this.#createInstanceBuffer(
      4,
      graphData.nodeWeights,
      1,
      gl.FLOAT,
      false,
      4,
      order,
      1,
    );
    this.highlightBuffer = this.#createInstanceBuffer(
      5,
      new Uint8Array(graphData.nodeCount),
      1,
      gl.UNSIGNED_BYTE,
      true,
      1,
      order,
      1,
    );
    const iconBuffer = this.#createInstanceBuffer(
      6,
      graphData.nodeIconIds,
      1,
      gl.UNSIGNED_BYTE,
      false,
      1,
      order,
      1,
    );
    this.visibilityBuffer = this.#createByteIntegerInstanceBuffer(
      7,
      new Uint8Array(graphData.nodeCount),
    );
    const nodeIdBuffer = this.#createUint32InstanceBuffer(8, order);
    const orderedColorOverrides = new Uint8Array(graphData.nodeCount);
    for (
      let instanceIndex = 0;
      instanceIndex < order.length;
      instanceIndex += 1
    ) {
      orderedColorOverrides[instanceIndex] =
        graphData.nodeColorOverrides[order[instanceIndex]] ?? 0;
    }
    this.colorOverrideBuffer = this.#createBuffer(
      orderedColorOverrides,
    );

    this.instanceBuffers.push(
      this.positionBuffer,
      sizeBuffer,
      colorBuffer,
      weightBuffer,
      this.highlightBuffer,
      iconBuffer,
      this.visibilityBuffer,
      nodeIdBuffer,
      this.colorOverrideBuffer,
    );
    this.nodeCount = graphData.nodeCount;
    this.#configurePointVertexArray();
    gl.bindVertexArray(null);
    const generation = ++this.iconLoadGeneration;
    void this.iconAtlas
      .loadCustomIcons(graphData.nodeIconSources, graphData.nodeIconIds)
      .then((changed) => {
        if (changed && generation === this.iconLoadGeneration) {
          this.onIconsLoaded();
        }
      });
  }

  /**
   * 更新节点邻域关联标记。
   *
   * @param mask - 长度等于节点数量的 0/1 掩码。
   * @returns 无返回值。
   */
  updateHighlightMask(mask: Uint8Array): void {
    if (!this.highlightBuffer) {
      return;
    }

    const gl = this.gl;
    for (
      let instanceIndex = 0;
      instanceIndex < this.nodeCount;
      instanceIndex += 1
    ) {
      this.orderedHighlightMask[instanceIndex] =
        mask[this.instanceOrder[instanceIndex]] === 1 ? 255 : 0;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.highlightBuffer);
    gl.bufferSubData(
      gl.ARRAY_BUFFER,
      0,
      this.orderedHighlightMask,
    );
  }

  /**
   * 局部更新一个节点的 GPU 位置。
   *
   * @param nodeId - 节点索引。
   * @param x - 新世界坐标 X。
   * @param y - 新世界坐标 Y。
   * @returns 无返回值。
   */
  updateNodePosition(nodeId: number, x: number, y: number): void {
    if (!this.positionBuffer) {
      return;
    }

    const instanceIndex = this.instanceIndexByNode[nodeId];
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferSubData(
      gl.ARRAY_BUFFER,
      instanceIndex * 8,
      new Float32Array([x, y]),
    );
  }

  /**
   * 更新节点可见性属性。
   *
   * @param mask - 长度等于节点数量的 0/1 掩码。
   * @returns 无返回值。
   */
  updateVisibilityMask(
    mask: Uint8Array,
    nodeBudget: number = this.nodeCount,
    forceNodeIds: readonly number[] = [],
  ): void {
    if (!this.visibilityBuffer) {
      return;
    }

    const gl = this.gl;
    for (
      let instanceIndex = 0;
      instanceIndex < this.nodeCount;
      instanceIndex += 1
    ) {
      this.orderedVisibilityMask[instanceIndex] =
        mask[this.instanceOrder[instanceIndex]];
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.visibilityBuffer);
    gl.bufferSubData(
      gl.ARRAY_BUFFER,
      0,
      this.orderedVisibilityMask,
    );
    this.#rebuildPointIndices(mask, forceNodeIds);
  }

  /**
   * 绘制全部节点实例。
   *
   * @param camera - 当前相机。
   * @param hoverId - 当前悬停节点。
   * @param selectedId - 当前选中节点。
   * @param options - 节点尺寸、形状、邻域和权重选项。
   * @returns 无返回值。
   */
  draw(
    camera: Camera2D,
    hoverId: number | null,
    selectedId: number | null,
    options: NodeRenderOptions = {},
  ): void {
    if (!this.nodeCount) {
      return;
    }

    if (this.nodeCount >= 100_000) {
      this.#drawPoints(camera, hoverId, selectedId, options);
      return;
    }

    const gl = this.gl;
    const program = this.program;
    const {
      nodeScale = 1,
      nodeStride = 1,
      nodeShape = 0,
      highlightMask = null,
      highlightColor = [0.42, 0.95, 1, 0.95],
      dimOpacity = 0.1,
      weightStrength = 1,
      highlightPass = 0,
      minimumSize = 5,
    } = options;

    program.use();
    gl.uniform2f(
      program.uniform("uViewport"),
      camera.viewportWidth,
      camera.viewportHeight,
    );
    gl.uniform2f(program.uniform("uCenter"), camera.centerX, camera.centerY);
    gl.uniform1f(program.uniform("uScale"), camera.scale);
    gl.uniform1f(program.uniform("uNodeScale"), nodeScale);
    gl.uniform1f(program.uniform("uMinimumSize"), minimumSize);
    gl.uniform1ui(program.uniform("uHoverId"), hoverId ?? 0xffffffff);
    gl.uniform1ui(program.uniform("uSelectedId"), selectedId ?? 0xffffffff);
    gl.uniform1ui(program.uniform("uNodeStride"), Math.max(1, nodeStride));
    gl.uniform1ui(program.uniform("uNodeShape"), nodeShape);
    gl.uniform1f(program.uniform("uWeightStrength"), weightStrength);
    gl.uniform1f(program.uniform("uDimOpacity"), dimOpacity);
    gl.uniform4fv(program.uniform("uHighlightColor"), highlightColor);
    gl.uniform1i(program.uniform("uIconAtlas"), 0);
    this.iconAtlas.bind(0);
    gl.uniform1ui(
      program.uniform("uHighlightActive"),
      highlightMask ? 1 : 0,
    );
    gl.uniform1ui(program.uniform("uHighlightPass"), highlightPass);

    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.nodeCount);
    gl.bindVertexArray(null);
  }

  /**
   * 释放节点 GPU 资源和共享图标纹理。
   *
   * @returns 无返回值。
   */
  dispose(): void {
    const gl = this.gl;
    this.#deleteInstanceBuffers();
    if (this.vao) {
      gl.deleteVertexArray(this.vao);
    }
    if (this.pointVao) {
      gl.deleteVertexArray(this.pointVao);
    }
    if (this.pointIndexBuffer) {
      gl.deleteBuffer(this.pointIndexBuffer);
    }
    if (this.quadBuffer) {
      gl.deleteBuffer(this.quadBuffer);
    }
    this.program.dispose();
    this.pointProgram.dispose();
    this.iconAtlas.dispose();
  }

  /**
   * 使用每节点一个顶点的 Point Sprite 绘制超大图。
   *
   * @param camera - 当前相机。
   * @param hoverId - 当前悬停节点。
   * @param selectedId - 当前选中节点。
   * @param options - 节点尺寸、邻域和权重选项。
   * @returns 无返回值。
   */
  #drawPoints(
    camera: Camera2D,
    hoverId: number | null,
    selectedId: number | null,
    options: NodeRenderOptions,
  ): void {
    const {
      nodeScale = 1,
      nodeShape = 7,
      highlightMask = null,
      highlightColor = [0.42, 0.95, 1, 0.95],
      dimOpacity = 0.1,
      weightStrength = 1,
      minimumSize = 5,
    } = options;
    const gl = this.gl;
    const program = this.pointProgram;
    program.use();
    gl.uniform2f(
      program.uniform("uViewport"),
      camera.viewportWidth,
      camera.viewportHeight,
    );
    gl.uniform2f(program.uniform("uCenter"), camera.centerX, camera.centerY);
    gl.uniform1f(program.uniform("uScale"), camera.scale);
    gl.uniform1f(program.uniform("uNodeScale"), nodeScale);
    gl.uniform1f(program.uniform("uMinimumSize"), minimumSize);
    gl.uniform1ui(program.uniform("uNodeShape"), nodeShape);
    gl.uniform1ui(program.uniform("uHoverId"), hoverId ?? 0xffffffff);
    gl.uniform1ui(program.uniform("uSelectedId"), selectedId ?? 0xffffffff);
    gl.uniform1f(program.uniform("uWeightStrength"), weightStrength);
    gl.uniform1f(program.uniform("uDimOpacity"), dimOpacity);
    gl.uniform4fv(program.uniform("uHighlightColor"), highlightColor);
    gl.uniform1i(program.uniform("uIconAtlas"), 0);
    this.iconAtlas.bind(0);
    gl.uniform1ui(
      program.uniform("uHighlightActive"),
      highlightMask ? 1 : 0,
    );
    gl.bindVertexArray(this.pointVao);
    gl.drawElements(
      gl.POINTS,
      this.pointIndexCount,
      gl.UNSIGNED_INT,
      0,
    );
    gl.bindVertexArray(null);
  }

  /**
   * 将现有节点实例缓冲重新解释为每节点一个顶点的 Point Sprite 属性。
   *
   * @returns 无返回值。
   */
  #configurePointVertexArray(): void {
    const gl = this.gl;
    this.pointVao = gl.createVertexArray();
    if (!this.pointVao) {
      throw new Error("无法创建节点 Point Sprite VAO");
    }
    gl.bindVertexArray(this.pointVao);
    this.#configurePointAttribute(0, this.positionBuffer, 2, gl.FLOAT, false, 8);
    const instanceBuffers = this.instanceBuffers;
    this.#configurePointAttribute(
      1,
      instanceBuffers[1],
      1,
      gl.FLOAT,
      false,
      4,
    );
    this.#configurePointAttribute(
      2,
      instanceBuffers[2],
      4,
      gl.UNSIGNED_BYTE,
      true,
      4,
    );
    this.#configurePointAttribute(
      3,
      instanceBuffers[3],
      1,
      gl.FLOAT,
      false,
      4,
    );
    this.#configurePointAttribute(
      4,
      this.highlightBuffer,
      1,
      gl.UNSIGNED_BYTE,
      true,
      1,
    );
    this.#configurePointIntegerAttribute(5, this.visibilityBuffer);
    this.#configurePointIntegerAttribute(
      6,
      instanceBuffers[7],
      gl.UNSIGNED_INT,
    );
    this.#configurePointAttribute(
      7,
      instanceBuffers[5],
      1,
      gl.UNSIGNED_BYTE,
      false,
      1,
    );
    this.#configurePointAttribute(
      8,
      this.colorOverrideBuffer,
      1,
      gl.UNSIGNED_BYTE,
      true,
      1,
    );
    this.pointIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.pointIndexBuffer);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      new Uint32Array(1),
      gl.DYNAMIC_DRAW,
    );
    gl.bindVertexArray(null);
  }

  /**
   * 为全部可见节点生成紧凑 Point Sprite 索引。
   *
   * @param visibilityMask - 节点可见掩码。
   * @param forceNodeIds - 选中节点和直接邻居等强制保留节点。
   * @returns 无返回值。
   */
  #rebuildPointIndices(
    visibilityMask: Uint8Array,
    forceNodeIds: readonly number[],
  ): void {
    const order = this.instanceOrder;
    const forceMark = this.pointForceMark;
    const indexBuffer = this.pointIndexBuffer;
    if (!order || !forceMark || !indexBuffer) {
      this.pointIndexCount = 0;
      return;
    }

    forceMark.fill(0);
    for (const nodeId of forceNodeIds) {
      if (nodeId >= 0 && nodeId < forceMark.length) {
        forceMark[nodeId] = 1;
      }
    }

    let visibleCount = 0;
    for (let instanceIndex = 0; instanceIndex < order.length; instanceIndex += 1) {
      const nodeId = order[instanceIndex];
      if (visibilityMask[nodeId] === 1 || forceMark[nodeId] === 1) {
        visibleCount += 1;
      }
    }
    if (!visibleCount) {
      this.pointIndexCount = 0;
      return;
    }

    const indices = new Uint32Array(visibleCount);
    const forcedIndices = new Uint32Array(forceNodeIds.length);
    const focusNodeId = forceNodeIds[0] ?? -1;
    let targetIndex = 0;
    let forcedIndex = 0;
    let focusInstanceIndex = -1;

    for (let instanceIndex = 0; instanceIndex < order.length; instanceIndex += 1) {
      const nodeId = order[instanceIndex];
      const visible =
        visibilityMask[nodeId] === 1 || forceMark[nodeId] === 1;
      if (!visible) {
        continue;
      }
      if (forceMark[nodeId] === 1) {
        if (nodeId === focusNodeId) {
          focusInstanceIndex = instanceIndex;
        } else if (forcedIndex < forcedIndices.length) {
          forcedIndices[forcedIndex] = instanceIndex;
          forcedIndex += 1;
        }
        continue;
      }
      indices[targetIndex] = instanceIndex;
      targetIndex += 1;
    }

    for (let index = 0; index < forcedIndex; index += 1) {
      indices[targetIndex] = forcedIndices[index];
      targetIndex += 1;
    }
    if (focusInstanceIndex >= 0) {
      indices[targetIndex] = focusInstanceIndex;
      targetIndex += 1;
    }

    const gl = this.gl;
    gl.bindVertexArray(this.pointVao);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      indices.subarray(0, targetIndex),
      gl.DYNAMIC_DRAW,
    );
    gl.bindVertexArray(null);
    this.pointIndexCount = targetIndex;
  }

  /**
   * 配置一个非实例化浮点顶点属性。
   *
   * @param location - shader 属性位置。
   * @param buffer - WebGL 缓冲。
   * @param componentCount - 分量数量。
   * @param componentType - 分量类型。
   * @param normalized - 是否规范化。
   * @param stride - 字节跨度。
   * @returns 无返回值。
   */
  #configurePointAttribute(
    location: number,
    buffer: WebGLBuffer | null,
    componentCount: number,
    componentType: number,
    normalized: boolean,
    stride: number,
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
      0,
    );
    gl.vertexAttribDivisor(location, 0);
  }

  /**
   * 配置一个非实例化整数顶点属性。
   *
   * @param location - shader 属性位置。
   * @param buffer - WebGL 缓冲。
   * @param type - 整数分量类型。
   * @returns 无返回值。
   */
  #configurePointIntegerAttribute(
    location: number,
    buffer: WebGLBuffer | null,
    type: number = this.gl.UNSIGNED_BYTE,
  ): void {
    const gl = this.gl;
    const componentSize =
      type === gl.UNSIGNED_BYTE ? 1 : 4;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribIPointer(location, 1, type, componentSize, 0);
    gl.vertexAttribDivisor(location, 0);
  }

  /**
   * 创建节点 VAO 和单位四边形。
   *
   * @returns 无返回值。
   */
  #createVertexArray(): void {
    const gl = this.gl;
    this.vao = gl.createVertexArray();
    if (!this.vao) {
      throw new Error("无法创建节点 VAO");
    }

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

    gl.bindVertexArray(null);
  }

  /**
   * 创建浮点实例缓冲并按绘制顺序上传。
   *
   * @param location - shader 属性位置。
   * @param array - 源 TypedArray。
   * @param componentCount - 每实例分量数。
   * @param componentType - WebGL 分量类型。
   * @param normalized - 是否规范化整数。
   * @param stride - 字节跨度。
   * @param order - 可选节点绘制顺序。
   * @param componentCountForOrder - 重排时每节点分量数。
   * @returns 新 WebGL 缓冲。
   */
  #createInstanceBuffer(
    location: number,
    array: ReorderableArray,
    componentCount: number,
    componentType: number,
    normalized: boolean,
    stride: number,
    order: Uint32Array | null = null,
    componentCountForOrder: number = componentCount,
  ): WebGLBuffer {
    const gl = this.gl;
    const buffer = gl.createBuffer();
    const uploadArray = order
      ? this.#reorderArray(array, componentCountForOrder, order)
      : array;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, uploadArray, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(
      location,
      componentCount,
      componentType,
      normalized,
      stride,
      0,
    );
    gl.vertexAttribDivisor(location, 1);
    return buffer;
  }

  /**
   * 创建并上传一个不绑定属性的 GPU 缓冲。
   *
   * @param data - 缓冲数据。
   * @returns 创建的 GPU 缓冲。
   */
  #createBuffer(data: ArrayBufferView): WebGLBuffer {
    const gl = this.gl;
    const buffer = gl.createBuffer();
    if (!buffer) {
      throw new Error("无法创建节点属性缓冲");
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return buffer;
  }

  /**
   * 创建无符号整数实例缓冲。
   *
   * @param location - shader 属性位置。
   * @param array - 无符号整数数组。
   * @returns 新 WebGL 缓冲。
   */
  #createUint32InstanceBuffer(
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
   * 使用 256 个权重桶生成稳定绘制顺序。
   *
   * @param weights - 归一化节点权重。
   * @returns 节点绘制顺序。
   */
  #createWeightOrder(weights: Float32Array): Uint32Array {
    const nodeCount = weights.length;
    const order = new Uint32Array(nodeCount);
    const bucketByNode = new Uint8Array(nodeCount);
    const bucketCounts = new Uint32Array(256);

    // 分桶排序足以决定绘制层级，避免为几十万个节点创建 JS 对象数组。
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
    for (let bucket = 0; bucket < bucketCounts.length; bucket += 1) {
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
   * 按节点顺序重排实例属性。
   *
   * @param array - 原始实例属性。
   * @param componentCount - 每节点分量数。
   * @param order - 节点绘制顺序。
   * @returns 重排后的同类型 TypedArray。
   */
  #reorderArray(
    array: ReorderableArray,
    componentCount: number,
    order: Uint32Array,
  ): ReorderableArray {
    const arrayLength = array.length;
    const ordered =
      array instanceof Float32Array
        ? new Float32Array(arrayLength)
        : array instanceof Uint32Array
          ? new Uint32Array(arrayLength)
          : array instanceof Uint16Array
            ? new Uint16Array(arrayLength)
            : new Uint8Array(arrayLength);
    const source = array;
    const target = ordered;
    for (
      let instanceIndex = 0;
      instanceIndex < order.length;
      instanceIndex += 1
    ) {
      const sourceOffset = order[instanceIndex] * componentCount;
      const targetOffset = instanceIndex * componentCount;
      for (let component = 0; component < componentCount; component += 1) {
        target[targetOffset + component] = source[sourceOffset + component];
      }
    }
    return target;
  }

  /**
   * 创建无符号字节整数实例缓冲。
   *
   * @param location - shader 属性位置。
   * @param array - 无符号字节数组。
   * @returns 新 WebGL 缓冲。
   */
  #createByteIntegerInstanceBuffer(
    location: number,
    array: Uint8Array,
  ): WebGLBuffer {
    const gl = this.gl;
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, array, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribIPointer(
      location,
      1,
      gl.UNSIGNED_BYTE,
      1,
      0,
    );
    gl.vertexAttribDivisor(location, 1);
    return buffer;
  }

  /**
   * 删除全部实例缓冲。
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
