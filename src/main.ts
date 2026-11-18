import "./library-demo.css";
import Stats from "stats.js";
import { GraphDataService } from "./graph/GraphDataService";
import { loadDemoGraph } from "./examples/demo-graph";
import {
  DEFAULT_DEMO_ID,
  resolveDemoByPresetId,
  resolveInitialDemo,
} from "./examples/demo-registry";
import { objectGraphInputExample } from "./examples/relationship-payload";
import { GraphView } from "./lib";
import type {
  EdgeStyleName,
  GraphGenerationOptions,
  GraphPayload,
  KnowledgeGraphPayload,
  NodeDetails,
  NodeShapeName,
  ObjectGraphPayload,
} from "./lib/types";

/** 可选择的压测预设。 */
interface StressPreset {
  /** 预设节点数量。 */
  nodeCount: number;
  /** 预设边数量。 */
  edgeCount: number;
  /** 预设社区数量。 */
  clusterCount: number;
  /** 可复现随机种子。 */
  seed: number;
}

/** 结合 URL 参数后的实际压测配置。 */
interface ResolvedStressPreset extends StressPreset {
  /** 当前预设名称。 */
  id: string;
}

/** 范围控件的事件绑定配置。 */
interface RangeControlBinding {
  /** 范围输入元素。 */
  input: HTMLInputElement;
  /** 数值输出元素。 */
  output: HTMLOutputElement;
  /** 初始值。 */
  initialValue: number;
  /** 数值格式化函数。 */
  format: (value: number) => string;
  /** 数值应用函数。 */
  apply: (value: number) => void;
}

const STRESS_PRESETS: Readonly<Record<string, StressPreset>> = {
  default: {
    nodeCount: 100,
    edgeCount: 3_000,
    clusterCount: 10,
    seed: 20261116,
  },
  "100k": {
    nodeCount: 100_000,
    edgeCount: 200_000,
    clusterCount: 48,
    seed: 20261117,
  },
  "300k": {
    nodeCount: 300_000,
    edgeCount: 600_000,
    clusterCount: 64,
    seed: 20261118,
  },
  "600k": {
    nodeCount: 600_000,
    edgeCount: 1_200_000,
    clusterCount: 96,
    seed: 20261119,
  },
  "1m": {
    nodeCount: 1_000_000,
    edgeCount: 2_000_000,
    clusterCount: 128,
    seed: 20261120,
  },
};

const query = new URLSearchParams(window.location.search);
const stressPreset = resolveStressPreset(query);
const initialDemo = resolveInitialDemo(query);
const continuousRender = query.get("continuous") === "1";
const targetFps = parsePositiveInteger(query.get("fps"), 60);
const graphView = new GraphView("#graph-canvas", {
  continuousRender,
  targetFps,
  fitPadding: 0.88,
  style: {
    backgroundColor: [0.012, 0.03, 0.047, 1],
    nodeShape: "image",
    edgeStyle: "straight",
    dimOpacity: 0.1,
    edgeDimOpacity: 0.035,
    weightStrength: 1,
    labelFontSize: 10,
    showGroupBounds: true,
    nodeScale: 0.9,
    showLabels: true,
    edgeWidthScale: 0.1,
    showEdges: true,
  },
});
const dataService = new GraphDataService();
const stats = new Stats();
stats.showPanel(0);
stats.dom.classList.add("stats-fps-panel");
stats.dom.title = "Stats.js FPS，点击切换 FPS / MS";
document.body.append(stats.dom);

window.graphView = graphView;
window.disposeGraphView = () => {
  dataService.dispose();
  stats.dom.remove();
  graphView.dispose();
};

graphView.on("framemetrics", (metrics) => {
  window.graphMetrics = metrics;
  console.info("[traffic-graph metrics]", metrics);
});
graphView.on("frame", (metrics) => {
  window.graphLastFrame = metrics;
  stats.update();
});
setupConfigurationControls();
setupNeighborhoodPanel();
setupNodeSearch();

const loadStartedAt = performance.now();

