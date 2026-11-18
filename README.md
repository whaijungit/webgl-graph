# 全国交通要素 · Three.js

把天地图 WFS 的全国铁路、公路要素做成一张可旋转、可缩放的 **三维球面交通网络**。

![全国交通要素三维球面预览](preview.png)

- 铁路：`LRRL`，5,274 个要素
- 公路：`LRDL`，171,472 个要素
- 范围：中国及周边，`73°E – 135°E / 18°N – 54°N`
- 版本：`1:1,000,000` 基础地理数据（2017 版），**不是实时交通流量**
- 原始服务：[天地图 TDTService WFS](https://gisserver.tianditu.gov.cn/TDTService/wfs)
- 渲染：Three.js `LineSegments` + 球面经纬投影 + UnrealBloom + CSS2D 城市标注

> 原始 WFS 要素量较大（公路约 171k 条、原始坐标约 754 万点），浏览器直接逐页请求会很慢。项目先用 `scripts/fetch_transport.py` 离线段位简化，再打包成 `public/data/transport.bin` 供前端一次加载。

## 运行

```bash
cd traffic-globe
pnpm install
pnpm dev
```

也可以使用 npm：

```bash
npm install
npm run dev
```

打开 `http://127.0.0.1:4317`。

无 UI 关系图库：

```js
import { GraphView } from "china-transport-globe";

const graph = new GraphView("#graph-canvas");
graph.setData(payload);
```

详细 API 和构建说明见 [docs/library.md](docs/library.md)。

真实 npm 包依赖示例：

```text
http://127.0.0.1:4317/examples/npm-dependencies.html
```

该示例以当前应用为根节点，从 npm 官方 Registry 递归读取 `three` 与
`vite` 的普通依赖和可选依赖。数据快照位于
`src/data/npm-dependencies.json`，可通过以下命令更新：

```bash
npm run build:npm-sample
```

生产构建：

```bash
pnpm build
pnpm preview
```

## 数据刷新

```bash
python scripts/fetch_transport.py --force
```

若已跑过一次，修改渲染逻辑后可以直接从处理缓存重新打包：

```bash
python scripts/fetch_transport.py --from-cache
```

脚本会：

1. 按 `count=5000` 分页请求 WFS 的 `LRRL` / `LRDL`；
2. 用 Douglas–Peucker 简化线位，并丢弃国家尺度下不可见的小于约 1.3 km 的碎段；
3. 生成 `public/data/transport.bin`（Float32 经纬度 + Uint32 偏移）；
4. 下载并简化省级边界 `public/data/china.json`；
5. 写入 `public/data/meta.json`（图层数量、节点数、来源）。

当前快照：铁路 5,274 个要素、公路 171,472 个要素。界面上的数量是 WFS 原始匹配数，渲染使用的是简化后的线位。

## 目录

```text
traffic-globe/
├─ index.html
├─ src/
│  ├─ main.js         # Three.js 场景、数据解析、交互
│  └─ style.css       # HUD / 面板 / 标注
├─ public/data/
│  ├─ transport.bin   # 铁路 + 公路线位
│  ├─ china.json      # 省级边界
│  └─ meta.json       # 统计与来源
└─ scripts/
   └─ fetch_transport.py
```

## 交互

- 拖拽：旋转地球
- 滚轮：缩放
- 图层控制：铁路 / 公路 / 省界
- 自动巡航：围绕中国区域轻微摆动
- 重置视角：回到初始构图

## 说明

- 天地图 WFS 已返回 `Access-Control-Allow-Origin: *`，浏览器可直接请求；本 Demo 为了稳定和性能使用离线快照。
- 使用时请遵守天地图服务条款，并保留页面右下角的数据来源标注。
- 线位已按国家尺度简化，不能用作工程测量或导航数据。
