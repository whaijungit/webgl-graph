import type {
  GraphBounds,
  GraphPayload,
  NodeDetails,
} from "../lib/types.js";
import { normalizeColorArray } from "./Color.js";

const DEFAULT_NODE_COLOR = "#53e1ff";
const DEFAULT_EDGE_COLOR = 0x53e1ff68;

/**
 * 校验并持有连续 SoA TypedArray 图数据。
 *
 * 业务对象只在导入阶段存在，渲染热路径直接读取这些 TypedArray。
 */
export class GraphData {
  /** 节点数量。 */
  readonly nodeCount: number;
  /** 边数量。 */
  readonly edgeCount: number;
  /** 社区数量。 */
  readonly clusterCount: number;
  /** Worker 生成耗时，单位毫秒。 */
  readonly generationMs: number;
  /** 节点世界坐标。 */
  readonly nodePositions: Float32Array;
  /** 节点基础尺寸。 */
  readonly nodeSizes: Float32Array;
  /** 节点 RGBA 颜色字节。 */
  readonly nodeColors: Uint8Array;
  /** 节点是否显式提供了自定义颜色。 */
  readonly nodeColorOverrides: Uint8Array;
  /** 节点社区索引。 */
  readonly nodeGroups: Uint16Array;
  /** 节点图标图集索引。 */
  readonly nodeIconIds: Uint8Array;
  /** 逐节点自定义图标来源；内置图标为 `null`。 */
  readonly nodeIconSources: Array<string | null> | null;
  /** 节点标签。 */
  readonly nodeLabels: string[] | null;
  /** 节点类型文本。 */
  readonly nodeKinds: string[] | null;
  /** 社区标签。 */
  readonly groupLabels: string[] | null;
  /** 边起点节点索引。 */
  readonly edgeSources: Uint32Array;
  /** 边终点节点索引。 */
  readonly edgeTargets: Uint32Array;
  /** 边端点坐标。 */
  readonly edgePositions: Float32Array;
  /** 边线宽。 */
  readonly edgeWidths: Float32Array;
  /** 边 RGBA 颜色字节。 */
  readonly edgeColors: Uint8Array;
  /** 边关系类型文本。 */
  readonly edgeKinds: string[] | null;
  /** 每个节点的无向连接度。 */
  readonly nodeDegrees: Uint32Array;
  /** 节点原始权重。 */
  readonly rawNodeWeights: Float32Array;
  /** 对数归一化后的节点权重。 */
  readonly nodeWeights: Float32Array;
  /** 世界坐标边界。 */
  readonly bounds: GraphBounds;
  /** 主要 TypedArray 的总字节数。 */
  readonly byteLength: number;

