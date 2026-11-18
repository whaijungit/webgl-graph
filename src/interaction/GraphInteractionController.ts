import type { SpatialNodeIndex } from "./SpatialNodeIndex.js";
import type { Camera2D } from "../render/Camera2D.js";

/** 图交互事件回调。 */
interface GraphInteractionCallbacks {
  /** 悬停节点变化回调。 */
  onHover?: (nodeId: number | null, clientX: number, clientY: number) => void;
  /** 点击选择回调。 */
  onSelect?: (nodeId: number | null, clientX: number, clientY: number) => void;
  /** 节点拖动回调。 */
  onNodeDrag?: (nodeId: number, x: number, y: number) => void;
  /** 节点拖动开始回调。 */
  onNodeDragStart?: (nodeId: number) => void;
  /** 节点拖动结束回调。 */
  onNodeDragEnd?: (nodeId: number | null) => void;
  /** 双击适配视图回调。 */
  onFitView?: () => void;
  /** 相机视图变化回调。 */
  onViewChange?: () => void;
  /** 高频交互开始回调。 */
  onInteractionStart?: () => void;
  /** 高频交互结束回调。 */
  onInteractionEnd?: () => void;
}

/** 当前指针拖动状态。 */
interface DragState {
  /** 捕获的指针 ID。 */
  pointerId: number;
  /** 被拖动节点；空白拖动时为 `null`。 */
  nodeId: number | null;
  /** 拖动模式。 */
  mode: "pan" | "node";
  /** 上一次指针 X。 */
  lastX: number;
  /** 上一次指针 Y。 */
  lastY: number;
  /** 按下时指针 X。 */
  startX: number;
  /** 按下时指针 Y。 */
  startY: number;
  /** 是否超过点击移动阈值。 */
  moved: boolean;
  /** 指针到节点中心的世界 X 偏移。 */
  offsetX: number;
  /** 指针到节点中心的世界 Y 偏移。 */
  offsetY: number;
}

/** 世界坐标点。 */
interface WorldPoint {
  /** 世界坐标 X。 */
  x: number;
  /** 世界坐标 Y。 */
  y: number;
}

/**
 * 将 Canvas 指针、滚轮和双击事件转换为图交互。
 *
 * 节点拖动只更新节点，空白拖动平移相机，滚轮围绕指针位置缩放。
 */
export class GraphInteractionController {
  /** 交互目标 Canvas。 */
  private readonly canvas: HTMLCanvasElement;
  /** 用于平移和缩放的二维相机。 */
  private readonly camera: Camera2D;
  /** 交互结果回调。 */
  private readonly callbacks: GraphInteractionCallbacks;
  /** 当前空间拾取索引。 */
  private nodeIndex: SpatialNodeIndex | null;
  /** 当前指针拖动状态。 */
  private drag: DragState | null;
  /** 统一移除 DOM 监听器的控制器。 */
  private readonly abortController: AbortController;
  /** 交互结束防抖定时器。 */
  private interactionTimer: ReturnType<typeof setTimeout> | null;
  /** `pointerdown` 监听函数，保持稳定引用以支持统一清理。 */
  private readonly pointerDownListener: (event: PointerEvent) => void;
  /** `pointermove` 监听函数，保持稳定引用以支持统一清理。 */
  private readonly pointerMoveListener: (event: PointerEvent) => void;
  /** `pointerup` 监听函数，保持稳定引用以支持统一清理。 */
  private readonly pointerUpListener: (event: PointerEvent) => void;
  /** `pointerleave` 监听函数，保持稳定引用以支持统一清理。 */
  private readonly pointerLeaveListener: () => void;
  /** `wheel` 监听函数，保持稳定引用以支持统一清理。 */
  private readonly wheelListener: (event: WheelEvent) => void;
  /** `dblclick` 监听函数，保持稳定引用以支持统一清理。 */
  private readonly doubleClickListener: (event: MouseEvent) => void;

