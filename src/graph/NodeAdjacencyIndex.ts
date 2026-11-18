/**
 * 使用 CSR 保存无向邻接关系和节点关联边。
 */
export class NodeAdjacencyIndex {
  /** 节点数量。 */
  readonly nodeCount: number;
  /** 每个节点在邻居数组中的起始偏移。 */
  readonly offsets: Uint32Array;
  /** 最大无向连接度。 */
  maxDegree: number;
  /** 每个节点在关联边数组中的起始偏移。 */
  readonly incidentEdgeOffsets: Uint32Array;
  /** CSR 布局的直接邻居索引。 */
  readonly neighbors: Uint32Array;
  /** CSR 布局的关联边索引。 */
  readonly incidentEdges: Uint32Array;
  /** 索引 TypedArray 的总字节数。 */
  readonly byteLength: number;

  /**
   * 构建 CSR 邻接索引。
   *
   * @param nodeCount - 节点数量。
   * @param edgeSources - 边起点数组。
   * @param edgeTargets - 边终点数组。
   */
  constructor(
    nodeCount: number,
    edgeSources: Uint32Array,
    edgeTargets: Uint32Array,
  ) {
    this.nodeCount = nodeCount;
    this.offsets = new Uint32Array(nodeCount + 1);
    this.incidentEdgeOffsets = new Uint32Array(nodeCount + 1);
    this.maxDegree = 0;

    const degrees = new Uint32Array(nodeCount);
    const incidentDegrees = new Uint32Array(nodeCount);
    for (let edgeIndex = 0; edgeIndex < edgeSources.length; edgeIndex += 1) {
      const source = edgeSources[edgeIndex];
      const target = edgeTargets[edgeIndex];
      if (source === target) {
        continue;
      }
      degrees[source] += 1;
      degrees[target] += 1;
      incidentDegrees[source] += 1;
      incidentDegrees[target] += 1;
    }

    let runningOffset = 0;
    let incidentOffset = 0;
    for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex += 1) {
      this.offsets[nodeIndex] = runningOffset;
      runningOffset += degrees[nodeIndex];
      this.maxDegree = Math.max(this.maxDegree, degrees[nodeIndex]);
      this.incidentEdgeOffsets[nodeIndex] = incidentOffset;
      incidentOffset += incidentDegrees[nodeIndex];
    }
    this.offsets[nodeCount] = runningOffset;
    this.incidentEdgeOffsets[nodeCount] = incidentOffset;

    this.neighbors = new Uint32Array(runningOffset);
    this.incidentEdges = new Uint32Array(incidentOffset);
    const cursors = new Uint32Array(nodeCount);
    const incidentCursors = new Uint32Array(nodeCount);

    for (let edgeIndex = 0; edgeIndex < edgeSources.length; edgeIndex += 1) {
      const source = edgeSources[edgeIndex];
      const target = edgeTargets[edgeIndex];
      if (source === target) {
        continue;
      }
      this.neighbors[this.offsets[source] + cursors[source]] = target;
      cursors[source] += 1;
      this.neighbors[this.offsets[target] + cursors[target]] = source;
      cursors[target] += 1;
      this.incidentEdges[
        this.incidentEdgeOffsets[source] + incidentCursors[source]
      ] = edgeIndex;
      incidentCursors[source] += 1;
      this.incidentEdges[
        this.incidentEdgeOffsets[target] + incidentCursors[target]
      ] = edgeIndex;
      incidentCursors[target] += 1;
    }

    this.byteLength =
      this.offsets.byteLength +
      this.neighbors.byteLength +
      this.incidentEdgeOffsets.byteLength +
      this.incidentEdges.byteLength;
  }

  /**
   * 获取节点邻居区间。
   *
   * @param nodeId - 节点索引。
   * @returns CSR 邻居数组的起止索引。
   */
  getNeighborRange(nodeId: number): [number, number] {
    return [this.offsets[nodeId], this.offsets[nodeId + 1]];
  }

  /**
   * 获取节点关联边区间。
   *
   * @param nodeId - 节点索引。
   * @returns CSR 关联边数组的起止索引。
   */
  getIncidentEdgeRange(nodeId: number): [number, number] {
    return [
      this.incidentEdgeOffsets[nodeId],
      this.incidentEdgeOffsets[nodeId + 1],
    ];
  }
}
