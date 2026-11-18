# Traffic Graph Library

`GraphView` 是无 UI 的 WebGL2 关系图组件。它只管理 Canvas、标签层、渲染、交互、事件和生命周期，不创建控制面板、图例、统计或 Tooltip。

源码全部使用 TypeScript，并开启 `noImplicitAny`。所有类、属性、函数和方法均带 TSDoc 注释。

主示例页在应用层提供可收起的“配置”面板，包含数据规模、缩放、适配、节点形状、边样式、透明度、权重强度、尺寸、标签和持续渲染配置。该面板由 `src/main.ts` 管理，不属于 `GraphView` 库本身。

## 构建

```bash
npm install
npm run build:lib
```

产物：

```text
dist-lib/traffic-graph.js
src/lib/index.d.ts
```

包入口：

```ts
import { GraphView } from "china-transport-globe";
```

## 基本用法

```html
<div id="graph">
  <canvas id="graph-canvas"></canvas>
</div>
```

```css
#graph {
  position: relative;
  width: 100%;
  height: 100%;
}

#graph-canvas {
  display: block;
  width: 100%;
  height: 100%;
  background: #030b12;
}
```

```ts
import { GraphView } from "china-transport-globe";

const graph = new GraphView("#graph-canvas", {
  fitPadding: 0.9,
  style: {
    nodeShape: "image",
    edgeStyle: "straight",
    showLabels: true,
    showGroupBounds: true,
    labelFontSize: 10,
    weightStrength: 1,
  },
});

graph.setData(payload);
graph.fitView();
```

也可以直接传入业务对象图。节点和边使用字符串 ID 关联，坐标和
TypedArray 索引会由适配器自动生成：

```ts
graph.setData({
  groups: [
    { id: "root", label: "应用" },
    { id: "vite", label: "vite" },
  ],
  nodes: [
    { id: "app@1.0.0", name: "app", kind: "root", branch: "root" },
    { id: "vite@7.0.0", name: "vite", kind: "devDependency", branch: "vite" },
  ],
  edges: [
    { source: "app@1.0.0", target: "vite@7.0.0", kind: "devDependency" },
  ],
});
```

节点支持可选的 `x/y`、`size`、`weight`、`color` 和 `iconId`；边支持
可选的 `label`、`width` 和 `color`。缺少位置时按 `group` 或 `branch`
生成确定性的分组布局。

还可直接传入通用知识图谱：

```ts
graph.setData({
  schemaVersion: "1.0",
  title: "示例知识图谱",
  entities: [
    { id: "brand:byd", type: "brand", name: "比亚迪" },
    { id: "series:qin", type: "series", name: "秦车系" },
  ],
  relations: [
    {
      id: "relation:byd-qin",
      type: "owns",
      source: "brand:byd",
      target: "series:qin",
      label: "品牌拥有车系",
      directed: true,
    },
  ],
});
```

图片节点被选中时默认保留图标原始颜色。显式传入节点的 `color` 后会使用该自定义颜色；SoA 数据可通过 `nodeColorOverrides` 标记需要覆盖颜色的节点。

每个节点可使用独立图标：

```ts
graph.setData({
  nodes: [
    { id: "a", name: "A", icon: "data:image/svg+xml;base64,..." },
    { id: "b", name: "B", icon: "https://example.com/b.svg" },
  ],
  edges: [{ source: "a", target: "b" }],
});
```

图标会装入一张共享 16×16 图集，最多 256 个不同图标；重复 URL 自动复用。跨域图片服务器必须允许 CORS，否则会显示占位图标。

`payload` 使用 `docs/high-performance-graph.md` 中定义的 SoA TypedArray 数据契约。普通数值数组会自动转换为对应 TypedArray。

## 颜色格式

样式、节点颜色和边颜色都支持以下格式：

```ts
graph.setStyle({
  backgroundColor: "#030b12",
  highlightColor: 0x69f2ffff,
});

graph.setData({
  ...payload,
  nodeColors: [
    "#53e1ff",
    "#75f5b6cc",
    "rgb(255, 209, 102)",
    "rgba(255, 125, 125, 0.8)",
    [167, 139, 250, 0.95],
    [0.16, 0.65, 1, 1],
    0x5eead4,
  ],
  edgeColors: [
    0x53e1ff68,
    "#f47ab280",
    "rgba(117, 245, 182, 0.55)",
  ],
});
```

