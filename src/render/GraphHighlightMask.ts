/**
 * 当前焦点邻域的实例状态标记。
 *
 * 点击节点变化时只修改焦点和直接邻居对应的字节，然后把标记上传到
 * NodeRenderer 的实例属性缓冲区。
 */
export class GraphHighlightMask {
  /** WebGL2 上下文。 */
  readonly gl: WebGL2RenderingContext;
  /** 节点数量。 */
  readonly nodeCount: number;
  /** 邻接索引。 */
  readonly adjacencyIndex: NodeAdjacencyIndex;
  /** 兼容旧二维标记布局的宽度。 */
  readonly width: number;
  /** 兼容旧二维标记布局的高度。 */
  readonly height: number;
  /** 节点关联标记。 */
  readonly mask: Uint8Array;
  /** 当前焦点节点。 */
  focusId: number | null;
  /** 上一次标记为非零的节点。 */
  previousIds: number[];
    /**
   * 初始化 GraphHighlightMask。
   *
   * @param gl - WebGL2 上下文
   * @param nodeCount - 节点数量
   * @param adjacencyIndex - 邻接索引
   */
  constructor(
    gl: WebGL2RenderingContext,
    nodeCount: number,
    adjacencyIndex: NodeAdjacencyIndex,
  ) {
    this.gl = gl;
    this.nodeCount = nodeCount;
    this.adjacencyIndex = adjacencyIndex;
    this.width = 1024;
    this.height = Math.max(1, Math.ceil(nodeCount / this.width));
    this.mask = new Uint8Array(this.width * this.height);
    this.focusId = null;
    this.previousIds = [];

  }

    /**
   * 更新对应状态。
   *
   * @param focusId - 焦点节点索引
   * @returns 无业务返回值；必要时返回更新后的状态。
   */
  update(focusId: number | null): boolean {
    if (focusId === this.focusId) {
      return false;
    }

    for (const nodeId of this.previousIds) {
      this.mask[nodeId] = 0;
    }

    this.previousIds = [];
    this.focusId = focusId;

    if (focusId !== null) {
      this.mask[focusId] = 1;
      this.previousIds.push(focusId);

      const [start, end] = this.adjacencyIndex.getNeighborRange(focusId);
      for (let index = start; index < end; index += 1) {
        const neighborId = this.adjacencyIndex.neighbors[index];
        if (this.mask[neighborId] === 1) {
          continue;
        }
        this.mask[neighborId] = 1;
        this.previousIds.push(neighborId);
      }
    }

    return true;
  }

    /**
   * 释放相关资源。
   * @returns 无业务返回值；必要时返回更新后的状态。
   */
  dispose(): void {}
}

import type { NodeAdjacencyIndex } from "../graph/NodeAdjacencyIndex.js";