try {
  if (initialDemo) {
    const result = loadDemoGraph(graphView, initialDemo, loadStartedAt);
    window.graphStressInfo = result.info;
    document.title = result.documentTitle;
    graphView.canvas.setAttribute("aria-label", result.ariaLabel);
    setConfigStatus(result.statusText);
    console.info(`[traffic-graph ${initialDemo.id}]`, result.info);
  } else {
    setDocumentProgress(stressPreset, 0);
    const generationOptions: GraphGenerationOptions = {
      nodeCount: stressPreset.nodeCount,
      edgeCount: stressPreset.edgeCount,
      clusterCount: stressPreset.clusterCount,
      seed: stressPreset.seed,
      layoutAspect: window.innerWidth / window.innerHeight,
    };
    const payload = await dataService.load(
      generationOptions,
      (progress) => setDocumentProgress(stressPreset, progress),
    );
    const loadMs = performance.now() - loadStartedAt;
    const uploadStartedAt = performance.now();
    graphView.setData(payload);
    const uploadMs = performance.now() - uploadStartedAt;
    const stressInfo = {
      preset: stressPreset.id,
      nodeCount: stressPreset.nodeCount,
      edgeCount: stressPreset.edgeCount,
      generationMs: payload.generationMs ?? 0,
      loadMs,
      uploadMs,
    };
    window.graphStressInfo = stressInfo;
    document.title =
      `${formatCount(stressPreset.nodeCount)} 节点 · ` +
      `${formatCount(stressPreset.edgeCount)} 边 · WebGL2`;
    graphView.canvas.setAttribute(
      "aria-label",
      `${formatCount(stressPreset.nodeCount)} 个节点和 ` +
        `${formatCount(stressPreset.edgeCount)} 条边的压测关系图`,
    );
    setConfigStatus(
      `${formatCount(stressPreset.nodeCount)} 节点 · ` +
        `${formatCount(stressPreset.edgeCount)} 边 · 配置面板按需更新`,
    );
    console.info("[traffic-graph stress]", stressInfo);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  document.title = `压测数据加载失败 · ${message}`;
  setConfigStatus(`加载失败：${message}`);
  console.error("[traffic-graph stress]", error);
}

/**
 * 合并 URL 参数和预设，得到实际压测规模。
 *
 * @param searchParams - 当前页面 URL 查询参数。
 * @returns 节点、边、社区和随机种子配置。
 */
function resolveStressPreset(
  searchParams: URLSearchParams,
): ResolvedStressPreset {
  const requestedPreset = searchParams.get("preset") ?? "default";
  const base =
    STRESS_PRESETS[requestedPreset] ?? STRESS_PRESETS.default;
  const nodeCount = parsePositiveInteger(
    searchParams.get("nodes"),
    base.nodeCount,
  );
  const edgeCount = parsePositiveInteger(
    searchParams.get("edges"),
    base.edgeCount,
  );
  const clusterCount = Math.min(
    nodeCount,
    parsePositiveInteger(
      searchParams.get("clusters"),
      base.clusterCount,
    ),
  );
  return {
    id: STRESS_PRESETS[requestedPreset] ? requestedPreset : "custom",
    nodeCount,
    edgeCount,
    clusterCount,
    seed: parsePositiveInteger(searchParams.get("seed"), base.seed),
  };
}

/**
 * 解析正整数查询参数。
 *
 * @param value - URL 参数文本。
 * @param fallback - 参数缺失或无效时使用的回退值。
 * @returns 大于 0 的整数。
 */
function parsePositiveInteger(
  value: string | null,
  fallback: number,
): number {
  if (value === null) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : fallback;
}

/**
 * 将数字格式化为便于阅读的 `k` / `m` 单位。
 *
 * @param value - 原始数量。
 * @returns 紧凑数量文本。
 */
function formatCount(value: number): string {
  if (value >= 1_000_000) {
    return `${Number((value / 1_000_000).toFixed(1))}m`;
  }
  if (value >= 1_000) {
    return `${Math.round(value / 1_000)}k`;
  }
  return String(value);
}

/**
 * 在页面标题中显示 Worker 生成进度，不创建额外 DOM 面板。
 *
 * @param preset - 当前压测配置。
 * @param progress - 0～1 生成进度。
 * @returns 无返回值。
 */
function setDocumentProgress(
  preset: ResolvedStressPreset,
  progress: number,
): void {
  const percent = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  document.title =
    `${formatCount(preset.nodeCount)} 节点 · ` +
    `${formatCount(preset.edgeCount)} 边 · 生成 ${percent}%`;
}

/**
 * 创建并绑定示例应用的图配置面板。
 *
 * 所有控件只在用户操作时调用 GraphView API，不在渲染帧内更新 DOM。
 *
 * @returns 无返回值。
 */
function setupConfigurationControls(): void {
  const toggleButton =
    getRequiredElement<HTMLButtonElement>("#config-toggle");
  const closeButton =
    getRequiredElement<HTMLButtonElement>("#config-close");
  const panel = getRequiredElement<HTMLElement>("#config-panel");
  const style = graphView.getStyle();

  toggleButton.addEventListener("click", () => {
    setConfigPanelOpen(panel, toggleButton, panel.hidden);
  });
  closeButton.addEventListener("click", () => {
    setConfigPanelOpen(panel, toggleButton, false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setConfigPanelOpen(panel, toggleButton, false);
    }
  });

  document
    .querySelectorAll<HTMLButtonElement>("[data-preset]")
    .forEach((button) => {
      const presetId = button.dataset.preset ?? "default";
      const demo = resolveDemoByPresetId(presetId);
      button.classList.toggle(
        "is-active",
        demo
          ? initialDemo?.id === demo.id
          : initialDemo === null && presetId === stressPreset.id,
      );
      button.addEventListener("click", () => {
        if (demo && initialDemo?.id === demo.id) {
          return;
        }
        if (
          !demo &&
          initialDemo === null &&
          presetId === stressPreset.id
        ) {
          return;
        }
        const nextQuery = new URLSearchParams(window.location.search);
        nextQuery.delete("nodes");
        nextQuery.delete("edges");
        if (demo?.id === DEFAULT_DEMO_ID) {
          nextQuery.delete("preset");
        } else {
          nextQuery.set("preset", presetId);
        }
        window.location.assign(
          `${window.location.pathname}?${nextQuery.toString()}`,
        );
      });
    });

  getRequiredElement<HTMLButtonElement>("#zoom-in").addEventListener(
    "click",
    () => changeZoom(1.35),
  );
  getRequiredElement<HTMLButtonElement>("#zoom-out").addEventListener(
    "click",
    () => changeZoom(1 / 1.35),
  );
  getRequiredElement<HTMLButtonElement>("#fit-view").addEventListener(
    "click",
    () => graphView.fitView(),
  );
  getRequiredElement<HTMLButtonElement>(
    "#clear-selection",
  ).addEventListener("click", () => graphView.select(null));

  const uploadButton =
    getRequiredElement<HTMLButtonElement>("#upload-data");
  const downloadButton =
    getRequiredElement<HTMLButtonElement>("#download-sample");
  const fileInput =
    getRequiredElement<HTMLInputElement>("#graph-file-input");
  uploadButton.addEventListener("click", () => fileInput.click());
  downloadButton.addEventListener("click", downloadExampleGraph);
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) {
      void importGraphFile(file, fileInput);
    }
  });

  const nodeShapeSelect =
    getRequiredElement<HTMLSelectElement>("#node-shape");
  nodeShapeSelect.addEventListener("change", () => {
    graphView.setStyle({
      nodeShape: parseNodeShape(nodeShapeSelect.value),
    });
  });

  const edgeStyleSelect =
    getRequiredElement<HTMLSelectElement>("#edge-style");
  edgeStyleSelect.addEventListener("change", () => {
    graphView.setStyle({
      edgeStyle: parseEdgeStyle(edgeStyleSelect.value),
    });
  });

  bindRangeControl({
    input: getRequiredElement<HTMLInputElement>("#dim-opacity"),
    output: getRequiredElement<HTMLOutputElement>("#dim-opacity-output"),
    initialValue: style.dimOpacity,
    format: (value) => `${Math.round(value * 100)}%`,
    apply: (value) => graphView.setStyle({ dimOpacity: value }),
  });
  bindRangeControl({
    input: getRequiredElement<HTMLInputElement>("#weight-strength"),
    output: getRequiredElement<HTMLOutputElement>(
      "#weight-strength-output",
    ),
    initialValue: style.weightStrength,
    format: (value) => `${value.toFixed(1)}×`,
    apply: (value) => graphView.setStyle({ weightStrength: value }),
  });
  bindRangeControl({
    input: getRequiredElement<HTMLInputElement>("#node-scale"),
    output: getRequiredElement<HTMLOutputElement>("#node-scale-output"),
    initialValue: style.nodeScale,
    format: (value) => `${value.toFixed(1)}×`,
    apply: (value) => graphView.setStyle({ nodeScale: value }),
  });
  bindRangeControl({
    input: getRequiredElement<HTMLInputElement>("#minimum-node-size"),
    output: getRequiredElement<HTMLOutputElement>(
      "#minimum-node-size-output",
    ),
    initialValue: style.minimumNodeSize,
    format: (value) => `${value.toFixed(1)} px`,
    apply: (value) => graphView.setStyle({ minimumNodeSize: value }),
  });
  bindRangeControl({
    input: getRequiredElement<HTMLInputElement>("#edge-width"),
    output: getRequiredElement<HTMLOutputElement>("#edge-width-output"),
    initialValue: style.edgeWidthScale,
    format: (value) => `${value.toFixed(1)}×`,
    apply: (value) => graphView.setStyle({ edgeWidthScale: value }),
  });
  bindRangeControl({
    input: getRequiredElement<HTMLInputElement>("#label-font-size"),
    output: getRequiredElement<HTMLOutputElement>(
      "#label-font-size-output",
    ),
    initialValue: style.labelFontSize,
    format: (value) => `${Math.round(value)} px`,
    apply: (value) => graphView.setStyle({ labelFontSize: value }),
  });
  bindRangeControl({
    input: getRequiredElement<HTMLInputElement>("#target-fps"),
    output: getRequiredElement<HTMLOutputElement>("#target-fps-output"),
    initialValue: targetFps,
    format: (value) => `${Math.round(value)} FPS`,
    apply: (value) => graphView.setTargetFps(value),
  });

  const labelsToggle =
    getRequiredElement<HTMLInputElement>("#show-labels");
  labelsToggle.checked = style.showLabels;
  labelsToggle.addEventListener("change", () => {
    graphView.setStyle({ showLabels: labelsToggle.checked });
  });

  const groupBoundsToggle = getRequiredElement<HTMLInputElement>(
    "#show-group-bounds",
  );
  groupBoundsToggle.checked = style.showGroupBounds;
  groupBoundsToggle.addEventListener("change", () => {
    graphView.setStyle({ showGroupBounds: groupBoundsToggle.checked });
  });

  const edgesToggle =
    getRequiredElement<HTMLInputElement>("#show-edges");
  edgesToggle.checked = style.showEdges;
  edgesToggle.addEventListener("change", () => {
    graphView.setStyle({ showEdges: edgesToggle.checked });
  });

  const edgeArrowsToggle =
    getRequiredElement<HTMLInputElement>("#show-edge-arrows");
  edgeArrowsToggle.checked = style.showEdgeArrows;
  edgeArrowsToggle.addEventListener("change", () => {
    graphView.setStyle({
      showEdgeArrows: edgeArrowsToggle.checked,
    });
  });

  const continuousToggle =
    getRequiredElement<HTMLInputElement>("#continuous-render");
  continuousToggle.checked = continuousRender;
  continuousToggle.addEventListener("change", () => {
    graphView.setContinuousRender(continuousToggle.checked);
  });

  setConfigStatus("配置面板已就绪");
}

