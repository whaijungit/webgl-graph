import type {
  GraphGenerationOptions,
  GraphPayload,
} from "../lib/types.js";
import { SeededRandom } from "./SeededRandom.js";

/** 社区中心的 X/Y TypedArray。 */
interface ClusterCenters {
  /** 社区中心世界坐标 X。 */
  x: Float32Array;
  /** 社区中心世界坐标 Y。 */
  y: Float32Array;
}

const COMMUNITY_COLORS: ReadonlyArray<
  readonly [number, number, number]
> = [
  [83, 225, 255],
  [117, 245, 182],
  [255, 209, 102],
  [255, 125, 125],
  [167, 139, 250],
  [84, 160, 255],
  [255, 157, 87],
  [94, 234, 212],
  [244, 114, 182],
  [163, 230, 53],
  [250, 204, 21],
  [96, 165, 250],
  [192, 132, 252],
  [45, 212, 191],
  [248, 113, 113],
  [147, 197, 253],
];

/**
 * 在 Worker 中生成可复现的合成关系网络。
 */
export class SyntheticGraphGenerator {
  /** 节点数量。 */
  readonly nodeCount: number;
  /** 边数量。 */
  readonly edgeCount: number;
  /** 社区数量。 */
  readonly clusterCount: number;
  /** 布局宽高比。 */
  readonly layoutAspect: number;
  /** Y 轴压缩比例。 */
  readonly verticalScale: number;
  /** 可复现随机数生成器。 */
  readonly random: SeededRandom;

  /**
   * 创建合成图生成器。
   *
   * @param options - 节点、边、社区、随机种子和布局宽高比。
   */
  constructor({
    nodeCount,
    edgeCount,
    clusterCount,
    seed,
    layoutAspect = 1.43,
  }: GraphGenerationOptions) {
    this.nodeCount = Math.max(1, Math.floor(nodeCount));
    this.edgeCount = Math.max(1, Math.floor(edgeCount));
    this.clusterCount = Math.max(
      1,
      Math.min(Math.floor(clusterCount ?? 1), this.nodeCount),
    );
    const safeAspect = Number.isFinite(layoutAspect)
      ? layoutAspect
      : 1.43;
    this.layoutAspect = Math.max(0.65, Math.min(2.8, safeAspect));
    this.verticalScale = Math.max(
      0.46,
      Math.min(1.08, 1 / this.layoutAspect),
    );
    this.random = new SeededRandom(seed ?? 1);
  }

  /**
   * 生成完整 SoA 图数据。
   *
   * @param onProgress - 0～1 进度回调。
   * @returns 节点和边 TypedArray。
   */
  generate(
    onProgress: (progress: number) => void = () => {},
  ): GraphPayload {
    const startedAt = performance.now();
    const centers = this.#createClusterCenters();
    const nodePositions = new Float32Array(this.nodeCount * 2);
    const nodeSizes = new Float32Array(this.nodeCount);
    const nodeColors = new Uint8Array(this.nodeCount * 4);
    const nodeGroups = new Uint16Array(this.nodeCount);
    const nodeLabels =
      this.nodeCount <= 1_000
        ? Array.from<number, string>(
            { length: this.nodeCount },
            (_, index): string => `节点 ${index + 1}`,
          )
        : null;

    this.#generateNodes(
      centers,
      nodePositions,
      nodeSizes,
      nodeColors,
      nodeGroups,
    );
    onProgress(0.48);

