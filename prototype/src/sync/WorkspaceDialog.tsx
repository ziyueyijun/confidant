import { useState } from 'react'

/**
 * 工作空间——**从菜单进入的弹窗**。
 *
 * 「工作空间」是用户在界面上看到的名字；在库里它对应的就是那个文件夹
 * （`CONTEXT.md` 里叫「库」）。
 *
 * ## 只有两个按钮
 *
 * - **打开工作空间**——在文件管理器里打开当前这个文件夹。
 * - **切换工作空间**——**弹出系统文件夹选择器**，让用户自己挑位置。
 *
 * **不显示「最近打开的」列表。** 那是一个应用替用户维护的隐式状态：
 * 它会过期、会指向已删除的文件夹、会让用户以为「选过的东西就不用再想」。
 * 而切换工作空间是一件低频、需要明确知道自己在选什么的事——
 * 每次都从文件系统里现挑，比从一个可能过期的列表里挑更可靠。
 */
export function WorkspaceDialog({ onClose }: { onClose: () => void }) {
  const [picking, setPicking] = useState(false)

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/30 p-6">
      <div className="w-full max-w-md overflow-hidden rounded-lg bg-white shadow-2xl">
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
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-1 text-[11px] text-slate-500">当前</div>
            <div className="truncate font-mono text-xs text-slate-800">
              %USERPROFILE%\知己笔记
            </div>
            <div className="mt-1 text-[10px] text-slate-400">1284 篇笔记</div>
          </div>

          <div className="mt-3 flex gap-2">
            <button className="flex-1 rounded bg-slate-800 px-3 py-2 text-xs text-white hover:bg-slate-700">
              打开工作空间
            </button>
            <button
              onClick={() => setPicking(true)}
              className="flex-1 rounded border border-slate-300 bg-white px-3 py-2 text-xs hover:bg-slate-100"
            >
              切换工作空间
            </button>
          </div>

          <div className="mt-3 text-[11px] leading-relaxed text-slate-400">
            同一时刻打开一个工作空间。切换会重新建立索引——
            搜索与反向链接都只作用于当前这一个。
          </div>
        </div>
      </div>

      {picking && <FolderPicker onClose={() => setPicking(false)} />}
    </div>
  )
}

/**
 * 系统文件夹选择器（原型里的样子）。
 *
 * 真机上这是 `dialog.showOpenDialog({ properties: ['openDirectory'] })`——
 * 由操作系统画的窗口，应用控制不了它的外观，也不该试图控制。
 * 这里画出来只是为了让流程看得见。
 */
function FolderPicker({ onClose }: { onClose: () => void }) {
  const [path, setPath] = useState('D:\\笔记\\工作')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-6">
      <div className="w-full max-w-lg overflow-hidden rounded-lg border border-slate-400 bg-slate-100 shadow-2xl">
        {/* 模仿系统窗口的标题栏 */}
        <div className="flex items-center gap-2 border-b border-slate-300 bg-slate-200 px-3 py-1.5">
          <span className="text-[11px] text-slate-600">选择文件夹</span>
          <span className="ml-auto text-[10px] text-slate-400">原型：这是系统窗口，不是应用画的</span>
        </div>

        <div className="p-3">
          <div className="mb-2 flex gap-2 text-[11px]">
            <button className="rounded border border-slate-300 bg-white px-2 py-0.5 hover:bg-slate-50">
              ←
            </button>
            <button className="rounded border border-slate-300 bg-white px-2 py-0.5 hover:bg-slate-50">
              →
            </button>
            <input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              className="flex-1 rounded border border-slate-300 px-2 py-0.5 font-mono text-[11px] outline-none focus:border-sky-500"
            />
          </div>

          <div className="h-44 overflow-auto rounded border border-slate-300 bg-white p-1">
            {[
              ['📁', '技术'],
              ['📁', '思考'],
              ['📁', '写作'],
              ['📁', '旧稿'],
            ].map(([icon, name]) => (
              <button
                key={name}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[11px] text-slate-700 hover:bg-sky-50"
              >
                <span>{icon}</span>
                {name}
              </button>
            ))}
          </div>

          <div className="mt-2 flex items-center gap-2">
            <span className="text-[11px] text-slate-500">文件夹名</span>
            <input
              defaultValue="工作"
              className="flex-1 rounded border border-slate-300 px-2 py-0.5 text-[11px] outline-none focus:border-sky-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-slate-300 bg-slate-200 px-3 py-2">
          <button
            onClick={onClose}
            className="ml-auto rounded border border-slate-400 bg-slate-100 px-4 py-1 text-[11px] hover:bg-white"
          >
            取消
          </button>
          <button
            onClick={onClose}
            className="rounded border border-sky-700 bg-sky-600 px-4 py-1 text-[11px] text-white hover:bg-sky-500"
          >
            选择文件夹
          </button>
        </div>
      </div>
    </div>
  )
}
