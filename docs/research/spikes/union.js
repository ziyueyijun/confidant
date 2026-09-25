// union.js — 双索引（并集）实验 + 真实多词查询
//
// 目标：直接回答票面第 5 问 —— 若预分词召回缺口不可接受，最优解是什么？
// 对比：
//   preseg              单索引，词级 AND
//   perchar             单索引，逐字 -> 精确子串
//   trigram             单索引，>=3 字子串
//   preseg ∪ perchar    双索引（票面建议的形态之一）
//   preseg ∪ trigram    双索引
//
// 并集语义：两表 rowid 集合求并；召回上界 = 两者较高者，精度可能下降。
//
// 用法: node union.js <tag>

const fs = require('fs');
const path = require('path');
const Database = require('D:/ZSJ/Github/confidant/docs/research/spikes/simple-ext/node_modules/better-sqlite3');

const OUTDIR = __dirname;
const TAG = process.argv[2] || '1M';
const TARGET = parseInt(process.argv[3] || '1000000', 10);
const NOTE_CHUNK = 400;
const REPS = 7;
const now = () => Number(process.hrtime.bigint()) / 1e6;
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const esc = s => '"' + s.replace(/"/g, '""') + '"';

const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
const preseg = s => { const o = []; for (const x of segmenter.segment(s)) o.push(x.isWordLike ? x.segment : ' '); return o.join(' ').replace(/ {2,}/g, ' ').trim(); };
// perchar\uff1aCJK \u5b57\u7b26\u524d\u540e\u90fd\u63d2\u7a7a\u683c\uff08\u53ea\u540e\u63d2\u4f1a\u4e0e\u6570\u5b57/\u5b57\u6bcd\u7c98\u8fde\u6210 token\uff0c\u9020\u6210\u5047\u9634\uff1b\u89c1\u62a5\u544a \u00a74.3\uff09
const perchar = s => s.replace(/([\u3400-\u9fff\uf900-\ufaff])/g, ' $1 ').replace(/ {2,}/g, ' ').trim();

// ground truth
const rawNotes = fs.readFileSync(path.join(__dirname, 'corpus.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const docs = []; let acc = 0;
outer:
for (const r of rawNotes) {
  for (let k = 0; k < r.text.length; k += NOTE_CHUNK) {
    const p = r.text.slice(k, k + NOTE_CHUNK);
    if (p.length < 60) continue;
    docs.push({ text: p }); acc += p.length;
    if (acc >= TARGET) break outer;
  }
}

const QUERIES = {
  char1: ['识', '史', '学', '国', '人'],
  word2: ['知识', '历史', '科学', '经济', '规模', '革命'],
  word4: ['人工智能', '世界大战', '中华人民共和国', '中国人民银行'],
  cross: ['克思', '共和', '第一', '部分', '中共', '人民共和'],
  phrase: ['中国历史', '大规模', '知识管理'],
  oov: ['知识管理', '量子纠缠笔记'],
  // 真实多词查询（用户输入多个词，语义为 AND）
  multiterm: ['中国 历史', '经济 政策', '人工智能 发展', '北京 大学'],
};

const C = {
  preseg: new Database(path.join(OUTDIR, `b2_${TAG}_preseg.db`), { readonly: true }),
  perchar: new Database(path.join(OUTDIR, `b2_${TAG}_perchar.db`), { readonly: true }),
  trigram: new Database(path.join(OUTDIR, `b2_${TAG}_trigram.db`), { readonly: true }),
};

function idPreseg(q) { const t = preseg(q).split(/\s+/).filter(Boolean); if (!t.length) return new Set(); return new Set(C.preseg.prepare('SELECT rowid r FROM fts WHERE fts MATCH ?').all(t.map(esc).join(' AND ')).map(r => r.r)); }
function idPerchar(q) {
  // 空格分隔的多个词 -> 每个词转成相邻字短语，词间 AND
  const terms = q.split(/\s+/).filter(Boolean).map(t => esc(perchar(t).trim())).filter(Boolean);
  if (!terms.length) return new Set();
  return new Set(C.perchar.prepare('SELECT rowid r FROM fts WHERE fts MATCH ?').all(terms.join(' AND ')).map(r => r.r));
}
function idTrigram(q) {
  const terms = q.split(/\s+/).filter(Boolean);
  if (terms.some(t => [...t].length < 3)) return null; // 任一 <3 字则结构性失败
  return new Set(C.trigram.prepare('SELECT rowid r FROM fts WHERE fts MATCH ?').all(terms.map(esc).join(' AND ')).map(r => r.r));
}
function union(a, b) { if (!a || !b) return null; const s = new Set(a); for (const x of b) s.add(x); return s; }

function met(got, gt) {
  if (got === null) return { unsupported: true, recall: 0, precision: 0, hits: 0, gt: gt.size };
  let tp = 0; for (const x of got) if (gt.has(x)) tp++;
  return { recall: gt.size ? +(tp / gt.size).toFixed(4) : 1, precision: got.size ? +(tp / got.size).toFixed(4) : 1, hits: got.size, gt: gt.size, missed: gt.size - tp, extra: got.size - tp };
}

const results = {};
for (const [cat, list] of Object.entries(QUERIES)) {
  results[cat] = [];
  for (const q of list) {
    const gt = new Set();
    if (cat === 'multiterm') {
      // 多词查询：语义是「所有词都出现」（AND），GT = 各词子串命中集的交集
      const toks = q.split(/\s+/).filter(Boolean);
      const sets = toks.map(t => new Set(docs.map((d, i) => [d, i]).filter(([d]) => d.text.includes(t)).map(([, i]) => i + 1)));
      let inter = sets[0] || new Set();
      for (let k = 1; k < sets.length; k++) inter = new Set([...inter].filter(x => sets[k].has(x)));
      for (const x of inter) gt.add(x);
    } else {
      docs.forEach((d, i) => { if (d.text.includes(q)) gt.add(i + 1); });
    }
    const row = { q, gt: gt.size, schemes: {} };
    const runMeasured = (label, fn) => {
      let got, times = [];
      try { for (let i = 0; i < REPS; i++) { const t = now(); got = fn(); times.push(now() - t); } }
      catch (e) { row.schemes[label] = { err: e.message }; return; }
      row.schemes[label] = got === null ? met(null, gt) : { ...met(got, gt), ms: +median(times).toFixed(3) };
    };
    runMeasured('preseg', () => idPreseg(q));
    runMeasured('perchar', () => idPerchar(q));
    runMeasured('trigram', () => idTrigram(q));
    // 并集延迟 = 两表查询时间之和（串行执行，真实做法）
    runMeasured('preseg∪perchar', () => union(idPreseg(q), idPerchar(q)));
    runMeasured('preseg∪trigram', () => union(idPreseg(q), idTrigram(q)));
    results[cat].push(row);
  }
}

// 聚合
const agg = {};
for (const [cat, rows] of Object.entries(results)) {
  const a = { n: rows.length, schemes: {} };
  for (const label of ['preseg', 'perchar', 'trigram', 'preseg∪perchar', 'preseg∪trigram']) {
    const ms = rows.map(r => r.schemes[label]).filter(x => x && typeof x.recall === 'number');
    const un = rows.filter(r => r.schemes[label] && r.schemes[label].unsupported).length;
    const avg = k => ms.length ? +(ms.reduce((s, m) => s + m[k], 0) / ms.length).toFixed(4) : null;
    a.schemes[label] = { recall: avg('recall'), precision: avg('precision'), unsupported: un };
  }
  agg[cat] = a;
}

// 索引体积对比（双索引 = 两块之和）
const size = {};
for (const n of ['preseg', 'perchar', 'trigram']) {
  const f = path.join(OUTDIR, `b2_${TAG}_${n}.db`);
  let b = 0; for (const x of [f, f + '-wal', f + '-shm']) if (fs.existsSync(x)) b += fs.statSync(x).size;
  size[n] = b;
}
const origBytes = Buffer.byteLength(docs.map(d => d.text).join(''), 'utf8');
const sizeReport = {
  origBytes,
  preseg: { bytes: size.preseg, ratio: +(size.preseg / origBytes).toFixed(2) },
  perchar: { bytes: size.perchar, ratio: +(size.perchar / origBytes).toFixed(2) },
  trigram: { bytes: size.trigram, ratio: +(size.trigram / origBytes).toFixed(2) },
  preseg_union_perchar: { bytes: size.preseg + size.perchar, ratio: +((size.preseg + size.perchar) / origBytes).toFixed(2) },
  preseg_union_trigram: { bytes: size.preseg + size.trigram, ratio: +((size.preseg + size.trigram) / origBytes).toFixed(2) },
};

const out = { tag: TAG, docs: docs.length, chars: docs.reduce((a, d) => a + d.text.length, 0), sizeReport, results, agg };
fs.writeFileSync(path.join(OUTDIR, `union_${TAG}.json`), JSON.stringify(out, null, 2));

console.log(`\n=== [${TAG}] 双索引并集对比 (${docs.length} docs) ===`);
console.log('类别聚合  R/P（trigram 的 R 只统计可执行查询，无法执行数另标）');
const labels = ['preseg', 'perchar', 'trigram', 'preseg∪perchar', 'preseg∪trigram'];
console.log('cat'.padEnd(11) + labels.map(l => ('| ' + l).padEnd(19)).join(''));
for (const [cat, a] of Object.entries(agg)) {
  console.log(cat.padEnd(11) + labels.map(l => {
    const x = a.schemes[l];
    const s = `${(x.recall * 100).toFixed(0)}%/${(x.precision * 100).toFixed(0)}%`;
    const note = x.unsupported ? ` (${x.unsupported}/${a.n} n/a)` : '';
    return ('| ' + s + note).padEnd(19);
  }).join(''));
}
console.log('\n索引体积:');
for (const [k, v] of Object.entries(sizeReport)) {
  if (k === 'origBytes') { console.log(`  ${k}: ${(v / 1048576).toFixed(2)} MiB`); continue; }
  console.log(`  ${k.padEnd(24)} ${(v.bytes / 1048576).toFixed(2)} MiB (${v.ratio}x)`);
}
console.log(`\nsaved union_${TAG}.json`);

// 打印 multiterm 细节（真实查询语义）
console.log('\n=== 多词查询细节 ===');
for (const r of results.multiterm) {
  console.log(`q="${r.q}" gt=${r.gt}`);
  for (const [l, m] of Object.entries(r.schemes)) {
    console.log(`   ${l.padEnd(16)} R=${(m.recall * 100).toFixed(0)}% P=${(m.precision * 100).toFixed(0)}% hits=${m.hits} ${m.ms ? m.ms + 'ms' : ''}`);
  }
}
