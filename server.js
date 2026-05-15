const express = require('express');
const Database = require('better-sqlite3');
const multer = require('multer');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const app = express();
const JWT_SECRET = 'fss_secret_2026_shianlian';
const PORT = 3000;

// ===== 目录初始化 =====
const UPLOAD_DIR = '/opt/fss/uploads';
['quals','reports','tickets','products'].forEach(d => {
  fs.mkdirSync(path.join(UPLOAD_DIR, d), { recursive: true });
});

// ===== 数据库初始化 =====
const db = new Database('/opt/fss/fss.db');
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    pw TEXT NOT NULL,
    uscc TEXT DEFAULT '',
    addr TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS ledger (
    id TEXT PRIMARY KEY,
    mer_id TEXT NOT NULL,
    name TEXT NOT NULL,
    cat TEXT DEFAULT '其他',
    qty TEXT DEFAULT '',
    supplier TEXT DEFAULT '',
    sup_id TEXT DEFAULT '',
    date TEXT DEFAULT '',
    produce_date TEXT DEFAULT '',
    batch TEXT DEFAULT '',
    expiry TEXT DEFAULT '',
    secret INTEGER DEFAULT 0,
    report TEXT DEFAULT '',
    report_url TEXT DEFAULT '',
    ticket_url TEXT DEFAULT '',
    ts INTEGER DEFAULT (strftime('%s','now') * 1000)
  );
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    mer_id TEXT NOT NULL,
    sup_id TEXT NOT NULL,
    sup_name TEXT DEFAULT '',
    name TEXT NOT NULL,
    qty TEXT DEFAULT '',
    items TEXT DEFAULT '[]',
    date TEXT DEFAULT '',
    remark TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    ts INTEGER DEFAULT (strftime('%s','now') * 1000)
  );
  CREATE TABLE IF NOT EXISTS shipments (
    id TEXT PRIMARY KEY,
    sup_id TEXT NOT NULL,
    sup_name TEXT DEFAULT '',
    mer_id TEXT NOT NULL,
    name TEXT NOT NULL,
    qty TEXT DEFAULT '',
    items TEXT DEFAULT '[]',
    batch TEXT DEFAULT '',
    date TEXT DEFAULT '',
    report TEXT DEFAULT '',
    report_ref TEXT DEFAULT '',
    report_url TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    ts INTEGER DEFAULT (strftime('%s','now') * 1000)
  );
  CREATE TABLE IF NOT EXISTS mer_suppliers (
    id TEXT PRIMARY KEY,
    mer_id TEXT NOT NULL,
    sup_id TEXT DEFAULT '',
    sup_name TEXT NOT NULL,
    contact TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    cat TEXT DEFAULT '',
    type TEXT DEFAULT 'manual'
  );
  CREATE TABLE IF NOT EXISTS quals (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    owner_role TEXT NOT NULL,
    type TEXT NOT NULL,
    no TEXT DEFAULT '',
    expire TEXT DEFAULT '',
    holder TEXT DEFAULT '',
    file_url TEXT DEFAULT '',
    ts INTEGER DEFAULT (strftime('%s','now') * 1000)
  );
  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    mfr_id TEXT NOT NULL,
    name TEXT NOT NULL,
    org TEXT DEFAULT '',
    no TEXT DEFAULT '',
    date TEXT DEFAULT '',
    expire TEXT DEFAULT '',
    result TEXT DEFAULT 'pending',
    file_url TEXT DEFAULT '',
    ts INTEGER DEFAULT (strftime('%s','now') * 1000)
  );
  CREATE TABLE IF NOT EXISTS sup_reports (
    id TEXT PRIMARY KEY,
    sup_id TEXT NOT NULL,
    name TEXT NOT NULL,
    cat TEXT DEFAULT '',
    org TEXT DEFAULT '',
    no TEXT DEFAULT '',
    date TEXT DEFAULT '',
    expire TEXT DEFAULT '',
    result TEXT DEFAULT 'pass',
    file_url TEXT DEFAULT '',
    ts INTEGER DEFAULT (strftime('%s','now') * 1000)
  );
  CREATE TABLE IF NOT EXISTS sup_products (
    id TEXT PRIMARY KEY,
    sup_id TEXT NOT NULL,
    name TEXT NOT NULL,
    cat TEXT DEFAULT '',
    spec TEXT DEFAULT '',
    price TEXT DEFAULT '',
    file_url TEXT DEFAULT '',
    ts INTEGER DEFAULT (strftime('%s','now') * 1000)
  );
  CREATE TABLE IF NOT EXISTS sup_mfrs (
    id TEXT PRIMARY KEY,
    mfr_id TEXT NOT NULL,
    sup_id TEXT NOT NULL,
    sup_name TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS mfr_mers (
    id TEXT PRIMARY KEY,
    mfr_id TEXT NOT NULL,
    mer_id TEXT NOT NULL,
    mer_name TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS mfr_shipments (
    id TEXT PRIMARY KEY,
    mfr_id TEXT NOT NULL,
    prod TEXT DEFAULT '',
    to_name TEXT DEFAULT '',
    qty TEXT DEFAULT '',
    date TEXT DEFAULT '',
    ts INTEGER DEFAULT (strftime('%s','now') * 1000)
  );
  CREATE TABLE IF NOT EXISTS mfr_receives (
    id TEXT PRIMARY KEY,
    mfr_id TEXT NOT NULL,
    from_name TEXT DEFAULT '',
    prod TEXT DEFAULT '',
    qty TEXT DEFAULT '',
    date TEXT DEFAULT '',
    ts INTEGER DEFAULT (strftime('%s','now') * 1000)
  );
  CREATE TABLE IF NOT EXISTS invites (
    id TEXT PRIMARY KEY,
    from_id TEXT NOT NULL,
    from_role TEXT DEFAULT '',
    for_role TEXT DEFAULT '',
    ts INTEGER DEFAULT (strftime('%s','now') * 1000)
  );
  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    to_id TEXT NOT NULL,
    msg TEXT DEFAULT '',
    read INTEGER DEFAULT 0,
    ts INTEGER DEFAULT (strftime('%s','now') * 1000)
  );
  CREATE TABLE IF NOT EXISTS pending_reg (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    role TEXT DEFAULT '',
    name TEXT DEFAULT '',
    ts INTEGER DEFAULT (strftime('%s','now') * 1000)
  );
  -- 默认管理员账号
  INSERT OR IGNORE INTO users (id, role, name, phone, pw, status)
  VALUES
    ('mer_admin','mer','示例商户','13800000001','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lkjS','pass'),
    ('sup_admin','sup','示例供应商','13800000002','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lkjS','pass'),
    ('mfr_admin','mfr','示例厂家','13800000003','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lkjS','pass'),
    ('op_admin','op','市场监管局','13800000004','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lkjS','pass');
`);

// ===== 中间件 =====
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static('/opt/fss/frontend'));

// 文件上传配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOAD_DIR, req.params.type || 'quals');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '_' + Math.random().toString(36).slice(2) + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ===== 工具函数 =====
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'token无效' });
  }
}

// ===== 认证接口 =====
// 登录
app.post('/api/login', (req, res) => {
  const { phone, pw } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE phone=?').get(phone);
  if (!user) return res.json({ error: '手机号不存在' });
  const ok = bcrypt.compareSync(pw, user.pw);
  if (!ok) return res.json({ error: '密码错误' });
  const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, role: user.role, name: user.name, phone: user.phone, uscc: user.uscc, addr: user.addr, status: user.status } });
});

// 注册
app.post('/api/register', (req, res) => {
  const { role, name, phone, pw, uscc, addr, inviteToken } = req.body;
  if (!name || !phone || !pw) return res.json({ error: '信息不完整' });
  if (db.prepare('SELECT id FROM users WHERE phone=?').get(phone)) return res.json({ error: '手机号已注册' });
  const hashedPw = bcrypt.hashSync(pw, 10);
  const newId = uid();
  db.prepare('INSERT INTO users (id,role,name,phone,pw,uscc,addr,status) VALUES (?,?,?,?,?,?,?,?)').run(
    newId, role, name, phone, hashedPw, uscc || '', addr || '', role === 'op' ? 'pass' : 'pending'
  );
  db.prepare('INSERT INTO pending_reg (id,user_id,role,name) VALUES (?,?,?,?)').run(uid(), newId, role, name);
  // 邀请自动关联
  if (inviteToken) {
    const inv = db.prepare('SELECT * FROM invites WHERE id=?').get(inviteToken);
    if (inv) {
      const fromUser = db.prepare('SELECT * FROM users WHERE id=?').get(inv.from_id);
      if (fromUser) {
        if (fromUser.role === 'sup' && role === 'mer') {
          db.prepare('INSERT OR IGNORE INTO mer_suppliers (id,mer_id,sup_id,sup_name,type) VALUES (?,?,?,?,?)').run(uid(), newId, fromUser.id, fromUser.name, 'platform');
        } else if (fromUser.role === 'mer' && role === 'sup') {
          db.prepare('INSERT OR IGNORE INTO mer_suppliers (id,mer_id,sup_id,sup_name,type) VALUES (?,?,?,?,?)').run(uid(), fromUser.id, newId, name, 'platform');
        } else if (fromUser.role === 'mfr' && role === 'sup') {
          db.prepare('INSERT OR IGNORE INTO sup_mfrs (id,mfr_id,sup_id,sup_name) VALUES (?,?,?,?)').run(uid(), fromUser.id, newId, name);
        } else if (fromUser.role === 'sup' && role === 'mfr') {
          db.prepare('INSERT OR IGNORE INTO sup_mfrs (id,mfr_id,sup_id,sup_name) VALUES (?,?,?,?)').run(uid(), newId, fromUser.id, fromUser.name);
        }
        db.prepare('INSERT INTO notifications (id,to_id,msg) VALUES (?,?,?)').run(uid(), fromUser.id, `✅ ${name} 通过您的邀请注册，已自动关联`);
      }
    }
  }
  res.json({ ok: true, msg: '注册成功，等待审核' });
});

// ===== 文件上传 =====
app.post('/api/upload/:type', auth, upload.single('file'), (req, res) => {
  if (!req.file) return res.json({ error: '上传失败' });
  const url = `/uploads/${req.params.type}/${req.file.filename}`;
  res.json({ url });
});

// ===== 用户/监管接口 =====
app.get('/api/users', auth, (req, res) => {
  const users = db.prepare('SELECT id,role,name,phone,uscc,addr,status FROM users').all();
  res.json(users);
});
app.get('/api/users/me', auth, (req, res) => {
  const user = db.prepare('SELECT id,role,name,phone,uscc,addr,status FROM users WHERE id=?').get(req.user.id);
  res.json(user);
});
app.put('/api/users/:id/status', auth, (req, res) => {
  db.prepare('UPDATE users SET status=? WHERE id=?').run(req.body.status, req.params.id);
  res.json({ ok: true });
});
app.put('/api/users/:id/pw', auth, (req, res) => {
  const hashed = bcrypt.hashSync(req.body.pw, 10);
  db.prepare('UPDATE users SET pw=? WHERE id=?').run(hashed, req.params.id);
  res.json({ ok: true });
});

// ===== 台账 =====
app.get('/api/ledger', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM ledger WHERE mer_id=? ORDER BY ts DESC').all(req.user.id);
  res.json(rows);
});
app.post('/api/ledger', auth, (req, res) => {
  const d = req.body;
  const id = uid();
  db.prepare(`INSERT INTO ledger (id,mer_id,name,cat,qty,supplier,sup_id,date,produce_date,batch,expiry,secret,report,report_url,ticket_url,ts)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, req.user.id, d.name, d.cat||'其他', d.qty||'', d.supplier||'', d.supId||'',
    d.date||'', d.produceDate||'', d.batch||'', d.expiry||'', d.secret?1:0,
    d.report||'', d.reportUrl||'', d.ticketUrl||'', Date.now()
  );
  res.json({ id });
});
app.delete('/api/ledger/:id', auth, (req, res) => {
  db.prepare('DELETE FROM ledger WHERE id=? AND mer_id=?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ===== 要货申请 =====
app.get('/api/orders', auth, (req, res) => {
  let rows;
  if (req.user.role === 'mer') {
    rows = db.prepare('SELECT * FROM orders WHERE mer_id=? ORDER BY ts DESC').all(req.user.id);
  } else {
    // 供应商/厂家看到发给自己的
    rows = db.prepare('SELECT * FROM orders WHERE sup_id=? ORDER BY ts DESC').all(req.user.id);
  }
  rows = rows.map(r => ({ ...r, items: JSON.parse(r.items || '[]') }));
  res.json(rows);
});
app.post('/api/orders', auth, (req, res) => {
  const d = req.body;
  const id = uid();
  db.prepare(`INSERT INTO orders (id,mer_id,sup_id,sup_name,name,qty,items,date,remark,status,ts)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, req.user.id, d.supId, d.supName||'', d.name, d.qty||'',
    JSON.stringify(d.items||[]), d.date||'', d.remark||'', 'pending', Date.now()
  );
  res.json({ id });
});
app.put('/api/orders/:id/status', auth, (req, res) => {
  db.prepare('UPDATE orders SET status=? WHERE id=?').run(req.body.status, req.params.id);
  res.json({ ok: true });
});

// ===== 发货/收货 =====
app.get('/api/shipments', auth, (req, res) => {
  let rows;
  if (req.user.role === 'sup') {
    rows = db.prepare('SELECT * FROM shipments WHERE sup_id=? ORDER BY ts DESC').all(req.user.id);
  } else {
    rows = db.prepare('SELECT * FROM shipments WHERE mer_id=? ORDER BY ts DESC').all(req.user.id);
  }
  rows = rows.map(r => ({ ...r, items: JSON.parse(r.items || '[]') }));
  res.json(rows);
});
app.post('/api/shipments', auth, (req, res) => {
  const d = req.body;
  const id = uid();
  db.prepare(`INSERT INTO shipments (id,sup_id,sup_name,mer_id,name,qty,items,batch,date,report,report_ref,report_url,status,ts)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, req.user.id, req.user.name, d.merId, d.name, d.qty||'',
    JSON.stringify(d.items||[]), d.batch||'', d.date||'',
    d.report||'', d.reportRef||'', d.reportUrl||'', 'pending', Date.now()
  );
  res.json({ id });
});
app.put('/api/shipments/:id/confirm', auth, (req, res) => {
  const s = db.prepare('SELECT * FROM shipments WHERE id=?').get(req.params.id);
  if (!s) return res.json({ error: '记录不存在' });
  db.prepare('UPDATE shipments SET status=? WHERE id=?').run('done', s.id);
  // 自动生成台账
  const ledgerId = uid();
  db.prepare(`INSERT INTO ledger (id,mer_id,name,cat,qty,supplier,sup_id,date,batch,secret,report,report_url,ts)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    ledgerId, req.user.id, s.name, s.cat||'其他', s.qty, s.sup_name, s.sup_id,
    new Date().toISOString().slice(0,10), s.batch||'', 0,
    s.report||'', s.report_url||'', Date.now()
  );
  res.json({ ok: true, ledgerId });
});

// ===== 供应商库 =====
app.get('/api/mer-suppliers', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM mer_suppliers WHERE mer_id=?').all(req.user.id);
  res.json(rows);
});
app.post('/api/mer-suppliers', auth, (req, res) => {
  const d = req.body;
  const id = uid();
  db.prepare('INSERT INTO mer_suppliers (id,mer_id,sup_id,sup_name,contact,phone,cat,type) VALUES (?,?,?,?,?,?,?,?)').run(
    id, req.user.id, d.supId||'', d.supName, d.contact||'', d.phone||'', d.cat||'', d.type||'manual'
  );
  res.json({ id });
});
app.delete('/api/mer-suppliers/:id', auth, (req, res) => {
  db.prepare('DELETE FROM mer_suppliers WHERE id=? AND mer_id=?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ===== 证件资质 =====
app.get('/api/quals', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM quals WHERE owner_id=? ORDER BY ts DESC').all(req.user.id);
  res.json(rows);
});
app.post('/api/quals', auth, (req, res) => {
  const d = req.body;
  const id = uid();
  db.prepare('INSERT INTO quals (id,owner_id,owner_role,type,no,expire,holder,file_url,ts) VALUES (?,?,?,?,?,?,?,?,?)').run(
    id, req.user.id, d.ownerRole||req.user.role, d.type, d.no||'', d.expire||'', d.holder||'', d.fileUrl||'', Date.now()
  );
  res.json({ id });
});
app.delete('/api/quals/:id', auth, (req, res) => {
  db.prepare('DELETE FROM quals WHERE id=? AND owner_id=?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ===== 厂家检测报告 =====
app.get('/api/reports', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM reports WHERE mfr_id=? ORDER BY ts DESC').all(req.user.id);
  res.json(rows);
});
app.post('/api/reports', auth, (req, res) => {
  const d = req.body;
  const id = uid();
  db.prepare('INSERT INTO reports (id,mfr_id,name,org,no,date,expire,result,file_url,ts) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
    id, req.user.id, d.name, d.org||'', d.no||'', d.date||'', d.expire||'', d.result||'pending', d.fileUrl||'', Date.now()
  );
  res.json({ id });
});
app.delete('/api/reports/:id', auth, (req, res) => {
  db.prepare('DELETE FROM reports WHERE id=? AND mfr_id=?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ===== 供应商检测报告 =====
app.get('/api/sup-reports', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM sup_reports WHERE sup_id=? ORDER BY ts DESC').all(req.user.id);
  res.json(rows);
});
app.post('/api/sup-reports', auth, (req, res) => {
  const d = req.body;
  const id = uid();
  db.prepare('INSERT INTO sup_reports (id,sup_id,name,cat,org,no,date,expire,result,file_url,ts) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(
    id, req.user.id, d.name, d.cat||'', d.org||'', d.no||'', d.date||'', d.expire||'', d.result||'pass', d.fileUrl||'', Date.now()
  );
  res.json({ id });
});
app.delete('/api/sup-reports/:id', auth, (req, res) => {
  db.prepare('DELETE FROM sup_reports WHERE id=? AND sup_id=?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ===== 供应商产品 =====
app.get('/api/sup-products', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM sup_products WHERE sup_id=? ORDER BY ts DESC').all(req.user.id);
  res.json(rows);
});
app.post('/api/sup-products', auth, (req, res) => {
  const d = req.body;
  const id = uid();
  db.prepare('INSERT INTO sup_products (id,sup_id,name,cat,spec,price,file_url,ts) VALUES (?,?,?,?,?,?,?,?)').run(
    id, req.user.id, d.name, d.cat||'', d.spec||'', d.price||'', d.fileUrl||'', Date.now()
  );
  res.json({ id });
});
app.delete('/api/sup-products/:id', auth, (req, res) => {
  db.prepare('DELETE FROM sup_products WHERE id=? AND sup_id=?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ===== 关联管理 =====
app.get('/api/sup-mfrs', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM sup_mfrs WHERE mfr_id=? OR sup_id=?').all(req.user.id, req.user.id);
  res.json(rows);
});
app.post('/api/sup-mfrs', auth, (req, res) => {
  const d = req.body;
  const exists = db.prepare('SELECT id FROM sup_mfrs WHERE mfr_id=? AND sup_id=?').get(d.mfrId, d.supId);
  if (exists) return res.json({ id: exists.id });
  const id = uid();
  db.prepare('INSERT INTO sup_mfrs (id,mfr_id,sup_id,sup_name) VALUES (?,?,?,?)').run(id, d.mfrId, d.supId, d.supName||'');
  res.json({ id });
});
app.get('/api/mfr-mers', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM mfr_mers WHERE mfr_id=? OR mer_id=?').all(req.user.id, req.user.id);
  res.json(rows);
});
app.post('/api/mfr-mers', auth, (req, res) => {
  const d = req.body;
  const exists = db.prepare('SELECT id FROM mfr_mers WHERE mfr_id=? AND mer_id=?').get(d.mfrId, d.merId);
  if (exists) return res.json({ id: exists.id });
  const id = uid();
  db.prepare('INSERT INTO mfr_mers (id,mfr_id,mer_id,mer_name) VALUES (?,?,?,?)').run(id, d.mfrId, d.merId, d.merName||'');
  // 双向：商户供应商库也加入
  const merSupExists = db.prepare('SELECT id FROM mer_suppliers WHERE mer_id=? AND sup_id=?').get(d.merId, d.mfrId);
  if (!merSupExists) {
    const mfrUser = db.prepare('SELECT name,phone FROM users WHERE id=?').get(d.mfrId);
    db.prepare('INSERT INTO mer_suppliers (id,mer_id,sup_id,sup_name,type) VALUES (?,?,?,?,?)').run(uid(), d.merId, d.mfrId, mfrUser?.name||'', 'mfr');
  }
  res.json({ id });
});

// ===== 厂家收发货 =====
app.get('/api/mfr-shipments', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM mfr_shipments WHERE mfr_id=? ORDER BY ts DESC').all(req.user.id);
  res.json(rows);
});
app.post('/api/mfr-shipments', auth, (req, res) => {
  const d = req.body;
  const id = uid();
  db.prepare('INSERT INTO mfr_shipments (id,mfr_id,prod,to_name,qty,date,ts) VALUES (?,?,?,?,?,?,?)').run(
    id, req.user.id, d.prod||'', d.to||'', d.qty||'', d.date||'', Date.now()
  );
  res.json({ id });
});
app.get('/api/mfr-receives', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM mfr_receives WHERE mfr_id=? ORDER BY ts DESC').all(req.user.id);
  res.json(rows);
});
app.post('/api/mfr-receives', auth, (req, res) => {
  const d = req.body;
  const id = uid();
  db.prepare('INSERT INTO mfr_receives (id,mfr_id,from_name,prod,qty,date,ts) VALUES (?,?,?,?,?,?,?)').run(
    id, req.user.id, d.from||'', d.prod||'', d.qty||'', d.date||'', Date.now()
  );
  res.json({ id });
});
app.delete('/api/mfr-shipments/:id', auth, (req, res) => {
  db.prepare('DELETE FROM mfr_shipments WHERE id=? AND mfr_id=?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});
app.delete('/api/mfr-receives/:id', auth, (req, res) => {
  db.prepare('DELETE FROM mfr_receives WHERE id=? AND mfr_id=?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ===== 邀请 =====
app.post('/api/invites', auth, (req, res) => {
  const { forRole } = req.body;
  const token = 'inv_' + req.user.id + '_' + forRole + '_' + Date.now();
  db.prepare('INSERT INTO invites (id,from_id,from_role,for_role) VALUES (?,?,?,?)').run(token, req.user.id, req.user.role, forRole);
  res.json({ token });
});
app.get('/api/invites/:token', (req, res) => {
  const inv = db.prepare('SELECT * FROM invites WHERE id=?').get(req.params.token);
  if (!inv) return res.json({ error: '邀请已失效' });
  const from = db.prepare('SELECT id,name,role FROM users WHERE id=?').get(inv.from_id);
  res.json({ ...inv, fromUser: from });
});

// ===== 通知 =====
app.get('/api/notifications', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM notifications WHERE to_id=? ORDER BY ts DESC').all(req.user.id);
  res.json(rows);
});
app.put('/api/notifications/read', auth, (req, res) => {
  db.prepare('UPDATE notifications SET read=1 WHERE to_id=?').run(req.user.id);
  res.json({ ok: true });
});

// ===== 公示页 =====
app.get('/api/pub/:merId', (req, res) => {
  const mer = db.prepare('SELECT id,name,addr,phone FROM users WHERE id=? AND role=?').get(req.params.merId, 'mer');
  if (!mer) return res.json({ error: '商户不存在' });
  const quals = db.prepare('SELECT * FROM quals WHERE owner_id=? AND owner_role=?').all(mer.id, 'mer');
  const ledger = db.prepare('SELECT * FROM ledger WHERE mer_id=? ORDER BY ts DESC LIMIT 50').all(mer.id);
  const suppliers = db.prepare('SELECT * FROM mer_suppliers WHERE mer_id=?').all(mer.id);
  // 供应商证件
  const supQuals = {};
  suppliers.forEach(s => {
    if (s.sup_id) {
      supQuals[s.sup_id] = db.prepare("SELECT * FROM quals WHERE owner_id=? AND (type='营业执照' OR type='食品经营许可证' OR type='食品生产许可证')").all(s.sup_id);
    }
  });
  res.json({ mer, quals, ledger, suppliers, supQuals });
});

// ===== 监管端 =====
app.get('/api/op/stats', auth, (req, res) => {
  const mers = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='mer'").get().c;
  const sups = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='sup'").get().c;
  const mfrs = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='mfr'").get().c;
  const pending = db.prepare("SELECT COUNT(*) as c FROM pending_reg").get().c;
  const ledgerTotal = db.prepare("SELECT COUNT(*) as c FROM ledger").get().c;
  res.json({ mers, sups, mfrs, pending, ledgerTotal });
});
app.get('/api/op/pending', auth, (req, res) => {
  const rows = db.prepare('SELECT p.*,u.phone,u.uscc,u.addr FROM pending_reg p JOIN users u ON p.user_id=u.id ORDER BY p.ts DESC').all();
  res.json(rows);
});
app.delete('/api/op/pending/:id', auth, (req, res) => {
  db.prepare('DELETE FROM pending_reg WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

app.put('/api/users/self/pw', async (req, res) => {
  const { phone, pw } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE phone=?').get(phone);
  if(!user) return res.json({ error: '手机号未注册' });
  const hashed = bcrypt.hashSync(pw, 10);
  db.prepare('UPDATE users SET pw=? WHERE id=?').run(hashed, user.id);
  res.json({ ok: true });
});

app.put('/api/shipments/:id/status', auth, (req, res) => {
  db.prepare('UPDATE shipments SET status=? WHERE id=?').run(req.body.status, req.params.id);
  res.json({ ok: true });
});

// ===== 启动 =====
app.listen(PORT, () => {
  console.log(`食安链后端运行在端口 ${PORT}`);
});
