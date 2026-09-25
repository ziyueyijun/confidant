/**
 * 同步界面的假数据。全部在内存里，不落盘。
 *
 * 每个 scenario 对应一种真实会遇到的同步状态——原型要能把这些状态**都看一遍**，
 * 因为「同步失败长什么样」「冲突长什么样」正是这一票要回答的问题。
 *
 * 界面上的每一条约束都来自 #3 / #17 / #19 的决议，不是设计者随手加的。
 */

// ---- 配置 ----

export interface SyncConfig {
  server: string
  path: string
  username: string
  /** 界面上只显示掩码；真实凭据存系统侧，不入库 */
  passwordMask: string
  vaultUuid: string
}

export const 配置: SyncConfig = {
  server: 'https://dav.example.com/dav',
  path: '/知己笔记/',
  username: 'me',
  passwordMask: '••••••••••••',
  vaultUuid: '7f3a1c92-4e08-4b6d-9a15-2c8e5f0b7d31',
}

// ---- 状态 ----

export type SyncPhase = 'never' | 'idle' | 'syncing' | 'failed' | 'unconfigured'

export interface SyncStatus {
  phase: SyncPhase
  /** 「上次同步于 X 分钟前」里的那个 X；null = 从未同步过 */
  minutesAgo: number | null
  /** 已同步的文件数 */
  syncedFiles: number
  /** 失败时的具体原因——「下载失败：连接超时」而非「更新失败」 */
  error: string | null
  /** 同步中的进度 */
  progress: { done: number; total: number } | null
  /** 当前正在处理的文件（进度条下面那行小字） */
  currentFile: string | null
}

// ---- 待处理的变更 ----

export type ChangeKind = 'upload' | 'download' | 'delete-local' | 'delete-remote' | 'conflict'

export interface Change {
  kind: ChangeKind
  path: string
  /** 删除类的变更带上这个，用来在确认界面上说清后果 */
  size?: string
}

export const 待处理: Change[] = [
  { kind: 'upload', path: '技术/为什么是逐字索引.md' },
  { kind: 'upload', path: '思考/知识与连接.md' },
  { kind: 'upload', path: 'journal/2026/2026-09-25.md' },
  { kind: 'upload', path: '技术/待整理/正则备忘.md' },
  { kind: 'upload', path: '技术/待整理/工具箱.md' },
  { kind: 'upload', path: '思考/长期项目/第二大脑/架构草案.md' },
  { kind: 'upload', path: 'assets/003/20260925-143022-a1b2.png', size: '2.1 MB' },
  { kind: 'upload', path: 'assets/003/20260925-150817-c3d4.png', size: '840 KB' },
  { kind: 'upload', path: '技术/检索方案对比.md' },
  { kind: 'upload', path: '思考/关于「不整理」.md' },
  { kind: 'upload', path: '技术/待整理/快捷键草稿.md' },
  { kind: 'upload', path: 'journal/2026/2026-09-24.md' },
  { kind: 'download', path: '思考/长期项目/第二大脑/灵感清单.md' },
  { kind: 'download', path: '技术/待整理/WebDAV 笔记.md' },
  { kind: 'download', path: 'journal/2026/2026-09-23.md' },
  { kind: 'conflict', path: '思考/读书笔记.md' },
  { kind: 'conflict', path: '技术/索引体积实测.md' },
]

// ---- 冲突副本 ----

export interface Conflict {
  id: string
  /** 原笔记路径 */
  path: string
  /** 副本文件名——只用小写 ASCII，扩展名留在末尾 */
  copyName: string
  /** 副本是什么时候产生的 */
  at: string
  /** 来自哪台机器 */
  from: string
  localBody: string
  remoteBody: string
}

export const 冲突列表: Conflict[] = [
  {
    id: 'c1',
    path: '思考/读书笔记.md',
    copyName: '读书笔记.conflict-20260925-1430-office.md',
    at: '今天 14:30',
    from: 'office',
    localBody: `## 核心观点

作者认为，阅读的目的不是记住，而是**改变自己的思考方式**。

## 摘抄

> 我们读一本书，不是为了把它读完，而是为了被它改变。`,
    remoteBody: `## 核心观点

作者认为，阅读的目的不是记住，而是**改变自己的思考方式**。这一点在第三章讲得最清楚。

## 摘抄

> 我们读一本书，不是为了把它读完，而是为了被它改变。

## 我的批注

读到这段时我想起去年读的那本——两本书说的是同一件事，但切入点完全不同。`,
  },
  {
    id: 'c2',
    path: '技术/索引体积实测.md',
    copyName: '索引体积实测.conflict-20260924-0912-home.md',
    at: '昨天 09:12',
    from: 'home',
    localBody: `100 万字档，索引 13.99 MiB，5.18 倍。

结论：换召回率划算。`,
    remoteBody: `100 万字档，索引 13.99 MiB，5.18 倍。查询 0.3–5ms。

结论：换召回率划算。补充：增量编辑 0.23ms，全库 rebuild 116ms——
「必须做增量索引」的架构压力消失了。`,
  },
]

/** 大批量冲突——用来回答「冲突多了会不会放不下」 */
export const 大量冲突: Conflict[] = [
  ...冲突列表,
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `cx${i}`,
    path: `技术/待整理/草稿-${String(i + 3).padStart(2, '0')}.md`,
    copyName: `草稿-${String(i + 3).padStart(2, '0')}.conflict-2026092${i % 9}-1${i % 10}00-home.md`,
    at: `${i + 2} 天前`,
    from: 'home',
    localBody: `本地版本 ${i + 3}\n\n这一段在本地被改过。`,
    remoteBody: `远端版本 ${i + 3}\n\n这一段在远端被改过，内容不一样。`,
  })),
]

