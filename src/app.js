const express = require('express');
const path = require('path');
const { openDb } = require('./db');
const { hash, check, sign, requireAuth, validCreds } = require('./auth');

function createApp({ dbFile } = {}) {
  const db = openDb(dbFile);
  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // ---------- auth ----------
  app.post('/api/register', (req, res) => {
    const v = validCreds(req.body);
    if (v.error) return res.status(400).json({ error: v.error });
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(v.u)) return res.status(409).json({ error: 'Username taken' });
    const r = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(v.u, hash(v.p));
    const user = { id: r.lastInsertRowid, username: v.u };
    res.status(201).json({ token: sign(user), user });
  });
  app.post('/api/login', (req, res) => {
    const row = db.prepare('SELECT * FROM users WHERE username = ?').get(String(req.body?.username || ''));
    if (!row || !check(String(req.body?.password || ''), row.password_hash)) return res.status(401).json({ error: 'Invalid username or password' });
    const user = { id: row.id, username: row.username };
    res.json({ token: sign(user), user });
  });

  // ---------- products ----------
  app.get('/api/products', (req, res) => {
    const q = `%${String(req.query.q || '')}%`;
    const cat = req.query.category;
    const rows = cat
      ? db.prepare('SELECT * FROM products WHERE (name LIKE ? OR description LIKE ?) AND category = ? ORDER BY id').all(q, q, cat)
      : db.prepare('SELECT * FROM products WHERE name LIKE ? OR description LIKE ? ORDER BY id').all(q, q);
    res.json(rows);
  });
  app.get('/api/categories', (_req, res) => res.json(db.prepare('SELECT DISTINCT category FROM products ORDER BY category').all().map((r) => r.category)));
  app.get('/api/products/:id', (req, res) => {
    const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!p) return res.status(404).json({ error: 'Product not found' });
    res.json(p);
  });

  // ---------- orders ----------
  // Cart lives in the browser (localStorage); checkout sends items and the server re-prices them from the DB.
  app.post('/api/orders', requireAuth, (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const name = String(req.body?.shipping_name || '').trim();
    const address = String(req.body?.shipping_address || '').trim();
    if (!items.length) return res.status(400).json({ error: 'Cart is empty' });
    if (!name || !address) return res.status(400).json({ error: 'Shipping name and address are required' });
    try {
      const order = db.transaction(() => {
        let total = 0;
        const lines = items.map((it) => {
          const qty = Number(it.quantity);
          if (!Number.isInteger(qty) || qty < 1 || qty > 99) throw Object.assign(new Error('Invalid quantity'), { status: 400 });
          const p = db.prepare('SELECT * FROM products WHERE id = ?').get(it.product_id);
          if (!p) throw Object.assign(new Error('Product not found'), { status: 400 });
          if (p.stock < qty) throw Object.assign(new Error(`Not enough stock for ${p.name}`), { status: 409 });
          total += p.price * qty;
          return { p, qty };
        });
        total = Math.round(total * 100) / 100;
        const o = db.prepare('INSERT INTO orders (user_id, total, shipping_name, shipping_address) VALUES (?,?,?,?)').run(req.user.id, total, name, address);
        for (const { p, qty } of lines) {
          db.prepare('INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?,?,?,?)').run(o.lastInsertRowid, p.id, qty, p.price);
          db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(qty, p.id);
        }
        return { id: o.lastInsertRowid, total, status: 'Processing' };
      })();
      res.status(201).json(order);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });
  app.get('/api/orders', requireAuth, (req, res) => {
    const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
    const itemsQ = db.prepare('SELECT oi.quantity, oi.unit_price, p.name, p.image, p.id product_id FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE order_id = ?');
    res.json(orders.map((o) => ({ ...o, items: itemsQ.all(o.id) })));
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
  app.locals.db = db;
  return app;
}

module.exports = { createApp };
