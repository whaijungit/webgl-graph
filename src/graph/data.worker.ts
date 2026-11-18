import { SyntheticGraphGenerator } from "./SyntheticGraphGenerator.js";
import type { GraphGenerationOptions } from "../lib/types.js";

/** Worker 图数据生成请求。 */
interface GenerateMessage {
  /** 消息类型。 */
  type: "generate";
  /** 请求 ID，用于忽略已取消请求。 */
  requestId: number;
  /** 合成图生成参数。 */
  options: GraphGenerationOptions;
}

self.onmessage = (event: MessageEvent<GenerateMessage>) => {
  const message = event.data;

  if (message.type !== "generate") {
    return;
  }

  try {
    const generator = new SyntheticGraphGenerator(message.options);
    const payload = generator.generate((progress: number) => {
      postMessage({
        type: "progress",
        requestId: message.requestId,
        progress,
      });
    });

    const transferables: Transferable[] = [
      ...new Set<ArrayBuffer>(
        Object.values(payload)
          .filter(
            (value): value is ArrayBufferView<ArrayBuffer> =>
              ArrayBuffer.isView(value),
          )
          .map((view) => view.buffer),
      ),
    ] as Transferable[];

    postMessage(
      {
        type: "complete",
        requestId: message.requestId,
        payload,
      },
      transferables,
    );
  } catch (error) {
    postMessage({
      type: "error",
      requestId: message.requestId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