// ---- 场景 ----

export type ScenarioKey =
  | 'idle'
  | 'syncing'
  | 'failed'
  | 'first'
  | 'conflicts'
  | 'manyConflicts'
  | 'danger'
  | 'unconfigured'

export interface Scenario {
  key: ScenarioKey
  label: string
  /** 一句话说明这个场景在检验什么 */
  note: string
}

export const 场景: Scenario[] = [
  { key: 'idle', label: '空闲', note: '已连接、刚同步过——最常见的状态，界面不该在这里占地方' },
  { key: 'syncing', label: '同步中', note: '进度可见，且要能看出「还要多久」' },
  { key: 'failed', label: '失败', note: '「悄悄进行」可以，「悄悄失败」不可接受——错误必须具体' },
  { key: 'first', label: '首次同步', note: '两边都有内容且不同——绝不自动合并，停下来问用户' },
  { key: 'conflicts', label: '有冲突', note: '待处理的副本列表，每条要能并排看两份' },
  { key: 'manyConflicts', label: '冲突很多', note: '12 条冲突——检验冲突列表放不下时怎么办' },
  { key: 'danger', label: '批量删除', note: '一次要删 47 篇，超过阈值先停下问用户' },
  { key: 'unconfigured', label: '未配置', note: '还没填 WebDAV 信息时的样子' },
]

/** 场景说明文字——给控制条用。 */
export function 场景说明(key: string): string {
  const s = 场景.find((x) => x.key === key) ?? 场景[0]
  return `${s.label}：${s.note}`
}

export interface SyncMock {
  scenario: ScenarioKey
  status: SyncStatus
  changes: Change[]
  conflicts: Conflict[]
  /** 批量删除的篇数——只在 danger 场景有值 */
  pendingDeletes: number
  /** 首次同步时两边各有多少内容 */
  firstSync: { localCount: number; remoteCount: number; remoteAt: string } | null
}

const 状态: Record<ScenarioKey, SyncStatus> = {
  idle: {
    phase: 'idle',
    minutesAgo: 8,
    syncedFiles: 1284,
    error: null,
    progress: null,
    currentFile: null,
  },
  syncing: {
    phase: 'syncing',
    minutesAgo: 8,
    syncedFiles: 1284,
    error: null,
    progress: { done: 1207, total: 3000 },
    currentFile: 'assets/003/20260925-150817-c3d4.png',
  },
  failed: {
    phase: 'failed',
    minutesAgo: 8,
    syncedFiles: 1284,
    error: '连接超时（dav.example.com 30 秒无响应）。下次启动会自动重试。',
    progress: null,
    currentFile: null,
  },
  first: {
    phase: 'never',
    minutesAgo: null,
    syncedFiles: 0,
    error: null,
    progress: null,
    currentFile: null,
  },
  conflicts: {
    phase: 'idle',
    minutesAgo: 8,
    syncedFiles: 1284,
    error: null,
    progress: null,
    currentFile: null,
  },
  manyConflicts: {
    phase: 'idle',
    minutesAgo: 8,
    syncedFiles: 1284,
    error: null,
    progress: null,
    currentFile: null,
  },
  danger: {
    phase: 'idle',
    minutesAgo: 8,
    syncedFiles: 1284,
    error: null,
    progress: null,
    currentFile: null,
  },
  unconfigured: {
    phase: 'unconfigured',
    minutesAgo: null,
    syncedFiles: 0,
    error: null,
    progress: null,
    currentFile: null,
  },
}

export function 取场景(key: ScenarioKey): SyncMock {
  return {
    scenario: key,
    status: 状态[key],
    // 只有相关场景才给出待处理清单，其余留空——免得每个场景都长得一样
    changes: key === 'idle' || key === 'unconfigured' ? [] : 待处理,
    conflicts: key === 'conflicts' ? 冲突列表 : key === 'manyConflicts' ? 大量冲突 : [],
    pendingDeletes: key === 'danger' ? 47 : 0,
    firstSync:
      key === 'first'
        ? { localCount: 1284, remoteCount: 1279, remoteAt: '3 天前（2026-09-22 19:04）' }
        : null,
  }
}

// ---- 文案 ----

/** 「上次同步于……」——四种相位各有说法，不能糊成一个词 */
export function 状态文字(s: SyncStatus): string {
  switch (s.phase) {
    case 'unconfigured':
      return '尚未配置 WebDAV'
    case 'never':
      return '从未同步过'
    case 'syncing':
      return s.progress ? `正在同步 ${s.progress.done} / ${s.progress.total}` : '正在同步'
    case 'failed':
      return '上次同步失败'
    case 'idle':
      return s.minutesAgo === null ? '已连接' : `上次同步于 ${s.minutesAgo} 分钟前`
  }
}

/** 三个按钮的语义——这是整票最容易做错的地方，文案要顶住 */
export const 语义说明 = {
  同步: '比对本地、远端与上次同步的记录，两边都改过的走冲突处理。不会覆盖任何一侧。',
  上传: '以本地为准，把本地内容推送到远端。会无条件覆盖远端不同的文件。',
  下载: '以远端为准，把远端内容拉取到本地。会无条件覆盖本地不同的文件。',
}
