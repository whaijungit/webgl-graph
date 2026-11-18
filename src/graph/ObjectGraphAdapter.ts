import type {
  ColorInput,
  GraphPayload,
  ObjectGraphGroup,
  ObjectGraphNode,
  ObjectGraphPayload,
} from "../lib/types.js";

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const FIRST_CUSTOM_ICON_INDEX = 8;
const GROUP_LAYOUT_GAP = 260;
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

/** 自动布局使用的分组中心。 */
interface GroupCenter {
  /** 世界坐标 X。 */
  x: number;
  /** 世界坐标 Y。 */
  y: number;
}

/**
 * 判断输入是否为 `{ groups, nodes, edges }` 对象图。
 *
 * @param payload - 待判断的数据。
 * @returns 是否为对象图格式。
 */
export function isObjectGraphPayload(
  payload: unknown,
): payload is ObjectGraphPayload {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const candidate = payload as Partial<ObjectGraphPayload>;
  return Array.isArray(candidate.nodes) && Array.isArray(candidate.edges);
}

/**
 * 将带字符串 ID 的对象图转换为连续 TypedArray 的渲染载荷。
 *
 * 节点和边只保留一次索引映射；缺失布局、颜色、尺寸、权重、图标和
 * 边端点坐标时，由本函数补齐。
 *
 * @param graph - 业务对象图。
 * @returns GraphData 可接收的 SoA 数据。
 */
export function createGraphPayloadFromObjectGraph(
  graph: ObjectGraphPayload,
): GraphPayload {
  const nodes = graph.nodes;
  const edges = graph.edges;
  const groups = resolveGroups(graph, nodes);
  const groupIndexById = createGroupIndex(groups);
  const nodeIndexById = createNodeIndex(nodes);
  const nodeGroups = new Uint16Array(nodes.length);
  const groupMembers = groups.map<number[]>(() => []);

  for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
    const groupId = resolveNodeGroupId(nodes[nodeIndex]);
    const groupIndex = groupIndexById.get(groupId);
    if (groupIndex === undefined) {
      throw new Error(`节点 ${nodes[nodeIndex].id} 引用了未知分组 ${groupId}`);
    }
    nodeGroups[nodeIndex] = groupIndex;
    groupMembers[groupIndex].push(nodeIndex);
  }

  const degrees = new Uint32Array(nodes.length);
  const edgeSources = new Uint32Array(edges.length);
  const edgeTargets = new Uint32Array(edges.length);
  for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex += 1) {
    const edge = edges[edgeIndex];
    const source = nodeIndexById.get(edge.source);
    const target = nodeIndexById.get(edge.target);
    if (source === undefined) {
      throw new Error(`边 ${edgeIndex} 的起点不存在：${edge.source}`);
    }
    if (target === undefined) {
      throw new Error(`边 ${edgeIndex} 的终点不存在：${edge.target}`);
    }
    edgeSources[edgeIndex] = source;
    edgeTargets[edgeIndex] = target;
    if (source !== target) {
      degrees[source] += 1;
      degrees[target] += 1;
    }
  }

  const positions = createNodePositions(nodes, groupMembers);
  const nodePositions = new Float32Array(nodes.length * 2);
  const nodeSizes = new Float32Array(nodes.length);
  const nodeWeights = new Float32Array(nodes.length);
  const nodeIconIds = new Uint8Array(nodes.length);
  const nodeIconSources: Array<string | null> = new Array(nodes.length).fill(
    null,
  );
  const customIconIndexBySource = new Map<string, number>();
  const nodeColorOverrides = new Uint8Array(nodes.length);
  const nodeColors: ColorInput[] = new Array(nodes.length);
  const nodeLabels: string[] = new Array(nodes.length);
  const nodeKinds: string[] = new Array(nodes.length);

  for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
    const node = nodes[nodeIndex];
    const groupIndex = nodeGroups[nodeIndex];
    nodePositions[nodeIndex * 2] = positions[nodeIndex].x;
    nodePositions[nodeIndex * 2 + 1] = positions[nodeIndex].y;
    nodeWeights[nodeIndex] = finiteOr(node.weight, degrees[nodeIndex] + 1);
    nodeSizes[nodeIndex] = finiteOr(
      node.size,
      node.kind === "root" ? 6.5 : resolveNodeSize(degrees[nodeIndex]),
    );
    const iconSource = node.icon?.trim();
    if (iconSource) {
      let iconId = customIconIndexBySource.get(iconSource);
      if (iconId === undefined) {
        iconId =
          FIRST_CUSTOM_ICON_INDEX + customIconIndexBySource.size;
        if (iconId > 255) {
          throw new Error(
            `自定义图标超过 248 个，无法放入共享图集：${iconSource}`,
          );
        }
        customIconIndexBySource.set(iconSource, iconId);
      }
      nodeIconIds[nodeIndex] = iconId;
      nodeIconSources[nodeIndex] = iconSource;
    } else {
      nodeIconIds[nodeIndex] = resolveIconId(node, nodeIndex);
    }
    nodeColors[nodeIndex] =
      node.color ??
      COMMUNITY_COLORS[groupIndex % COMMUNITY_COLORS.length];
    nodeColorOverrides[nodeIndex] = node.color !== undefined ? 1 : 0;
    nodeLabels[nodeIndex] = resolveNodeLabel(node);
    nodeKinds[nodeIndex] = node.kind ?? "node";
  }

  const edgePositions = new Float32Array(edges.length * 4);
  const edgeWidths = new Float32Array(edges.length);
  const edgeColors: ColorInput[] = new Array(edges.length);
  const edgeKinds: string[] = new Array(edges.length);
  for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex += 1) {
    const edge = edges[edgeIndex];
    const source = edgeSources[edgeIndex];
    const target = edgeTargets[edgeIndex];
    edgePositions[edgeIndex * 4] = nodePositions[source * 2];
    edgePositions[edgeIndex * 4 + 1] = nodePositions[source * 2 + 1];
    edgePositions[edgeIndex * 4 + 2] = nodePositions[target * 2];
    edgePositions[edgeIndex * 4 + 3] = nodePositions[target * 2 + 1];
    edgeWidths[edgeIndex] = finiteOr(
      edge.width,
      edge.kind === "devDependency" ? 0.74 : 0.9,
    );
    edgeColors[edgeIndex] =
      edge.color ??
      `${COMMUNITY_COLORS[nodeGroups[source] % COMMUNITY_COLORS.length]}c0`;
    edgeKinds[edgeIndex] = edge.kind ?? edge.label ?? "relation";
  }

  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    clusterCount: groups.length,
    generationMs: graph.generationMs,
    nodePositions,
    nodeSizes,
    nodeColors,
    nodeColorOverrides,
    nodeGroups,
    nodeWeights,
    nodeIconIds,
    nodeIconSources,
    nodeLabels,
    nodeKinds,
    groupLabels: groups.map((group) => group.label ?? group.id),
    edgeSources,
    edgeTargets,
    edgePositions,
    edgeWidths,
    edgeColors,
    edgeKinds,
  };
}

