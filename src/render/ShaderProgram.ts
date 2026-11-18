/**
 * 编译、链接并缓存 uniform location 的 WebGL2 着色器程序。
 */
export class ShaderProgram {
  /** WebGL2 上下文。 */
  readonly gl: WebGL2RenderingContext;
  /** 顶点着色器。 */
  vertexShader: WebGLShader | null;
  /** 片元着色器。 */
  fragmentShader: WebGLShader | null;
  /** 已链接的着色器程序。 */
  program: WebGLProgram | null;
  /** uniform 名称到 location 的缓存。 */
  private readonly uniformLocations: Map<
    string,
    WebGLUniformLocation | null
  >;

  /**
   * 编译并链接着色器。
   *
   * @param gl - WebGL2 上下文。
   * @param vertexSource - 顶点着色器源码。
   * @param fragmentSource - 片元着色器源码。
   */
  constructor(
    gl: WebGL2RenderingContext,
    vertexSource: string,
    fragmentSource: string,
  ) {
    this.gl = gl;
    this.vertexShader = this.#compile(gl.VERTEX_SHADER, vertexSource);
    this.fragmentShader = this.#compile(
      gl.FRAGMENT_SHADER,
      fragmentSource,
    );
    this.program = gl.createProgram();
    this.uniformLocations = new Map();
    if (!this.program) {
      throw new Error("无法创建 WebGL program");
    }
    gl.attachShader(this.program, this.vertexShader);
    gl.attachShader(this.program, this.fragmentShader);
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(this.program) || "未知链接错误";
      this.dispose();
      throw new Error(`着色器链接失败：${message}`);
    }
  }

  /**
   * 将当前程序设为 WebGL 活动程序。
   *
   * @returns 无返回值。
   */
  use(): void {
    this.gl.useProgram(this.program);
  }

  /**
   * 查询并缓存 uniform location。
   *
   * @param name - uniform 名称。
   * @returns uniform location；不存在时返回 `null`。
   */
  uniform(name: string): WebGLUniformLocation | null {
    if (!this.uniformLocations.has(name)) {
      this.uniformLocations.set(
        name,
        this.gl.getUniformLocation(this.program, name),
      );
    }
    return this.uniformLocations.get(name) ?? null;
  }

  /**
   * 删除程序及其着色器。
   *
   * @returns 无返回值。
   */
  dispose(): void {
    const gl = this.gl;
    if (this.program) {
      gl.deleteProgram(this.program);
      this.program = null;
    }
    if (this.vertexShader) {
      gl.deleteShader(this.vertexShader);
      this.vertexShader = null;
    }
    if (this.fragmentShader) {
      gl.deleteShader(this.fragmentShader);
      this.fragmentShader = null;
    }
  }

  /**
   * 编译单个着色器并检查编译状态。
   *
   * @param type - 顶点或片元着色器类型。
   * @param source - 着色器源码。
   * @returns 编译成功的着色器。
   */
  #compile(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) {
      throw new Error("无法创建 WebGL shader");
    }
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) || "未知编译错误";
      gl.deleteShader(shader);
      throw new Error(`着色器编译失败：${message}`);
    }
    return shader;
  }
}