/**
 * 读取用户上传的 JSON，并替换当前关系图数据。
 *
 * 支持 ObjectGraphPayload 和 SoA GraphPayload；解析或校验失败时保留
 * 当前图不变，只在配置面板中显示错误信息。
 *
 * @param file - 用户选择的 JSON 文件。
 * @param input - 文件输入控件，用于允许再次选择同一文件。
 * @returns 无返回值。
 */
async function importGraphFile(
  file: File,
  input: HTMLInputElement,
): Promise<void> {
  setConfigStatus(`正在读取 ${file.name}…`);
  try {
    const text = await file.text();
    const payload: unknown = JSON.parse(text);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("JSON 根节点必须是对象");
    }

    const uploadStartedAt = performance.now();
    const data = graphView.setData(
      payload as GraphPayload | ObjectGraphPayload | KnowledgeGraphPayload,
    );
    const uploadMs = performance.now() - uploadStartedAt;
    document
      .querySelectorAll<HTMLButtonElement>("[data-preset]")
      .forEach((button) => button.classList.remove("is-active"));
    document.title =
      `${formatCount(data.nodeCount)} 节点 · ` +
      `${formatCount(data.edgeCount)} 边 · 上传数据`;
    graphView.canvas.setAttribute(
      "aria-label",
      `${formatCount(data.nodeCount)} 个节点和 ` +
        `${formatCount(data.edgeCount)} 条边的上传关系图`,
    );
    window.graphStressInfo = {
      preset: "uploaded",
      nodeCount: data.nodeCount,
      edgeCount: data.edgeCount,
      generationMs: 0,
      loadMs: 0,
      uploadMs,
    };
    setConfigStatus(
      `${file.name} · ${formatCount(data.nodeCount)} 节点 · ` +
        `${formatCount(data.edgeCount)} 边`,
    );
    console.info("[traffic-graph upload]", window.graphStressInfo);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setConfigStatus(`上传失败：${message}`);
    console.error("[traffic-graph upload]", error);
  } finally {
    input.value = "";
  }
}