  /**
   * 创建并校验图数据。
   *
   * @param payload - SoA 图数据与可选业务文本。
   */
  constructor(payload: GraphPayload) {
    this.nodeCount = Math.max(0, Math.floor(payload.nodeCount));
    this.edgeCount = Math.max(0, Math.floor(payload.edgeCount));
    this.generationMs = payload.generationMs ?? 0;
    this.nodePositions = toFloat32Array(payload.nodePositions);
    this.nodeSizes = toFloat32Array(payload.nodeSizes);
    this.nodeColors = normalizeColorArray(
      payload.nodeColors,
      this.nodeCount,
      DEFAULT_NODE_COLOR,
    );
    this.nodeColorOverrides = payload.nodeColorOverrides
      ? toUint8Array(payload.nodeColorOverrides)
      : new Uint8Array(this.nodeCount);
    this.nodeGroups = toUint16Array(payload.nodeGroups);
    this.nodeIconSources = payload.nodeIconSources
      ? Array.from(payload.nodeIconSources)
      : null;
    this.nodeIconIds = payload.nodeIconIds
      ? toUint8Array(payload.nodeIconIds)
      : this.nodeIconSources
        ? createIconIdsFromSources(this.nodeCount, this.nodeIconSources)
        : createIconIds(this.nodeCount);
    this.nodeLabels = payload.nodeLabels
      ? Array.from(payload.nodeLabels)
      : null;
    this.nodeKinds = payload.nodeKinds
      ? Array.from(payload.nodeKinds)
      : null;
    this.groupLabels = payload.groupLabels
      ? Array.from(payload.groupLabels)
      : null;
    this.edgeSources = toUint32Array(payload.edgeSources);
    this.edgeTargets = toUint32Array(payload.edgeTargets);
    this.edgePositions = toFloat32Array(payload.edgePositions);
    this.edgeWidths = toFloat32Array(payload.edgeWidths);
    this.edgeColors = normalizeColorArray(
      payload.edgeColors,
      this.edgeCount,
      DEFAULT_EDGE_COLOR,
    );
    this.edgeKinds = payload.edgeKinds
      ? Array.from(payload.edgeKinds)
      : null;
    this.clusterCount = resolveClusterCount(
      payload.clusterCount,
      this.nodeGroups,
      this.nodeCount,
    );

    this.#validate();
    this.nodeDegrees = this.#calculateDegrees();
    const rawWeights = payload.nodeWeights ?? this.nodeDegrees;
    this.rawNodeWeights = toFloat32Array(rawWeights);
    this.nodeWeights = this.#normalizeWeights(this.rawNodeWeights);
    this.bounds = this.#calculateBounds();
    this.byteLength = this.#calculateByteLength();
  }

  /**
   * 读取节点详情。
   *
   * @param nodeIndex - 节点索引。
   * @returns 节点详情；越界时返回 `null`。
   */
  getNodeDetails(nodeIndex: number): NodeDetails | null {
    if (
      !Number.isInteger(nodeIndex) ||
      nodeIndex < 0 ||
      nodeIndex >= this.nodeCount
    ) {
      return null;
    }
    const group = this.nodeGroups[nodeIndex];
    return {
      index: nodeIndex,
      x: this.nodePositions[nodeIndex * 2],
      y: this.nodePositions[nodeIndex * 2 + 1],
      size: this.nodeSizes[nodeIndex],
      group,
      groupLabel: this.groupLabels?.[group] ?? null,
      degree: this.nodeDegrees[nodeIndex],
      rawWeight: this.rawNodeWeights[nodeIndex],
      weight: this.nodeWeights[nodeIndex],
      label: this.nodeLabels?.[nodeIndex] ?? null,
      kind: this.nodeKinds?.[nodeIndex] ?? null,
      color: [
        this.nodeColors[nodeIndex * 4],
        this.nodeColors[nodeIndex * 4 + 1],
        this.nodeColors[nodeIndex * 4 + 2],
        this.nodeColors[nodeIndex * 4 + 3],
      ],
    };
  }

  /**
   * 读取世界坐标边界。
   *
   * @returns 图数据边界对象。
   */
  getBounds(): GraphBounds {
    return this.bounds;
  }

  /**
   * 读取主要 TypedArray 总字节数。
   *
   * @returns 总字节数。
   */
  getByteLength(): number {
    return this.byteLength;
  }