    const edgeSources = new Uint32Array(this.edgeCount);
    const edgeTargets = new Uint32Array(this.edgeCount);
    const edgePositions = new Float32Array(this.edgeCount * 4);
    const edgeWidths = new Float32Array(this.edgeCount);
    const edgeColors = new Uint8Array(this.edgeCount * 4);
    const edgeKinds =
      this.edgeCount <= 20_000
        ? new Array<string>(this.edgeCount)
        : null;
    this.#generateEdges(
      nodePositions,
      nodeGroups,
      edgeSources,
      edgeTargets,
      edgePositions,
      edgeWidths,
      edgeColors,
      edgeKinds,
      onProgress,
    );
    onProgress(0.98);

    return {
      nodeCount: this.nodeCount,
      edgeCount: this.edgeCount,
      clusterCount: this.clusterCount,
      nodePositions,
      nodeSizes,
      nodeColors,
      nodeGroups,
      nodeLabels,
      edgeSources,
      edgeTargets,
      edgePositions,
      edgeWidths,
      edgeColors,
      edgeKinds,
      generationMs: performance.now() - startedAt,
    };
  }

  /**
   * 创建社区中心。
   *
   * @returns 社区中心的 X/Y 坐标。
   */
  #createClusterCenters(): ClusterCenters {
    const x = new Float32Array(this.clusterCount);
    const y = new Float32Array(this.clusterCount);
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    for (let index = 0; index < this.clusterCount; index += 1) {
      const radius = Math.sqrt((index + 1) / this.clusterCount) * 1040;
      const angle = index * goldenAngle + this.random.range(-0.08, 0.08);
      x[index] = Math.cos(angle) * radius;
      y[index] = Math.sin(angle) * radius * this.verticalScale;
    }
    return { x, y };
  }

  /**
   * 生成节点位置、尺寸、颜色和分组。
   *
   * @param centers - 社区中心。
   * @param positions - 节点坐标输出。
   * @param sizes - 节点尺寸输出。
   * @param colors - 节点颜色输出。
   * @param groups - 节点社区输出。
   */
  #generateNodes(
    centers: ClusterCenters,
    positions: Float32Array,
    sizes: Float32Array,
    colors: Uint8Array,
    groups: Uint16Array,
  ): void {
    const useSpreadLayout = this.nodeCount <= 1_000;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const centerSpacing = Math.sqrt(
      (Math.PI * 1040 * 1040 * this.verticalScale) / this.clusterCount,
    );

    for (let index = 0; index < this.nodeCount; index += 1) {
      const group = index % this.clusterCount;
      const localIndex = Math.floor(index / this.clusterCount);
      const clusterSize = Math.ceil(
        (this.nodeCount - group) / this.clusterCount,
      );
      if (useSpreadLayout) {
        const angle =
          index * goldenAngle + this.random.range(-0.08, 0.08);
        const radius =
          Math.sqrt((index + 0.8) / this.nodeCount) * 930;
        positions[index * 2] =
          Math.cos(angle) * radius + this.random.range(-12, 12);
        positions[index * 2 + 1] =
          Math.sin(angle) * radius * 0.72 + this.random.range(-12, 12);
      } else {
        const spread =
          centerSpacing * (0.3 + (group % 7) * 0.008);
        const angle =
          localIndex * goldenAngle +
          group * 0.73 +
          this.random.range(-0.035, 0.035);
        const radius =
          Math.sqrt((localIndex + 0.5) / clusterSize) * spread;
        positions[index * 2] =
          centers.x[group] + Math.cos(angle) * radius;
        positions[index * 2 + 1] =
          centers.y[group] + Math.sin(angle) * radius * 0.86;
      }

      const prominence = Math.pow(this.random.next(), 3.8);
      sizes[index] = Math.max(1.6, 1.45 + prominence * 1.35);
      groups[index] = group;
      const color = COMMUNITY_COLORS[group % COMMUNITY_COLORS.length];
      colors[index * 4] = color[0];
      colors[index * 4 + 1] = color[1];
      colors[index * 4 + 2] = color[2];
      colors[index * 4 + 3] = 230;
      if (localIndex < 3) {
        sizes[index] += 0.45;
        colors[index * 4 + 3] = 255;
      }
    }
  }

  /**
   * 生成边、颜色和关系类型。
   *
   * @param positions - 节点坐标。
   * @param groups - 节点社区。
   * @param sources - 边起点输出。
   * @param targets - 边终点输出。
   * @param positionsOut - 边端点输出。
   * @param widths - 边宽输出。
   * @param colors - 边颜色输出。
   * @param kinds - 边关系类型输出。
   * @param onProgress - 进度回调。
   */
  #generateEdges(
    positions: Float32Array,
    groups: Uint16Array,
    sources: Uint32Array,
    targets: Uint32Array,
    positionsOut: Float32Array,
    widths: Float32Array,
    colors: Uint8Array,
    kinds: string[] | null,
    onProgress: (progress: number) => void,
  ): void {
    const localEdgeCount = Math.floor(this.edgeCount * 0.58);
    const progressStep = Math.max(1, Math.floor(this.edgeCount / 32));
    for (let edgeIndex = 0; edgeIndex < this.edgeCount; edgeIndex += 1) {
      let source: number;
      let target: number;
      if (edgeIndex < localEdgeCount) {
        source = this.random.integer(this.nodeCount);
        const group = source % this.clusterCount;
        const clusterSize = Math.ceil(
          (this.nodeCount - group) / this.clusterCount,
        );
        const localIndex = Math.floor(source / this.clusterCount);
        const maxSpan = Math.max(1, Math.min(12, clusterSize - 1));
        const span = 1 + this.random.integer(maxSpan);
        const targetLocal = (localIndex + span) % clusterSize;
        target = group + targetLocal * this.clusterCount;
        if (target >= this.nodeCount) {
          target = group;
        }
      } else {
        const candidateGroup = this.random.integer(this.clusterCount);
        const sourceSize = Math.ceil(
          (this.nodeCount - candidateGroup) / this.clusterCount,
        );
        const sourceLocal =
          this.random.next() < 0.35
            ? this.random.integer(Math.min(6, sourceSize))
            : this.random.integer(sourceSize);
        source = candidateGroup + sourceLocal * this.clusterCount;
        if (source >= this.nodeCount) {
          source = candidateGroup;
        }
        const sourceGroup = source % this.clusterCount;
        const offset =
          1 + this.random.integer(Math.max(1, this.clusterCount - 1));
        const targetGroup = (sourceGroup + offset) % this.clusterCount;
        const targetSize = Math.ceil(
          (this.nodeCount - targetGroup) / this.clusterCount,
        );
        const targetLocal =
          this.random.next() < 0.2
            ? this.random.integer(Math.min(5, targetSize))
            : this.random.integer(targetSize);
        target = targetGroup + targetLocal * this.clusterCount;
        if (target >= this.nodeCount) {
          target = targetGroup;
        }
      }
      if (target === source && this.nodeCount > 1) {
        target = (target + 1) % this.nodeCount;
      }

      sources[edgeIndex] = source;
      targets[edgeIndex] = target;
      const sourceOffset = source * 2;
      const targetOffset = target * 2;
      positionsOut[edgeIndex * 4] = positions[sourceOffset];
      positionsOut[edgeIndex * 4 + 1] = positions[sourceOffset + 1];
      positionsOut[edgeIndex * 4 + 2] = positions[targetOffset];
      positionsOut[edgeIndex * 4 + 3] = positions[targetOffset + 1];

      const isLocal = edgeIndex < localEdgeCount;
      if (kinds) {
        kinds[edgeIndex] = isLocal ? "local" : "cross-community";
      }
      const color = COMMUNITY_COLORS[
        groups[source] % COMMUNITY_COLORS.length
      ];
      widths[edgeIndex] = isLocal ? 0.72 : 0.58;
      colors[edgeIndex * 4] = isLocal
        ? color[0]
        : Math.round(color[0] * 0.62);
      colors[edgeIndex * 4 + 1] = isLocal
        ? color[1]
        : Math.round(color[1] * 0.72);
      colors[edgeIndex * 4 + 2] = isLocal
        ? color[2]
        : Math.round(color[2] * 0.93);
      colors[edgeIndex * 4 + 3] = isLocal ? 104 : 38;
      if (edgeIndex % progressStep === 0) {
        onProgress(0.5 + (edgeIndex / this.edgeCount) * 0.48);
      }
    }
  }
}
