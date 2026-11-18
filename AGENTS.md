# AGENTS.md

本文件定义 `traffic-globe` 当前工程状态、架构约束、数据契约、交互规则和验证要求。修改此模块时，应同时遵守本文件和仓库上层目录中的 `AGENTS.md`。

## 当前工程状态

- 项目是 TypeScript + Vite 的 WebGL2 高性能关系网络原型，入口示例为 `index.html` 和 `src/main.ts`。
- 公共库入口为 `src/lib/index.ts`，类型入口为 `src/lib/index.d.ts`。
- `GraphView.setData()` 同时接受运行时 `GraphData`、SoA `GraphPayload` 和业务对象图 `ObjectGraphPayload`。
- 默认演示数据为 **100 个节点 / 3,000 条边 / 10 个社区**。
- 默认节点外观为图片图标；节点数达到 `100,000` 后切换为 Point Sprite 大图路径。
- 数据规模区域支持 JSON 上传和示例数据下载；上传数据通过 `GraphView.setData()` 装载。
- 当前仓库分支为 `dev`，远程名为 `origin`。

## 运行与验证

```bash
npm install
npm run typecheck
npm run dev
npm run build
npm run build:lib
```

- `npm run dev` 使用 Vite 默认开发端口；当前启动后通常为 `http://localhost:5173/`，具体地址以 Vite 输出为准。
- `npm run preview` 固定使用 `http://127.0.0.1:4317`。
- 当前没有 `examples/custom-graph.html`；对象图输入示例位于 `src/examples/relationship-payload.ts`。
- 所有源码均为 TypeScript，语法和类型检查统一使用 `npm run typecheck`。

完成修改后至少验证：

1. `npm run typecheck` 通过。
2. `npm run build` 通过；修改公共库或类型时额外运行 `npm run build:lib`。
3. 页面没有 WebGL shader 编译错误。
4. `renderer.gl.getError()` 返回 `0`。
5. 默认数据量为 `100 / 3,000`。
6. 点击节点后直接邻居节点、原始图标、标签和关联边均正常显示。
7. 点击其他节点可切换邻域，点击空白区域可清除选择。
8. 缩放到不同级别时，当前视口内节点不得因节点预算或实例序号被删除。
9. `preset=1m` 时 Point Sprite 提交数量应等于当前可见节点数。
10. 关联节点必须保留 `nodeColors` 和 `nodeIconIds`，不得统一改成高亮色或同一种图标。

## 核心对象

| 类或模块 | 文件 | 职责 |
| --- | --- | --- |
| `GraphView` | `src/lib/GraphView.ts` | 库入口、数据装载、相机、渲染、交互、事件和生命周期 |
| `GraphDataService` | `src/graph/GraphDataService.ts` | Worker 生命周期和 transferable ArrayBuffer |
| `SyntheticGraphGenerator` | `src/graph/SyntheticGraphGenerator.ts` | 合成节点和边 |
| `GraphData` | `src/graph/GraphData.ts` | 校验并持有 SoA TypedArray |
| `ObjectGraphAdapter` | `src/graph/ObjectGraphAdapter.ts` | 将 `{ groups, nodes, edges }` 转换为 SoA GraphPayload |
| `NodeAdjacencyIndex` | `src/graph/NodeAdjacencyIndex.ts` | CSR 无向邻接索引和关联边索引 |
| `GraphHighlightMask` | `src/render/GraphHighlightMask.ts` | 生成当前焦点和直接邻居的 0/1 标记 |
| `GraphRenderer` | `src/render/GraphRenderer.ts` | 绘制编排、邻域切换、可见性和边 LOD |
| `NodeRenderer` | `src/render/NodeRenderer.ts` | 节点实例化、SDF、图片图标和大图 Point Sprite |
| `NodeLabelRenderer` | `src/render/NodeLabelRenderer.ts` | 共享 Canvas 标签、碰撞过滤和标签 LOD |
| `EdgeRenderer` | `src/render/EdgeRenderer.ts` | 直线、曲线、虚线、抗锯齿和关联边强调 |
| `NodeIconAtlas` | `src/render/NodeIconAtlas.ts` | 图片节点共享纹理图集 |
| `HighlightOverlayRenderer` | `src/render/HighlightOverlayRenderer.ts` | 小图邻域节点使用原图标放大绘制 |
| `GraphStyle` | `src/render/GraphStyle.ts` | 样式对象和配置校验 |
| `Camera2D` | `src/render/Camera2D.ts` | 中心、缩放和视口 |
| `SpatialNodeIndex` | `src/interaction/SpatialNodeIndex.ts` | 局部拾取和视口节点查询 |
| `GraphInteractionController` | `src/interaction/GraphInteractionController.ts` | 拖拽、缩放、悬停和点击 |
| 演示装配 | `src/main.ts` | 压测数据、配置面板、邻域面板和相机适配，不属于库核心 |

