import dependencyGraph from "../data/npm-dependencies.json";
import type {
  ColorInput,
  GraphPayload,
} from "../lib/types.js";

type DependencyGraphData = typeof dependencyGraph;
type DependencyGroup = DependencyGraphData["groups"][number];
type DependencyNode = DependencyGraphData["nodes"][number];
type DependencyEdge = DependencyGraphData["edges"][number];

/** 依赖分组布局中心。 */
interface GroupCenter {
  /** 世界坐标 X。 */
  x: number;
  /** 世界坐标 Y。 */
  y: number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const COMMUNITY_COLORS: readonly string[] = [
  "#53e1ff",
  "#75f5b6",
  "#ffd166",
  "#ff7d7d",
  "#a78bfa",
  "#54a0ff",
  "#ff9d57",
  "#5eead4",
  "#f472b6",
  "#a3e635",
  "#facc15",
  "#60a5fa",
];

/**
 * 将 npm 依赖 JSON 转换为 GraphView 使用的 SoA 数据。
 *
 * @returns 包含节点、依赖边、权重、标签和颜色的图数据。
 */
export function createNpmDependencyGraphPayload(): GraphPayload {
  const nodes: readonly DependencyNode[] = dependencyGraph.nodes;
  const edges: readonly DependencyEdge[] = dependencyGraph.edges;
  const groups: readonly DependencyGroup[] = dependencyGraph.groups;
  const nodeIndexById = createNodeIndex(nodes);
  const groupIndexById = new Map<string, number>(
    groups.map((group, index) => [group.id, index]),
  );
  const groupMembers = groups.map<number[]>(() => []);
  for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
    const groupIndex =
      groupIndexById.get(nodes[nodeIndex].branch) ?? 0;
    groupMembers[groupIndex].push(nodeIndex);
  }

  const centers = createGroupCenters(groups, groupMembers);
  const nodePositions = new Float32Array(nodes.length * 2);
  const nodeSizes = new Float32Array(nodes.length);
  const nodeWeights = new Float32Array(nodes.length);
  const nodeGroups = new Uint16Array(nodes.length);
  const nodeIconIds = new Uint8Array(nodes.length);
  const degrees = new Uint32Array(nodes.length);

  for (const edge of edges) {
    const source = nodeIndexById.get(edge.source);
    const target = nodeIndexById.get(edge.target);
    if (source !== undefined && target !== undefined) {
      degrees[source] += 1;
      degrees[target] += 1;
    }
  }

  groupMembers.forEach((memberIds, groupIndex) => {
    const center = centers[groupIndex];
    const radius =
      memberIds.length <= 1
        ? 0
        : Math.min(190, 42 + Math.sqrt(memberIds.length) * 46);
    memberIds.forEach((nodeIndex, localIndex) => {
      const angle = localIndex * GOLDEN_ANGLE + groupIndex * 0.41;
      const localRadius =
        nodes[nodeIndex].kind === "root"
          ? 0
          : radius * Math.sqrt((localIndex + 0.6) / memberIds.length);
      nodePositions[nodeIndex * 2] =
        center.x + Math.cos(angle) * localRadius;
      nodePositions[nodeIndex * 2 + 1] =
        center.y + Math.sin(angle) * localRadius * 0.82;
      nodeGroups[nodeIndex] = groupIndex;
      nodeWeights[nodeIndex] = degrees[nodeIndex] + 1;
      nodeSizes[nodeIndex] =
        nodes[nodeIndex].kind === "root"
          ? 6.5
          : degrees[nodeIndex] >= 4
            ? 4.5
            : degrees[nodeIndex] >= 2
              ? 3.3
              : 2.5;
      nodeIconIds[nodeIndex] = resolveIconIndex(nodes[nodeIndex]);
    });
  });

