import type { GraphData } from "../graph/GraphData.js";
import type { GraphBounds } from "../lib/types.js";

/** 每个世界轴划分的目标网格数量。 */
const TARGET_CELL_COUNT = 180;

/**
 * 基于均匀网格的节点空间索引。
 *
 * 只保存索引桶，不在拾取或视口查询时扫描完整节点数组。
 */
export class SpatialNodeIndex {
  /** 被索引的图数据。 */
  readonly data: GraphData;
  /** 图数据世界边界。 */
  readonly bounds: GraphBounds;
  /** 网格键到节点索引数组的映射。 */
  readonly cells: Map<number, number[]>;
  /** 单个网格的世界尺寸。 */
  readonly cellSize: number;
  /** 将二维网格坐标压缩为单键时使用的行跨度。 */
  readonly keyStride: number;
  /** 保证负网格 X 坐标转换为非负整数键的偏移。 */
  readonly offsetX: number;
  /** 保证负网格 Y 坐标转换为非负整数键的偏移。 */
  readonly offsetY: number;
  /** 实际有节点占用的最小网格 X。 */
  occupiedMinCellX: number;
  /** 实际有节点占用的最小网格 Y。 */
  occupiedMinCellY: number;
  /** 实际有节点占用的最大网格 X。 */
  occupiedMaxCellX: number;
  /** 实际有节点占用的最大网格 Y。 */
  occupiedMaxCellY: number;

  /**
   * 创建并填充空间索引。
   *
   * @param data - 已完成校验的图数据。
   */
  constructor(data: GraphData) {
    this.data = data;
    this.bounds = data.getBounds();
    this.cells = new Map<number, number[]>();
    const worldWidth = Math.max(1, this.bounds.maxX - this.bounds.minX);
    const worldHeight = Math.max(1, this.bounds.maxY - this.bounds.minY);
    this.cellSize = Math.max(worldWidth, worldHeight) / TARGET_CELL_COUNT;
    this.keyStride = 4096;
    this.offsetX = Math.ceil(-this.bounds.minX / this.cellSize) + 1;
    this.offsetY = Math.ceil(-this.bounds.minY / this.cellSize) + 1;
    this.occupiedMinCellX = Infinity;
    this.occupiedMinCellY = Infinity;
    this.occupiedMaxCellX = -Infinity;
    this.occupiedMaxCellY = -Infinity;
    this.#build();
  }

