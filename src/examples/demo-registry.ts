import type { DemoGraphDefinition } from "./demo-graph.js";
import { bydSeriesDemo } from "./byd-series-graph.js";
import { nanchangUprisingDemo } from "./nanchang-uprising-graph.js";
import { packageDependencyDemo } from "./package-dependency-graph.js";

/** 默认示例 ID。 */
export const DEFAULT_DEMO_ID = bydSeriesDemo.id;

/** 比亚迪车系示例 URL 参数。 */
export const BYD_SERIES_PRESET_ID = "byd";

/** 南昌起义示例 URL 参数。 */
export const NANCHANG_PRESET_ID = "nanchang";

/** npm 依赖示例 ID。 */
export const PACKAGE_DEPENDENCY_DEMO_ID = packageDependencyDemo.id;

/** npm 依赖示例 URL 参数。 */
export const PACKAGE_DEPENDENCY_PRESET_ID = "dependencies";

/**
 * 根据 URL 参数选择初始内置示例。
 *
 * @param searchParams - 当前页面查询参数。
 * @returns 示例定义；随机压测数据应返回 `null`。
 */
export function resolveInitialDemo(
  searchParams: URLSearchParams,
): DemoGraphDefinition | null {
  const preset = searchParams.get("preset");
  if (preset === BYD_SERIES_PRESET_ID) {
    return bydSeriesDemo;
  }
  if (preset === NANCHANG_PRESET_ID) {
    return nanchangUprisingDemo;
  }
  if (preset === PACKAGE_DEPENDENCY_PRESET_ID) {
    return packageDependencyDemo;
  }
  if (
    !searchParams.has("preset") &&
    !searchParams.has("nodes") &&
    !searchParams.has("edges")
  ) {
    return bydSeriesDemo;
  }
  return null;
}

/**
 * 将数据规模按钮映射到内置示例。
 *
 * @param presetId - 按钮的预设 ID。
 * @returns 示例定义；普通压测预设返回 `null`。
 */
export function resolveDemoByPresetId(
  presetId: string,
): DemoGraphDefinition | null {
  if (presetId === BYD_SERIES_PRESET_ID) {
    return bydSeriesDemo;
  }
  if (presetId === NANCHANG_PRESET_ID) {
    return nanchangUprisingDemo;
  }
  if (presetId === PACKAGE_DEPENDENCY_DEMO_ID) {
    return packageDependencyDemo;
  }
  return null;
}
