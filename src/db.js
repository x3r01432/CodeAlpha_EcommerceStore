const Database = require('better-sqlite3');

const PRODUCTS = [
  ['Aurora Wireless Headphones', 'Over-ear Bluetooth headphones with active noise cancelling and 30-hour battery.', 129.99, 'Audio', '🎧', 25],
  ['Pulse Smartwatch', 'Fitness tracking, heart-rate monitor, GPS and 7-day battery life.', 199.0, 'Wearables', '⌚', 15],
  ['Nimbus Mechanical Keyboard', 'Hot-swappable 75% keyboard with RGB backlight and tactile switches.', 89.5, 'Computers', '⌨️', 30],
  ['Orbit 4K Webcam', 'Ultra HD webcam with auto-focus and dual noise-reducing mics.', 74.99, 'Computers', '📷', 20],
  ['Echo Portable Speaker', 'Waterproof speaker with 360° sound and 12-hour playtime.', 59.99, 'Audio', '🔊', 40],
  ['Lumen Desk Lamp', 'LED desk lamp with wireless charging base and 5 brightness levels.', 39.95, 'Home', '💡', 50],
  ['Glide Ergonomic Mouse', 'Vertical wireless mouse that reduces wrist strain.', 34.99, 'Computers', '🖱️', 35],
  ['Brew Smart Mug', 'Temperature-controlled mug that keeps coffee hot for 90 minutes.', 99.0, 'Home', '☕', 12],
  ['Trail Backpack', '25L water-resistant backpack with laptop sleeve.', 64.0, 'Outdoors', '🎒', 18],
  ['Volt Power Bank', '20,000 mAh USB-C power bank with fast charging.', 45.5, 'Accessories', '🔋', 60],
];

function openDb(file = process.env.DB_FILE || 'store.db') {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      price REAL NOT NULL CHECK (price >= 0),
      category TEXT NOT NULL,
      image TEXT NOT NULL,
      stock INTEGER NOT NULL CHECK (stock >= 0)
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      total REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'Processing',
      shipping_name TEXT NOT NULL,
      shipping_address TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price REAL NOT NULL
    );
  `);
  if (db.prepare('SELECT COUNT(*) c FROM products').get().c === 0) {
    const ins = db.prepare('INSERT INTO products (name, description, price, category, image, stock) VALUES (?,?,?,?,?,?)');
    db.transaction(() => PRODUCTS.forEach((p) => ins.run(...p)))();
  }
  return db;
}

module.exports = { openDb };
