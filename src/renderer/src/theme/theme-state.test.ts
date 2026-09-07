import { describe, expect, it } from "vitest";
import { isThemeChecked, normalizeTheme, THEMES } from "./theme-state";

describe("normalizeTheme(01:三态 + 旧值迁移)", () => {
  it("接受三个合法主题 id 原样返回", () => {
    expect(normalizeTheme("github")).toBe("github");
    expect(normalizeTheme("night")).toBe("night");
    expect(normalizeTheme("newsprint")).toBe("newsprint");
  });

  it("旧值 light → github、dark → night(存储字段升级)", () => {
    expect(normalizeTheme("light")).toBe("github");
    expect(normalizeTheme("dark")).toBe("night");
  });

  it("旧值 system / null / 非法值 → 默认 github(跟随系统已取消)", () => {
    expect(normalizeTheme("system")).toBe("github");
    expect(normalizeTheme(null)).toBe("github");
    expect(normalizeTheme(undefined)).toBe("github");
    expect(normalizeTheme(42)).toBe("github");
    expect(normalizeTheme("blue")).toBe("github");
  });

  it("菜单勾选态与当前主题一一对应", () => {
    expect(isThemeChecked("night", "night")).toBe(true);
    expect(isThemeChecked("night", "github")).toBe(false);
    expect(isThemeChecked("newsprint", "newsprint")).toBe(true);
  });

  it("主题清单含三主题且 id 唯一(菜单构建数据源)", () => {
    expect(THEMES.map((t) => t.id)).toEqual(["github", "night", "newsprint"]);
  });
});