  /**
   * 校验各 SoA 数组长度、组索引和端点范围。
   *
   * @returns 无返回值；校验失败时抛出异常。
   */
  #validate(): void {
    const checks: ReadonlyArray<readonly [boolean, string]> = [
      [this.nodePositions.length === this.nodeCount * 2, "节点坐标长度错误"],
      [this.nodeSizes.length === this.nodeCount, "节点尺寸长度错误"],
      [this.nodeColors.length === this.nodeCount * 4, "节点颜色长度错误"],
      [
        this.nodeColorOverrides.length === this.nodeCount,
        "节点颜色覆盖标记长度错误",
      ],
      [this.nodeGroups.length === this.nodeCount, "节点分组长度错误"],
      [this.nodeIconIds.length === this.nodeCount, "节点图标索引长度错误"],
      [
        !this.nodeIconSources ||
          this.nodeIconSources.length === this.nodeCount,
        "节点图标来源长度错误",
      ],
      [!this.nodeLabels || this.nodeLabels.length === this.nodeCount, "节点标签长度错误"],
      [!this.nodeKinds || this.nodeKinds.length === this.nodeCount, "节点类型长度错误"],
      [!this.groupLabels || this.groupLabels.length >= this.clusterCount, "社区标签长度错误"],
      [this.edgeSources.length === this.edgeCount, "边起点长度错误"],
      [this.edgeTargets.length === this.edgeCount, "边终点长度错误"],
      [this.edgePositions.length === this.edgeCount * 4, "边坐标长度错误"],
      [this.edgeWidths.length === this.edgeCount, "边宽长度错误"],
      [this.edgeColors.length === this.edgeCount * 4, "边颜色长度错误"],
      [!this.edgeKinds || this.edgeKinds.length === this.edgeCount, "边类型长度错误"],
    ];
    const failed = checks.find(([passed]) => !passed);
    if (failed) {
      throw new Error(`图数据格式错误：${failed[1]}`);
    }

    for (let edgeIndex = 0; edgeIndex < this.edgeCount; edgeIndex += 1) {
      const source = this.edgeSources[edgeIndex];
      const target = this.edgeTargets[edgeIndex];
      if (source >= this.nodeCount || target >= this.nodeCount) {
        throw new Error(`图数据端点越界：边 ${edgeIndex}`);
      }
    }
    for (let nodeIndex = 0; nodeIndex < this.nodeCount; nodeIndex += 1) {
      if (this.nodeGroups[nodeIndex] >= this.clusterCount) {
        throw new Error(`节点社区索引越界：节点 ${nodeIndex}`);
      }
    }
  }

  /**
   * 计算无向连接度。
   *
   * @returns 每个节点的连接度。
   */
  #calculateDegrees(): Uint32Array {
    const degrees = new Uint32Array(this.nodeCount);
    for (let edgeIndex = 0; edgeIndex < this.edgeCount; edgeIndex += 1) {
      const source = this.edgeSources[edgeIndex];
      const target = this.edgeTargets[edgeIndex];
      if (source !== target) {
        degrees[source] += 1;
        degrees[target] += 1;
      }
    }
    return degrees;
  }

  /**
   * 对权重取对数并归一化。
   *
   * @param weights - 原始权重数组。
   * @returns 归一化到 0～1 的权重。
   */
  #normalizeWeights(weights: Float32Array): Float32Array {
    const normalized = new Float32Array(this.nodeCount);
    if (!this.nodeCount || !weights.length) {
      return normalized;
    }
    let minLog = Infinity;
    let maxLog = -Infinity;
    for (const weight of weights) {
      const logValue = Math.log1p(Math.max(0, weight));
      minLog = Math.min(minLog, logValue);
      maxLog = Math.max(maxLog, logValue);
    }
    const span = maxLog - minLog;
    if (!Number.isFinite(span) || span <= 0.000001) {
      normalized.fill(1);
      return normalized;
    }
    for (let index = 0; index < this.nodeCount; index += 1) {
      const weight = index < weights.length ? weights[index] : 0;
      const normalizedLog =
        (Math.log1p(Math.max(0, weight)) - minLog) / span;
      normalized[index] = Math.pow(normalizedLog, 0.55);
    }
    return normalized;
  }

  /**
   * 计算节点世界坐标边界。
   *
   * @returns 世界坐标边界。
   */
  #calculateBounds(): GraphBounds {
    if (!this.nodeCount) {
      return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let nodeIndex = 0; nodeIndex < this.nodeCount; nodeIndex += 1) {
      const x = this.nodePositions[nodeIndex * 2];
      const y = this.nodePositions[nodeIndex * 2 + 1];
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    return { minX, minY, maxX, maxY };
  }

  /**
   * 汇总主要 TypedArray 的字节长度。
   *
   * @returns 总字节数。
   */
  #calculateByteLength(): number {
    const arrays: readonly ArrayBufferView[] = [
      this.nodePositions,
      this.nodeSizes,
      this.nodeColors,
      this.nodeColorOverrides,
      this.nodeGroups,
      this.nodeIconIds,
      this.nodeDegrees,
      this.rawNodeWeights,
      this.nodeWeights,
      this.edgeSources,
      this.edgeTargets,
      this.edgePositions,
      this.edgeWidths,
      this.edgeColors,
    ];
    return arrays.reduce((total, array) => total + array.byteLength, 0);
  }
}