/**
 * 读取显式分组，并补充节点引用但分组数组中缺失的分组。
 *
 * @param graph - 对象图。
 * @param nodes - 节点数组。
 * @returns 最终分组列表。
 */
function resolveGroups(
  graph: ObjectGraphPayload,
  nodes: readonly ObjectGraphNode[],
): ObjectGraphGroup[] {
  const groups: ObjectGraphGroup[] = Array.from(graph.groups ?? []);
  const seen = new Set<string>();
  for (const group of groups) {
    if (!group.id) {
      throw new Error("分组 ID 不能为空");
    }
    if (seen.has(group.id)) {
      throw new Error(`分组 ID 重复：${group.id}`);
    }
    seen.add(group.id);
  }
  for (const node of nodes) {
    const groupId = resolveNodeGroupId(node);
    if (!seen.has(groupId)) {
      seen.add(groupId);
      groups.push({ id: groupId, label: groupId });
    }
  }
  if (groups.length === 0) {
    groups.push({ id: "default", label: "default" });
  }
  return groups;
}

/**
 * 创建分组 ID 到连续索引的映射。
 *
 * @param groups - 分组列表。
 * @returns 分组索引映射。
 */
function createGroupIndex(
  groups: readonly ObjectGraphGroup[],
): Map<string, number> {
  return new Map(groups.map((group, index) => [group.id, index]));
}

/**
 * 创建节点 ID 到连续索引的映射。
 *
 * @param nodes - 节点数组。
 * @returns 节点索引映射。
 */
function createNodeIndex(
  nodes: readonly ObjectGraphNode[],
): Map<string, number> {
  const indexById = new Map<string, number>();
  for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
    const id = nodes[nodeIndex].id;
    if (!id) {
      throw new Error(`节点 ${nodeIndex} 的 ID 不能为空`);
    }
    if (indexById.has(id)) {
      throw new Error(`节点 ID 重复：${id}`);
    }
    indexById.set(id, nodeIndex);
  }
  return indexById;
}

/**
 * 解析节点所属分组 ID。
 *
 * @param node - 对象图节点。
 * @returns 分组 ID。
 */
