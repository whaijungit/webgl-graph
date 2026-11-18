import type { GraphBounds } from "../lib/types.js";

/** 屏幕或世界坐标点。 */
interface ScreenPoint {
  /** 坐标 X。 */
  x: number;
  /** 坐标 Y。 */
  y: number;
}

/**
 * 二维相机。
 */
export class Camera2D {
  /** 视口中心世界坐标 X。 */
  centerX: number;
  /** 视口中心世界坐标 Y。 */
  centerY: number;
  /** 每世界单位对应的像素数。 */
  scale: number;
  /** 视口 CSS 宽度。 */
  viewportWidth: number;
  /** 视口 CSS 高度。 */
  viewportHeight: number;
  /** 仅用于避免数值溢出的最小缩放。 */
  readonly minScale: number;
  /** 仅用于避免数值溢出的最大缩放。 */
  readonly maxScale: number;

  /**
   * 创建默认相机。
   */
  constructor() {
    this.centerX = 0;
    this.centerY = 0;
    this.scale = 1;
    this.viewportWidth = 1;
    this.viewportHeight = 1;
    // 缩放范围不做业务限制，仅保留极小/极大值避免浮点运算溢出。
    this.minScale = 0.0001;
    this.maxScale = 100000;
  }

  /**
   * 设置视口 CSS 尺寸。
   *
   * @param width - 视口宽度。
   * @param height - 视口高度。
   * @returns 无返回值。
   */
  setViewport(width: number, height: number): void {
    this.viewportWidth = Math.max(1, width);
    this.viewportHeight = Math.max(1, height);
  }

  /**
   * 将世界边界适配到当前视口。
   *
   * @param bounds - 世界坐标边界。
   * @param padding - 视口内保留的可用比例。
   * @returns 无返回值。
   */
  fit(
    bounds: GraphBounds,
    padding: number = 0.88,
  ): void {
    const worldWidth = Math.max(1, bounds.maxX - bounds.minX);
    const worldHeight = Math.max(1, bounds.maxY - bounds.minY);

    this.centerX = (bounds.minX + bounds.maxX) * 0.5;
    this.centerY = (bounds.minY + bounds.maxY) * 0.5;
    this.scale = Math.min(
      this.viewportWidth / worldWidth,
      this.viewportHeight / worldHeight,
    ) * padding;
    this.scale = this.#clampScale(this.scale);
  }

  /**
   * 按屏幕像素平移相机中心。
   *
   * @param deltaX - 水平像素位移。
   * @param deltaY - 垂直像素位移。
   * @returns 无返回值。
   */
  panByPixels(deltaX: number, deltaY: number): void {
    this.centerX -= deltaX / this.scale;
    this.centerY -= deltaY / this.scale;
  }

  /**
   * 围绕屏幕坐标缩放。
   *
   * @param screenX - 缩放锚点屏幕 X。
   * @param screenY - 缩放锚点屏幕 Y。
   * @param factor - 缩放倍率。
   * @returns 无返回值。
   */
  zoomAt(screenX: number, screenY: number, factor: number): void {
    const world = this.screenToWorld(screenX, screenY);
    const nextScale = this.#clampScale(this.scale * factor);
    this.scale = nextScale;
    this.centerX =
      world.x - (screenX - this.viewportWidth * 0.5) / this.scale;
    this.centerY =
      world.y - (screenY - this.viewportHeight * 0.5) / this.scale;
  }

  /**
   * 将屏幕坐标转换为世界坐标。
   *
   * @param screenX - 屏幕坐标 X。
   * @param screenY - 屏幕坐标 Y。
   * @returns 世界坐标点。
   */
  screenToWorld(
    screenX: number,
    screenY: number,
  ): ScreenPoint {
    return {
      x:
        this.centerX +
        (screenX - this.viewportWidth * 0.5) / this.scale,
      y:
        this.centerY +
        (screenY - this.viewportHeight * 0.5) / this.scale,
    };
  }

  /**
   * 将缩放限制在浮点安全范围内。
   *
   * @param scale - 原始缩放。
   * @returns 限制后的缩放。
   */
  #clampScale(scale: number): number {
    return Math.max(this.minScale, Math.min(this.maxScale, scale));
  }
}
