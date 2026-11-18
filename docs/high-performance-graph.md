# 高性能关系图实现说明

这个原型把关系图当作 GPU 数据渲染，而不是几十万个 JavaScript 图元对象。默认数据量为 100 个节点、3,000 条边，也可以切换到 50 万节点、100 万条边进行压力测试。

## 运行

```bash
npm install
npm run dev
```

打开 `http://127.0.0.1:4317`。

生产构建：

```bash
npm run build
```

## 对象职责

| 类 | 职责 |
| --- | --- |
| `SyntheticGraphGenerator` | 在 Worker 中生成合成图数据 |
| `GraphDataService` | 管理 Worker 生命周期和 ArrayBuffer 转移 |
| `GraphData` | 校验并持有 SoA TypedArray |
| `NodeAdjacencyIndex` | 使用 CSR 存储无向邻接关系 |
| `GraphRenderer` | 编排 WebGL2 每帧绘制和 LOD |
| `GraphHighlightMask` | 生成当前焦点与直接邻居的实例状态标记 |
| `GraphStyle` | 保存形状、边样式、透明度和权重强度 |
| `EdgeRenderer` | 实例化绘制直线、曲线或虚线 |
| `NodeRenderer` | 实例化绘制任意内置 SDF 节点形状 |
| `Camera2D` | 保存中心、缩放和视口状态 |
| `SpatialNodeIndex` | 建立网格索引并执行局部拾取 |
| `GraphInteractionController` | 处理拖拽、缩放、悬停和点击 |
| `GraphView` | 无 UI 库入口、渲染、交互、事件和生命周期 |

## 第一步：Worker 生成连续缓冲区

[SyntheticGraphGenerator.ts](../src/graph/SyntheticGraphGenerator.ts) 输出以下数据：

```text
nodePositions    Float32Array  2 × N
nodeSizes        Float32Array    N
nodeColors       Uint8Array     4 × N
nodeGroups       Uint16Array     N
nodeWeights      Float32Array    N，可选
nodeIconIds      Uint8Array      N，可选
nodeLabels       string[]        N，可选，仅用于提示信息
nodeKinds        string[]        N，可选，仅用于提示信息
edgeSources      Uint32Array     E
edgeTargets      Uint32Array     E
edgePositions    Float32Array  4 × E
edgeWidths       Float32Array    E
edgeColors       Uint8Array     4 × E
edgeKinds        string[]        E，可选，关系类型文本
```

[data.worker.ts](../src/graph/data.worker.ts) 通过 transfer list 把 ArrayBuffer 转交给主线程，避免复制几十 MB 数据。

替换真实数据时，可以保留同一套数组格式，也可以把 Worker 改成流式解析 JSON、CSV 或二进制文件。渲染层不需要知道数据的业务含义。

`nodeLabels`、`nodeKinds` 和 `groupLabels` 是可选的展示元数据，不参与 WebGL 实例缓冲区。npm 依赖图示例使用这些字段显示真实包名、版本和依赖分支。

内置合成数据会在节点数不超过 1,000 时生成 `节点 N` 标签；更大的合成图不创建逐节点标签字符串。主页面 3 节点示例和自定义图示例也提供了各自的业务标签。

### 节点标签的渲染预算

[NodeLabelRenderer.ts](../src/render/NodeLabelRenderer.ts) 使用一个共享的 Canvas 2D 图层绘制全部标签，不为节点创建 DOM 文本：

1. 节点数不超过 200 时，直接显示视口内全部标签。
2. 节点数超过 200 后才优先绘制高权重节点，并执行屏幕空间碰撞过滤。
3. 自动优化时，桌面最多保留 140 个标签，窄屏最多 72 个，拖拽或缩放期间最多 48 个。
4. 选中和悬停节点始终保留标签。
5. 大图只扫描有上限的高权重候选，不遍历全部节点。
6. 没有 `nodeLabels` 的合成大图会隐藏标签画布并直接跳过绘制。

小图标签会省略版本号并尝试节点四周的位置以减少遮挡，悬停/选中提示仍显示完整包名和版本。标签文本宽度会缓存，避免连续渲染时重复测量。标签不增加 WebGL draw call，但会在每次实际渲染时产生少量 Canvas 2D 提交成本。

调用 `graphView.setStyle({ showLabels: false })` 可以直接关闭标签图层。没有 `nodeLabels` 的数据不会创建标签文本。

标签还会根据测得的 FPS 自动降级：低于目标帧率约 10% 时开始减少普通标签预算，降到目标帧率约 60% 时自动隐藏普通标签；性能恢复后按较慢速度恢复。手动开关始终优先，关闭后无论 FPS 如何都不绘制标签。

