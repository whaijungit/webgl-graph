# AGENTS.md

本文件定义 `traffic-globe` 中高性能关系图模块的架构约束、交互规则、数据契约和验证要求。修改此模块时，应同时遵守本文件和仓库上层目录中的 `AGENTS.md`。

## 项目目标

本项目是一个基于 WebGL2 的高性能关系网络可视化原型。核心目标不是创建几十万个 JavaScript 图元对象，而是：

- 使用连续 TypedArray 保存图数据。
- 使用 Instanced Rendering 绘制节点和边。
- 在 Web Worker 中生成或预处理大数据。
- 悬停只做局部拾取，点击后才显示直接关联节点。
- 在保持高权重节点可见的同时控制远景片元成本。

默认数据为 **100 个节点 / 3,000 条边 / 10 个社区**，默认节点外观为图片图标。

## 运行与验证

```bash
npm install
npm run dev
npm run build
```

开发服务器由 `vite.config.js` 配置在 `http://127.0.0.1:4317`。

完整自定义数据示例：

```text
http://127.0.0.1:4317/examples/custom-graph.html
```

示例源码位于 [examples/custom-graph.html](examples/custom-graph.html) 和 [src/examples/custom-graph.js](src/examples/custom-graph.js)。

完成修改后至少验证：

1. `npm run build` 通过。
2. 页面没有 WebGL shader 编译错误。
3. `renderer.gl.getError()` 返回 `0`。
4. 默认数据量为 `100 / 3,000`。
5. 点击节点后邻居节点、原图标和关联边正常显示。
6. 点击空白区域能够清除选择。

所有 `src/**/*.js` 可用以下命令检查语法：

```powershell
Get-ChildItem -Path src -Recurse -Filter *.js | ForEach-Object {
  node --check $_.FullName
}
```

## 不能破坏的交互规则

- 鼠标悬停只显示节点提示，不显示邻域关系。
- 点击节点后才高亮直接邻居和关联边。
- 按在节点上拖动只移动该节点及其关联边，不移动相机；按在空白处拖动仍平移画布。
- 点击节点后必须显示全部直接邻居的标签；选中面板同时列出邻居名称，避免标签被 HUD 遮挡后无法识别。
- 点击其他节点切换焦点邻域。
- 点击空白区域清除选择。
- 关联节点使用自己的原始图片图标，不能统一替换成同一种图标。
- 关联节点直接放大显示，不额外绘制圆环或外框。
- 关联边可以加粗，但必须继续使用每条边自己的原始颜色。
- 非关联节点和非关联边降低透明度，而不是完全删除。
- “直线”模式必须使用片元级抗锯齿，不能因亚像素宽度出现断裂。

## 核心对象

| 类 | 文件 | 职责 |
| --- | --- | --- |
| `GraphView` | [src/lib/GraphView.js](src/lib/GraphView.js) | 无 UI 库入口、渲染、交互、事件和生命周期 |
| `GraphApplication` | [src/GraphApplication.js](src/GraphApplication.js) | 旧版带 HUD 演示装配，不属于库入口 |
| `GraphDataService` | [src/graph/GraphDataService.js](src/graph/GraphDataService.js) | Worker 生命周期和 transferable ArrayBuffer |
| `SyntheticGraphGenerator` | [src/graph/SyntheticGraphGenerator.js](src/graph/SyntheticGraphGenerator.js) | 合成节点和边 |
| `GraphData` | [src/graph/GraphData.js](src/graph/GraphData.js) | 校验和持有 SoA TypedArray |
| `NodeAdjacencyIndex` | [src/graph/NodeAdjacencyIndex.js](src/graph/NodeAdjacencyIndex.js) | CSR 无向邻接索引 |
| `GraphRenderer` | [src/render/GraphRenderer.js](src/render/GraphRenderer.js) | 绘制编排、LOD、邻域切换 |
| `NodeRenderer` | [src/render/NodeRenderer.js](src/render/NodeRenderer.js) | 节点实例化、SDF 形状、权重尺寸 |
| `NodeLabelRenderer` | [src/render/NodeLabelRenderer.js](src/render/NodeLabelRenderer.js) | 共享 Canvas 标签、碰撞过滤和标签 LOD |
| `EdgeRenderer` | [src/render/EdgeRenderer.js](src/render/EdgeRenderer.js) | 直线、曲线、虚线和抗锯齿 |
| `NodeIconAtlas` | [src/render/NodeIconAtlas.js](src/render/NodeIconAtlas.js) | 图片节点纹理图集 |
| `HighlightOverlayRenderer` | [src/render/HighlightOverlayRenderer.js](src/render/HighlightOverlayRenderer.js) | 使用原图标放大直接邻居 |
| `GraphStyle` | [src/render/GraphStyle.js](src/render/GraphStyle.js) | 样式对象和配置校验 |
| `Camera2D` | [src/render/Camera2D.js](src/render/Camera2D.js) | 中心、缩放、视口 |
| `SpatialNodeIndex` | [src/interaction/SpatialNodeIndex.js](src/interaction/SpatialNodeIndex.js) | 鼠标局部拾取 |
| `GraphInteractionController` | [src/interaction/GraphInteractionController.js](src/interaction/GraphInteractionController.js) | 拖拽、缩放、悬停、点击 |
| `GraphHud` | [src/ui/GraphHud.js](src/ui/GraphHud.js) | 低频 DOM 更新、lil-gui 控制器和样式控制 |

