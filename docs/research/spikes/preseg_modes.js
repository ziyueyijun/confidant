// preseg_modes.js — 预分词方案的两种查询构造对比（AND vs 短语）
//
// 关键：预分词表存的是「词 + 空格」，因此查询端有两种构造方式：
//   AND   : 查询词分词后 -> "词1" AND "词2"（顺序无关，会假阳）
//   短语  : 整个查询分词后的串 -> "词1 词2"（要求顺序相邻，更严）
// 二者召回与精度的差别，决定了「预分词方案」到底能到什么水平。
//
// 用法: node preseg_modes.js <tag> <chars>

const fs = require('fs');
const path = require('path');
const Database = require('D:/ZSJ/Github/confidant/docs/research/spikes/simple-ext/node_modules/better-sqlite3');
const OUTDIR = __dirname;
const TAG = process.argv[2] || '1M';
const TARGET = parseInt(process.argv[3] || '1000000', 10);
const esc = s => '"' + s.replace(/"/g, '""') + '"';

const raw = fs.readFileSync(path.join(OUTDIR, 'corpus.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const docs = []; let acc = 0;
for (const r of raw) {
  for (let k = 0; k < r.text.length; k += 400) {
    const p = r.text.slice(k, k + 400); if (p.length < 60) continue;
    docs.push(p); acc += p.length; if (acc >= TARGET) break;
  }
  if (acc >= TARGET) break;
}
const seg = new Intl.Segmenter('zh', { granularity: 'word' });
const preseg = s => { const o = []; for (const x of seg.segment(s)) o.push(x.isWordLike ? x.segment : ' '); return o.join(' ').replace(/ {2,}/g, ' ').trim(); };

const db = new Database(path.join(OUTDIR, `b2_${TAG}_preseg.db`), { readonly: true });
const qAnd = s => { const t = preseg(s).split(/\s+/).filter(Boolean); if (!t.length) return new Set(); return new Set(db.prepare('SELECT rowid r FROM fts WHERE fts MATCH ?').all(t.map(esc).join(' AND ')).map(r => r.r)); };
const qPhrase = s => { const t = preseg(s).trim(); if (!t) return new Set(); return new Set(db.prepare('SELECT rowid r FROM fts WHERE fts MATCH ?').all(esc(t)).map(r => r.r)); };
// 也对比「原文逐字短语」与「原文短语（不分词）」
const perchar = s => s.replace(/([\u3400-\u9fff\uf900-\ufaff])/g, ' $1 ').replace(/ {2,}/g, ' ').trim();

const QS = {
  char1: ['识', '史', '国'],
  word2: ['知识', '历史', '规模', '革命'],
  word4: ['人工智能', '世界大战', '中华人民共和国'],
  cross: ['克思', '共和', '第一', '部分', '中共', '人民共和'],
  phrase: ['中国历史', '大规模'],
  oov: ['知识管理', '量子纠缠笔记'],
  multiterm: ['中国 历史', '北京 大学', '经济 政策'],
};
function ev(fn, s) {
  const truth = new Set(); docs.forEach((d, k) => { if (d.includes(s)) truth.add(k + 1); });
  const got = fn(s); let tp = 0; for (const x of got) if (truth.has(x)) tp++;
  return { R: truth.size ? tp / truth.size : 1, P: got.size ? tp / got.size : 1, n: got.size, gt: truth.size };
}
const rows = [];
console.log(`=== [${TAG}] 预分词查询构造对比 (${docs.length} docs) ===`);
console.log('cat      query           tokens             AND R/P        PHRASE R/P');
for (const [cat, list] of Object.entries(QS)) {
  for (const s of list) {
    const a = ev(qAnd, s), p = ev(qPhrase, s);
    console.log(`${cat.padEnd(8)} ${s.padEnd(15)} ${preseg(s).padEnd(18)} ${((a.R * 100).toFixed(0) + '%/' + (a.P * 100).toFixed(0) + '%').padEnd(14)} ${(p.R * 100).toFixed(0)}%/${(p.P * 100).toFixed(0)}%`);
    rows.push({ cat, q: s, tokens: preseg(s), and: a, phrase: p });
  }
}
fs.writeFileSync(path.join(OUTDIR, `preseg_modes_${TAG}.json`), JSON.stringify({ tag: TAG, docs: docs.length, rows }, null, 2));
console.log(`saved preseg_modes_${TAG}.json`);
db.close();