## 输入数据格式

### SoA `GraphPayload`

`GraphData` 使用结构数组，不维护节点对象数组：

```text
nodePositions    Float32Array  2 x N
nodeSizes        Float32Array    N
nodeColors       Uint8Array     4 x N
nodeGroups       Uint16Array     N
nodeIconIds      Uint8Array      N, optional, default index % 8
nodeWeights      Float32Array    N, optional, default undirected degree
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

普通数值数组会在装载时转换为对应 TypedArray。`nodeWeights` 缺失时，使用无向连接度取对数并归一化；原始权重用于提示信息，归一化权重用于节点尺寸。

颜色字段支持 CSS 颜色、十六进制整数、RGB/RGBA 元组和扁平 RGBA 字节数组。

### 业务对象图 `ObjectGraphPayload`

`GraphView.setData()` 可直接接收：

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
    {
      source: "app@1.0.0",
      target: "vite@7.0.0",
      kind: "devDependency",
    },
  ],
});
```

对象图规则：

- `nodes[].id` 必须唯一，边的 `source/target` 必须引用节点 ID。
- `node.group` 优先，其次 `node.branch`，用于关联 `groups[].id`。
- 分组缺失时会根据节点字段自动推导；未知边端点、重复节点 ID 和重复分组 ID 必须抛出明确错误。
- 节点可选 `x/y/size/weight/color/iconId`；边可选 `label/width/color`。
- 缺少坐标时由 `ObjectGraphAdapter` 生成确定性的分组布局。
- 边的 GPU 端点坐标由节点位置自动生成，业务侧不需要传 `edgePositions`。
- 业务对象只允许在装载阶段转换，禁止在每帧把对象图重新转换为 GPU 数据。
- 修改对象图字段时必须同步更新 `src/lib/types.ts` 和 `src/lib/index.d.ts`。

## 邻域交互与显示

1. 鼠标悬停通过 `SpatialNodeIndex` 做局部拾取，只显示节点提示。
2. 点击节点后，`NodeAdjacencyIndex` 读取直接邻居和关联边。
3. `GraphHighlightMask` 生成焦点和直接邻居标记；重复边产生的邻居必须按节点去重。
4. 小图通过 `HighlightOverlayRenderer` 使用每个邻居自己的 `nodeIconIds` 放大绘制。
5. 大图 Point Sprite 使用每个节点自己的图标索引，只放大、恢复透明度和调整绘制顺序。
6. `EdgeRenderer` 根据焦点 ID 判断关联边，只提高透明度和线宽，保留 `edgeColors`。

不能破坏的交互规则：

- 悬停不显示邻域关系。
- 点击节点后才高亮直接邻居和关联边。
- 点击其他节点切换焦点邻域，点击空白区域清除选择。
- 按在节点上拖动只移动该节点及其关联边，不移动相机；按在空白处拖动仍平移画布。
- 点击节点后必须显示全部直接邻居标签；演示侧邻域面板同时列出邻居名称。
- 关联节点使用自己的原始图片图标和原始颜色。
- 节点选中和关联显示不得修改 `nodeColors`；大数据和小数据行为一致。
- 关联节点只放大显示，不额外绘制高亮圆环或外框。
- 关联边可以加粗，但必须继续使用每条边自己的颜色。
- 非关联节点和非关联边降低透明度，而不是完全删除。
- 若关联节点不在画布安全区域内，演示侧可自动适配相机，但不能改变节点数据。
- “直线”模式必须使用片元级抗锯齿，不能因亚像素宽度出现断裂。

