// coldjieba.js — 在干净进程里量 wangfenjin/simple 的冷启动开销
// jieba 词典初始化是进程级一次性的，必须用从未调用过 simple/jieba 的新进程来量。
// 用法: node coldjieba.js [dbPath]

const path = require('path');
const Database = require('D:/ZSJ/Github/confidant/docs/research/spikes/simple-ext/node_modules/better-sqlite3');
const DLL = 'D:/ZSJ/Github/confidant/docs/research/spikes/simple-ext/dll/libsimple-windows-x64/simple.dll';
const DICT = 'D:/ZSJ/Github/confidant/docs/research/spikes/simple-ext/dll/libsimple-windows-x64/dict';
const DB = process.argv[2] || path.join(__dirname, 'b2_100k_simple.db');
const now = () => Number(process.hrtime.bigint()) / 1e6;

const out = { db: DB };
let t = now();
const db = new Database(DB, { readonly: true });
out.openDbMs = +(now() - t).toFixed(2);

t = now();
db.loadExtension(DLL);
out.loadExtensionMs = +(now() - t).toFixed(2);

t = now();
db.prepare('SELECT jieba_dict(?) v').get(DICT);
out.jiebaDictCallMs = +(now() - t).toFixed(2);

// 首次 simple_query（触发拼音表，拼音表编译在 DLL 内，应当很快）
t = now();
const r1 = db.prepare('SELECT count(*) c FROM fts WHERE fts MATCH simple_query(?)').get('中国').c;
out.firstSimpleQueryMs = +(now() - t).toFixed(2);
out.firstSimpleQueryHits = r1;

// 首次 jieba_query（触发 jieba 词典加载 —— 关键的冷启动数字）
t = now();
const r2 = db.prepare('SELECT count(*) c FROM fts WHERE fts MATCH jieba_query(?)').get('中国').c;
out.firstJiebaQueryMs = +(now() - t).toFixed(2);
out.firstJiebaQueryHits = r2;

// 第二次
t = now();
db.prepare('SELECT count(*) c FROM fts WHERE fts MATCH jieba_query(?)').get('中国');
out.secondJiebaQueryMs = +(now() - t).toFixed(2);

// 拼音
try { out.pinyinFull = db.prepare('SELECT count(*) c FROM fts WHERE fts MATCH simple_query(?)').get('zhongguo').c; } catch (e) { out.pinyinFull = 'ERR ' + e.message; }
try { out.pinyinInitials = db.prepare('SELECT count(*) c FROM fts WHERE fts MATCH simple_query(?)').get('zg').c; } catch (e) { out.pinyinInitials = 'ERR ' + e.message; }

db.close();
console.log(JSON.stringify(out, null, 2));