/**
 * 下载可直接上传的对象图 JSON 示例。
 *
 * @returns 无返回值。
 */
function downloadExampleGraph(): void {
  const content = `${JSON.stringify(objectGraphInputExample, null, 2)}\n`;
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "relationship-graph-example.json";
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  setConfigStatus("示例数据已下载，可直接修改后上传");
}

/**
 * 显示当前选中节点及其全部直接关联节点。
 *
 * DOM 只在选择事件发生时更新；点击关联节点可直接切换当前焦点。
 *
 * @returns 无返回值。
 */
function setupNeighborhoodPanel(): void {
  const panel =
    getRequiredElement<HTMLElement>("#neighborhood-panel");
  const title =
    getRequiredElement<HTMLElement>("#neighborhood-title");
  const summary =
    getRequiredElement<HTMLElement>("#neighborhood-summary");
  const list =
    getRequiredElement<HTMLUListElement>("#neighborhood-list");
  const closeButton =
    getRequiredElement<HTMLButtonElement>("#neighborhood-close");

  const clearPanel = (): void => {
    panel.hidden = true;
    title.textContent = "";
    summary.textContent = "";
    list.replaceChildren();
  };

  closeButton.addEventListener("click", () => graphView.select(null));
  graphView.on("data", clearPanel);

  graphView.on("select", ({ node, related }) => {
    if (!node) {
      clearPanel();
      return;
    }

    title.textContent = getNodeDisplayName(node);
    summary.textContent =
      related.length === 0
        ? "没有直接关联节点"
        : `${related.length} 个直接关联节点`;

    const fragment = document.createDocumentFragment();
    for (const relatedNode of related) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      const name = document.createElement("span");
      const metadata = document.createElement("span");
      const displayName = getNodeDisplayName(relatedNode);

      button.type = "button";
      button.className = "neighborhood-item";
      button.title = displayName;
      button.setAttribute("aria-label", `查看关联节点 ${displayName}`);
      button.addEventListener("click", () => {
        graphView.select(relatedNode.index);
      });

      name.className = "neighborhood-item-name";
      name.textContent = displayName;
      metadata.className = "neighborhood-item-meta";
      metadata.textContent = relatedNode.kind
        ? `${relatedNode.kind} · ${relatedNode.degree}`
        : `关联度 ${relatedNode.degree}`;

      button.append(name, metadata);
      item.append(button);
      fragment.append(item);
    }
    list.replaceChildren(fragment);
    panel.hidden = false;
    fitNeighborhoodOnGraph(node, related, panel);
  });
}

