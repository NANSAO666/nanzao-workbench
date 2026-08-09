require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const authRouter = require('./auth');
const dataRouter = require('./data');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 静态页面
app.use(express.static(path.resolve(__dirname, '..')));

// API 路由
app.use('/api/auth', authRouter);
app.use('/api/data', dataRouter);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});
