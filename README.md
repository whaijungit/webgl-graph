# webgl-graph · WebGL2 高性能关系图

`traffic-globe` 是一个基于 **TypeScript + Vite + WebGL2** 的高性能关系网络原型。项目名称沿用原交通球项目，但当前核心已经迁移为通用关系图：数据以 SoA TypedArray 组织，支持交互选择、直接邻域高亮、图片图标、共享 Canvas 标签、边样式和百万节点级压测。

默认演示为比亚迪品牌 / 技术 → 车系 → 车型关系图；南昌起义人物关系通过 `?preset=nanchang` 打开，npm 依赖示例通过 `?preset=dependencies` 打开，随机 **100 个节点 / 3,000 条边** 图可通过 `?preset=default` 打开。节点数达到 **100,000** 后自动切换为 Point Sprite 大图渲染路径。

## 主要能力

- WebGL2 实例化渲染，CPU 热路径主要维护 TypedArray 和 GPU buffer。
- `GraphView.setData()` 同时接受运行时 `GraphData`、SoA `GraphPayload`、业务对象 `ObjectGraphPayload` 和通用 `KnowledgeGraphPayload`。
- 点击节点显示直接邻居、原始图标、标签和关联边；点击其他节点切换邻域，点击空白区域清除选择。
- 邻域节点保留各自的 `nodeColors` 和 `nodeIconIds`，关联边保留各自的 `edgeColors`。
- 选中图片节点默认保留原始图标色，显式提供 `color` 时使用自定义颜色。
- 支持圆形、方形、菱形、三角形、六边形、星形、混合形状和图片图标。
- 每个节点可通过 `icon` 或 `nodeIconSources` 提供独立 URL/Data URL 图标，内部合并到共享图集。
- 支持直线、曲线和虚线边；直线使用片元级抗锯齿。
- 有向边只在 `target` 节点轮廓处显示一个方向箭头，箭头与边共用实例、颜色和透明度。
- 节点标签共享一个 Canvas 2D 图层，不创建逐节点 DOM。
- 默认按需渲染；可持续渲染并按 30～60 FPS 控制目标帧率。
- 左下角提供 `stats.js` FPS 面板，开启持续渲染或进行交互时实时刷新。
- 配置面板支持节点搜索、JSON 数据上传和示例数据下载。

## 快速开始

建议使用 Node.js 20.19+ 或 22.12+。

```bash
npm install
npm run dev
```

开发服务器通常运行在 `http://localhost:5173/`，实际地址以 Vite 输出为准。

生产预览：

```bash
npm run build
npm run preview
```

预览地址固定为 `http://127.0.0.1:4317`。

## 压测数据

主页面通过 URL 参数选择合成数据规模：

```text
http://localhost:5173/?preset=100k
http://localhost:5173/?preset=300k
http://localhost:5173/?preset=600k
http://localhost:5173/?preset=1m
```

| 预设 | 节点 | 边 | 社区 |
| --- | ---: | ---: | ---: |
| `preset=default` | 100 | 3,000 | 10 |
| `100k` | 100,000 | 200,000 | 48 |
| `300k` | 300,000 | 600,000 | 64 |
| `600k` | 600,000 | 1,200,000 | 96 |
| `1m` | 1,000,000 | 2,000,000 | 128 |

可使用 `nodes`、`edges`、`clusters` 和 `seed` 覆盖数量与随机种子：

```text
http://localhost:5173/?preset=100k&nodes=150000&edges=350000
```

持续渲染和 FPS 采样：

```text
http://localhost:5173/?preset=300k&continuous=1&fps=60
```

更多压测说明见 [docs/performance-testing.md](docs/performance-testing.md)。

## 交互

- 在空白区域拖拽：平移画布。
- 在节点上拖拽：只移动该节点及其关联边，不移动相机。
- 滚轮：以指针位置为中心缩放。
- 点击节点：显示焦点、全部直接邻居、关联边和邻居标签。
- 点击其他节点：切换焦点邻域。
- 点击空白区域：清除选择。
- 配置面板：切换数据规模、上传数据、下载示例、缩放、适配视图和调整样式。
- 显示配置可单独关闭“边方向箭头”。

演示页会在浏览器控制台暴露以下调试对象：

```js
window.graphView;
window.graphStressInfo;
window.graphLastFrame;
window.graphMetrics;
```

## 作为库使用

公共入口为 `src/lib/index.ts`，类型声明入口为 `src/lib/index.d.ts`。构建公共库：

```bash
npm run build:lib
```

产物为 `dist-lib/traffic-graph.js`。包名和导入方式：

```ts
import { GraphView } from "china-transport-globe";
```

最小 HTML 结构：

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

