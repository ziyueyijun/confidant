// purejs.js — 关键假设检验：纯 JS 能否复刻 simple 扩展的 jieba_query 质量？
//
// 机制（已实测）：
//   simple tokenizer = 逐字建 token（每个汉字一个 token，+拼音 token），不建词 token。
//   jieba_query(q)   = 用 jieba 把 q 切成词，每个词展开为「相邻字短语」，词间 AND。
//                      例：jieba_query('中国历史') => "中国" AND "历史"（在逐字索引上 = 子串）
//
// 若 tokenize 换成 unicode61 + 纯 JS 逐字插空格，查询端用 Intl.Segmenter 分词 +
// 相邻字短语 AND，应当得到与 jieba_query 几乎相同的召回/精度。
// 这决定了「是否必须引入 C 扩展」。
//
// 用法: node purejs.js <tag> <chars>

const fs = require('fs');
const path = require('path');
const Database = require('D:/ZSJ/Github/confidant/docs/research/spikes/simple-ext/node_modules/better-sqlite3');
const DLL = 'D:/ZSJ/Github/confidant/docs/research/spikes/simple-ext/dll/libsimple-windows-x64/simple.dll';
const DICT = 'D:/ZSJ/Github/confidant/docs/research/spikes/simple-ext/dll/libsimple-windows-x64/dict';
const OUTDIR = __dirname;
const TAG = process.argv[2] || '1M';
const TARGET = parseInt(process.argv[3] || '1000000', 10);
const REPS = 7;
const now = () => Number(process.hrtime.bigint()) / 1e6;
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const esc = s => '"' + s.replace(/"/g, '""') + '"';
const perchar = s => s.replace(/([\u3400-\u9fff\uf900-\ufaff])/g, ' $1 ').replace(/ {2,}/g, ' ').trim();
const seg = new Intl.Segmenter('zh', { granularity: 'word' });
const words = s => { const o = []; for (const x of seg.segment(s)) if (x.isWordLike) o.push(x.segment); return o; };

const raw = fs.readFileSync(path.join(OUTDIR, 'corpus.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const docs = []; let acc = 0;
outer:
for (const r of raw) { for (let k = 0; k < r.text.length; k += 400) { const p = r.text.slice(k, k + 400); if (p.length < 60) continue; docs.push(p); acc += p.length; if (acc >= TARGET) break outer; } }

const pc = new Database(path.join(OUTDIR, `b2_${TAG}_perchar.db`), { readonly: true });
const sm = new Database(path.join(OUTDIR, `b2_${TAG}_simple.db`), { readonly: true });
sm.loadExtension(DLL); sm.prepare('SELECT jieba_dict(?) v').get(DICT);

// 纯 JS 词级短语查询：每个词 -> 相邻字短语，词间 AND
function pureJS(q) {
  const ws = words(q);
  if (!ws.length) return new Set();
  const m = ws.map(w => esc(perchar(w))).join(' AND ');
  return new Set(pc.prepare('SELECT rowid r FROM fts WHERE fts MATCH ?').all(m).map(r => r.r));
}
// simple 扩展的 jieba_query
function jiebaQ(q) { return new Set(sm.prepare('SELECT rowid r FROM fts WHERE fts MATCH jieba_query(?)').all(q).map(r => r.r)); }
// simple_query（逐字 AND，对照）
function simpleQ(q) { return new Set(sm.prepare('SELECT rowid r FROM fts WHERE fts MATCH simple_query(?)').all(q).map(r => r.r)); }

const QUERIES = {
  char1: ['识', '史', '国'],
  word2: ['知识', '历史', '科学', '经济', '规模', '革命'],
  word4: ['人工智能', '世界大战', '中华人民共和国', '中国人民银行'],
  cross: ['克思', '共和', '第一', '部分', '中共', '人民共和'],
  phrase: ['中国历史', '大规模', '知识管理'],
  oov: ['知识管理', '量子纠缠笔记'],
  multiterm: ['中国 历史', '北京 大学', '经济 政策', '人工智能 发展'],
};

function met(got, truth) { let tp = 0; for (const x of got) if (truth.has(x)) tp++; return { R: truth.size ? +(tp / truth.size).toFixed(4) : 1, P: got.size ? +(tp / got.size).toFixed(4) : 1, n: got.size, gt: truth.size }; }

const rows = [];
console.log(`=== [${TAG}] 纯 JS 复刻 jieba_query (${docs.length} docs) ===`);
console.log('cat      query          | 纯JS(preseg分词+相邻短语)  | jieba_query(扩展)       | simple_query(逐字AND)');
for (const [cat, list] of Object.entries(QUERIES)) {
  for (const q of list) {
    const truth = new Set();
    // multiterm 语义：空格分隔的词都要出现（子串交集）
    const toks = q.split(/\s+/).filter(Boolean);
    if (cat === 'multiterm') {
      const sets = toks.map(t => new Set(docs.map((d, i) => [d, i]).filter(([d]) => d.includes(t)).map(([, i]) => i + 1)));
      let inter = sets[0] || new Set();
      for (let k = 1; k < sets.length; k++) inter = new Set([...inter].filter(x => sets[k].has(x)));
      for (const x of inter) truth.add(x);
    } else {
      docs.forEach((d, i) => { if (d.includes(q)) truth.add(i + 1); });
    }
    const t0 = now(); let gp; for (let i = 0; i < REPS; i++) gp = pureJS(q); const msP = median([now() - t0]);
    const gp2 = pureJS(q);
    const g2 = jiebaQ(q), g3 = simpleQ(q);
    const mp = met(gp2, truth), m2 = met(g2, truth), m3 = met(g3, truth);
    const f = m => `${(m.R * 100).toFixed(0)}%/${(m.P * 100).toFixed(0)}%`;
    console.log(`${cat.padEnd(8)} ${q.padEnd(14)} | ${f(mp).padEnd(24)} | ${f(m2).padEnd(22)} | ${f(m3)}`);
    rows.push({ cat, q, purejs: mp, jieba: m2, simple: m3 });
  }
}

// 聚合
const agg = {};
for (const cat of Object.keys(QUERIES)) {
  const rs = rows.filter(r => r.cat === cat);
  const avg = k => ({
    purejs: +(rs.reduce((s, r) => s + r.purejs[k], 0) / rs.length).toFixed(3),
    jieba: +(rs.reduce((s, r) => s + r.jieba[k], 0) / rs.length).toFixed(3),
    simple: +(rs.reduce((s, r) => s + r.simple[k], 0) / rs.length).toFixed(3),
  });
  agg[cat] = { n: rs.length, R: avg('R'), P: avg('P') };
}
console.log('\n=== 类别聚合 ===');
console.log('cat        | 纯JS R/P      | jieba R/P     | simple R/P');
for (const [cat, a] of Object.entries(agg)) {
  console.log(`${cat.padEnd(10)} | ${((a.R.purejs * 100).toFixed(0) + '%/' + (a.P.purejs * 100).toFixed(0) + '%').padEnd(13)} | ${((a.R.jieba * 100).toFixed(0) + '%/' + (a.P.jieba * 100).toFixed(0) + '%').padEnd(13)} | ${(a.R.simple * 100).toFixed(0)}%/${(a.P.simple * 100).toFixed(0)}%`);
}

fs.writeFileSync(path.join(OUTDIR, `purejs_${TAG}.json`), JSON.stringify({ tag: TAG, docs: docs.length, rows, agg }, null, 2));
console.log(`\nsaved purejs_${TAG}.json`);
pc.close(); sm.close();