/**
 * 按节点标签和类型搜索当前图数据。
 *
 * 搜索只在用户停止输入后执行，并最多展示 24 条结果；点击或按回车
 * 会选中节点并复用现有邻域定位与面板显示流程。
 *
 * @returns 无返回值。
 */
function setupNodeSearch(): void {
  const input =
    getRequiredElement<HTMLInputElement>("#node-search-input");
  const summary =
    getRequiredElement<HTMLElement>("#node-search-summary");
  const results =
    getRequiredElement<HTMLUListElement>("#node-search-results");
  const maxResults = 24;
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  let matchedIndexes: number[] = [];

  const clearResults = (): void => {
    matchedIndexes = [];
    results.replaceChildren();
    results.hidden = true;
    summary.textContent = "";
  };

  const selectResult = (nodeIndex: number): void => {
    graphView.select(nodeIndex);
    const node = graphView.data?.getNodeDetails(nodeIndex);
    summary.textContent = node
      ? `已选择 ${getNodeDisplayName(node)}`
      : "已选择节点";
    results.hidden = true;
  };

  const runSearch = (): void => {
    const query = input.value.trim().toLocaleLowerCase();
    clearResults();
    if (!query) {
      return;
    }

    const data = graphView.data;
    if (!data) {
      summary.textContent = "图数据尚未加载";
      return;
    }

    const fragment = document.createDocumentFragment();
    matchedIndexes = [];
    for (
      let nodeIndex = 0;
      nodeIndex < data.nodeCount && matchedIndexes.length < maxResults;
      nodeIndex += 1
    ) {
      const label =
        data.nodeLabels?.[nodeIndex] ?? `节点 ${nodeIndex + 1}`;
      const kind = data.nodeKinds?.[nodeIndex] ?? "";
      if (
        !label.toLocaleLowerCase().includes(query) &&
        !kind.toLocaleLowerCase().includes(query) &&
        !String(nodeIndex + 1).includes(query)
      ) {
        continue;
      }

      matchedIndexes.push(nodeIndex);
      const item = document.createElement("li");
      const button = document.createElement("button");
      const labelElement = document.createElement("span");
      const metadata = document.createElement("span");
      button.type = "button";
      button.className = "node-search-result";
      button.title = label;
      button.setAttribute("aria-label", `选择节点 ${label}`);
      labelElement.className = "node-search-result-label";
      labelElement.textContent = label;
      metadata.className = "node-search-result-meta";
      metadata.textContent = kind || `#${nodeIndex + 1}`;
      button.append(labelElement, metadata);
      button.addEventListener("click", () => selectResult(nodeIndex));
      item.append(button);
      fragment.append(item);
    }

    results.append(fragment);
    results.hidden = matchedIndexes.length === 0;
    summary.textContent =
      matchedIndexes.length === 0
        ? "没有匹配节点"
        : `显示 ${matchedIndexes.length} 个匹配节点`;
  };

  input.addEventListener("input", () => {
    if (searchTimer !== null) {
      clearTimeout(searchTimer);
    }
    searchTimer = setTimeout(runSearch, 160);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && matchedIndexes.length > 0) {
      event.preventDefault();
      selectResult(matchedIndexes[0]);
    } else if (event.key === "Escape") {
      input.value = "";
      clearResults();
    }
  });

  graphView.on("data", () => {
    input.value = "";
    clearResults();
  });
}

