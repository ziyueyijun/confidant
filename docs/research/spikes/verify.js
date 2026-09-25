// verify.js — 收尾核验
// 1) Intl.Segmenter 纯吞吐（1M 字）
// 2) contentless-delete 表：只存索引、不复制内容的空间
// 3) perchar 对英文/中英混排的正确性与假阳性
// 4) perchar 是否真的「精确子串」（用随机子串做代数检验）

const fs = require('fs');
const path = require('path');
const Database = require('D:/ZSJ/Github/confidant/docs/research/spikes/simple-ext/node_modules/better-sqlite3');
const now = () => Number(process.hrtime.bigint()) / 1e6;
const esc = s => '"' + s.replace(/"/g, '""') + '"';
// perchar\uff1aCJK \u5b57\u7b26\u524d\u540e\u90fd\u63d2\u7a7a\u683c\uff08\u53ea\u540e\u63d2\u4f1a\u4e0e\u6570\u5b57/\u5b57\u6bcd\u7c98\u8fde\u6210 token\uff0c\u9020\u6210\u5047\u9634\uff1b\u89c1\u62a5\u544a \u00a74.3\uff09
const perchar = s => s.replace(/([\u3400-\u9fff\uf900-\ufaff])/g, ' $1 ').replace(/ {2,}/g, ' ').trim();

const raw = fs.readFileSync(path.join(__dirname, 'corpus.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const docs = []; let acc = 0;
outer:
for (const r of raw) { for (let k = 0; k < r.text.length; k += 400) { const p = r.text.slice(k, k + 400); if (p.length < 60) continue; docs.push(p); acc += p.length; if (acc >= 1000000) break outer; } }

const out = {};

// 1) Segmenter 吞吐
{
  const seg = new Intl.Segmenter('zh', { granularity: 'word' });
  const txt = docs.join('\n');
  // 预热
  for (const s of seg.segment('预热文本测试')) { }
  const t0 = now();
  let n = 0;
  for (const s of seg.segment(txt)) n++;
  const ms = now() - t0;
  out.segmenter = { chars: txt.length, segments: n, ms: +ms.toFixed(1), kCharsPerSec: +(txt.length / ms).toFixed(1) };
}

// 2) contentless-delete 大小（preseg 与 perchar）
{
  const origBytes = Buffer.byteLength(docs.join(''), 'utf8');
  const seg = new Intl.Segmenter('zh', { granularity: 'word' });
  const preseg = s => { const o = []; for (const x of seg.segment(s)) o.push(x.isWordLike ? x.segment : ' '); return o.join(' ').replace(/ {2,}/g, ' ').trim(); };
  const mk = (name, fn) => {
    const f = path.join(__dirname, `vc_${name}.db`);
    for (const x of [f, f + '-wal', f + '-shm']) if (fs.existsSync(x)) fs.unlinkSync(x);
    const db = new Database(f); db.pragma('journal_mode = WAL');
    db.exec("CREATE VIRTUAL TABLE fts USING fts5(body, content='', contentless_delete=1, tokenize='unicode61')");
    const ins = db.prepare('INSERT INTO fts(rowid, body) VALUES(?,?)');
    db.transaction(() => docs.forEach((t, i) => ins.run(i + 1, fn(t))))();
    db.close();
    let b = 0; for (const x of [f, f + '-wal', f + '-shm']) if (fs.existsSync(x)) b += fs.statSync(x).size;
    return { bytes: b, ratio: +(b / origBytes).toFixed(2) };
  };
  out.contentlessDelete = { origBytes, preseg: mk('preseg', preseg), perchar: mk('perchar', perchar) };
  // 验证 contentless-delete 可 rebuild（delete-all + reinsert 语义）
  const db = new Database(path.join(__dirname, 'vc_perchar.db'));
  try { db.exec("INSERT INTO fts(fts) VALUES('rebuild')"); out.contentlessDelete.rebuildCmd = 'OK'; }
  catch (e) { out.contentlessDelete.rebuildCmd = 'ERR: ' + e.message; }
  try { const c = db.prepare('SELECT count(*) c FROM fts WHERE fts MATCH ?').get(esc(perchar('历史'))).c; out.contentlessDelete.matchWorks = c; }
  catch (e) { out.contentlessDelete.matchWorks = 'ERR: ' + e.message; }
  db.close();
}

// 3) 英文/中英混排
{
  const db = new Database(':memory:');
  db.exec("CREATE VIRTUAL TABLE fts USING fts5(body, tokenize='unicode61')");
  const ins = db.prepare('INSERT INTO fts VALUES(?)');
  const samples = ['人工智能 Artificial Intelligence 正在改变世界', '机器学习 machine learning 是 AI 的子领域', 'OpenAI 发布了 GPT 模型'];
  samples.forEach(s => ins.run(perchar(s)));
  const hit = q => db.prepare('SELECT body FROM fts WHERE fts MATCH ?').all(esc(perchar(q))).map(r => r.body);
  out.mixed = {
    indexed: samples.map(perchar),
    queries: {}
  };
  for (const q of ['Artificial', 'machine', 'Intelligence', 'GPT', '子领域', '机器学习']) {
    out.mixed.queries[q] = hit(q).length;
  }
  db.close();
}

// 4) perchar 精确子串的代数检验：随机取 3-6 字子串，比对 FTS 命中集 == 子串命中集
{
  const db = new Database(path.join(__dirname, 'vc_perchar.db'));
  let checked = 0, mismatch = 0;
  const rnd = (() => { let s = 12345; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
  const gt = new Set(); // 由 bench2 的 sizing 不同，这里单独算
  for (let iter = 0; iter < 300; iter++) {
    const di = Math.floor(rnd() * docs.length);
    const t = docs[di];
    const L = 2 + Math.floor(rnd() * 5); // 2..6
    const i = Math.floor(rnd() * Math.max(1, t.length - L));
    const sub = t.slice(i, i + L);
    if (!/^[\u3400-\u9fff]+$/.test(sub)) continue;
    const fts = new Set(db.prepare('SELECT rowid r FROM fts WHERE fts MATCH ?').all(esc(perchar(sub))).map(r => r.r));
    const truth = new Set(); docs.forEach((d, k) => { if (d.includes(sub)) truth.add(k + 1); });
    checked++;
    if (fts.size !== truth.size || [...truth].some(x => !fts.has(x))) {
      mismatch++;
      if (mismatch <= 5) out.mismatchSamples = [...(out.mismatchSamples || []), { sub, ftsSize: fts.size, truthSize: truth.size }];
    }
  }
  out.percharExactness = { checked, mismatch };
  db.close();
}

console.log(JSON.stringify(out, null, 2));
fs.writeFileSync(path.join(__dirname, 'verify.json'), JSON.stringify(out, null, 2));
