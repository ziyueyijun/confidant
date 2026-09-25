import { useState } from 'react'

/**
 * 工作空间——**从菜单进入的弹窗**。
 *
 * 「工作空间」是用户在界面上看到的名字；在库里它对应的就是那个文件夹
 * （`CONTEXT.md` 里叫「库」）。这里用「工作空间」是因为它更直白：
 * 它回答的是「我现在在哪个文件夹里写东西」。
 *
 * 这一节管的是**动作**（打开、切换、在文件管理器里看），不是偏好设置——
 * 所以它不放进设置弹窗。原先散在菜单里的「在文件管理器中打开笔记库」
 * 收进这里，菜单不再重复。
 */
export function WorkspaceDialog({ onClose }: { onClose: () => void }) {
  const [switching, setSwitching] = useState(false)

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/30 p-6">
      <div className="w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex items-center border-b border-slate-200 px-4 py-2.5">
          <span className="text-sm font-medium text-slate-700">工作空间</span>
          <button
            onClick={onClose}
            className="ml-auto rounded px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            关闭
          </button>
        </div>

        <div className="p-4">
          {/* 当前工作空间 */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-[11px] text-slate-500">当前</span>
              <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">
                已打开
              </span>
            </div>
            <div className="truncate font-mono text-xs text-slate-800">
              %USERPROFILE%\知己笔记
            </div>
            <div className="mt-1 text-[10px] text-slate-400">1284 篇笔记 · 上次同步于 8 分钟前</div>
          </div>

          {/* 动作 */}
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="rounded bg-slate-800 px-3 py-1.5 text-xs text-white hover:bg-slate-700">
              打开工作空间
            </button>
            <button className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-100">
              在文件管理器中打开
            </button>
            <button
              onClick={() => setSwitching((v) => !v)}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-100"
            >
              切换工作空间…
            </button>
          </div>

          {/* 切换：列出最近打开的 */}
          {switching && (
            <div className="mt-3 rounded-lg border border-slate-200">
              <div className="border-b border-slate-100 px-3 py-1.5 text-[11px] text-slate-500">
                最近打开的
              </div>
              <ul>
                {[
                  ['%USERPROFILE%\\知己笔记', '当前', true],
                  ['D:\\笔记\\工作', '3 天前', false],
                  ['%USERPROFILE%\\写作', '2 个月前', false],
                ].map(([path, when, current]) => (
                  <li key={path as string}>
                    <button
                      className={`flex w-full items-center gap-2 border-b border-slate-50 px-3 py-2 text-left last:border-b-0 ${
                        current ? 'bg-slate-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <span className="truncate font-mono text-[11px] text-slate-700">
                        {path as string}
                      </span>
                      <span className="ml-auto shrink-0 text-[10px] text-slate-400">
                        {when as string}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <button className="w-full border-t border-slate-100 px-3 py-2 text-left text-[11px] text-slate-500 hover:bg-slate-50">
                选择其他文件夹…
              </button>
            </div>
          )}

          <div className="mt-3 text-[11px] leading-relaxed text-slate-400">
            同一时刻打开一个工作空间。切换会重新建立索引——
            搜索与反向链接都只作用于当前这一个。
          </div>
        </div>
      </div>
    </div>
  )
}
