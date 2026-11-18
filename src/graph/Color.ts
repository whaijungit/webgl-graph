import type {
  ColorInput,
  NormalizedColor,
  RgbTuple,
  RgbaTuple,
} from "../lib/types.js";

/**
 * 将任意受支持的颜色输入解析为 0～1 范围的 RGBA。
 *
 * @param color - 十六进制、CSS、整数或 RGB/RGBA 数组颜色。
 * @returns 规范化 RGBA 元组。
 */
export function parseColor(color: ColorInput): NormalizedColor {
  if (typeof color === "number") {
    return parseNumericColor(color);
  }
  if (Array.isArray(color)) {
    return parseArrayColor(color as RgbTuple | RgbaTuple);
  }
  if (typeof color === "string") {
    const value = color.trim().toLowerCase();
    if (!value) {
      throw new TypeError("颜色字符串不能为空");
    }
    if (value.startsWith("#") || value.startsWith("0x")) {
      return parseHexColor(value);
    }
    if (value.startsWith("rgb(") || value.startsWith("rgba(")) {
      return parseCssRgb(value);
    }
    if (/^\d+$/.test(value)) {
      return parseNumericColor(Number(value));
    }
  }
  throw new TypeError(`不支持的颜色值：${String(color)}`);
}

/**
 * 将任意受支持的颜色输入解析为 0～255 范围的 RGBA 字节。
 *
 * @param color - 十六进制、CSS、整数或 RGB/RGBA 数组颜色。
 * @returns RGBA 字节元组。
 */
export function parseColorBytes(
  color: ColorInput,
): [number, number, number, number] {
  const [red, green, blue, alpha] = parseColor(color);
  return [
    Math.round(red * 255),
    Math.round(green * 255),
    Math.round(blue * 255),
    Math.round(alpha * 255),
  ];
}

/**
 * 将颜色集合规范化为扁平 RGBA 字节数组。
 *
 * @param colors - 扁平 RGBA 字节、TypedArray 或逐项颜色输入。
 * @param count - 节点或边的数量。
 * @param fallback - 输入为空时循环使用的回退颜色。
 * @returns 长度为 `count * 4` 的 RGBA 字节数组。
 */
export function normalizeColorArray(
  colors: ArrayLike<ColorInput>,
  count: number,
  fallback: ColorInput,
): Uint8Array {
  const safeCount = Math.max(0, Math.floor(count));
  const output = new Uint8Array(safeCount * 4);

  if (colors.length >= safeCount * 4) {
    for (let index = 0; index < safeCount * 4; index += 1) {
      output[index] = clampByte(Number(colors[index]));
    }
    return output;
  }

  const fallbackBytes = parseColorBytes(fallback);
  if (colors.length === 0) {
    for (let index = 0; index < safeCount; index += 1) {
      output.set(fallbackBytes, index * 4);
    }
    return output;
  }

  for (let index = 0; index < safeCount; index += 1) {
    const source =
      index < colors.length
        ? colors[index]
        : colors[colors.length - 1];
    output.set(parseColorBytes(source), index * 4);
  }
  return output;
}

/**
 * 解析十六进制整数颜色。
 *
 * @param value - `0xRRGGBB` 或 `0xRRGGBBAA` 整数。
 * @returns 规范化 RGBA 元组。
 */
function parseNumericColor(value: number): NormalizedColor {
  if (!Number.isFinite(value) || value < 0 || value > 0xffffffff) {
    throw new TypeError(`无效的整数颜色：${value}`);
  }
  const integer = Math.floor(value);
  if (integer <= 0xffffff) {
    return [
      ((integer >>> 16) & 0xff) / 255,
      ((integer >>> 8) & 0xff) / 255,
      (integer & 0xff) / 255,
      1,
    ];
  }
  return [
    ((integer >>> 24) & 0xff) / 255,
    ((integer >>> 16) & 0xff) / 255,
    ((integer >>> 8) & 0xff) / 255,
    (integer & 0xff) / 255,
  ];
}

/**
 * 解析十六进制字符串颜色。
 *
 * @param value - 带 `#` 或 `0x` 前缀的 3、4、6、8 位十六进制字符串。
 * @returns 规范化 RGBA 元组。
 */
