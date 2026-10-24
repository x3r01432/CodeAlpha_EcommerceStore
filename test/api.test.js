const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { createApp } = require('../src/app');

let app, token;
before(async () => {
  app = createApp({ dbFile: ':memory:' });
  const r = await request(app).post('/api/register').send({ username: 'steven', password: 'secret123' });
  token = r.body.token;
});

test('seeded products are listed', async () => {
  const r = await request(app).get('/api/products');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.length, 10);
});
test('search and category filter', async () => {
  const r = await request(app).get('/api/products?q=keyboard');
  assert.strictEqual(r.body.length, 1);
  const c = await request(app).get('/api/products?category=Audio');
  assert.ok(c.body.every((p) => p.category === 'Audio'));
});
test('product detail and 404', async () => {
  assert.strictEqual((await request(app).get('/api/products/1')).body.id, 1);
  assert.strictEqual((await request(app).get('/api/products/999')).status, 404);
});
test('register validates and rejects duplicates', async () => {
  assert.strictEqual((await request(app).post('/api/register').send({ username: 'x', password: '1' })).status, 400);
  assert.strictEqual((await request(app).post('/api/register').send({ username: 'steven', password: 'secret123' })).status, 409);
});
test('password is stored as bcrypt hash', () => {
  const row = app.locals.db.prepare('SELECT password_hash FROM users WHERE username = ?').get('steven');
  assert.match(row.password_hash, /^\$2[aby]\$/);
});
test('login works and wrong password fails', async () => {
  assert.strictEqual((await request(app).post('/api/login').send({ username: 'steven', password: 'secret123' })).status, 200);
  assert.strictEqual((await request(app).post('/api/login').send({ username: 'steven', password: 'nope' })).status, 401);
});
test('orders require auth', async () => {
  assert.strictEqual((await request(app).post('/api/orders').send({})).status, 401);
  assert.strictEqual((await request(app).get('/api/orders')).status, 401);
});
test('checkout creates order, prices from DB and decrements stock', async () => {
  const before = (await request(app).get('/api/products/1')).body;
  const r = await request(app).post('/api/orders').set('Authorization', `Bearer ${token}`)
    .send({ items: [{ product_id: 1, quantity: 2, price: 0.01 }, { product_id: 3, quantity: 1 }], shipping_name: 'Steven Rios', shipping_address: '1 Main St' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.total, Math.round((before.price * 2 + 89.5) * 100) / 100);
  const after = (await request(app).get('/api/products/1')).body;
  assert.strictEqual(after.stock, before.stock - 2);
});
test('order history lists items', async () => {
  const r = await request(app).get('/api/orders').set('Authorization', `Bearer ${token}`);
  assert.strictEqual(r.body.length, 1);
  assert.strictEqual(r.body[0].items.length, 2);
});
test('checkout rejects empty cart, bad qty and overselling', async () => {
  const auth = { Authorization: `Bearer ${token}` };
  const base = { shipping_name: 'S', shipping_address: 'A' };
  assert.strictEqual((await request(app).post('/api/orders').set(auth).send({ ...base, items: [] })).status, 400);
  assert.strictEqual((await request(app).post('/api/orders').set(auth).send({ ...base, items: [{ product_id: 1, quantity: 0 }] })).status, 400);
  assert.strictEqual((await request(app).post('/api/orders').set(auth).send({ ...base, items: [{ product_id: 8, quantity: 99 }] })).status, 409);
});
