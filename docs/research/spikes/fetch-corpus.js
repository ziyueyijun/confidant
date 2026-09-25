// fetch-corpus.js — 抓取中文维基百科正文作为真实语料
// 用法: node fetch-corpus.js [目标字数]
// 输出: corpus.jsonl (每行 {"id":n,"title":"...","text":"..."})，stderr 打印进度
//
// 为什么用维基百科：真实中文散文，有真实的分词边界、真实的长句、
// 真实的中英混排与标点。比随机汉字合成语料可信得多。
//
// 策略（关键：批量取 wikitext 极快，一次请求 50 篇约 400 万字）：
//   1. list=search 用一批常见词搜出大量条目标题（去重）
//   2. 按 50 篇/请求批量取 revisions content（wikitext）
//   3. 清洗 wikitext -> 纯文本（去模板/表格/标签/链接语法/ref、notelist 等）
//
// 清洗是启发式的，目标是「保留真实的中文散文与标点」，丢弃 wiki 语法噪声。

const fs = require('fs');
const path = require('path');

const TARGET_CHARS = parseInt(process.argv[2] || '2400000', 10);
const OUT = path.join(__dirname, 'corpus.jsonl');
const API = 'https://zh.wikipedia.org/w/api.php';
const UA = 'confidant-research-spike/0.1 (https://github.com/ziyueyijun/confidant; local benchmark)';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(params, retries = 6) {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      const text = await res.text();
      try { return JSON.parse(text); } catch { /* rate limited plain text */ }
      process.stderr.write(`\n  [rate-limited ${i + 1}]`);
      await sleep(2500 * (i + 1));
    } catch (e) {
      process.stderr.write(`\n  [net err ${i + 1}: ${e.message}]`);
      await sleep(2000 * (i + 1));
    }
  }
  throw new Error('api failed: ' + url);
}

