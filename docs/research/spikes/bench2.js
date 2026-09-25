// bench2.js — 中文检索方案完整实测（最终版）
//
// 四套索引，全部 external content 结构，同一语料：
//   preseg   : Intl.Segmenter 逐词 + unicode61        查询=词级 AND
//   perchar  : 逐字插空格 + unicode61                 查询=相邻字短语（精确子串）
//   trigram  : trigram                                查询=引号短语（精确子串，>=3字）
//   simple   : wangfenjin/simple（逐字 token + 拼音）  查询=simple_query / jieba_query
//
// 用法: node bench2.js <targetChars> <tag>
// 产出: bench2_<tag>.json

const fs = require('fs');
const path = require('path');
const Database = require('D:/ZSJ/Github/confidant/docs/research/spikes/simple-ext/node_modules/better-sqlite3');

const DLL = 'D:/ZSJ/Github/confidant/docs/research/spikes/simple-ext/dll/libsimple-windows-x64/simple.dll';
const DICT = 'D:/ZSJ/Github/confidant/docs/research/spikes/simple-ext/dll/libsimple-windows-x64/dict';
const CORPUS = path.join(__dirname, 'corpus.jsonl');
const OUTDIR = __dirname;

const TARGET = parseInt(process.argv[2] || '100000', 10);
const TAG = process.argv[3] || String(TARGET);
const NOTE_CHUNK = 400;
const REPS = 7;
const now = () => Number(process.hrtime.bigint()) / 1e6;
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