/**
 * 获取节点在面板中的显示名称。
 *
 * @param node - 节点详情。
 * @returns 业务标签或稳定的节点编号。
 */
function getNodeDisplayName(node: NodeDetails): string {
  const label = node.label?.trim();
  return label || `节点 ${node.index + 1}`;
}

/**
 * 确保当前节点和全部直接关联节点位于画布可见区域。
 *
 * 只在至少一个关联节点超出视口时调整相机，避免每次选择都打断
 * 用户已经建立好的观察位置。右侧关联面板占用的空间会从适配区域
 * 中扣除。
 *
 * @param node - 当前选中节点。
 * @param related - 全部直接关联节点。
 * @param panel - 当前关联节点面板。
 * @returns 无返回值。
 */
function fitNeighborhoodOnGraph(
  node: NodeDetails,
  related: readonly NodeDetails[],
  panel: HTMLElement,
): void {
  if (related.length === 0) {
    return;
  }

  const camera = graphView.camera;
  const viewportWidth = camera.viewportWidth;
  const viewportHeight = camera.viewportHeight;
  const leftInset = 64;
  const topInset = 72;
  const bottomInset = 56;
  const panelInset = panel.getBoundingClientRect().width + 28;
  const safeRight = Math.max(
    leftInset + 160,
    viewportWidth - panelInset,
  );
  const safeBottom = Math.max(
    topInset + 160,
    viewportHeight - bottomInset,
  );
  const nodes = [node, ...related];

  const allVisible = nodes.every((item) => {
    const screenX =
      (item.x - camera.centerX) * camera.scale +
      viewportWidth * 0.5;
    const screenY =
      (item.y - camera.centerY) * camera.scale +
      viewportHeight * 0.5;
    return (
      screenX >= leftInset &&
      screenX <= safeRight &&
      screenY >= topInset &&
      screenY <= safeBottom
    );
  });
  if (allVisible) {
    return;
  }

  let minX = node.x;
  let minY = node.y;
  let maxX = node.x;
  let maxY = node.y;
  for (const relatedNode of related) {
    minX = Math.min(minX, relatedNode.x);
    minY = Math.min(minY, relatedNode.y);
    maxX = Math.max(maxX, relatedNode.x);
    maxY = Math.max(maxY, relatedNode.y);
  }

  const availableWidth = safeRight - leftInset;
  const availableHeight = safeBottom - topInset;
  const fitScale =
    Math.min(
      availableWidth / Math.max(1, maxX - minX),
      availableHeight / Math.max(1, maxY - minY),
    ) * 0.78;
  const scale = Math.max(
    camera.minScale,
    Math.min(camera.maxScale, fitScale),
  );
  const desiredScreenX = leftInset + availableWidth * 0.5;
  const desiredScreenY = topInset + availableHeight * 0.5;
  const centerX =
    (minX + maxX) * 0.5 +
    (viewportWidth * 0.5 - desiredScreenX) / scale;
  const centerY =
    (minY + maxY) * 0.5 +
    (viewportHeight * 0.5 - desiredScreenY) / scale;

  graphView.setView(centerX, centerY, scale);
}