  /**
   * 拾取指针附近的最近节点。
   *
   * @param worldX - 指针世界坐标 X。
   * @param worldY - 指针世界坐标 Y。
   * @param scale - 每世界单位对应的屏幕像素数。
   * @param hitRadiusPixels - 额外命中半径，单位像素。
   * @returns 最近节点索引；没有命中时返回 `null`。
   */
  pick(
    worldX: number,
    worldY: number,
    scale: number,
    hitRadiusPixels: number = 12,
  ): number | null {
    const safeScale = Math.max(0.0001, scale);
    if (safeScale < this.#minimumPickScale()) {
      return null;
    }
    const worldRadius = hitRadiusPixels / safeScale;
    let minCellX = Math.floor(
      (worldX - worldRadius - this.bounds.minX) / this.cellSize,
    );
    let maxCellX = Math.floor(
      (worldX + worldRadius - this.bounds.minX) / this.cellSize,
    );
    let minCellY = Math.floor(
      (worldY - worldRadius - this.bounds.minY) / this.cellSize,
    );
    let maxCellY = Math.floor(
      (worldY + worldRadius - this.bounds.minY) / this.cellSize,
    );

    minCellX = Math.max(minCellX, this.occupiedMinCellX);
    maxCellX = Math.min(maxCellX, this.occupiedMaxCellX);
    minCellY = Math.max(minCellY, this.occupiedMinCellY);
    maxCellY = Math.min(maxCellY, this.occupiedMaxCellY);
    if (minCellX > maxCellX || minCellY > maxCellY) {
      return null;
    }

    let pickedNodeId = -1;
    let nearestDistanceSquared = Infinity;
    const positions = this.data.nodePositions;
    const sizes = this.data.nodeSizes;
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
        const bucket = this.cells.get(this.#key(cellX, cellY));
        if (!bucket) {
          continue;
        }
        for (const nodeId of bucket) {
          const deltaX =
            (positions[nodeId * 2] - worldX) * safeScale;
          const deltaY =
            (positions[nodeId * 2 + 1] - worldY) * safeScale;
          const distanceSquared =
            deltaX * deltaX + deltaY * deltaY;
          const hitRadius = Math.max(8, sizes[nodeId] + 4);
          const hitRadiusSquared = hitRadius * hitRadius;
          if (
            distanceSquared <= hitRadiusSquared &&
            distanceSquared < nearestDistanceSquared
          ) {
            pickedNodeId = nodeId;
            nearestDistanceSquared = distanceSquared;
          }
        }
      }
    }
    return pickedNodeId >= 0 ? pickedNodeId : null;
  }

  /**
   * 根据节点规模返回可辨识的最小悬停缩放。
   *
   * 超大图缩到远景时节点在屏幕上高度重叠，继续做 12px 命中查询会
   * 将世界范围扩大到整张图并扫描大量节点，因此直接跳过 hover 拾取。
   *
   * @returns 最小可执行局部拾取的相机缩放。
   */
  #minimumPickScale(): number {
    if (this.data.nodeCount >= 600_000) {
      return 0.18;
    }
    if (this.data.nodeCount >= 250_000) {
      return 0.12;
    }
    if (this.data.nodeCount >= 100_000) {
      return 0.06;
    }
    return 0.01;
  }

  /**
   * 收集世界边界内的全部节点。
   *
   * @param area - 需要查询的世界坐标范围。
   * @returns 范围内的节点索引数组。
   */
  collectInBounds(area: GraphBounds): number[] {
    let minCellX = Math.floor(
      (area.minX - this.bounds.minX) / this.cellSize,
    );
    let maxCellX = Math.floor(
      (area.maxX - this.bounds.minX) / this.cellSize,
    );
    let minCellY = Math.floor(
      (area.minY - this.bounds.minY) / this.cellSize,
    );
    let maxCellY = Math.floor(
      (area.maxY - this.bounds.minY) / this.cellSize,
    );

    minCellX = Math.max(minCellX, this.occupiedMinCellX);
    maxCellX = Math.min(maxCellX, this.occupiedMaxCellX);
    minCellY = Math.max(minCellY, this.occupiedMinCellY);
    maxCellY = Math.min(maxCellY, this.occupiedMaxCellY);
    const nodes: number[] = [];
    if (minCellX > maxCellX || minCellY > maxCellY) {
      return nodes;
    }

    const positions = this.data.nodePositions;
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
        const bucket = this.cells.get(this.#key(cellX, cellY));
        if (!bucket) {
          continue;
        }
        for (const nodeId of bucket) {
          const x = positions[nodeId * 2];
          const y = positions[nodeId * 2 + 1];
          if (
            x >= area.minX &&
            x <= area.maxX &&
            y >= area.minY &&
            y <= area.maxY
          ) {
            nodes.push(nodeId);
          }
        }
      }
    }
    return nodes;
  }

  /**
   * 判断查询范围是否完全覆盖当前图数据边界。
   *
   * @param area - 世界坐标查询范围。
   * @returns 是否覆盖全部节点。
   */
  coversBounds(area: GraphBounds): boolean {
    return (
      area.minX <= this.bounds.minX &&
      area.minY <= this.bounds.minY &&
      area.maxX >= this.bounds.maxX &&
      area.maxY >= this.bounds.maxY
    );
  }

  /**
   * 将节点从一个网格桶移动到新网格桶。
   *
   * @param nodeId - 节点索引。
   * @param previousX - 移动前世界坐标 X。
   * @param previousY - 移动前世界坐标 Y。
   * @param nextX - 移动后世界坐标 X。
   * @param nextY - 移动后世界坐标 Y。
   * @returns 无返回值。
   */
  updateNodePosition(
    nodeId: number,
    previousX: number,
    previousY: number,
    nextX: number,
    nextY: number,
  ): void {
    const previousCellX = Math.floor(
      (previousX - this.bounds.minX) / this.cellSize,
    );
    const previousCellY = Math.floor(
      (previousY - this.bounds.minY) / this.cellSize,
    );
    const previousKey = this.#key(previousCellX, previousCellY);
    const previousBucket = this.cells.get(previousKey);
    if (previousBucket) {
      const bucketIndex = previousBucket.indexOf(nodeId);
      if (bucketIndex >= 0) {
        previousBucket.splice(bucketIndex, 1);
      }
    }

    const nextCellX = Math.floor(
      (nextX - this.bounds.minX) / this.cellSize,
    );
    const nextCellY = Math.floor(
      (nextY - this.bounds.minY) / this.cellSize,
    );
    const nextKey = this.#key(nextCellX, nextCellY);
    let nextBucket = this.cells.get(nextKey);
    if (!nextBucket) {
      nextBucket = [];
      this.cells.set(nextKey, nextBucket);
    }
    nextBucket.push(nodeId);
    this.occupiedMinCellX = Math.min(
      this.occupiedMinCellX,
      nextCellX,
    );
    this.occupiedMinCellY = Math.min(
      this.occupiedMinCellY,
      nextCellY,
    );
    this.occupiedMaxCellX = Math.max(
      this.occupiedMaxCellX,
      nextCellX,
    );
    this.occupiedMaxCellY = Math.max(
      this.occupiedMaxCellY,
      nextCellY,
    );
  }

  /**
   * 根据节点坐标建立初始网格桶。
   *
   * @returns 无返回值。
   */
  #build(): void {
    const positions = this.data.nodePositions;
    for (let nodeIndex = 0; nodeIndex < this.data.nodeCount; nodeIndex += 1) {
      const cellX = Math.floor(
        (positions[nodeIndex * 2] - this.bounds.minX) / this.cellSize,
      );
      const cellY = Math.floor(
        (positions[nodeIndex * 2 + 1] - this.bounds.minY) / this.cellSize,
      );
      this.occupiedMinCellX = Math.min(this.occupiedMinCellX, cellX);
      this.occupiedMinCellY = Math.min(this.occupiedMinCellY, cellY);
      this.occupiedMaxCellX = Math.max(this.occupiedMaxCellX, cellX);
      this.occupiedMaxCellY = Math.max(this.occupiedMaxCellY, cellY);
      const key = this.#key(cellX, cellY);
      let bucket = this.cells.get(key);
      if (!bucket) {
        bucket = [];
        this.cells.set(key, bucket);
      }
      bucket.push(nodeIndex);
    }
  }

  /**
   * 将二维网格坐标压缩为单一 Map 键。
   *
   * @param cellX - 网格 X。
   * @param cellY - 网格 Y。
   * @returns 非负整数网格键。
   */
  #key(cellX: number, cellY: number): number {
    return (cellX + this.offsetX) * this.keyStride + cellY + this.offsetY;
  }
}