  const edgeSources = new Uint32Array(edges.length);
  const edgeTargets = new Uint32Array(edges.length);
  const edgePositions = new Float32Array(edges.length * 4);
  const edgeWidths = new Float32Array(edges.length);
  const edgeColors: ColorInput[] = new Array(edges.length);
  for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex += 1) {
    const edge = edges[edgeIndex];
    const source = nodeIndexById.get(edge.source) ?? 0;
    const target = nodeIndexById.get(edge.target) ?? 0;
    edgeSources[edgeIndex] = source;
    edgeTargets[edgeIndex] = target;
    edgePositions[edgeIndex * 4] = nodePositions[source * 2];
    edgePositions[edgeIndex * 4 + 1] = nodePositions[source * 2 + 1];
    edgePositions[edgeIndex * 4 + 2] = nodePositions[target * 2];
    edgePositions[edgeIndex * 4 + 3] = nodePositions[target * 2 + 1];
    edgeWidths[edgeIndex] = edge.kind === "devDependency" ? 0.74 : 0.9;
    const color = COMMUNITY_COLORS[source % COMMUNITY_COLORS.length];
    edgeColors[edgeIndex] =
      edge.kind === "devDependency"
        ? `rgba(148, 163, 184, 0.52)`
        : `${color}80`;
  }

  const nodeColors: ColorInput[] = nodes.map((node, nodeIndex) => {
    const color = COMMUNITY_COLORS[nodeIndex % COMMUNITY_COLORS.length];
    if (node.kind === "root") {
      return "#f3fbff";
    }
    return nodeIndex % 4 === 0
      ? `rgba(${Number.parseInt(color.slice(1, 3), 16)}, ${Number.parseInt(color.slice(3, 5), 16)}, ${Number.parseInt(color.slice(5, 7), 16)}, 0.94)`
      : color;
  });

  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    clusterCount: groups.length,
    nodePositions,
    nodeSizes,
    nodeColors,
    nodeWeights,
    nodeGroups,
    nodeIconIds,
    nodeLabels: nodes.map((node) => node.id),
    nodeKinds: nodes.map((node) => node.kind),
    groupLabels: groups.map((group) => group.label),
    edgeSources,
    edgeTargets,
    edgePositions,
    edgeWidths,
    edgeColors,
    edgeKinds: edges.map((edge) => edge.kind),
  };
}

/**
 * 创建节点 ID 到数组索引的映射。
 *
 * @param nodes - npm 依赖节点数组。
 * @returns 节点 ID 到索引的映射。
 */
function createNodeIndex(
  nodes: readonly DependencyNode[],
): Map<string, number> {
  return new Map(nodes.map((node, index) => [node.id, index]));
}

/**
 * 计算各依赖分支的布局中心。
 *
 * @param groups - 依赖分组。
 * @param groupMembers - 每个分组内的节点索引。
 * @returns 与分组顺序一致的世界坐标中心。
 */
function createGroupCenters(
  groups: readonly DependencyGroup[],
  groupMembers: readonly number[][],
): GroupCenter[] {
  const centers: GroupCenter[] = groups.map(() => ({
    x: 0,
    y: 0,
  }));
  const rootIndex = groups.findIndex((group) => group.id === "root");
  const viteIndex = groups.findIndex((group) => group.id === "vite");
  const threeIndex = groups.findIndex((group) => group.id === "three");
  if (rootIndex >= 0) {
    centers[rootIndex] = { x: 0, y: 0 };
  }
  if (viteIndex >= 0) {
    centers[viteIndex] = { x: 0, y: 250 };
  }
  if (threeIndex >= 0) {
    centers[threeIndex] = { x: 0, y: -250 };
  }

  const branchIndexes = groups
    .map((_, index) => index)
    .filter(
      (index) =>
        index !== rootIndex &&
        index !== viteIndex &&
        index !== threeIndex &&
        groupMembers[index].length > 0,
    );
  branchIndexes.forEach((groupIndex, index) => {
    const progress =
      branchIndexes.length === 1
        ? 0.5
        : index / (branchIndexes.length - 1);
    const angle = 0.18 + progress * (Math.PI - 0.36);
    centers[groupIndex] = {
      x: Math.cos(angle) * 900,
      y: 260 + Math.sin(angle) * 430,
    };
  });
  return centers;
}

/**
 * 根据 npm 节点类型选择共享图标。
 *
 * @param node - npm 依赖节点。
 * @returns 图标图集索引。
 */
function resolveIconIndex(node: DependencyNode): number {
  if (node.kind === "root") {
    return 0;
  }
  if (node.kind === "devDependency") {
    return 4;
  }
  if (node.name.includes("esbuild")) {
    return 7;
  }
  if (node.name.includes("rollup")) {
    return 6;
  }
  return 1 + (node.name.length % 6);
}