function parseHexColor(value: string): NormalizedColor {
  const digits = value.startsWith("#") ? value.slice(1) : value.slice(2);
  if (!/^[0-9a-f]+$/.test(digits)) {
    throw new TypeError(`无效的十六进制颜色：${value}`);
  }
  if (digits.length === 3 || digits.length === 4) {
    const expanded = Array.from(digits, (digit) => `${digit}${digit}`).join("");
    return parseHexColor(`#${expanded}`);
  }
  if (digits.length !== 6 && digits.length !== 8) {
    throw new TypeError(`十六进制颜色长度必须为 3、4、6 或 8 位：${value}`);
  }
  const red = Number.parseInt(digits.slice(0, 2), 16);
  const green = Number.parseInt(digits.slice(2, 4), 16);
  const blue = Number.parseInt(digits.slice(4, 6), 16);
  const alpha =
    digits.length === 8 ? Number.parseInt(digits.slice(6, 8), 16) : 255;
  return [red / 255, green / 255, blue / 255, alpha / 255];
}

/**
 * 解析 CSS `rgb()` 和 `rgba()` 颜色。
 *
 * @param value - CSS 颜色字符串，支持逗号或空格分隔。
 * @returns 规范化 RGBA 元组。
 */
function parseCssRgb(value: string): NormalizedColor {
  const start = value.indexOf("(");
  const end = value.lastIndexOf(")");
  if (start < 0 || end <= start) {
    throw new TypeError(`无效的 CSS RGB 颜色：${value}`);
  }
  const body = value.slice(start + 1, end).trim();
  const normalized = body.includes(",")
    ? body.split(",").map((part) => part.trim())
    : body.replace("/", " ").split(/\s+/);
  if (normalized.length !== 3 && normalized.length !== 4) {
    throw new TypeError(`CSS RGB 颜色需要 3 或 4 个通道：${value}`);
  }
  const red = parseCssRgbChannel(normalized[0]);
  const green = parseCssRgbChannel(normalized[1]);
  const blue = parseCssRgbChannel(normalized[2]);
  const alpha =
    normalized.length === 4 ? parseCssAlpha(normalized[3]) : 1;
  return [
    red,
    green,
    blue,
    alpha,
  ];
}

/**
 * 解析 CSS RGB 的 R/G/B 通道。
 *
 * @param channel - 0～255 数字或百分比字符串。
 * @returns 0～1 范围内的颜色通道值。
 */
function parseCssRgbChannel(channel: string): number {
  if (channel.endsWith("%")) {
    return clamp(Number.parseFloat(channel) / 100);
  }
  return clamp(Number.parseFloat(channel) / 255);
}

/**
 * 解析 CSS RGBA 的 alpha 通道。
 *
 * @param channel - 0～1 数字或百分比字符串。
 * @returns 0～1 范围内的透明度。
 */
function parseCssAlpha(channel: string): number {
  if (channel.endsWith("%")) {
    return clamp(Number.parseFloat(channel) / 100);
  }
  return clamp(Number.parseFloat(channel));
}

/**
 * 解析 RGB/RGBA 数组。
 *
 * @param color - 三个或四个数值通道。
 * @returns 规范化 RGBA 元组。
 */
function parseArrayColor(color: RgbTuple | RgbaTuple): NormalizedColor {
  if (color.length !== 3 && color.length !== 4) {
    throw new TypeError("颜色数组必须包含 3 或 4 个通道");
  }
  const values = Array.from(color, (channel) => Number(channel));
  if (values.some((channel) => !Number.isFinite(channel) || channel < 0)) {
    throw new TypeError("颜色通道必须是非负有限数值");
  }
  const usesNormalizedRgb = values
    .slice(0, 3)
    .every((channel) => channel <= 1);
  const rgbScale = usesNormalizedRgb ? 1 : 255;
  const alpha = values[3] ?? (usesNormalizedRgb ? 1 : 255);
  const normalizedAlpha = alpha <= 1 ? alpha : alpha / 255;
  return [
    clamp(values[0] / rgbScale),
    clamp(values[1] / rgbScale),
    clamp(values[2] / rgbScale),
    clamp(normalizedAlpha),
  ];
}

/**
 * 将字节通道限制在 0～255。
 *
 * @param value - 原始通道值。
 * @returns 四舍五入并限制后的字节值。
 */
function clampByte(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(255, Math.round(value)));
}

/**
 * 将数值限制在 0～1。
 *
 * @param value - 原始数值。
 * @returns 限制后的数值。
 */
function clamp(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}