## 数据契约

`GraphData` 使用结构数组，不维护节点对象数组：

```text
nodePositions    Float32Array  2 × N
nodeSizes        Float32Array    N
nodeColors       Uint8Array     4 × N
nodeGroups       Uint16Array     N
nodeIconIds      Uint8Array      N，可选，默认 index % 8
nodeWeights      Float32Array    N，可选，默认连接度
nodeLabels       string[]        N，可选，节点提示文本
nodeKinds        string[]        N，可选，节点类型文本
groupLabels      string[]        G，可选，社区提示文本
edgeSources      Uint32Array     E
edgeTargets      Uint32Array     E
edgePositions    Float32Array  4 × E
edgeWidths       Float32Array    E
edgeColors       Uint8Array     4 × E
edgeKinds        string[]        E，可选，关系类型文本
```

`nodeWeights` 缺失时，`GraphData` 自动使用无向连接度，并对连接度取对数后归一化。原始权重用于提示信息，归一化权重用于节点尺寸。

不要在主线程每帧把业务对象转换成 GPU 数据。业务对象应只存在于导入阶段。

## 邻域高亮流程

1. 鼠标悬停通过 `SpatialNodeIndex` 取得节点 ID。
2. 点击节点后，`NodeAdjacencyIndex` 按 `offsets[nodeId]` 到 `offsets[nodeId + 1]` 读取直接邻居。
3. `GraphHighlightMask` 生成 0/1 标记，并更新 `NodeRenderer` 的实例属性。
4. `HighlightOverlayRenderer` 使用邻居坐标、权重和原始 `nodeIconIds` 放大绘制原图片。
5. `EdgeRenderer` 根据 source/target 与焦点 ID 判断关联边，保留原始边颜色并加粗。

普通状态预计为 2 个 draw call：边和节点。存在选中节点时预计为 3 个 draw call：边、普通节点、关联节点覆盖层。

## 性能策略

- 默认启用按需渲染，静止时不持续重绘。
- HUD 的“持续压测”用于连续提交帧并测量性能。
- 连续渲染和交互渲染默认限制在 `56 FPS`，界面可在 `30～60 FPS` 调整。
- 连续压测低于目标帧率约 18% 时，应自动降低 LOD 可见预算；切换数据或目标帧率时重置为完整预算。
- 拖拽和缩放使用更低 LOD，操作结束后补一帧高质量结果，但高缩放级别仍必须保留可见预算。
- 当前相机视口内的节点必须全部显示，不得按节点序号跳过；边保留可见预算。
- 选中节点和全部直接邻居强制绕过 LOD。
- 大图使用较低的设备像素比上限。
- 不要在 HUD 中使用大面积 `backdrop-filter`，它会增加合成成本。
- 不要为节点创建 DOM `<img>`、SVG 或独立 Canvas。
- 节点标签必须共用一个 Canvas 2D 图层。节点数不超过 200 时显示视口内全部标签；超过该阈值后才启用碰撞过滤、可见预算和交互 LOD。不得为每个节点创建 DOM 文本。
- 标签预算必须跟随实时 FPS 自动降级：性能不足时先减少普通标签，继续不足时自动隐藏普通标签；性能恢复后缓慢恢复。手动标签开关作为总开关。
- 选中节点和全部直接邻居的标签必须绕过高权重抽样、碰撞隐藏和 FPS 标签预算；性能降级只能影响非关联标签。
- 不要把平滑边退化成 `gl.LINES`，不同平台对 `lineWidth` 支持不一致。

## 样式配置

界面支持：

- 节点：圆形、方形、菱形、三角形、六边形、星形、混合形状、图片图标。
- 边：直线、曲线、虚线。
- 非关联透明度。
- 权重差异强度。
- 节点标签显隐。
- 持续压测开关。

也可以在控制台配置：

```js
graphApplication.setStyle({
  nodeShape: "image",
  edgeStyle: "straight",
  dimOpacity: 0.1,
  weightStrength: 1,
  showLabels: true,
  labelFontSize: 10,
  nodeScale: 1,
  edgeWidthScale: 1,
  showEdges: true,
  highlightColor: [0.42, 0.95, 1, 0.95],
});
```

任意业务图片应打包到共享纹理图集，并通过 `nodeIconIds` 指定每节点索引。不要为每个节点加载独立纹理。

