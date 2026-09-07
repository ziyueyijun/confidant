// 主题状态机(01):三态 github/night/newsprint 的规范化与迁移。
// 纯函数,供 use-app-theme 与单测共用;「跟随系统」已取消(01 决议)。

export type ThemeId = "github" | "night" | "newsprint";

export const THEMES: ReadonlyArray<{ id: ThemeId; label: string }> = [
  { id: "github", label: "GitHub" },
  { id: "night", label: "Night" },
  { id: "newsprint", label: "Newsprint" },
];

const THEME_IDS = new Set<string>(THEMES.map((t) => t.id));

/** 持久化值 → 主题 id:旧值迁移(light→github、dark→night、system→github 默认),
 * 其余非法值一律回落默认 github。 */
export function normalizeTheme(value: unknown): ThemeId {
  if (typeof value === "string" && THEME_IDS.has(value)) return value as ThemeId;
  if (value === "light") return "github";
  if (value === "dark") return "night";
  return "github";
}

/** 菜单勾选态(单源):某主题 id 是否勾选。 */
export function isThemeChecked(current: ThemeId, id: ThemeId): boolean {
  return current === id;
}