// ---------- 语料 ----------
const rawNotes = fs.readFileSync(CORPUS, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const docs = [];
let acc = 0;
outer:
for (const r of rawNotes) {
  for (let k = 0; k < r.text.length; k += NOTE_CHUNK) {
    const piece = r.text.slice(k, k + NOTE_CHUNK);
    if (piece.length < 60) continue;
    docs.push({ title: r.title, text: piece });
    acc += piece.length;
    if (acc >= TARGET) break outer;
  }
}
const N = docs.length;
const origBytes = Buffer.byteLength(docs.map(d => d.text).join(''), 'utf8');
const origChars = docs.reduce((a, d) => a + d.text.length, 0);

// ---------- 变换 ----------
const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
const preseg = s => { const o = []; for (const x of segmenter.segment(s)) o.push(x.isWordLike ? x.segment : ' '); return o.join(' ').replace(/ {2,}/g, ' ').trim(); };
// 逐字：每个汉字后加空格（保留非汉字，仅把汉字拆开）
const perchar = s => s.replace(/([\u3400-\u9fff\uf900-\ufaff])/g, ' $1 ').replace(/ {2,}/g, ' ').trim();

const VIEWS = {
  preseg: { texts: docs.map(d => preseg(d.text)), tokenize: 'unicode61', ext: false },
  perchar: { texts: docs.map(d => perchar(d.text)), tokenize: 'unicode61', ext: false },
  trigram: { texts: docs.map(d => d.text), tokenize: 'trigram', ext: false },
  simple: { texts: docs.map(d => d.text), tokenize: 'simple', ext: true },
};

// ---------- ground truth ----------
const QUERIES = {
  char1: ['识', '史', '学', '国', '人'],
  word2: ['知识', '历史', '科学', '经济', '规模', '革命'],
  word4: ['人工智能', '世界大战', '中华人民共和国', '中国人民银行'],
  cross: ['克思', '共和', '第一', '部分', '中共', '人民共和'],  // 跨词边界子串
  phrase: ['中国历史', '大规模', '知识管理'],                    // 连贯子串
  oov: ['知识管理', '量子纠缠笔记'],
};
const ALL_Q = [...new Set(Object.values(QUERIES).flat())];
const GT = {};
for (const q of ALL_Q) {
  const s = new Set();
  docs.forEach((d, i) => { if (d.text.includes(q)) s.add(i + 1); });
  GT[q] = s;
}

// ---------- 建索引 ----------
const idx = {};
function build(name) {
  const view = VIEWS[name];
  const f = path.join(OUTDIR, `b2_${TAG}_${name}.db`);
  for (const x of [f, f + '-wal', f + '-shm']) if (fs.existsSync(x)) fs.unlinkSync(x);
  const db = new Database(f);
  db.pragma('journal_mode = WAL');
  if (view.ext) { db.loadExtension(DLL); db.prepare('SELECT jieba_dict(?) v').get(DICT); }
  db.exec('CREATE TABLE docs(id INTEGER PRIMARY KEY, title TEXT, body TEXT)');
  db.exec(`CREATE VIRTUAL TABLE fts USING fts5(body, content='docs', content_rowid='id', tokenize='${view.tokenize}')`);
  const idb = db.prepare('INSERT INTO docs(id,title,body) VALUES(?,?,?)');
  const ifts = db.prepare('INSERT INTO fts(rowid,body) VALUES(?,?)');
  const t0 = now();
  db.transaction(() => {
    view.texts.forEach((t, i) => { idb.run(i + 1, docs[i].title, t); ifts.run(i + 1, t); });
  })();
  const buildMs = now() - t0;
  db.exec("INSERT INTO fts(fts) VALUES('optimize')");
  db.close();
  let size = 0; for (const x of [f, f + '-wal', f + '-shm']) if (fs.existsSync(x)) size += fs.statSync(x).size;
  const contentBytes = Buffer.byteLength(view.texts.join(''), 'utf8');
  return {
    buildMs: Math.round(buildMs), dbBytes: size, totalRatio: +(size / origBytes).toFixed(2),
    contentBytes, contentRatio: +(contentBytes / origBytes).toFixed(3),
  };
}
for (const name of Object.keys(VIEWS)) {
  idx[name] = build(name);
  console.log(`[${TAG}] ${name.padEnd(8)} build ${String(idx[name].buildMs).padStart(5)}ms  db ${(idx[name].dbBytes / 1048576).toFixed(2)} MiB (${idx[name].totalRatio}x)  contentRatio ${idx[name].contentRatio}`);
}

// ---------- 打开只读连接 ----------
const conn = {};
for (const name of Object.keys(VIEWS)) {
  const db = new Database(path.join(OUTDIR, `b2_${TAG}_${name}.db`), { readonly: true });
  if (VIEWS[name].ext) { db.loadExtension(DLL); db.prepare('SELECT jieba_dict(?) v').get(DICT); }
  conn[name] = db;
}

// ---------- 查询构造 ----------
const esc = s => '"' + s.replace(/"/g, '""') + '"';
// preseg: 查询改写为词级 AND
function qPreseg(db, q) { const t = preseg(q).split(/\s+/).filter(Boolean); if (!t.length) return new Set(); return new Set(db.prepare('SELECT rowid r FROM fts WHERE fts MATCH ?').all(t.map(esc).join(' AND ')).map(r => r.r)); }
// perchar: 相邻字短语 -> 精确子串
function qPerchar(db, q) { const t = perchar(q).trim(); if (!t) return new Set(); return new Set(db.prepare('SELECT rowid r FROM fts WHERE fts MATCH ?').all(esc(t)).map(r => r.r)); }
// trigram: 引号短语（<3 字结构性失败：返回 null 表示「无法执行」）
function qTrigram(db, q) { if ([...q].length < 3) return null; return new Set(db.prepare('SELECT rowid r FROM fts WHERE fts MATCH ?').all(esc(q)).map(r => r.r)); }
// simple: AND 语义
function qSimple(db, q) { return new Set(db.prepare('SELECT rowid r FROM fts WHERE fts MATCH simple_query(?)').all(q).map(r => r.r)); }
// simple: jieba 词级
function qJieba(db, q) { return new Set(db.prepare('SELECT rowid r FROM fts WHERE fts MATCH jieba_query(?)').all(q).map(r => r.r)); }
// simple-raw: 引号短语（逐字相邻 = 精确子串）
function qSimplePhrase(db, q) { return new Set(db.prepare('SELECT rowid r FROM fts WHERE fts MATCH ?').all(esc(q)).map(r => r.r)); }

const SCHEMES = {
  preseg: qPreseg,
  perchar: qPerchar,
  trigram: qTrigram,
  simple_and: qSimple,
  simple_jieba: qJieba,
  simple_phrase: qSimplePhrase,
};

function met(got, gt) {
  if (got === null) return { unsupported: true, recall: 0, precision: 0, hits: 0, gt: gt.size, tp: 0, missed: gt.size, extra: 0 };
  if (!(got instanceof Set)) return { err: String(got && got.message || got) };
  let tp = 0; for (const x of got) if (gt.has(x)) tp++;
  return {
    recall: gt.size ? +(tp / gt.size).toFixed(4) : 1,
    precision: got.size ? +(tp / got.size).toFixed(4) : 1,
    hits: got.size, gt: gt.size, tp, missed: gt.size - tp, extra: got.size - tp,
  };
}

// ---------- 逐查询：延迟 + 召回/精确 ----------
const queryResults = {};
for (const [cat, list] of Object.entries(QUERIES)) {
  queryResults[cat] = [];
  for (const q of list) {
    const row = { q, presegTokens: preseg(q), percharTokens: perchar(q), gt: GT[q].size, lat: {}, m: {} };
    for (const [name, fn] of Object.entries(SCHEMES)) {
      // 决定该 scheme 用哪个连接
      const dbName = name.startsWith('simple') ? 'simple' : name;
      const db = conn[dbName];
      let got, times = [];
      try {
        for (let i = 0; i < REPS; i++) { const t = now(); got = fn(db, q); times.push(now() - t); }
      } catch (e) { row.m[name] = { err: e.message }; continue; }
      if (got === null) { row.m[name] = met(null, GT[q]); row.lat[name] = null; continue; }
      row.lat[name] = +median(times).toFixed(3);
      row.m[name] = met(got, GT[q]);
    }
    queryResults[cat].push(row);
  }
}

// ---------- 聚合 ----------
const agg = {};
for (const cat of Object.keys(QUERIES)) {
  const a = { n: queryResults[cat].length, schemes: {} };
  for (const name of Object.keys(SCHEMES)) {
    const ms = queryResults[cat].map(r => r.m[name]).filter(Boolean);
    const rs = ms.filter(m => typeof m.recall === 'number');
    const unsupported = ms.filter(m => m.unsupported).length;
    const avg = k => rs.length ? +(rs.reduce((s, m) => s + m[k], 0) / rs.length).toFixed(4) : null;
    const lats = queryResults[cat].map(r => r.lat[name]).filter(x => typeof x === 'number');
    a.schemes[name] = { recall: avg('recall'), precision: avg('precision'), latMs: lats.length ? +median(lats).toFixed(3) : null, unsupported };
  }
  agg[cat] = a;
}

// ---------- LIKE / trigram 兜底代价 ----------
const fallback = [];
for (const q of ['识', '史', '克思', '共和', '大规模', '知识管理']) {
  const row = { q };
  // preseg 表上 LIKE 原文（需回查 content 表 -> 索引失效）
  {
    const db = conn.preseg; let times = [], c;
    for (let i = 0; i < REPS; i++) { const t = now(); c = db.prepare("SELECT count(*) c FROM docs WHERE body LIKE '%'||?||'%'").get(q).c; times.push(now() - t); }
    row.likeOnPreseg = { ms: +median(times).toFixed(3), hit: c };
  }
  // perchar 表上 LIKE（原文列，同样失效）
  {
    const db = conn.perchar; let times = [], c;
    for (let i = 0; i < REPS; i++) { const t = now(); c = db.prepare("SELECT count(*) c FROM docs WHERE body LIKE '%'||?||'%'").get(q).c; times.push(now() - t); }
    row.likeOnPerchar = { ms: +median(times).toFixed(3), hit: c };
  }
  // trigram 表上 LIKE（可索引化）
  {
    const db = conn.trigram; let times = [], c;
    for (let i = 0; i < REPS; i++) { const t = now(); c = db.prepare("SELECT count(*) c FROM docs WHERE body LIKE '%'||?||'%'").get(q).c; times.push(now() - t); }
    row.likeOnTrigram = { ms: +median(times).toFixed(3), hit: c };
  }
  fallback.push(row);
}

// ---------- 增量 vs 全量 rebuild ----------
const incremental = {};
for (const name of ['preseg', 'perchar']) {
  const f = path.join(OUTDIR, `b2_${TAG}_${name}.db`);
  const db = new Database(f);
  const textsArr = VIEWS[name].texts;
  const mid = Math.floor(N / 2);
  const del = db.prepare("INSERT INTO fts(fts, rowid, body) VALUES('delete', ?, ?)");
  const ins = db.prepare('INSERT INTO fts(rowid, body) VALUES(?,?)');
  const upd = db.prepare('UPDATE docs SET body=? WHERE id=?');
  // 预热：对若干无关行做一轮 edit/undo，把页缓存与 statement 编译开销摊掉
  for (let w = 0; w < 3; w++) {
    const wi = 10 + w;
    const wo = textsArr[wi];
    db.transaction(() => { del.run(wi + 1, wo); upd.run(wo, wi + 1); ins.run(wi + 1, wo); })();
  }
  // 实测：单篇编辑（delete+update+insert 同一事务）
  const old = textsArr[mid];
  const edited = name === 'perchar' ? old + ' ' + perchar('追加内容') : old + ' ' + preseg('追加 内容');
  const t1 = now();
  db.transaction(() => { del.run(mid + 1, old); upd.run(edited, mid + 1); ins.run(mid + 1, edited); })();
  const incMs = now() - t1;
  // 实测：全库 rebuild
  const t2 = now();
  db.exec("INSERT INTO fts(fts) VALUES('rebuild')");
  const rebuildMs = now() - t2;
  db.close();
  incremental[name] = { oneNoteEditMs: +incMs.toFixed(3), fullRebuildMs: +rebuildMs.toFixed(1), notes: N };
}

// ---------- simple 扩展专属 ----------
// 注意：jieba 冷启动必须在一个「从未调用过任何 jieba/simple 函数」的进程里量。
// 本进程此前已经在 simple 连接上跑过查询，故此处只能量「已初始化后」的开销。
// 冷启动数字由 bench2_coldjieba.js 单独在干净进程里量。
let simpleExt = {};
{
  const tEx = new Database(path.join(OUTDIR, `b2_${TAG}_simple.db`));
  tEx.loadExtension(DLL); tEx.prepare('SELECT jieba_dict(?) v').get(DICT);
  const t0 = now();
  tEx.prepare('SELECT count(*) c FROM fts WHERE fts MATCH jieba_query(?)').get('中国');
  const jiebaWarm = now() - t0;
  const pinyin = {};
  for (const [q, label] of [['zhongguo', 'full_pinyin'], ['zg', 'initials']]) {
    try { pinyin[label] = tEx.prepare('SELECT count(*) c FROM fts WHERE fts MATCH simple_query(?)').get(q).c; }
    catch (e) { pinyin[label] = 'ERR: ' + e.message; }
  }
  tEx.close();
  simpleExt = { jiebaQueryAfterWarmMs: +jiebaWarm.toFixed(2), pinyin };
}

const out = {
  tag: TAG, target: TARGET, notes: N, chars: origChars, origBytes,
  indexes: idx, queries: queryResults, agg, fallback, incremental, simpleExt,
  host: { sqliteVersion: conn.preseg.prepare('SELECT sqlite_version() v').get().v, node: process.version },
};
for (const db of Object.values(conn)) db.close();
fs.writeFileSync(path.join(OUTDIR, `bench2_${TAG}.json`), JSON.stringify(out, null, 2));

// ---------- 打印 ----------
console.log(`\n=== [${TAG}] ${N} docs / ${origChars} chars / ${(origBytes / 1048576).toFixed(2)} MiB ===`);
console.log('索引: ' + Object.entries(idx).map(([k, v]) => `${k} ${(v.dbBytes / 1048576).toFixed(2)}MiB(${v.totalRatio}x)/${v.buildMs}ms`).join('  '));
console.log('\n类别聚合  R=召回 P=精确  latency=中位ms');
const hdr = 'cat'.padEnd(9) + Object.keys(SCHEMES).map(s => ('| ' + s).padEnd(20)).join('');
console.log(hdr);
for (const [cat, a] of Object.entries(agg)) {
  console.log(cat.padEnd(9) + Object.keys(SCHEMES).map(s => {
    const x = a.schemes[s];
    const lat = x.latMs === null ? 'n/a' : x.latMs + 'ms';
    const note = x.unsupported ? `(${x.unsupported}/${a.n}无法执行)` : '';
    return ('| ' + `${(x.recall * 100).toFixed(0)}%/${(x.precision * 100).toFixed(0)}% ${lat}${note}`).padEnd(20);
  }).join(''));
}
console.log('\n增量: ' + Object.entries(incremental).map(([k, v]) => `${k} 1篇=${v.oneNoteEditMs}ms 全rebuild=${v.fullRebuildMs}ms`).join('  |  '));
console.log('simple ext: ' + JSON.stringify(simpleExt));
console.log(`saved bench2_${TAG}.json`);
