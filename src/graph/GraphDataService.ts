import type {
  GraphGenerationOptions,
  GraphPayload,
} from "../lib/types.js";

/** Worker 进度消息。 */
interface WorkerProgressMessage {
  /** 消息类型。 */
  type: "progress";
  /** 对应生成请求 ID。 */
  requestId: number;
  /** 0～1 生成进度。 */
  progress: number;
}

/** Worker 错误消息。 */
interface WorkerErrorMessage {
  /** 消息类型。 */
  type: "error";
  /** 对应生成请求 ID。 */
  requestId: number;
  /** 可读错误文本。 */
  message: string;
}

/** Worker 完成消息。 */
interface WorkerCompleteMessage {
  /** 消息类型。 */
  type: "complete";
  /** 对应生成请求 ID。 */
  requestId: number;
  /** 生成的 SoA 图数据。 */
  payload: GraphPayload;
}

type WorkerMessage =
  | WorkerProgressMessage
  | WorkerErrorMessage
  | WorkerCompleteMessage;

/**
 * 管理 Worker 数据生成和 transferable 缓冲区生命周期。
 */
export class GraphDataService {
  /** 当前活动 Worker。 */
  private worker: Worker | null;
  /** 最近一次请求 ID。 */
  private activeRequestId: number;
  /** 当前请求被取消时需要调用的 reject。 */
  private activeReject:
    | ((reason?: DOMException | Error) => void)
    | null;

  /**
   * 创建数据服务。
   */
  constructor() {
    this.worker = null;
    this.activeRequestId = 0;
    this.activeReject = null;
  }

  /**
   * 在 Worker 中生成图数据。
   *
   * @param options - 合成图参数。
   * @param onProgress - 0～1 进度回调。
   * @returns 生成的 SoA 图数据。
   */
  load(
    options: GraphGenerationOptions,
    onProgress: (progress: number) => void = () => {},
  ): Promise<GraphPayload> {
    this.cancel();
    const requestId = this.activeRequestId + 1;
    this.activeRequestId = requestId;

    return new Promise<GraphPayload>((resolve, reject) => {
      const worker = new Worker(
        new URL("./data.worker.ts", import.meta.url),
        { type: "module" },
      );
      this.worker = worker;
      this.activeReject = reject;

      worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        const message = event.data;
        console.log(event)
        if (message.requestId !== requestId) {
          return;
        }
        if (message.type === "progress") {
          onProgress(message.progress);
          return;
        }
        if (message.type === "error") {
          this.#finishWorker();
          reject(new Error(message.message));
          return;
        }
        if (message.type === "complete") {
          this.#finishWorker();
          resolve(message.payload);
        }
      };

      worker.onerror = (event) => {
        this.#finishWorker();
        reject(new Error(event.message || "数据 Worker 执行失败"));
      };

      worker.postMessage({ type: "generate", requestId, options });
    });
  }

  /**
   * 取消当前数据请求。
   */
  cancel(): void {
    if (!this.worker) {
      return;
    }
    this.worker.terminate();
    this.worker = null;
    if (this.activeReject) {
      this.activeReject(new DOMException("数据请求已取消", "AbortError"));
      this.activeReject = null;
    }
  }

  /**
   * 释放 Worker。
   */
  dispose(): void {
    this.cancel();
  }

  /**
   * 清理当前 Worker 引用。
   */
  #finishWorker(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.activeReject = null;
  }
}