点击节点后，焦点和全部直接邻居的标签会强制保留，不参与高权重候选抽样、碰撞隐藏或 FPS 标签预算。性能降级只影响非关联节点标签，确保用户始终能识别当前邻域中的节点。

库不创建选择面板；业务侧可监听 `select` 事件，从 `related` 中取得全部直接邻居的名称。

节点支持直接拖动：按在节点上拖动时更新该节点坐标、CSR 记录的全部关联边端点和空间拾取索引，相机保持不动；按在空白处拖动仍执行画布平移。GPU 更新使用节点位置缓冲区和关联边位置缓冲区的小范围 `bufferSubData`，不会重传完整图的坐标数组。

如果业务数据没有提供 `nodeWeights`，`GraphData` 会自动使用节点连接度作为权重。权重先取对数并归一化到 `0～1`，再应用轻度感知曲线，避免长尾连接度把绝大多数节点压到同一档尺寸。

合成大图会把社区中心按当前画布宽高比铺开，并根据社区中心间距控制每个社区的内部半径。社区之间保留留白，社区内部使用低差异螺旋分布，避免 25 万以上节点在远景中连成不可辨认的色块。布局仍只生成一次 TypedArray，不会进入每帧渲染热路径。

## 第二步：上传 GPU 缓冲区

小图由 [NodeRenderer.ts](../src/render/NodeRenderer.ts) 使用四顶点图标四边形实例化绘制。节点数达到 100,000 后切换为单顶点 Point Sprite，并把全部可见节点索引写入动态 `Uint32Array`。大图不再按节点序号或节点预算抽样，任何位于当前视口内的节点都会提交；性能控制转移到更小的远景 Point Sprite 片元和边预算。Point Sprite 读取 `nodeIconIds` 并绘制 8 种高对比度简化图标；选中节点和直接邻居继续保留各自的图标索引与原始 `nodeColors`，只放大、恢复完整透明度并最后绘制当前焦点。

大图 Point Sprite 的远景屏幕尺寸以 `minimumNodeSize` 为下限，默认按权重映射到约 3～9px，避免百万节点在完整适配视图下产生过大的片元重叠；放大后继续按权重增长。选中节点放大到约 `40～60px`，直接邻居至少约 `24px`，因此大图邻域仍然清晰可见。

选中邻域保持图标形状一致。直接邻居维持自己的正常图标、颜色和尺寸，只保证绘制在非关联节点上层并显示标签；非关联节点降低透明度。

[EdgeRenderer.ts](../src/render/EdgeRenderer.ts) 把每条边展开成屏幕空间四边形。相邻顶点使用 `aStart` 和 `aEnd` 的同一份交错缓冲区，从而避开 WebGL 对 `lineWidth` 的平台限制。

普通节点只使用以下实例属性：

```text
aPosition  vec2
aSize      float
aColor     vec4
aWeight    float
```

节点实例按权重从低到高提交，高权重节点因此绘制在低权重节点之上。由于实例顺序不再等于原始节点 ID，渲染器会额外上传一个 `Uint32` 节点 ID 缓冲区；悬停、选中和邻域掩码仍使用原始节点 ID。

节点最终尺寸约为：

```text
原始尺寸 × LOD 尺寸 × 权重倍率
```

默认情况下，权重只影响节点尺寸和绘制顺序，不改变节点透明度。低权重节点会在 `minimumNodeSize` 屏幕尺寸下限之上缩小，高权重节点会放大并最后绘制。界面中的“节点最小尺寸”控制低权重节点的可调整像素下限，“权重差异”只调整下限以上的尺寸差异。

## 第三步：相机只修改 uniform

[Camera2D.ts](../src/render/Camera2D.ts) 保存世界中心与缩放。平移和滚轮缩放不会遍历、修改或重新上传节点坐标。

世界坐标到屏幕坐标的转换在顶点着色器中完成：

```glsl
vec2 screenCenter =
  (aPosition - uCenter) * uScale + uViewport * 0.5;
```

## 第四步：拾取使用空间索引

[SpatialNodeIndex.ts](../src/interaction/SpatialNodeIndex.ts) 在数据加载后建立一次均匀网格。鼠标悬停时只查询附近网格单元，再按像素距离寻找最近节点。

视口范围查询和鼠标局部拾取都会先与网格中实际存在节点的边界求交，再遍历交集范围。这样持续缩小时不会因为世界范围和拾取半径扩大而产生大量空网格循环。

