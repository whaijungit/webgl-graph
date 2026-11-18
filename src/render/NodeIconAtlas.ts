const ATLAS_COLUMNS = 4;
const ATLAS_ROWS = 2;
const CELL_SIZE = 128;

/**
 * 在单个 Canvas 纹理中生成并共享 8 种节点图标。
 */
export class NodeIconAtlas {
  /** WebGL2 上下文。 */
  readonly gl: WebGL2RenderingContext;
  /** 图集列数。 */
  readonly columns: number;
  /** 图集行数。 */
  readonly rows: number;
  /** 图集源 Canvas。 */
  readonly canvas: HTMLCanvasElement;
  /** 图集 Canvas 2D 上下文。 */
  readonly context: CanvasRenderingContext2D;
  /** 上传到 GPU 的图集纹理。 */
  texture: WebGLTexture | null;

  /**
   * 创建并上传节点图标图集。
   *
   * @param gl - WebGL2 上下文。
   */
  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.columns = ATLAS_COLUMNS;
    this.rows = ATLAS_ROWS;
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.columns * CELL_SIZE;
    this.canvas.height = this.rows * CELL_SIZE;
    const context = this.canvas.getContext("2d");
    if (!context) {
      throw new Error("无法创建节点图标图集上下文");
    }
    this.context = context;
    this.#drawAtlas();
    this.texture = this.#createTexture();
  }

  /**
   * 将图集纹理绑定到指定纹理单元。
   *
   * @param unit - 纹理单元索引。
   * @returns 无返回值。
   */
  bind(unit: number = 0): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
  }

  /**
   * 删除 GPU 图集纹理。
   *
   * @returns 无返回值。
   */
  dispose(): void {
    if (this.texture) {
      this.gl.deleteTexture(this.texture);
    }
    this.texture = null;
  }

  /**
   * 在共享 Canvas 中绘制全部图标。
   *
   * @returns 无返回值。
   */
  #drawAtlas(): void {
    const context = this.context;
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const icons: Array<
      [string, (context: CanvasRenderingContext2D) => void]
    > = [
      ["#2b7fff", this.#drawServer.bind(this)],
      ["#bb5cff", this.#drawCloud.bind(this)],
      ["#ff5f87", this.#drawUser.bind(this)],
      ["#ffb020", this.#drawLocation.bind(this)],
      ["#3dd9a4", this.#drawBuilding.bind(this)],
      ["#ff7657", this.#drawVehicle.bind(this)],
      ["#27c7ed", this.#drawRoute.bind(this)],
      ["#7bd34f", this.#drawDatabase.bind(this)],
    ];

    icons.forEach(([color, drawIcon], index) => {
      const column = index % this.columns;
      const row = Math.floor(index / this.columns);
      const x = column * CELL_SIZE;
      const y = row * CELL_SIZE;
      this.#drawTile(context, x, y, color);
      context.save();
      context.translate(
        x + CELL_SIZE * 0.5,
        y + CELL_SIZE * 0.5,
      );
      context.strokeStyle = "#f3fbff";
      context.fillStyle = "#f3fbff";
      context.lineWidth = 16;
      context.lineCap = "round";
      context.lineJoin = "round";
      drawIcon(context);
      context.restore();
    });
  }

  /**
   * 绘制单个图集底板。
   *
   * @param context - 图集 Canvas 上下文。
   * @param x - 底板左上角 X。
   * @param y - 底板左上角 Y。
   * @param color - 底板颜色。
   * @returns 无返回值。
   */
  #drawTile(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    color: string,
  ): void {
    context.save();
    context.beginPath();
    context.roundRect(x + 7, y + 7, CELL_SIZE - 14, CELL_SIZE - 14, 27);
    context.fillStyle = color;
    context.fill();
    context.lineWidth = 5;
    context.strokeStyle = "rgba(255, 255, 255, 0.32)";
    context.stroke();
    context.restore();
  }

  /**
   * 绘制服务器图标。
   *
   * @param context - 图集 Canvas 上下文。
   * @returns 无返回值。
   */
  #drawServer(context: CanvasRenderingContext2D): void {
    for (let row = -1; row <= 1; row += 1) {
      context.strokeRect(-31, row * 25 - 10, 62, 19);
      context.beginPath();
      context.arc(22, row * 25 - 1, 3.5, 0, Math.PI * 2);
      context.fill();
    }
  }

  /**
   * 绘制云服务图标。
   *
   * @param context - 图集 Canvas 上下文。
   * @returns 无返回值。
   */
  #drawCloud(context: CanvasRenderingContext2D): void {
    context.beginPath();
    context.arc(-20, 7, 19, Math.PI * 0.5, Math.PI * 1.5);
    context.arc(0, -9, 25, Math.PI, Math.PI * 1.9);
    context.arc(26, 5, 17, Math.PI * 1.15, Math.PI * 0.5);
    context.lineTo(26, 24);
    context.lineTo(-20, 24);
    context.closePath();
    context.stroke();
  }

  /**
   * 绘制用户图标。
   *
   * @param context - 图集 Canvas 上下文。
   * @returns 无返回值。
   */
  #drawUser(context: CanvasRenderingContext2D): void {
    context.beginPath();
    context.arc(0, -17, 17, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.arc(0, 34, 31, Math.PI * 1.13, Math.PI * 1.87);
    context.stroke();
  }

  /**
   * 绘制位置图标。
   *
   * @param context - 图集 Canvas 上下文。
   * @returns 无返回值。
   */
  #drawLocation(context: CanvasRenderingContext2D): void {
    context.beginPath();
    context.moveTo(0, 40);
    context.bezierCurveTo(-12, 22, -30, 2, -30, -15);
    context.arc(0, -15, 30, Math.PI, 0);
    context.bezierCurveTo(30, 2, 12, 22, 0, 40);
    context.closePath();
    context.stroke();
    context.beginPath();
    context.arc(0, -15, 9, 0, Math.PI * 2);
    context.fill();
  }

  /**
   * 绘制建筑图标。
   *
   * @param context - 图集 Canvas 上下文。
   * @returns 无返回值。
   */
  #drawBuilding(context: CanvasRenderingContext2D): void {
    context.strokeRect(-33, -38, 66, 76);
    context.beginPath();
    for (let x = -18; x <= 18; x += 18) {
      context.moveTo(x, -38);
      context.lineTo(x, -12);
    }
    for (let y = -22; y <= 20; y += 15) {
      context.moveTo(-33, y);
      context.lineTo(33, y);
    }
    context.stroke();
  }

  /**
   * 绘制车辆图标。
   *
   * @param context - 图集 Canvas 上下文。
   * @returns 无返回值。
   */
  #drawVehicle(context: CanvasRenderingContext2D): void {
    context.beginPath();
    context.moveTo(-37, 14);
    context.lineTo(-28, -6);
    context.lineTo(-14, -6);
    context.lineTo(-6, -22);
    context.lineTo(15, -22);
    context.lineTo(27, -6);
    context.lineTo(34, -6);
    context.quadraticCurveTo(42, 0, 40, 16);
    context.lineTo(-37, 16);
    context.closePath();
    context.stroke();
    context.beginPath();
    context.arc(-20, 20, 9, 0, Math.PI * 2);
    context.arc(23, 20, 9, 0, Math.PI * 2);
    context.stroke();
  }

  /**
   * 绘制路线图标。
   *
   * @param context - 图集 Canvas 上下文。
   * @returns 无返回值。
   */
  #drawRoute(context: CanvasRenderingContext2D): void {
    context.beginPath();
    context.moveTo(-36, 27);
    context.bezierCurveTo(-8, -36, 14, 40, 37, -26);
    context.stroke();
    context.beginPath();
    context.arc(-36, 27, 7, 0, Math.PI * 2);
    context.arc(37, -26, 7, 0, Math.PI * 2);
    context.fill();
  }

  /**
   * 绘制数据库图标。
   *
   * @param context - 图集 Canvas 上下文。
   * @returns 无返回值。
   */
  #drawDatabase(context: CanvasRenderingContext2D): void {
    context.beginPath();
    context.ellipse(0, -29, 32, 12, 0, 0, Math.PI * 2);
    context.moveTo(-32, -29);
    context.lineTo(-32, 29);
    context.moveTo(32, -29);
    context.lineTo(32, 29);
    context.stroke();
    for (let y = -10; y <= 29; y += 20) {
      context.beginPath();
      context.ellipse(0, y, 32, 12, 0, 0, Math.PI);
      context.stroke();
    }
  }

  /**
   * 将 Canvas 图集上传为 WebGL 纹理。
   *
   * @returns 新纹理；创建失败时返回 `null`。
   */
  #createTexture(): WebGLTexture | null {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this.canvas,
    );
    gl.bindTexture(gl.TEXTURE_2D, null);
    return texture;
  }
}