业务对象图用法：

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
  },
});

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
    {
      source: "app@1.0.0",
      target: "vite@7.0.0",
      kind: "devDependency",
    },
  ],
});
```

对象图不需要预先计算 GPU 坐标或 TypedArray：

- `nodes[].id` 必须唯一，边的 `source/target` 必须引用节点 ID。
- `node.group` 优先，其次使用 `node.branch` 关联 `groups[].id`。
- 缺少分组时会根据节点字段推导；缺少坐标时会生成确定性的分组布局。
- 节点可选 `x/y/size/weight/color/iconId`；边可选 `label/width/color`。
- 边的 GPU 端点坐标由节点位置自动生成。

完整 API、颜色格式和事件说明见 [docs/library.md](docs/library.md)。

## 数据格式

### 业务对象图

`ObjectGraphPayload` 适合直接接入业务数据：

```ts
interface ObjectGraphPayloadExample {
  groups?: { id: string; label?: string | null }[];
  nodes: {
    id: string;
    name?: string | null;
    label?: string | null;
    kind?: string | null;
    group?: string | null;
    branch?: string | null;
    x?: number;
    y?: number;
    size?: number;
    weight?: number;
    color?: ColorInput;
    iconId?: number;
  }[];
  edges: {
    source: string;
    target: string;
    kind?: string | null;
    label?: string | null;
    width?: number;
    color?: ColorInput;
  }[];
}
```

### SoA GraphPayload

大规模数据应直接使用连续 TypedArray：

```text
nodePositions    Float32Array  2 x N
nodeSizes        Float32Array    N
nodeColors       Uint8Array     4 x N
nodeColorOverrides Uint8Array   N, optional
nodeGroups       Uint16Array     N
nodeIconIds      Uint8Array      N, optional
nodeWeights      Float32Array    N, optional
nodeLabels       string[]        N, optional
nodeKinds        string[]        N, optional
groupLabels      string[]        G, optional
edgeSources      Uint32Array     E
edgeTargets      Uint32Array     E
edgePositions    Float32Array  4 x E
edgeWidths       Float32Array    E
edgeColors       Uint8Array     4 x E
edgeKinds        string[]        E, optional
```

普通数值数组会在装载时转换为对应 TypedArray。节点颜色和边颜色支持 CSS 颜色、十六进制整数、RGB/RGBA 元组以及扁平 RGBA 字节数组。

完整数据契约见 [docs/high-performance-graph.md](docs/high-performance-graph.md)；可直接上传的对象图示例位于 [src/examples/relationship-payload.ts](src/examples/relationship-payload.ts)。

## 渲染策略

### 小图

节点数小于 100,000 时：

- 每个节点使用四顶点图标四边形实例化绘制。
- 点击节点时，图片模式使用邻域覆盖层保留邻居自己的图标和颜色；圆形、方形等模式使用独立高亮 pass 最后绘制邻域，保持当前选择的节点形状。
- 普通状态通常为 2 个 draw call：边、节点。
- 选中状态通常为 3 个 draw call：边、普通节点、邻域高亮 pass 或图片覆盖层。

### 大图

节点数至少为 100,000 时：

- 每个节点使用一个 Point Sprite 顶点，并通过 `uNodeShape` 支持全部节点形状。
- 图片模式由 `nodeIconIds` 绘制图标；其他形状使用轻量片元 SDF，不会退回图标。
- 当前视口内的全部节点都会提交，不按节点预算或实例序号抽样。
- 当前焦点最后提交，直接邻居紧随其后，避免被普通节点覆盖。
- 选中节点约放大到 40～60px，直接邻居至少约 24px。
- 大图选中状态仍为 2 个 draw call：边、节点。

性能不足时，降级主要发生在普通边预算、Point Sprite 片元尺寸和普通标签预算；焦点、全部直接邻居及其关联边始终绕过 LOD。

## 项目结构

```text
traffic-globe/
├─ index.html
├─ src/
│  ├─ main.ts                       # 演示装配、配置面板、上传与邻域面板
│  ├─ examples/
│  │  ├─ demo-graph.ts                # 内置示例公共接口与装载器
│  │  ├─ demo-registry.ts             # 示例选择与 URL 映射
│  │  ├─ byd-series-graph.ts          # 比亚迪默认关系图
│  │  ├─ nanchang-uprising-graph.ts   # 南昌起义人物与指挥关系
│  │  ├─ package-dependency-graph.ts # 真实 npm 构建依赖示例
│  │  └─ relationship-payload.ts    # SoA 与对象图示例
│  ├─ graph/
│  │  ├─ GraphData.ts               # SoA 数据校验与访问
│  │  ├─ GraphDataService.ts        # Worker 生命周期
│  │  ├─ NodeAdjacencyIndex.ts      # CSR 邻接索引
│  │  ├─ ObjectGraphAdapter.ts      # 对象图转 SoA
│  │  └─ SyntheticGraphGenerator.ts # 合成数据
│  ├─ interaction/
│  │  ├─ GraphInteractionController.ts
│  │  └─ SpatialNodeIndex.ts
│  ├─ lib/
│  │  ├─ GraphView.ts
│  │  ├─ index.ts
│  │  ├─ index.d.ts
│  │  └─ types.ts
│  └─ render/
│     ├─ GraphRenderer.ts
│     ├─ NodeRenderer.ts
│     ├─ NodeLabelRenderer.ts
│     ├─ EdgeRenderer.ts
│     ├─ HighlightOverlayRenderer.ts
│     ├─ NodeIconAtlas.ts
│     └─ GraphStyle.ts
├─ docs/
│  ├─ library.md
│  ├─ high-performance-graph.md
│  └─ performance-testing.md
└─ package.json
```

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run typecheck` | 运行 TypeScript 类型检查 |
| `npm run build` | 构建演示页面 |
| `npm run build:lib` | 构建公共库到 `dist-lib/` |
| `npm run build:npm-sample` | 重新生成 npm 依赖关系数据快照 |
| `npm run preview` | 在 `http://127.0.0.1:4317` 预览构建结果 |

完成修改后至少运行：

```bash
npm run typecheck
npm run build
```

修改公共库或类型声明时额外运行：

```bash
npm run build:lib
```

浏览器侧还应确认没有 WebGL shader 编译错误，且 `renderer.gl.getError()` 返回 `0`。

## 相关文档

- [库 API 与使用方式](docs/library.md)
- [高性能关系图实现](docs/high-performance-graph.md)
- [大图压测与指标](docs/performance-testing.md)
- [工程架构与约束](AGENTS.md)