/**
 * 打开或关闭配置面板。
 *
 * @param panel - 配置面板元素。
 * @param toggleButton - 配置入口按钮。
 * @param open - 是否打开。
 * @returns 无返回值。
 */
function setConfigPanelOpen(
  panel: HTMLElement,
  toggleButton: HTMLButtonElement,
  open: boolean,
): void {
  panel.hidden = !open;
  toggleButton.setAttribute("aria-expanded", String(open));
}

/**
 * 以当前视口中心为锚点缩放。
 *
 * @param factor - 缩放倍率。
 * @returns 无返回值。
 */
function changeZoom(factor: number): void {
  const view = graphView.getViewState();
  graphView.setView(
    view.centerX,
    view.centerY,
    Math.max(0.0001, Math.min(100000, view.scale * factor)),
  );
}

/**
 * 绑定范围控件并同步输出文本。
 *
 * @param binding - 范围输入、输出、初始值和回调配置。
 * @returns 无返回值。
 */
function bindRangeControl(binding: RangeControlBinding): void {
  const update = (value: number): void => {
    binding.output.value = binding.format(value);
    binding.apply(value);
  };
  binding.input.value = String(binding.initialValue);
  update(binding.initialValue);
  binding.input.addEventListener("input", () => {
    update(Number(binding.input.value));
  });
}

/**
 * 将配置状态写入面板底部。
 *
 * @param message - 状态文本。
 * @returns 无返回值。
 */
function setConfigStatus(message: string): void {
  getRequiredElement<HTMLElement>("#config-status").textContent = message;
}

/**
 * 查询一个必须存在的 DOM 元素。
 *
 * @param selector - CSS 选择器。
 * @returns 对应元素。
 */
function getRequiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`缺少配置控件：${selector}`);
  }
  return element;
}

/**
 * 将下拉框文本解析为节点形状名称。
 *
 * @param value - 下拉框值。
 * @returns 受支持的节点形状。
 */
function parseNodeShape(value: string): NodeShapeName {
  switch (value) {
    case "circle":
    case "square":
    case "diamond":
    case "triangle":
    case "hexagon":
    case "star":
    case "mixed":
      return value;
    default:
      return "image";
  }
}

/**
 * 将下拉框文本解析为边样式名称。
 *
 * @param value - 下拉框值。
 * @returns 受支持的边样式。
 */
function parseEdgeStyle(value: string): EdgeStyleName {
  if (value === "curve" || value === "dashed") {
    return value;
  }
  return "straight";
}