// ---- wikitext -> plain text（启发式）----
function stripWikitext(s) {
  let t = s;
  // 去掉 <!-- 注释 -->
  t = t.replace(/<!--[\s\S]*?-->/g, '');
  // 去掉 <ref ...>...</ref> 与 <ref ... />
  t = t.replace(/<ref[^>]*\/>/gi, '');
  t = t.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
  // 去掉常见非正文标签块
  t = t.replace(/<(gallery|timeline|score|math|chem|syntaxhighlight|source|code|nowiki|pre|imagemap|mapframe|maplink)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  // 去掉表格 {| ... |}
  t = t.replace(/\{\|[\s\S]*?\|\}/g, ' ');
  // 去掉嵌套模板 {{ ... }}（反复剥离，处理嵌套）
  for (let i = 0; i < 12; i++) {
    const before = t;
    t = t.replace(/\{\{[^{}]*\}\}/g, ' ');
    if (t === before) break;
  }
  // 内链 [[a|b]] -> b ; [[a]] -> a ; 去掉文件/分类链接
  t = t.replace(/\[\[(?:[^\]|]*\|)?([^\]|]*)\]\]/g, (m, inner) => {
    if (!inner) return ' ';
    return inner;
  });
  t = t.replace(/\[\[(?:File|Image|文件|图像|Category|分类|Wikipedia|维基百科)[^\]]*\]\]/gi, ' ');
  // 外链 [url 文本] -> 文本 ; [url] -> 空
  t = t.replace(/\[https?:\/\/\S+\s+([^\]]*)\]/g, '$1');
  t = t.replace(/\[https?:\/\/\S+\]/g, ' ');
  // 去掉剩余 HTML 标签
  t = t.replace(/<[^>]+>/g, ' ');
  // 去掉标题行前缀 == xxx ==（保留文字）
  t = t.replace(/^={1,6}\s*(.*?)\s*={1,6}\s*$/gm, '$1');
  // 去掉列表/缩进/表格残留符号
  t = t.replace(/^[*#:;]+\s*/gm, '');
  // 去掉魔术字/剩余花括号残留
  t = t.replace(/[{}]/g, ' ');
  // 去掉 URL
  t = t.replace(/https?:\/\/\S+/g, ' ');
  // 折叠空白
  t = t.replace(/[ \t ]+/g, ' ');
  t = t.replace(/\n{2,}/g, '\n');
  return t;
}

// 保留含足够中文的段（正文），丢弃模板残留/列表
function extractProse(t) {
  const paras = t.split('\n').map(p => p.trim()).filter(Boolean);
  const ok = paras.filter(p => {
    if (p.length < 12) return false;
    const cjk = (p.match(/[一-鿿]/g) || []).length;
    return cjk / p.length > 0.35; // 中文占多数的段才算正文
  });
  return ok.join('\n');
}

(async () => {
  const t0 = Date.now();
  const notes = [];
  let total = 0;

  // 1) 收集标题
  const seedTerms = ['历史', '科学', '文化', '经济', '政治', '艺术', '音乐', '电影', '文学', '哲学',
    '数学', '物理', '化学', '生物', '医学', '工程', '地理', '教育', '社会', '法律',
    '技术', '计算机', '人工智能', '语言', '体育', '建筑', '宗教', '战争', '城市', '公司',
    '中国', '美国', '欧洲', '日本', '河流', '山脉', '植物', '动物', '天文', '气象',
    '铁路', '航天', '能源', '农业', '金融', '互联网', '游戏', '摄影', '绘画', '戏剧'];
  const seen = new Set();
  for (const term of seedTerms) {
    const j = await api({ action: 'query', list: 'search', srsearch: term, srnamespace: '0', srlimit: '50' });
    for (const r of (j.query && j.query.search) || []) seen.add(r.title);
    process.stderr.write(`\r seed "${term}": ${seen.size} titles`);
    await sleep(200);
    if (seen.size > 1800) break;
  }
  const titles = [...seen];

  // 2) 批量取 wikitext 并清洗
  const CHUNK = 1200;
  const BATCH = 50;
  for (let i = 0; i < titles.length && total < TARGET_CHARS; i += BATCH) {
    const batch = titles.slice(i, i + BATCH);
    let j;
    try {
      j = await api({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: batch.join('|') });
    } catch (e) { process.stderr.write(`\n skip batch: ${e.message}`); continue; }
    for (const p of (j.query && j.query.pages) || []) {
      let raw = '';
      try { raw = p.revisions[0].slots.main.content; } catch { continue; }
      const text = extractProse(stripWikitext(raw));
      if (text.length < 300) continue;
      for (let k = 0; k < text.length; k += CHUNK) {
        const piece = text.slice(k, k + CHUNK);
        if (piece.length < 200) continue;
        notes.push({ id: notes.length, title: p.title, text: piece });
        total += piece.length;
        if (total >= TARGET_CHARS) break;
      }
      if (total >= TARGET_CHARS) break;
    }
    process.stderr.write(`\r chars: ${total} / ${TARGET_CHARS}, notes: ${notes.length} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    await sleep(400);
  }

  fs.writeFileSync(OUT, notes.map(c => JSON.stringify(c)).join('\n'), 'utf8');

  const cjkRe = /[一-鿿]/g;
  let cjkCount = 0; const lengths = [];
  for (const c of notes) { const m = c.text.match(cjkRe); cjkCount += m ? m.length : 0; lengths.push(c.text.length); }
  lengths.sort((a, b) => a - b);
  const stat = {
    notes: notes.length,
    totalCharsUtf16: total,
    cjkChars: cjkCount,
    cjkRatio: (cjkCount / total).toFixed(3),
    bytesUtf8: Buffer.byteLength(notes.map(c => c.text).join(''), 'utf8'),
    medianNoteChars: lengths[Math.floor(lengths.length / 2)],
    p95NoteChars: lengths[Math.floor(lengths.length * 0.95)],
    maxNoteChars: lengths[lengths.length - 1],
    distinctTitles: new Set(notes.map(n => n.title)).size,
    elapsedSec: ((Date.now() - t0) / 1000).toFixed(1),
  };
  console.log('\ncorpus stats: ' + JSON.stringify(stat, null, 2));
  console.log('written: ' + OUT);
})();