  /**
   * 注册 Canvas 交互监听器。
   *
   * @param canvas - 接收指针事件的 Canvas。
   * @param camera - 图视图使用的相机。
   * @param callbacks - 悬停、选择、拖拽和视图变化回调。
   */
  constructor(
    canvas: HTMLCanvasElement,
    camera: Camera2D,
    callbacks: GraphInteractionCallbacks = {},
  ) {
    this.canvas = canvas;
    this.camera = camera;
    this.callbacks = callbacks;
    this.nodeIndex = null;
    this.drag = null;
    this.abortController = new AbortController();
    this.interactionTimer = null;
    this.pointerDownListener = (event) => this.handlePointerDown(event);
    this.pointerMoveListener = (event) => this.handlePointerMove(event);
    this.pointerUpListener = (event) => this.handlePointerUp(event);
    this.pointerLeaveListener = () => this.handlePointerLeave();
    this.wheelListener = (event) => this.handleWheel(event);
    this.doubleClickListener = (event) => this.handleDoubleClick(event);

    const options: AddEventListenerOptions = {
      signal: this.abortController.signal,
    };
    canvas.addEventListener("pointerdown", this.pointerDownListener, options);
    canvas.addEventListener("pointermove", this.pointerMoveListener, options);
    canvas.addEventListener("pointerup", this.pointerUpListener, options);
    canvas.addEventListener("pointercancel", this.pointerUpListener, options);
    canvas.addEventListener("pointerleave", this.pointerLeaveListener, options);
    canvas.addEventListener("wheel", this.wheelListener, {
      ...options,
      passive: false,
    });
    canvas.addEventListener(
      "dblclick",
      this.doubleClickListener,
      options,
    );
  }

  /**
   * 切换空间拾取索引，并终止正在进行的拖动。
   *
   * @param nodeIndex - 新图数据对应的空间索引。
   * @returns 无返回值。
   */
  setNodeIndex(nodeIndex: SpatialNodeIndex): void {
    this.nodeIndex = nodeIndex;
    this.drag = null;
    this.canvas.classList.remove("is-dragging");
    this.canvas.classList.remove("is-dragging-node");
  }

  /**
   * 移除全部事件监听器和定时器。
   *
   * @returns 无返回值。
   */
  dispose(): void {
    this.abortController.abort();
    clearTimeout(this.interactionTimer);
    this.nodeIndex = null;
  }

  /**
   * 处理主键按下并开始节点拖动或相机平移。
   *
   * @param event - Canvas 指针按下事件。
   * @returns 无返回值。
   */
  handlePointerDown(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }

    const nodeId = this.#pickAt(event);
    const drag: DragState = {
      pointerId: event.pointerId,
      nodeId,
      mode: nodeId === null ? "pan" : "node",
      lastX: event.clientX,
      lastY: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      offsetX: 0,
      offsetY: 0,
    };

    if (nodeId !== null) {
      const world = this.#eventToWorld(event);
      const positions = this.nodeIndex.data.nodePositions;
      drag.offsetX = positions[nodeId * 2] - world.x;
      drag.offsetY = positions[nodeId * 2 + 1] - world.y;
      this.callbacks.onNodeDragStart?.(nodeId);
    }

    this.drag = drag;