/**
 * 将通用数值输入转换为 Float32Array。
 *
 * @param value - TypedArray 或普通数值数组。
 * @returns Float32Array。
 */
function toFloat32Array(value: ArrayLike<number>): Float32Array {
  return value instanceof Float32Array ? value : Float32Array.from(value);
}

/**
 * 将通用数值输入转换为 Uint32Array。
 *
 * @param value - TypedArray 或普通数值数组。
 * @returns Uint32Array。
 */
function toUint32Array(value: ArrayLike<number>): Uint32Array {
  return value instanceof Uint32Array ? value : Uint32Array.from(value);
}

/**
 * 将通用数值输入转换为 Uint16Array。
 *
 * @param value - TypedArray 或普通数值数组。
 * @returns Uint16Array。
 */
function toUint16Array(value: ArrayLike<number>): Uint16Array {
  return value instanceof Uint16Array ? value : Uint16Array.from(value);
}

/**
 * 将通用数值输入转换为 Uint8Array。
 *
 * @param value - TypedArray 或普通数值数组。
 * @returns Uint8Array。
 */
function toUint8Array(value: ArrayLike<number>): Uint8Array {
  return value instanceof Uint8Array ? value : Uint8Array.from(value);
}

/**
 * 创建默认图标索引序列。
 *
 * @param nodeCount - 节点数量。
 * @returns 在 0～7 之间轮换的图标索引。
 */
function createIconIds(nodeCount: number): Uint8Array {
  const ids = new Uint8Array(nodeCount);
  for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex += 1) {
    ids[nodeIndex] = nodeIndex % 8;
  }
  return ids;
}

/**
 * 按自定义图标来源生成共享图集索引。
 *
 * 相同 URL/Data URL 自动复用索引，自定义索引从内置图标之后开始。
 *
 * @param nodeCount - 节点数量。
 * @param sources - 与节点索引对齐的图标来源。
 * @returns 图集索引数组。
 */
function createIconIdsFromSources(
  nodeCount: number,
  sources: readonly (string | null)[],
): Uint8Array {
  const ids = new Uint8Array(nodeCount);
  const indexBySource = new Map<string, number>();
  for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex += 1) {
    const source = sources[nodeIndex]?.trim();
    if (!source) {
      ids[nodeIndex] = nodeIndex % 8;
      continue;
    }
    let iconId = indexBySource.get(source);
    if (iconId === undefined) {
      iconId = 8 + indexBySource.size;
      if (iconId > 255) {
        throw new Error("自定义图标超过 248 个，无法放入共享图集");
      }
      indexBySource.set(source, iconId);
    }
    ids[nodeIndex] = iconId;
  }
  return ids;
}

/**
 * 推导社区数量。
 *
 * @param requested - 业务显式指定的社区数量。
 * @param groups - 节点社区索引。
 * @param nodeCount - 节点数量。
 * @returns 至少为 1 的社区数量。
 */
function resolveClusterCount(
  requested: number | undefined,
  groups: Uint16Array,
  nodeCount: number,
): number {
  if (Number.isFinite(requested) && Number(requested) > 0) {
    return Math.floor(Number(requested));
  }
  if (!nodeCount) {
    return 1;
  }
  let maxGroup = 0;
  for (const group of groups) {
    maxGroup = Math.max(maxGroup, group);
  }
  return maxGroup + 1;
}
