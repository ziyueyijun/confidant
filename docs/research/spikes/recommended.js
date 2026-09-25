// recommended.js — 推荐方案（纯 JS 逐字 + unicode61 + 原文列 refine）的完整数字
//
// 方案：
//   docs(id, raw, seg)   raw=原文，seg=逐字空格化
//   fts(seg, content='docs', content_rowid='id', tokenize='unicode61')
//   查询：无空格 -> 整串当一个相邻字短语（=精确子串）；有空格 -> 各段为短语，段间 AND
//   refine：候选集回查 docs.raw 做 includes，消除标点造成的假阳
//
// 用法: node recommended.js <chars> <tag>

const fs = require('fs');
const path = require('path');
const Database = require('D:/ZSJ/Github/confidant/docs/research/spikes/simple-ext/node_modules/better-sqlite3');
const OUTDIR = __dirname;
const TARGET = parseInt(process.argv[2] || '1000000', 10);
const TAG = process.argv[3] || String(TARGET);
const NOTE_CHUNK = 400, REPS = 9;
const now = () => Number(process.hrtime.bigint()) / 1e6;
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const esc = s => '"' + s.replace(/"/g, '""') + '"';
const perchar = s => s.replace(/([\u3400-\u9fff\uf900-\ufaff])/g, ' $1 ').replace(/ {2,}/g, ' ').trim();

const raw = fs.readFileSync(path.join(OUTDIR, 'corpus.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const docs = []; let acc = 0;
outer:
for (const r of raw) { for (let k = 0; k < r.text.length; k += NOTE_CHUNK) { const p = r.text.slice(k, k + NOTE_CHUNK); if (p.length < 60) continue; docs.push(p); acc += p.length; if (acc >= TARGET) break outer; } }
const origBytes = Buffer.byteLength(docs.join(''), 'utf8');

// ---- 建 ----
const f = path.join(OUTDIR, `rec_${TAG}.db`);
for (const x of [f, f + '-wal', f + '-shm']) if (fs.existsSync(x)) fs.unlinkSync(x);
const db = new Database(f); db.pragma('journal_mode = WAL');
db.exec('CREATE TABLE docs(id INTEGER PRIMARY KEY, raw TEXT, seg TEXT)');
db.exec("CREATE VIRTUAL TABLE fts USING fts5(seg, content='docs', content_rowid='id', tokenize='unicode61')");
const idb = db.prepare('INSERT INTO docs VALUES(?,?,?)'), ift = db.prepare('INSERT INTO fts(rowid,seg) VALUES(?,?)');
const tBuild = now();
db.transaction(() => docs.forEach((t, i) => { const s = perchar(t); idb.run(i + 1, t, s); ift.run(i + 1, s); }))();
const buildMs = now() - tBuild;
db.exec("INSERT INTO fts(fts) VALUES('optimize')");
db.close();
let size = 0; for (const x of [f, f + '-wal', f + '-shm']) if (fs.existsSync(x)) size += fs.statSync(x).size;

// ---- 查 ----
const rdb = new Database(f, { readonly: true });
const cand = rdb.prepare('SELECT d.id, d.raw FROM fts JOIN docs d ON d.id = fts.rowid WHERE fts MATCH ?');
function search(q, refine) {
  const parts = q.includes(' ') ? q.split(/\s+/).filter(Boolean) : [q];
  const m = parts.map(p => esc(perchar(p))).join(' AND ');
  const rows = cand.all(m);
  return refine ? rows.filter(r => { const tt = q.includes(' ') ? q.split(/\s+/) : [q]; return tt.every(x => r.raw.includes(x)); }) : rows;
}

const QUERIES = {
  char1: ['识', '史', '学', '国', '人'],
  word2: ['知识', '历史', '科学', '经济', '规模', '革命'],
  word4: ['人工智能', '世界大战', '中华人民共和国', '中国人民银行'],
  cross: ['克思', '共和', '第一', '部分', '中共', '人民共和'],
  phrase: ['中国历史', '大规模', '知识管理'],
  oov: ['知识管理', '量子纠缠笔记'],
  multiterm: ['中国 历史', '北京 大学', '经济 政策', '人工智能 发展'],
};

const rows = [];
const agg = {};
for (const [cat, list] of Object.entries(QUERIES)) {
  const perf = [];
  for (const q of list) {
    const truth = new Set();
    const toks = q.includes(' ') ? q.split(/\s+/) : [q];
    if (q.includes(' ')) {
      const sets = toks.map(t => new Set(docs.map((d, i) => [d, i]).filter(([d]) => d.includes(t)).map(([, i]) => i + 1)));
      let inter = sets[0] || new Set();
      for (let k = 1; k < sets.length; k++) inter = new Set([...inter].filter(x => sets[k].has(x)));
      for (const x of inter) truth.add(x);
    } else docs.forEach((d, i) => { if (d.includes(q)) truth.add(i + 1); });

    // 延迟：raw 与 refine 两档
    let t_raw = [], t_ref = [], gRaw, gRef;
    for (let i = 0; i < REPS; i++) { const t = now(); gRaw = search(q, false); t_raw.push(now() - t); }
    for (let i = 0; i < REPS; i++) { const t = now(); gRef = search(q, true); t_ref.push(now() - t); }
    const met = g => { let tp = 0; for (const x of g) if (truth.has(x.id)) tp++; return { R: truth.size ? +(tp / truth.size).toFixed(4) : 1, P: g.length ? +(tp / g.length).toFixed(4) : 1, n: g.length, gt: truth.size }; };
    const mr = met(gRaw), mf = met(gRef);
    rows.push({ cat, q, rawQuery: { ...mr, ms: +median(t_raw).toFixed(3) }, refine: { ...mf, ms: +median(t_ref).toFixed(3) } });
    perf.push(mf);
  }
  const avg = k => +(perf.reduce((s, x) => s + x[k], 0) / perf.length).toFixed(4);
  agg[cat] = { n: perf.length, R_raw: avg('R'), P_raw: +(rows.filter(r => r.cat === cat).reduce((s, r) => s + r.rawQuery.P, 0) / perf.length).toFixed(4), R_ref: avg('R'), P_ref: avg('P') };
}

// ---- 增量 vs rebuild ----
const segArr = docs.map(perchar);
const wdb = new Database(f);
const del = wdb.prepare("INSERT INTO fts(fts, rowid, seg) VALUES('delete', ?, ?)");
const ins = wdb.prepare('INSERT INTO fts(rowid, seg) VALUES(?,?)');
const upd = wdb.prepare('UPDATE docs SET seg=? WHERE id=?');
const mid = Math.floor(docs.length / 2);
// 预热
for (let w = 0; w < 3; w++) { const i = 10 + w; wdb.transaction(() => { del.run(i + 1, segArr[i]); upd.run(segArr[i], i + 1); ins.run(i + 1, segArr[i]); })(); }
const old = segArr[mid]; const edited = perchar(docs[mid] + ' 追加内容');
const t1 = now(); wdb.transaction(() => { del.run(mid + 1, old); upd.run(edited, mid + 1); ins.run(mid + 1, edited); })(); const incMs = now() - t1;
const t2 = now(); wdb.exec("INSERT INTO fts(fts) VALUES('rebuild')"); const rebuildMs = now() - t2;
wdb.close();

const out = { tag: TAG, notes: docs.length, chars: docs.reduce((a, d) => a + d.length, 0), origBytes, buildMs: Math.round(buildMs), dbBytes: size, ratio: +(size / origBytes).toFixed(2), agg, rows, incremental: { oneNoteEditMs: +incMs.toFixed(3), fullRebuildMs: +rebuildMs.toFixed(1) } };
fs.writeFileSync(path.join(OUTDIR, `recommended_${TAG}.json`), JSON.stringify(out, null, 2));

console.log(`\n=== [${TAG}] 推荐方案：逐字+unicode61+原文列refine (${docs.length} docs, ${(origBytes / 1048576).toFixed(2)} MiB) ===`);
console.log(`建索引 ${buildMs.toFixed(0)}ms   db ${(size / 1048576).toFixed(2)}MiB (${(size / origBytes).toFixed(2)}x)`);
console.log(`增量: 单篇编辑 ${incMs.toFixed(3)}ms   全 rebuild ${rebuildMs.toFixed(1)}ms`);
console.log('\n类别           | 不 refine R/P      | refine后 R/P       | refine中位延迟');
for (const [cat, a] of Object.entries(agg)) {
  const rr = rows.filter(r => r.cat === cat);
  const lat = median(rr.map(r => r.refine.ms));
  console.log(`${cat.padEnd(14)} | ${((a.R_raw * 100).toFixed(0) + '%/' + (a.P_raw * 100).toFixed(0) + '%').padEnd(18)} | ${((a.R_ref * 100).toFixed(0) + '%/' + (a.P_ref * 100).toFixed(0) + '%').padEnd(18)} | ${lat}ms`);
}
console.log(`\nsaved recommended_${TAG}.json`);