    this.#beginInteraction();
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.classList.add(
      nodeId === null ? "is-dragging" : "is-dragging-node",
    );
  }

  /**
   * 处理指针移动、悬停拾取和拖动更新。
   *
   * @param event - Canvas 指针移动事件。
   * @returns 无返回值。
   */
  handlePointerMove(event: PointerEvent): void {
    if (this.drag && this.drag.pointerId === event.pointerId) {
      const deltaX = event.clientX - this.drag.lastX;
      const deltaY = event.clientY - this.drag.lastY;
      const totalX = event.clientX - this.drag.startX;
      const totalY = event.clientY - this.drag.startY;
      this.drag.moved ||= Math.hypot(totalX, totalY) > 3;

      if (deltaX !== 0 || deltaY !== 0) {
        if (this.drag.mode === "node") {
          const world = this.#eventToWorld(event);
          if (this.drag.nodeId !== null) {
            this.callbacks.onNodeDrag?.(
              this.drag.nodeId,
              world.x + this.drag.offsetX,
              world.y + this.drag.offsetY,
            );
          }
        } else {
          this.camera.panByPixels(deltaX, deltaY);
          this.callbacks.onViewChange?.();
        }
      }

      this.drag.lastX = event.clientX;
      this.drag.lastY = event.clientY;
      this.callbacks.onHover?.(null, event.clientX, event.clientY);
      return;
    }

    const nodeId = this.#pickAt(event);
    this.canvas.classList.toggle("is-hovering-node", nodeId !== null);
    this.callbacks.onHover?.(nodeId, event.clientX, event.clientY);
  }

  /**
   * 结束拖动并根据移动距离区分点击。
   *
   * @param event - Canvas 指针抬起或取消事件。
   * @returns 无返回值。
   */
  handlePointerUp(event: PointerEvent): void {
    if (!this.drag || this.drag.pointerId !== event.pointerId) {
      return;
    }

    const wasClick = !this.drag.moved;
    const draggedNodeId = this.drag.nodeId;
    const wasNodeDrag = this.drag.mode === "node";
    this.drag = null;
    this.canvas.classList.remove("is-dragging");
    this.canvas.classList.remove("is-dragging-node");

    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }

    if (wasClick) {
      const nodeId = this.#pickAt(event);
      this.callbacks.onSelect?.(nodeId, event.clientX, event.clientY);
    } else if (wasNodeDrag) {
      this.callbacks.onNodeDragEnd?.(draggedNodeId);
    }

    this.#endInteraction();
  }

  /**
   * 清除离开 Canvas 时的悬停状态。
   *
   * @returns 无返回值。
   */
  handlePointerLeave(): void {
    if (!this.drag) {
      this.callbacks.onHover?.(null, 0, 0);
    }
  }

  /**
   * 围绕指针位置进行缩放。
   *
   * @param event - Canvas 滚轮事件。
   * @returns 无返回值。
   */
  handleWheel(event: WheelEvent): void {
    event.preventDefault();
    this.#beginInteraction();
    const rect = this.canvas.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const factor = Math.exp(-event.deltaY * 0.0015);
    this.camera.zoomAt(localX, localY, factor);
    this.callbacks.onViewChange?.();

    const nodeId = this.#pickAt(event);
    this.callbacks.onHover?.(nodeId, event.clientX, event.clientY);
    this.#scheduleInteractionEnd();
  }

  /**
   * 双击适配全部节点。
   *
   * @param event - Canvas 双击事件。
   * @returns 无返回值。
   */
  handleDoubleClick(event: MouseEvent): void {
    event.preventDefault();
    this.#beginInteraction();
    this.callbacks.onFitView?.();
    this.#scheduleInteractionEnd();
  }

  /**
   * 通知上层进入高频交互状态。
   *
   * @returns 无返回值。
   */
  #beginInteraction(): void {
    clearTimeout(this.interactionTimer);
    this.interactionTimer = null;
    this.callbacks.onInteractionStart?.();
  }

  /**
   * 防抖结束高频交互状态。
   *
   * @returns 无返回值。
   */
  #scheduleInteractionEnd(): void {
    clearTimeout(this.interactionTimer);
    this.interactionTimer = setTimeout(() => {
      this.interactionTimer = null;
      this.callbacks.onInteractionEnd?.();
    }, 140);
  }

  /**
   * 立即结束高频交互状态。
   *
   * @returns 无返回值。
   */
  #endInteraction(): void {
    clearTimeout(this.interactionTimer);
    this.interactionTimer = null;
    this.callbacks.onInteractionEnd?.();
  }

  /**
   * 在指针位置拾取节点。
   *
   * @param event - 指针、滚轮或鼠标事件。
   * @returns 命中节点索引；未命中时为 `null`。
   */
  #pickAt(event: PointerEvent | WheelEvent | MouseEvent): number | null {
    if (!this.nodeIndex) {
      return null;
    }

    const world = this.#eventToWorld(event);
    return this.nodeIndex.pick(world.x, world.y, this.camera.scale);
  }

  /**
   * 将客户端事件坐标转换为世界坐标。
   *
   * @param event - 指针、滚轮或鼠标事件。
   * @returns 世界坐标点。
   */
  #eventToWorld(
    event: PointerEvent | WheelEvent | MouseEvent,
  ): WorldPoint {
    const rect = this.canvas.getBoundingClientRect();
    return this.camera.screenToWorld(
      event.clientX - rect.left,
      event.clientY - rect.top,
    );
  }
}
