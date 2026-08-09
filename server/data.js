const express = require('express');
const db = require('./db');
const jwt = require('jsonwebtoken');

const router = express.Router();

// 认证中间件
function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    res.status(401).json({ error: 'token无效' });
  }
}

// 通用 CRUD 工厂
function crud(table, idColumn = 'id') {
  return {
    list: (req, res) => {
      const rows = db.prepare(`SELECT * FROM ${table} WHERE user_id = ? ORDER BY created_at DESC`).all(req.userId);
      res.json(rows);
    },
    get: (req, res) => {
      const row = db.prepare(`SELECT * FROM ${table} WHERE ${idColumn} = ? AND user_id = ?`).get(req.params.id, req.userId);
      if (!row) return res.status(404).json({ error: '不存在' });
      res.json(row);
    },
    create: (req, res) => {
      const data = { ...req.body, user_id: req.userId };
      const columns = Object.keys(data);
      const values = Object.values(data);
      const placeholders = columns.map(() => '?').join(', ');
      db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`).run(...values);
      res.json({ id: data[idColumn] || db.prepare('SELECT last_insert_rowid() as id').get().id, ...data });
    },
    update: (req, res) => {
      const data = { ...req.body, updated_at: new Date().toISOString() };
      const sets = Object.keys(data).map(k => `${k} = ?`).join(', ');
      const values = [...Object.values(data), req.params.id, req.userId];
      const result = db.prepare(`UPDATE ${table} SET ${sets} WHERE ${idColumn} = ? AND user_id = ?`).run(...values);
      if (result.changes === 0) return res.status(404).json({ error: '不存在' });
      res.json({ success: true });
    },
    delete: (req, res) => {
      const result = db.prepare(`DELETE FROM ${table} WHERE ${idColumn} = ? AND user_id = ?`).run(req.params.id, req.userId);
      if (result.changes === 0) return res.status(404).json({ error: '不存在' });
      res.json({ success: true });
    }
  };
}

// 提示词
const promptCrud = crud('prompts');
router.get('/prompts', auth, promptCrud.list);
router.get('/prompts/:id', auth, promptCrud.get);
router.post('/prompts', auth, promptCrud.create);
router.put('/prompts/:id', auth, promptCrud.update);
router.delete('/prompts/:id', auth, promptCrud.delete);

// 笔记
const noteCrud = crud('notes');
router.get('/notes', auth, noteCrud.list);
router.get('/notes/:id', auth, noteCrud.get);
router.post('/notes', auth, noteCrud.create);
router.put('/notes/:id', auth, noteCrud.update);
router.delete('/notes/:id', auth, noteCrud.delete);

// 代码片段
const snippetCrud = crud('snippets');
router.get('/snippets', auth, snippetCrud.list);
router.post('/snippets', auth, snippetCrud.create);
router.put('/snippets/:id', auth, snippetCrud.update);
router.delete('/snippets/:id', auth, snippetCrud.delete);

// 待办
const todoCrud = crud('todos');
router.get('/todos', auth, todoCrud.list);
router.post('/todos', auth, todoCrud.create);
router.put('/todos/:id', auth, todoCrud.update);
router.delete('/todos/:id', auth, todoCrud.delete);

// 计时记录
const timerCrud = crud('timer_records');
router.get('/timer-records', auth, timerCrud.list);
router.post('/timer-records', auth, timerCrud.create);
router.delete('/timer-records/:id', auth, timerCrud.delete);

// 保险箱
const vaultCrud = crud('vault_items');
router.get('/vault', auth, vaultCrud.list);
router.post('/vault', auth, vaultCrud.create);
router.put('/vault/:id', auth, vaultCrud.update);
router.delete('/vault/:id', auth, vaultCrud.delete);

// 书签
const bookmarkCrud = crud('bookmarks');
router.get('/bookmarks', auth, bookmarkCrud.list);
router.post('/bookmarks', auth, bookmarkCrud.create);
router.put('/bookmarks/:id', auth, bookmarkCrud.update);
router.delete('/bookmarks/:id', auth, bookmarkCrud.delete);

// AI会话
const sessionCrud = crud('ai_sessions');
router.get('/ai-sessions', auth, sessionCrud.list);
router.post('/ai-sessions', auth, sessionCrud.create);
router.put('/ai-sessions/:id', auth, sessionCrud.update);
router.delete('/ai-sessions/:id', auth, sessionCrud.delete);

// 业务模块
const moduleCrud = crud('business_modules');
router.get('/modules', auth, moduleCrud.list);
router.post('/modules', auth, moduleCrud.create);
router.put('/modules/:id', auth, moduleCrud.update);
router.delete('/modules/:id', auth, moduleCrud.delete);

// 导航配置
router.get('/nav-config', auth, (req, res) => {
  const row = db.prepare('SELECT * FROM nav_config WHERE user_id = ?').get(req.userId);
  res.json(row ? JSON.parse(row.config) : []);
});
router.put('/nav-config', auth, (req, res) => {
  const config = JSON.stringify(req.body.config || []);
  db.prepare('INSERT INTO nav_config (user_id, config) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET config = ?, updated_at = CURRENT_TIMESTAMP')
    .run(req.userId, config, config);
  res.json({ success: true });
});

// 用户设置
router.get('/settings', auth, (req, res) => {
  const row = db.prepare('SELECT * FROM settings WHERE user_id = ?').get(req.userId);
  res.json(row ? JSON.parse(row.config) : {});
});
router.put('/settings', auth, (req, res) => {
  const config = JSON.stringify(req.body);
  db.prepare('INSERT INTO settings (user_id, config) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET config = ?, updated_at = CURRENT_TIMESTAMP')
    .run(req.userId, config, config);
  res.json({ success: true });
});

// 批量导入（迁移用）
router.post('/import', auth, (req, res) => {
  const data = req.body;
  const tables = {
    prompts: 'prompts',
    notes: 'notes',
    snippets: 'snippets',
    todos: 'todos',
    timerRecords: 'timer_records',
    vaultItems: 'vault_items',
    bookmarks: 'bookmarks',
    aiSessions: 'ai_sessions'
  };

  for (const [key, table] of Object.entries(tables)) {
    const items = data[key];
    if (!items || !Array.isArray(items)) continue;
    const insert = db.prepare(
      `INSERT OR REPLACE INTO ${table} (id, user_id, ${Object.keys(items[0] || {}).filter(k => k !== 'id').join(', ')}) VALUES (?, ?, ${Object.keys(items[0] || {}).filter(k => k !== 'id').map(() => '?').join(', ')})`
    );
    const insertMany = db.transaction((rows) => {
      for (const row of rows) {
        const { id, ...rest } = row;
        insert.run(id, req.userId, ...Object.values(rest));
      }
    });
    insertMany(items);
  }

  res.json({ success: true });
});

module.exports = router;