## 渲染路径

### 小图路径（少于 100,000 节点）

- 节点使用四顶点图标四边形实例化绘制。
- 点击节点时额外绘制 `HighlightOverlayRenderer`，覆盖层只用于焦点邻域。
- 普通状态通常为 2 个 draw call：边、节点。
- 选中状态通常为 3 个 draw call：边、普通节点、邻域覆盖层。

### 大图 Point Sprite 路径（至少 100,000 节点）

- 每个节点使用一个 Point Sprite 顶点，图标由 `nodeIconIds` 在片元着色器中绘制。
- 当前视口内的全部节点必须写入 Point Sprite 索引，不得按节点预算或实例序号抽样。
- 当前焦点必须最后提交，直接邻居紧随其后，避免被普通节点覆盖。
- 远景 Point Sprite 使用可调 `minimumNodeSize` 下限，默认约 `3～9px`；放大后继续按权重增长。
- 关联节点至少约 `24px`，当前节点约 `40～60px`。
- 大图不创建 `HighlightOverlayRenderer` 绘制，选中状态仍为 2 个 draw call。

## 邻域标记属性

`NodeRenderer` 的邻域标记缓冲使用归一化 `UNSIGNED_BYTE`：

```text
非关联节点 -> 0
关联节点   -> 255
```

不要上传 `0/1`。归一化属性会把字节 `1` 读取为约 `0.0039`，小于着色器的关联判断阈值 `0.5`，导致大图邻居被错误压暗。

## 性能策略

- 默认启用按需渲染，静止时不持续重绘。
- 连续渲染和交互渲染按目标 FPS 限制；演示界面允许在 `30～60 FPS` 调整。
- 性能不足时降低普通边预算、标签预算和 Point Sprite 片元成本。
- 当前视口内节点必须全部显示，节点预算不得删除视口节点。
- 选中节点和全部直接邻居始终绕过 LOD。
- 边保留可见预算；每条实际绘制的边，其两个端点必须满足节点可见条件。
- 大图设备像素比上限：至少 250,000 节点为 `1`，至少 100,000 节点为 `1.5`，其余为 `2`。
- 不要在 HUD 中使用大面积 `backdrop-filter`。
- 不要为节点创建 DOM `<img>`、SVG、独立 Canvas 或逐节点 DOM 文本。
- 节点标签必须共用一个 Canvas 2D 图层；节点数超过 200 后启用碰撞过滤和预算。
- 标签预算应随实时 FPS 降级和恢复；焦点与直接邻居标签始终绕过普通标签预算。
- 低权重节点必须保留可调整的 `minimumNodeSize` 像素下限，不能因权重继续缩小到不可见。
- 不要把平滑边退化为 `gl.LINES`。

## 样式配置

当前演示通过 `graphView.setStyle()` 修改样式，使用 `window.graphView` 调试，不依赖 lil-gui 或旧版 `GraphApplication`。

```js
graphView.setStyle({
  nodeShape: "image",
  edgeStyle: "straight",
  dimOpacity: 0.1,
  weightStrength: 1,
  showLabels: true,
  labelFontSize: 10,
  nodeScale: 1,
  minimumNodeSize: 3,
  edgeWidthScale: 1,
  showEdges: true,
  highlightColor: [0.42, 0.95, 1, 0.95],
});
```

支持节点圆形、方形、菱形、三角形、六边形、星形、混合形状和图片图标；支持直线、曲线和虚线。样式变化必须通过 `GraphStyle`，渲染器不得直接读取 DOM。

## 已知问题和关键修复