点击节点后，[NodeAdjacencyIndex.ts](../src/graph/NodeAdjacencyIndex.ts) 直接取得该节点的邻居区间。[GraphHighlightMask.ts](../src/render/GraphHighlightMask.ts) 只更新这些节点的实例标记缓冲区：

```text
焦点节点 + 直接邻居 → 保持高亮
其他节点             → 透明度降低
焦点关联边           → 强化颜色和宽度
其他边               → 透明度降低
```

边着色器会比较高亮节点 ID：

```glsl
bool isFocused =
  aSource == uFocusId || aTarget == uFocusId;
```

焦点邻域高亮仍然只有两个 draw call。邻接索引只创建一次，不会在 `pointermove` 中扫描整个图。

焦点节点放大到约 `1.9×`，直接邻居放大到约 `1.45×`。邻域节点会强制绕过远景节点抽样，确保任意节点被点击后，它的直接关联节点都能显示出来。

## 第五步：LOD 控制实际片元成本

完整数据始终留在 GPU 缓冲区中。远景下执行两项 LOD：

1. 根据节点总数和相机缩放降低节点半径，减少重叠和过绘制。
2. 视口内节点全部写入紧凑 Point Sprite 索引；边继续按固定预算抽样并压缩成紧凑实例缓冲。
3. 焦点节点和焦点邻居强制加入节点可见集合。
4. 拖拽和缩放期间使用更低预算，操作结束后补一帧完整质量。

大图普通边预算上限为 6,000；所有已绘制边的端点会额外强制保留，避免出现悬空边。交互性能不足时只降低普通边预算和 Point Sprite 片元尺寸，不删除视口节点。放大后边可见性会重新计算，选中的节点关联边始终不会被抽样隐藏。小图不应用这些上限。

Point Sprite 的位置、颜色和尺寸缓冲按权重排序后的实例顺序上传。索引缓冲必须写入实例索引，再通过 `aNodeId` 使用原始业务节点 ID；若直接把业务节点 ID 当作索引，会导致部分 Hub 节点缺失或显示到错误位置。

`GraphView` 默认采用按需渲染：画面静止时不会持续重绘。调用 `setContinuousRender(true)` 后才会连续提交帧，用于测量当前设备性能。

## 自定义样式

可以直接在浏览器控制台修改：

```js
graphView.setStyle({
  nodeShape: "star",
  edgeStyle: "curve",
  dimOpacity: 0.08,
  weightStrength: 1.4,
  showLabels: true,
  labelFontSize: 12,
  nodeScale: 1,
  minimumNodeSize: 3,
  edgeWidthScale: 1.2,
  showEdges: true,
  highlightColor: "rgba(89, 255, 209, 0.95)",
});
```

内置节点形状包括圆形、方形、菱形、三角形、六边形、星形、混合形状和图片图标；边包括直线、曲线和虚线。

颜色支持 `#RGB`、`#RGBA`、`#RRGGBB`、`#RRGGBBAA`、`0xRRGGBB`、`0xRRGGBBAA`、十进制整数、CSS `rgb()/rgba()` 以及 RGB/RGBA 数组。节点和边的颜色集合既可逐项传颜色，也可传扁平 RGBA 字节数组。

图片图标由 [NodeIconAtlas.ts](../src/render/NodeIconAtlas.ts) 打包成一张纹理图集，`nodeIconIds` 决定每个节点使用哪张图片。真正任意业务图片也可以预先打进图集，而不是为每个节点创建 DOM `<img>` 或 SVG。任意边路径应在导入阶段采样成线段，再作为实例化曲线或折线数据提交。

## 接入业务数据

建议保留现有边界：

1. 业务对象只在数据导入阶段存在。
2. 归一化节点 ID 后写入稠密索引。
3. 坐标、尺寸、颜色、权重和边端点写入 TypedArray。
4. Worker 完成布局和索引构建。
5. 主线程只上传数据并渲染。

不要在每帧把业务对象转换成渲染对象，也不要在 `pointermove` 中遍历全部节点。

## npm 依赖图示例

`examples/npm-dependencies.html` 使用 npm 官方 Registry 数据生成真实依赖关系图。示例以当前应用为根，递归解析 `three`、`vite` 及其普通依赖和可选依赖，并由 `GraphData` 建立 CSR 邻接索引。

依赖快照保存在 `src/data/npm-dependencies.json`。重新抓取并更新快照：

```bash
npm run build:npm-sample
```

普通依赖、开发依赖和可选依赖分别使用不同边宽与透明度；悬停节点会显示真实包名和版本。
