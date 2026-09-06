// 渲染进程可用的最小路径工具(Windows 语义)。
// 主进程用 node:path;渲染层(bundler 无法直接引 node:path)与引擎侧
// 统一走这里的同名子集,保证相对引用解析口径一致(06/16 复用)。
// 约定:传入路径先做反斜杠 → 正斜杠归一(输出为 '/' 连接,Windows 可接受)。

const SEP = /[\\/]/;

function norm(p: string): string {
  return p.replace(/\\/g, "/");
}

/** basename:取路径最后一段(去尾分隔符后;空段返回 ".")。 */
export function basename(p: string): string {
  const t = norm(p).replace(/\/+$/, "");
  if (t === "") return ".";
  const segs = t.split("/");
  return segs[segs.length - 1] ?? ".";
}

/**
 * dirname:去掉最后一段。近似 node:path.win32.dirname 的常用面:
 * 'a/b' → 'a';'a' → '.';'C:/x/y' → 'C:/x';'C:/x' → 'C:/';'' → '.'。
 */
export function dirname(p: string): string {
  const t = norm(p).replace(/\/+$/, "");
  if (t === "") return ".";
  const lastSep = t.lastIndexOf("/");
  if (lastSep === -1) return /^[A-Za-z]:/.test(t) ? t : ".";
  if (lastSep === 0) return t[0]!;
  const d = t.slice(0, lastSep);
  return /^[A-Za-z]:$/.test(d) ? `${d}/` : d;
}

/** 连接段(不解析 . 与 ..;归一反斜杠)。 */
export function join(...parts: string[]): string {
  const out: string[] = [];
  for (const part of parts) {
    for (const seg of norm(part).split("/")) {
      if (seg !== "" && seg !== ".") out.push(seg);
    }
  }
  const head = parts[0] ?? "";
  const prefix = norm(head).startsWith("//") ? "//" : "";
  return prefix + out.join("/");
}

/**
 * 解析相对引用(相对 baseDir,允许 . 与 ..)。
 * baseDir 应为绝对路径(盘符或 UNC);绝对引用原样返回。
 * 结果以 '/' 连接;盘符写法 'C:/…'、UNC 写法 '//server/share/…'。
 */
export function resolveRelative(baseDir: string, rel: string): string {
  const r = norm(rel);
  if (isAbsolute(r)) return r;
  const b = norm(baseDir);
  const isUnc = b.startsWith("//");
  const stack: string[] = [];
  for (const seg of (b + "/" + r).split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      // 不越过根:盘符根/UNC 服务器+共享 之下才允许弹栈
      const floor = isUnc ? 2 : 1;
      if (stack.length > floor && !/^[A-Za-z]:$/.test(stack[stack.length - 1] ?? "")) {
        stack.pop();
      }
      continue;
    }
    stack.push(seg);
  }
  return (isUnc ? "//" : "") + stack.join("/");
}

/** Windows 风格绝对路径判断(盘符、UNC、/ 或 \ 开头)。 */
export function isAbsolute(p: string): boolean {
  const t = norm(p);
  return /^[A-Za-z]:\//.test(t) || t.startsWith("//") || t.startsWith("/");
}

/** 扩展名(小写,含点);无扩展名返回 ""。 */
export function extname(p: string): string {
  const base = basename(p);
  const idx = base.lastIndexOf(".");
  if (idx <= 0) return "";
  return base.slice(idx).toLowerCase();
}