function resolveNodeGroupId(node: ObjectGraphNode): string {
  return node.group ?? node.branch ?? node.kind ?? "default";
}

/**
 * 为每个节点计算确定性的分组布局坐标。
 *
 * @param nodes - 节点数组。
 * @param groupMembers - 各分组包含的节点索引。
 * @returns 与节点数组顺序一致的坐标。
 */
function createNodePositions(
  nodes: readonly ObjectGraphNode[],
  groupMembers: readonly number[][],
): Array<{ x: number; y: number }> {
  const centers = createGroupCenters(groupMembers);
  const positions = nodes.map((node) => ({
    x: Number(node.x),
    y: Number(node.y),
  }));

  groupMembers.forEach((memberIds, groupIndex) => {
    const center = centers[groupIndex];
    const radius = resolveGroupLayoutRadius(memberIds.length);
    memberIds.forEach((nodeIndex, localIndex) => {
      if (
        Number.isFinite(positions[nodeIndex].x) &&
        Number.isFinite(positions[nodeIndex].y)
      ) {
        return;
      }
      const angle = localIndex * GOLDEN_ANGLE + groupIndex * 0.41;
      const localRadius =
        nodes[nodeIndex].kind === "root"
          ? 0
          : radius *
            Math.sqrt((localIndex + 0.6) / Math.max(1, memberIds.length));
      positions[nodeIndex] = {
        x: center.x + Math.cos(angle) * localRadius,
        y: center.y + Math.sin(angle) * localRadius * 0.82,
      };
    });
  });
  return positions;
}

/**
 * 按分组数量生成环形中心，root 分组优先放在原点。
 *
 * @param groupMembers - 各分组成员。
 * @returns 与分组顺序一致的中心坐标。
 */
function createGroupCenters(
  groupMembers: readonly number[][],
): GroupCenter[] {
  const centers = groupMembers.map(() => ({ x: 0, y: 0 }));
  const outerGroups = groupMembers
    .map((members, index) => ({ members, index }))
    .filter((entry) => entry.members.length > 0);
  const groupRadii = outerGroups.map((entry) =>
    resolveGroupLayoutRadius(entry.members.length),
  );
  const maxGroupRadius = Math.max(0, ...groupRadii);
  const spacing = maxGroupRadius * 2 + GROUP_LAYOUT_GAP;
  const columns = Math.max(
    1,
    Math.ceil(Math.sqrt(outerGroups.length * 1.45)),
  );
  const rows = Math.max(1, Math.ceil(outerGroups.length / columns));
  const cells: Array<{ x: number; y: number; distance: number }> = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = (column - (columns - 1) * 0.5) * spacing;
      const y = (row - (rows - 1) * 0.5) * spacing;
      cells.push({ x, y, distance: x * x + y * y });
    }
  }
  cells.sort((left, right) => left.distance - right.distance);
  outerGroups.forEach((entry, order) => {
    const cell = cells[order];
    centers[entry.index] = { x: cell.x, y: cell.y };
  });
  return centers;
}

/**
 * 计算单个分组在自动布局中使用的世界坐标半径。
 *
 * @param memberCount - 分组内节点数量。
 * @returns 分组节点散射半径。
 */
function resolveGroupLayoutRadius(memberCount: number): number {
  return memberCount <= 1
    ? 0
    : Math.min(230, 46 + Math.sqrt(memberCount) * 52);
}

/**
 * 根据连接度计算节点基础尺寸。
 *
 * @param degree - 无向连接度。
 * @returns 节点尺寸。
 */
function resolveNodeSize(degree: number): number {
  if (degree >= 4) {
    return 4.5;
  }
  if (degree >= 2) {
    return 3.3;
  }
  return 2.5;
}

/**
 * 选择节点图标索引。
 *
 * @param node - 对象图节点。
 * @param nodeIndex - 节点索引。
 * @returns 0～7 的图标索引。
 */
function resolveIconId(node: ObjectGraphNode, nodeIndex: number): number {
  if (node.iconId !== undefined) {
    return Math.max(0, Math.min(7, Math.floor(node.iconId)));
  }
  if (node.kind === "root") {
    return 0;
  }
  if (node.kind === "devDependency") {
    return 4;
  }
  const name = node.name ?? node.id;
  return 1 + (name.length % 7);
}

/**
 * 生成节点显示标签。
 *
 * @param node - 对象图节点。
 * @returns 节点标签。
 */
function resolveNodeLabel(node: ObjectGraphNode): string {
  return node.label ?? node.name ?? node.id;
}

/**
 * 使用有限数值或回退值。
 *
 * @param value - 候选数值。
 * @param fallback - 回退值。
 * @returns 有限数值。
 */
function finiteOr(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}
