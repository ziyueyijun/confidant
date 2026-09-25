// fallback.js — 兜底方案的真实代价
//
// 关键架构事实：预分词方案用 external content 时，content 表的列必须与索引内容一致，
// 即 content 表存的是「分词后」的文本。于是：
//   - LIKE 原文 → 在分词表上会因词间空格而漏（跨词边界的子串根本匹配不到）
//   - 要 LIKE 原文，必须另存一列原文，或另建一张原文表
// 本脚本量三种兜底的真实延迟与体积：
//   1) LIKE 原文（普通表，无索引，全扫）
//   2) trigram FTS 表上的 MATCH / LIKE（>=3 字可索引）
//   3) perchar（逐字 unicode61）表上的相邻字短语 MATCH —— 精确子串，无长度下限
//
// 用法: node fallback.js <tag> <chars>

const fs = require('fs');
const path = require('path');
const Database = require('D:/ZSJ/Github/confidant/docs/research/spikes/simple-ext/node_modules/better-sqlite3');
const OUTDIR = __dirname;
const TAG = process.argv[2] || '1M';
const TARGET = parseInt(process.argv[3] || '1000000', 10);
const NOTE_CHUNK = 400;
const REPS = 11;
const now = () => Number(process.hrtime.bigint()) / 1e6;
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const esc = s => '"' + s.replace(/"/g, '""') + '"';
// perchar\uff1aCJK \u5b57\u7b26\u524d\u540e\u90fd\u63d2\u7a7a\u683c\uff08\u53ea\u540e\u63d2\u4f1a\u4e0e\u6570\u5b57/\u5b57\u6bcd\u7c98\u8fde\u6210 token\uff0c\u9020\u6210\u5047\u9634\uff1b\u89c1\u62a5\u544a \u00a74.3\uff09
const perchar = s => s.replace(/([\u3400-\u9fff\uf900-\ufaff])/g, ' $1 ').replace(/ {2,}/g, ' ').trim();

const raw = fs.readFileSync(path.join(OUTDIR, 'corpus.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const docs = []; let acc = 0;
outer:
for (const r of raw) {
  for (let k = 0; k < r.text.length; k += NOTE_CHUNK) {
    const p = r.text.slice(k, k + NOTE_CHUNK);
    if (p.length < 60) continue;
    docs.push(p); acc += p.length;
    if (acc >= TARGET) break outer;
  }
}
const origBytes = Buffer.byteLength(docs.join(''), 'utf8');

// 建：普通表（原文）+ trigram FTS + perchar FTS
function open(name, build) {
  const f = path.join(OUTDIR, `fb_${TAG}_${name}.db`);
  for (const x of [f, f + '-wal', f + '-shm']) if (fs.existsSync(x)) fs.unlinkSync(x);
  const db = new Database(f); db.pragma('journal_mode = WAL');
  build(db);
  db.close();
  let size = 0; for (const x of [f, f + '-wal', f + '-shm']) if (fs.existsSync(x)) size += fs.statSync(x).size;
  return { db: new Database(f, { readonly: true }), size, file: f };
}

// plain：只存原文
const plain = open('plain', db => {
  db.exec('CREATE TABLE docs(id INTEGER PRIMARY KEY, body TEXT)');
  const ins = db.prepare('INSERT INTO docs VALUES(?,?)');
  db.transaction(() => docs.forEach((t, i) => ins.run(i + 1, t)))();
});
// trigram（contentless-delete 不行，用 external content + 原文表）
const tri = open('trigram', db => {
  db.exec('CREATE TABLE docs(id INTEGER PRIMARY KEY, body TEXT)');
  db.exec("CREATE VIRTUAL TABLE fts USING fts5(body, content='docs', content_rowid='id', tokenize='trigram')");
  const idb = db.prepare('INSERT INTO docs VALUES(?,?)'), ift = db.prepare('INSERT INTO fts(rowid,body) VALUES(?,?)');
  db.transaction(() => docs.forEach((t, i) => { idb.run(i + 1, t); ift.run(i + 1, t); }))();
});
// FTS5 的 trigram 也支持 LIKE（docs.body 可被索引）
const pc = open('perchar', db => {
  db.exec('CREATE TABLE docs(id INTEGER PRIMARY KEY, body TEXT)');
  db.exec("CREATE VIRTUAL TABLE fts USING fts5(body, content='docs', content_rowid='id', tokenize='unicode61')");
  const idb = db.prepare('INSERT INTO docs VALUES(?,?)'), ift = db.prepare('INSERT INTO fts(rowid,body) VALUES(?,?)');
  db.transaction(() => docs.forEach((t, i) => { const s = perchar(t); idb.run(i + 1, s); ift.run(i + 1, s); }))();
});

const QUERIES = ['识', '史', '克思', '共和', '大规模', '知识管理', '人工智能', '量子纠缠笔记'];
const out = { tag: TAG, docs: docs.length, chars: docs.reduce((a, b) => a + b.length, 0), origBytes, sizes: {}, queries: [] };

for (const q of QUERIES) {
  const gt = docs.filter(t => t.includes(q)).length;
  const row = { q, gt };
  // 1) LIKE 原文（全扫）
  {
    let c, times = [];
    for (let i = 0; i < REPS; i++) { const t = now(); c = plain.db.prepare("SELECT count(*) c FROM docs WHERE body LIKE '%'||?||'%'").get(q).c; times.push(now() - t); }
    row.like_plain = { ms: +median(times).toFixed(3), hit: c };
  }
  // 2) trigram MATCH（>=3 字）
  {
    if ([...q].length >= 3) {
      let c, times = [];
      for (let i = 0; i < REPS; i++) { const t = now(); c = tri.db.prepare('SELECT count(*) c FROM fts WHERE fts MATCH ?').get(esc(q)).c; times.push(now() - t); }
      row.trigram_match = { ms: +median(times).toFixed(3), hit: c };
    } else row.trigram_match = { unsupported: true };
  }
  // 3) trigram LIKE（同一触发子索引）
  {
    let c, times = [];
    for (let i = 0; i < REPS; i++) { const t = now(); c = tri.db.prepare("SELECT count(*) c FROM docs WHERE body LIKE '%'||?||'%'").get(q).c; times.push(now() - t); }
    row.trigram_like = { ms: +median(times).toFixed(3), hit: c };
  }
  // 4) perchar 相邻字短语 MATCH（精确子串，无长度下限）
  {
    let c, times = [];
    for (let i = 0; i < REPS; i++) { const t = now(); c = pc.db.prepare('SELECT count(*) c FROM fts WHERE fts MATCH ?').get(esc(perchar(q))).c; times.push(now() - t); }
    row.perchar_match = { ms: +median(times).toFixed(3), hit: c };
  }
  out.queries.push(row);
}
out.sizes = {
  plain: { bytes: plain.size, ratio: +(plain.size / origBytes).toFixed(2) },
  trigram: { bytes: tri.size, ratio: +(tri.size / origBytes).toFixed(2) },
  perchar: { bytes: pc.size, ratio: +(pc.size / origBytes).toFixed(2) },
};

fs.writeFileSync(path.join(OUTDIR, `fallback_${TAG}.json`), JSON.stringify(out, null, 2));
console.log(`\n=== [${TAG}] 兜底代价 (${docs.length} docs, ${(origBytes / 1048576).toFixed(2)} MiB) ===`);
console.log(`体积: plain ${(plain.size / 1048576).toFixed(2)}MiB (${(plain.size / origBytes).toFixed(2)}x)  trigram ${(tri.size / 1048576).toFixed(2)}MiB (${(tri.size / origBytes).toFixed(2)}x)  perchar ${(pc.size / 1048576).toFixed(2)}MiB (${(pc.size / origBytes).toFixed(2)}x)`);
console.log('query'.padEnd(8) + 'gt'.padStart(6) + ' | ' + 'LIKE原文'.padEnd(18) + '| ' + 'trigram MATCH'.padEnd(18) + '| ' + 'trigram LIKE'.padEnd(18) + '| ' + 'perchar MATCH');
for (const r of out.queries) {
  const f = (o) => o.unsupported ? 'n/a(<3字)' : `${o.ms}ms/${o.hit}`;
  console.log(r.q.padEnd(8) + String(r.gt).padStart(6) + ' | ' + f(r.like_plain).padEnd(18) + '| ' + f(r.trigram_match).padEnd(18) + '| ' + f(r.trigram_like).padEnd(18) + '| ' + f(r.perchar_match));
}
console.log(`saved fallback_${TAG}.json`);
for (const c of [plain, tri, pc]) c.db.close();