## 已知问题和关键修复

### CSR 游标必须从 0 开始

`NodeAdjacencyIndex` 的写入游标必须使用 `new Uint32Array(nodeCount)`。不要使用 `new Uint32Array(degrees)`，后者会复制连接度作为初始游标，导致邻居写入越界并全部变成节点 0。

### 交错属性必须逐 location 绑定

`HighlightOverlayRenderer` 的元数据布局为 `[radius, accent, iconIndex]`。虽然数据在同一个交错缓冲区中，VAO 仍必须分别设置：

```text
location 2 -> stride 12, offset 0
location 3 -> stride 12, offset 4
location 4 -> stride 12, offset 8
```

不能只在 location 2 设置 `size = 3`，否则 accent 和 iconIndex 会读取默认值。

### 原图标不能被统一替换

`nodeIconIds` 默认使用 `index % 8`，保证相邻节点有足够的图标类型差异。关联节点覆盖层必须使用源节点的 `nodeIconIds`，不能使用固定图标。

### 边颜色不能被统一高亮

选中关联边时只提高透明度和线宽，不能把 RGB 改成固定高亮色。每条边继续使用 `edgeColors` 中的原始关系颜色。

### 直线必须做片元级 AA

直线的几何四边形会比核心线宽多出覆盖空间，片元着色器根据到线中心的距离生成 coverage。不要只缩小 `< 1px` 的四边形，否则斜线会出现周期性断点。

### 节点不能因 LOD 缺失

相机缩放不设置业务上的最小或最大倍率。当前视口内的节点必须全部显示，节点预算不得用于删除视口节点。性能控制主要依赖边预算、设备像素比、按需渲染和交互期间的片元成本控制。

超大图应继续将设备像素比限制为 `1`，并在边数量很大时降低曲线的细分段数。

### 缩小视图时空间索引不能遍历无限空网格

`SpatialNodeIndex.collectInBounds()` 和 `pick()` 计算出的网格范围都必须钳制到实际有节点占用的网格边界。缩小视图时世界视口和鼠标拾取半径会快速扩大，如果直接遍历完整矩形范围，空网格数量会急剧膨胀并阻塞主线程。

### 调整窗口尺寸时必须避免空白帧

WebGL canvas 修改 drawing buffer 尺寸会清空当前内容。`GraphView.resize()` 必须在尺寸变化后同步重绘一帧；WebGL context 使用透明合成并让 canvas CSS 背景与 `GraphStyle.backgroundColor` 保持一致，避免窗口变化时闪黑。

### 边 LOD 与节点 LOD 必须同步

边和节点不能各自独立抽样，否则会出现没有端点节点的悬空线。`GraphRenderer` 在生成边抽样后，必须把每条被绘制边的 `edgeSources` 和 `edgeTargets` 写入节点可见掩码，再通过 `NodeRenderer.updateVisibilityMask()` 上传。

修改边抽样预算、节点抽样预算或质量自适应逻辑时，必须同时验证：所有实际绘制的边，其两个端点都满足节点可见条件。

边抽样不能直接对完整图使用 `edgeIndex % stride`。必须先根据可见节点筛选出“至少一端与可见节点相连”的候选边，再在候选边中按预算抽样，并把结果上传到 `EdgeRenderer` 的可见性属性。这样 LOD 抽样仍然保留图结构，而不是生成随机悬空关系。

节点 LOD 不能使用全局 `nodeId % stride`，也不能对视口节点再次抽样。缩放时必须通过 `SpatialNodeIndex.collectInBounds()` 查询当前相机范围内的节点，并把视口节点全部加入可见集合。否则会遗漏当前可见区域中的节点。

## 修改边界

- 渲染热路径中不得遍历业务节点对象。
- 新增每帧数据时优先使用 TypedArray 和 GPU buffer。
- 节点拖动必须使用局部 `bufferSubData` 更新节点坐标和关联边端点，不得为一次拖动重传完整图缓冲区。
- 邻域查询不得在每次 `pointermove` 中扫描全图。
- 样式变化应通过 `GraphStyle`，不要让渲染器直接读取 DOM。
- 新交互必须同时考虑普通状态和选中状态。
- 修改 Worker 数据格式时同步更新 `GraphData`、渲染器和 `docs/high-performance-graph.md`。
- **节点选中的时候不要修改原本的颜色、大数据量跟小数据都一样即可不用区分**

## 扩展方向

- 自定义图片：扩展 `NodeIconAtlas` 的图集单元和 `nodeIconIds` 的有效范围。
- 多跳邻居：基于 CSR 做 BFS 并限制跳数，仍然只更新邻域标记。
- 自定义边路径：在导入阶段采样成折线或贝塞尔曲线，再实例化提交。
- 更高级 LOD：为节点和边建立空间分块或层次聚类，减少远景实例提交。
- WebGPU：在需要 GPU 计算、indirect draw 或更大规模时再引入。
