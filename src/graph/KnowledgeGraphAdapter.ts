import type {
  ColorInput,
  KnowledgeGraphEntity,
  KnowledgeGraphPayload,
  ObjectGraphEdge,
  ObjectGraphGroup,
  ObjectGraphNode,
  ObjectGraphPayload,
} from "../lib/types.js";

/**
 * 判断输入是否为通用 `{ entities, relations }` 知识图谱。
 *
 * @param payload - 待判断的数据。
 * @returns 是否为通用知识图谱格式。
 */
export function isKnowledgeGraphPayload(
  payload: unknown,
): payload is KnowledgeGraphPayload {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const candidate = payload as Partial<KnowledgeGraphPayload>;
  return (
    Array.isArray(candidate.entities) &&
    Array.isArray(candidate.relations)
  );
}

/**
 * 将平台无关知识图谱转换为当前应用的对象图。
 *
 * 坐标、尺寸和图标继续由 `ObjectGraphAdapter` 在装载阶段生成。
 * 真正的无向关系会生成正反两条边，使每条有向边仍只在目标端绘制箭头。
 *
 * @param graph - 通用知识图谱。
 * @returns 当前应用可装载的对象图。
 */
export function createObjectGraphFromKnowledgeGraph(
  graph: KnowledgeGraphPayload,
): ObjectGraphPayload {
  const groups = createGroups(graph);
  const groupIds = new Set(groups.map((group) => group.id));
  const nodes: ObjectGraphNode[] = graph.entities.map((entity) => {
    const groupId = resolveEntityGroupId(entity, groupIds);
    if (!groupIds.has(groupId)) {
      groupIds.add(groupId);
      groups.push({
        id: groupId,
        label: resolveFallbackGroupLabel(groupId),
      });
    }
    const attributes = entity.attributes ?? {};
    return {
      id: entity.id,
      name: entity.name,
      label: entity.label ?? entity.name,
      kind: entity.type,
      group: groupId,
      size: finiteNumber(attributes.size),
      weight: finiteNumber(attributes.weight),
      color: resolveColor(attributes.color),
      iconId: finiteNumber(attributes.iconId),
      icon:
        typeof attributes.icon === "string" ? attributes.icon : undefined,
    };
  });

  const edges: ObjectGraphEdge[] = [];
  for (const relation of graph.relations) {
    const attributes = relation.attributes ?? {};
    const baseEdge: ObjectGraphEdge = {
      source: relation.source,
      target: relation.target,
      kind: relation.type,
      label: relation.label ?? relation.type,
      width: finiteNumber(attributes.width),
      color: resolveColor(attributes.color),
    };
    edges.push(baseEdge);
    if (relation.directed === false) {
      edges.push({
        ...baseEdge,
        source: relation.target,
        target: relation.source,
      });
    }
  }

  return {
    groups,
    nodes,
    edges,
    generationMs: finiteNumber(graph.attributes?.generationMs),
  };
}

/**
 * 读取并规范化知识图谱分组。
 *
 * @param graph - 通用知识图谱。
 * @returns 当前应用可用的分组数组。
 */
function createGroups(graph: KnowledgeGraphPayload): ObjectGraphGroup[] {
  return Array.from(graph.groups ?? [], (group) => ({
    id: group.id,
    label: group.label ?? group.id,
  }));
}

/**
 * 选择实体在单分组对象图中的主分组。
 *
 * @param entity - 知识图谱实体。
 * @param knownGroupIds - 已声明的分组 ID。
 * @returns 主分组 ID。
 */
function resolveEntityGroupId(
  entity: KnowledgeGraphEntity,
  knownGroupIds: ReadonlySet<string>,
): string {
  const firstKnownGroup = entity.groupIds?.find((id) =>
    knownGroupIds.has(id),
  );
  return firstKnownGroup ?? entity.groupIds?.[0] ?? `type:${entity.type}`;
}

/**
 * 将未声明的兜底分组 ID 转为用户可读的中文名称。
 *
 * @param groupId - 未在 groups 中声明的分组 ID。
 * @returns 可读分组名称。
 */
function resolveFallbackGroupLabel(groupId: string): string {
  const typeName = groupId.startsWith("type:")
    ? groupId.slice("type:".length)
    : groupId;
  const knownLabels: Readonly<Record<string, string>> = {
    brand: "品牌",
    brand_channel: "品牌渠道",
    event: "事件",
    technology: "技术",
    vehicle_model: "车型",
    vehicle_platform: "平台",
    vehicle_series: "车系",
  };
  return knownLabels[typeName] ?? typeName.replaceAll(/[_-]+/g, " ");
}

/**
 * 从任意属性值中读取有限数值。
 *
 * @param value - 候选属性值。
 * @returns 有限数值；否则为 `undefined`。
 */
function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

/**
 * 从任意属性值中读取颜色输入。
 *
 * @param value - 候选属性值。
 * @returns 当前渲染器支持的颜色输入；否则为 `undefined`。
 */
function resolveColor(value: unknown): ColorInput | undefined {
  if (typeof value === "string" || typeof value === "number") {
    return value;
  }
  if (
    Array.isArray(value) &&
    (value.length === 3 || value.length === 4) &&
    value.every((channel) => typeof channel === "number")
  ) {
    return value as unknown as ColorInput;
  }
  return undefined;
}