### CSR 游标必须从 0 开始

`NodeAdjacencyIndex` 的写入游标必须使用 `new Uint32Array(nodeCount)`。不要使用 `new Uint32Array(degrees)`，后者会把连接度作为初始游标，导致写入越界。

### 交错属性必须逐 location 绑定

`HighlightOverlayRenderer` 的元数据布局为 `[radius, accent, iconIndex]`：

```text
location 2 -> stride 12, offset 0
location 3 -> stride 12, offset 4
location 4 -> stride 12, offset 8
```

不能只在 location 2 设置 `size = 3`。

### 原图标和原颜色不能被统一替换

直接邻居必须使用各自的 `nodeIconIds` 和 `nodeColors`。选中、悬停或关联状态只改变尺寸、透明度、线宽和绘制顺序，不得把节点 RGB 改成统一高亮色。

### 边颜色不能被统一高亮

关联边继续使用 `edgeColors` 中的 RGB，只提高透明度和线宽。

### 重复边与唯一邻居

CSR 中可能因重复边出现同一个邻居多次。面板、标签、覆盖层和邻域结果显示必须按节点 ID 去重，但关联边查询仍需保留全部重复边。

### Point Sprite 不能按预算抽样视口节点

1m 数据曾仅提交约 21,000 个节点，导致用户只看到部分节点。大图 Point Sprite 索引必须包含全部可见节点，并通过更小的远景片元尺寸控制成本。

### 大图关联节点必须最后绘制

普通实例顺序按权重排列，不能让邻居覆盖当前焦点。Point Sprite 索引应最后追加当前焦点。

### 直线必须做片元级 AA

直线几何四边形包含覆盖空间，片元着色器根据到线中心的距离生成 coverage。不要只缩小 `< 1px` 的四边形。

### 节点不能因 LOD 缺失

当前视口内的节点必须全部显示。缩放查询使用 `SpatialNodeIndex.collectInBounds()`；选中节点和邻居强制加入可见集合。

### 缩小视图时空间索引不能遍历无限空网格

`SpatialNodeIndex.collectInBounds()` 和 `pick()` 的网格范围必须钳制到实际节点占用边界。

### 调整窗口尺寸时必须避免空白帧

WebGL canvas 修改 drawing buffer 会清空内容。`GraphView.resize()` 必须在尺寸变化后同步重绘，并保持透明合成背景与 `GraphStyle.backgroundColor` 一致。

### 边 LOD 与节点可见性必须同步

边抽样必须先过滤为至少一端连接可见节点的候选边，再在候选边中抽样。所有实际绘制边的端点必须写入节点可见集合。

## 修改边界

- 渲染热路径中不得遍历业务节点对象。
- 每帧新增数据优先使用 TypedArray、连续缓冲和 GPU buffer。
- 节点拖动必须使用局部 `bufferSubData` 更新节点坐标和关联边端点。
- 邻域查询不得在每次 `pointermove` 中扫描全图。
- 样式变化通过 `GraphStyle`，不要让渲染器读取 DOM。
- 新交互必须同时考虑普通状态和选中状态。
- 修改 Worker 数据格式时同步更新 `GraphData`、渲染器、类型声明和 `docs/high-performance-graph.md`。
- 修改对象图输入格式时同步更新 `ObjectGraphAdapter`、`src/lib/types.ts`、`src/lib/index.d.ts` 和 `docs/library.md`。
- 节点选中时必须保留原始颜色、图标和单节点数据，大图与小图行为一致。

## 扩展方向

- 自定义图片：扩展 `NodeIconAtlas` 的图集单元和 `nodeIconIds` 有效范围。
- 多跳邻居：基于 CSR 做受限 BFS，仍然只更新邻域标记。
- 自定义边路径：在导入阶段采样为折线或贝塞尔曲线。
- 更高级 LOD：为边建立空间分块或层次聚类，节点仍保持视口内完整显示。
- WebGPU：需要 GPU compute、indirect draw 或更大规模时再引入。