支持的完整格式：

- `#RGB`、`#RGBA`
- `#RRGGBB`、`#RRGGBBAA`
- `0xRRGGBB`、`0xRRGGBBAA`
- 十进制整数，例如 `16711680`
- CSS `rgb(r,g,b)`、`rgba(r,g,b,a)`
- CSS 空格语法，例如 `rgb(255 136 0 / 50%)`
- RGB/RGBA 数组；RGB 可传 0～255 或 0～1，alpha 单独按 0～1 或 0～255 判断
- 扁平 RGBA `Uint8Array`

`nodeColors` 和 `edgeColors` 可传“每节点/每条边一个颜色”，也可传长 `Uint8Array` 扁平 RGBA 字节数组。

## API

### 数据

```ts
graph.setData(payload, { fit: true });
const data = graph.data;
```

### 样式

```ts
graph.setStyle({
  nodeShape: "circle",
  edgeStyle: "curve",
  showLabels: false,
  showGroupBounds: false,
  labelFontSize: 12,
  edgeWidthScale: 1.2,
  showEdges: true,
  showEdgeArrows: true,
});
```

`showGroupBounds` 默认开启，用于控制分组包围圈和组名；设为 `false` 时仍保留节点标签。`showEdgeArrows` 默认开启，在每条边的起点和终点节点轮廓处各绘制一个箭头；箭头继承该边的颜色、透明度和选中高亮。

### 视图与渲染

```ts
graph.fitView();
graph.setView(centerX, centerY, scale);
graph.setTargetFps(60);
graph.setContinuousRender(true);
graph.requestRender();
```

### 选择和邻域

```ts
graph.select(nodeId);
const neighbors = graph.getRelatedNodes(nodeId);
graph.select(null);
```

### 事件

```ts
const offHover = graph.on("hover", ({ nodeId, node, clientX, clientY }) => {
  // 业务侧自行创建 Tooltip
});

graph.on("select", ({ nodeId, node, related }) => {
  // 业务侧自行创建选择面板
});

graph.on("nodedrag", ({ nodeId, x, y }) => {});
graph.on("viewchange", (viewState) => {});
graph.on("framemetrics", ({ fps, frameMs, drawCalls }) => {});
```

### 导出与销毁

```ts
const png = await graph.exportImage("image/png");
graph.dispose();
```

## 标签策略

- 节点数不超过 200 时，显示视口内全部标签。
- 超过 200 后自动启用碰撞过滤、高权重优先和标签预算。
- FPS 不足时先减少普通标签，继续不足时暂时隐藏普通标签。
- 选中节点和全部直接邻居的标签绕过高权重抽样、碰撞过滤和 FPS 预算。
- 每个实际拥有节点的分组会显示淡色包围气泡和分组标签；选中节点时只突出相关分组。
- `showLabels` 是节点标签和分组标签的总开关；关闭后任何性能状态都不会绘制标签。
- `showGroupBounds` 单独控制分组包围圈与组名，关闭后节点标签和关系边不受影响。

## 窗口尺寸

`GraphView` 使用 `ResizeObserver` 监听 Canvas。尺寸变化后会同步重绘当前帧，避免 drawing buffer 重建期间出现空白或黑屏。若通过 `backgroundColor` 修改清屏色，请同步设置 Canvas 的 CSS `background`，保证重绘瞬间底色一致。

## 数据示例

- 随机压测合成图：[main.ts](../src/main.ts)
- 比亚迪品牌 / 技术 → 车系关系图：[byd-series-graph.ts](../src/examples/byd-series-graph.ts)
- 南昌起义人物谱：[nanchang-uprising-graph.ts](../src/examples/nanchang-uprising-graph.ts)
- 真实 npm 依赖子图：[package-dependency-graph.ts](../src/examples/package-dependency-graph.ts)
- 对象图与 SoA 示例：[relationship-payload.ts](../src/examples/relationship-payload.ts)
- npm 依赖图转换：[NpmDependencyGraph.ts](../src/graph/NpmDependencyGraph.ts)
