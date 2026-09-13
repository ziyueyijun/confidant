// 同步滚动日志的轮转步骤(票 06;决议 43)。纯函数、无 IO,便于单测。
// 与 sync-log.ts 分开,是因为 sync-log.ts 依赖 Electron(app.getPath),不便在单测里加载。

export interface RotationStep {
  from: string;
  to: string;
}

/**
 * 生成单份文件 + 编号备份的轮转改名步骤:保留 `file.1` … `file.keep`,丢弃更旧的。
 * 形如 `file.2 → file.3`、`file.1 → file.2`、`file → file.1`(`keep = 3` 时)。
 * **从最大序号往小做**,否则 `file → file.1` 会先覆盖掉还没挪走的 `file.1`。
 * 返回顺序即执行顺序;调用方对每一步「源不存在」容错。
 */
export function rotationSteps(filePath: string, keep: number): RotationStep[] {
  const steps: RotationStep[] = [];
  for (let i = Math.max(keep - 1, 0); i >= 1; i--) {
    steps.push({ from: `${filePath}.${i}`, to: `${filePath}.${i + 1}` });
  }
  steps.push({ from: filePath, to: `${filePath}.1` });
  return steps;
}
