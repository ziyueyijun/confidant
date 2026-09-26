#!/usr/bin/env node
// 重新生成原型用的 Sarasa Mono SC 网页字体。
//
// 产物（public/fonts/，约 8 MB）与中间缓存（.font-cache/，约 190 MB——下载的
// 压缩包、解压出的 TTF、切分中间产物）都不入库：体积大，且字体是第三方的
// （OFL-1.1）。这个脚本就是那份「重抓脚本」，任何时候都能把产物重建出来。
//
//   node scripts/build-fonts.mjs
//
// 依赖外部命令：tar（Windows 10+ 自带的 bsdtar 支持 7z）与 npx。

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SARASA_VERSION = '1.0.41'
const SARASA_ASSET = `SarasaMonoSC-TTF-Unhinted-${SARASA_VERSION}.7z`
const SARASA_URL = `https://github.com/be5invis/Sarasa-Gothic/releases/download/v${SARASA_VERSION}/${SARASA_ASSET}`
// GitHub Release 资产自带的 sha256（assets[].digest），随版本更新。
const SARASA_SHA256 = '6e3ac724c4bf7d099aa44a2cc24ccdd4a3234c3248b13b3a4a76d570e8c79a26'

const WEIGHTS = [
  { name: 'regular', weight: 400, ttf: 'SarasaMonoSC-Regular.ttf' },
  { name: 'bold', weight: 700, ttf: 'SarasaMonoSC-Bold.ttf' },
]

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cacheDir = path.join(root, '.font-cache')
const outDir = path.join(root, 'public', 'fonts', 'sarasa-mono-sc')

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'], ...opts })

// 用 node 直接跑 npx 的 JS 入口，而不是 spawn `npx`。
// Node 24 起 spawn `.cmd`/`.bat` 会直接 EINVAL（CVE-2024-27980 的加固），
// 而 `npx` 在 Windows 上只是个 .cmd 转发脚本。
function runNpx(args) {
  const cli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js')
  if (!fs.existsSync(cli)) throw new Error(`找不到 npx-cli.js：${cli}`)
  execFileSync(process.execPath, [cli, ...args], { stdio: ['ignore', 'inherit', 'inherit'] })
}

const sha256 = (file) =>
  createHash('sha256').update(fs.readFileSync(file)).digest('hex')

async function download() {
  fs.mkdirSync(cacheDir, { recursive: true })
  const archive = path.join(cacheDir, SARASA_ASSET)
  if (fs.existsSync(archive)) {
    console.log(`已缓存 ${SARASA_ASSET}`)
    return archive
  }
  console.log(`下载 ${SARASA_URL}`)
  const res = await fetch(SARASA_URL)
  if (!res.ok) throw new Error(`下载失败：${res.status} ${res.statusText}`)
  fs.writeFileSync(archive, Buffer.from(await res.arrayBuffer()))
  return archive
}

function extract(archive) {
  const dir = path.join(cacheDir, 'ttf')
  const marker = path.join(dir, WEIGHTS[0].ttf)
  if (fs.existsSync(marker)) {
    console.log('已解压 TTF')
    return dir
  }
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  // Windows 自带的 bsdtar 能直接读 7z。必须写全路径：PATH 上靠前的往往是
  // Git Bash 的 GNU tar，它既不支持 7z，还会把 `D:\...` 当成远程主机名。
  // 其他平台需要 p7zip 提供 7z。
  const systemTar = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
  const candidates = [
    ...(process.platform === 'win32' ? [[systemTar, ['-xf', archive, '-C', dir]]] : []),
    ['tar', ['-xf', archive, '-C', dir]],
    ['7z', ['x', '-y', `-o${dir}`, archive]],
  ]
  let lastError
  for (const [cmd, args] of candidates) {
    try {
      run(cmd, args)
      return dir
    } catch (err) {
      lastError = err
    }
  }
  throw new Error(`解压失败，请先安装 7z：${lastError?.message}`)
}

// cn-font-split 输出的 CSS 里是 `url("./<hash>.woff2")`，与 woff2 同目录。
// 这里把 woff2 移到 <weight>/ 下，并把 URL 改写成相对 fonts.css 的路径。
function split(ttf, weightName, destDir) {
  const staging = path.join(cacheDir, `split-${weightName}`)
  fs.rmSync(staging, { recursive: true, force: true })
  runNpx(['--yes', 'cn-font-split@7', '-i', ttf, '-o', staging])

  const css = fs.readFileSync(path.join(staging, 'result.css'), 'utf8')
  fs.rmSync(destDir, { recursive: true, force: true })
  fs.mkdirSync(destDir, { recursive: true })

  for (const file of fs.readdirSync(staging)) {
    if (file.endsWith('.woff2')) {
      fs.copyFileSync(path.join(staging, file), path.join(destDir, file))
    }
  }
  return css.replaceAll('url("./', `url("./${weightName}/`)
}

const archive = await download()
const actual = sha256(archive)
if (actual !== SARASA_SHA256) {
  throw new Error(`sha256 不匹配，已中止\n  期望 ${SARASA_SHA256}\n  实际 ${actual}`)
}
console.log('sha256 校验通过')

const ttfDir = extract(archive)
fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })

const banner = `/* 由 scripts/build-fonts.mjs 生成，请勿手改。\n   Sarasa Mono SC ${SARASA_VERSION}（OFL-1.1），拉丁 Iosevka + 中文思源黑体。 */\n`
const sheets = []
for (const { name, ttf } of WEIGHTS) {
  const source = path.join(ttfDir, ttf)
  if (!fs.existsSync(source)) throw new Error(`缺少字重文件：${source}`)
  console.log(`切分 ${ttf}`)
  sheets.push(split(source, name, path.join(outDir, name)))
}

fs.writeFileSync(path.join(outDir, 'fonts.css'), banner + sheets.join('\n'))

const bytes = fs
  .readdirSync(outDir, { recursive: true })
  .filter((f) => String(f).endsWith('.woff2'))
  .reduce((sum, f) => sum + fs.statSync(path.join(outDir, f)).size, 0)
console.log(`完成：${outDir}（woff2 合计 ${(bytes / 1048576).toFixed(1)} MB）`)
