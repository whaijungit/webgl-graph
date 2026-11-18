/**
 * 可复现的伪随机数生成器。
 */
export class SeededRandom {
  /** 当前 32 位伪随机状态。 */
  private state: number;

  /**
   * 创建伪随机数生成器。
   *
   * @param seed - 随机种子。
   */
  constructor(seed: number = 1) {
    this.state = seed >>> 0;
  }

  /**
   * 生成 0～1 的随机数。
   *
   * @returns 随机数。
   */
  next(): number {
    let value = (this.state += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * 生成指定范围内的随机数。
   *
   * @param min - 最小值。
   * @param max - 最大值。
   * @returns 范围内的随机数。
   */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /**
   * 生成指定上限内的整数。
   *
   * @param maxExclusive - 不包含的上限。
   * @returns 随机整数。
   */
  integer(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }
}
