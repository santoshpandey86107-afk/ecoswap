const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const Database = require('better-sqlite3');

const app = express();
const port = Number(process.env.PORT || 3000);
const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const databasePath = path.resolve(process.env.DATABASE_PATH || path.join(dataDir, 'ecoswap.sqlite'));
fs.mkdirSync(path.dirname(databasePath), { recursive: true });
const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('customer', 'admin')),
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS addresses (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    recipient_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    UNIQUE(user_id, label)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_addresses_default ON addresses(user_id) WHERE is_default=1;
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    emoji TEXT NOT NULL,
    price INTEGER NOT NULL CHECK(price >= 0),
    mrp INTEGER NOT NULL CHECK(mrp >= price),
    farmer TEXT NOT NULL,
    location TEXT NOT NULL,
    distance_km INTEGER NOT NULL,
    certificate TEXT NOT NULL,
    conventional TEXT NOT NULL,
    plastic_grams INTEGER NOT NULL DEFAULT 0,
    plastic_free INTEGER NOT NULL DEFAULT 0,
    rating REAL NOT NULL DEFAULT 0,
    season TEXT NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
    active INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS carts (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL CHECK(quantity > 0),
    PRIMARY KEY(user_id, product_id)
  );
  CREATE TABLE IF NOT EXISTS wishlists (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    PRIMARY KEY(user_id, product_id)
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY,
    order_number TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT NOT NULL,
    subtotal INTEGER NOT NULL,
    shipping INTEGER NOT NULL,
    total INTEGER NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'Cash on delivery',
    status TEXT NOT NULL DEFAULT 'Placed'
      CHECK(status IN ('Placed', 'Packed', 'Shipped', 'Delivered', 'Cancelled')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS order_items (
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    product_name TEXT NOT NULL,
    unit_price INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    PRIMARY KEY(order_id, product_id)
  );
  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    box_name TEXT NOT NULL,
    price INTEGER NOT NULL,
    frequency TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active', 'Paused', 'Cancelled')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);
`);

const seedProducts = [
  [1, 'Organic basmati rice 1kg', 'Food', '🌾', 210, 260, 'Ram Singh', 'Karnal, HR', 250, 'NPOP/2024/1182', 'Polished white rice', 0, 1, 4.6, 'Oct', 50],
  [2, 'Cold-pressed mustard oil 1L', 'Food', '🫒', 320, 380, 'Meena Devi', 'Alwar, RJ', 330, 'NPOP/2023/0771', 'Refined mustard oil', 30, 1, 4.5, 'Oct', 50],
  [3, 'Seasonal veg basket 3kg', 'Food', '🥬', 299, 350, 'Kisan Collective', 'Meerut, UP', 60, 'NPOP/2024/2210', 'Market vegetables', 20, 1, 4.7, 'Oct', 50],
  [4, 'Raw forest honey 500g', 'Food', '🍯', 420, 499, 'Bhil co-op', 'Udaipur, RJ', 400, 'NPOP/2023/1590', 'Syrup-blended honey', 25, 0, 4.4, 'Mar', 50],
  [5, 'Neem & tulsi face wash 100ml', 'Skincare', '🌿', 240, 310, 'Ayu Naturals', 'Dehradun, UK', 250, 'NPOP/2024/0455', 'Microbead face wash', 15, 1, 4.3, 'Oct', 50],
  [6, 'Coconut & shea body butter', 'Skincare', '🥥', 380, 450, 'Ayu Naturals', 'Dehradun, UK', 250, 'NPOP/2024/0455', 'Petroleum-based lotion', 35, 1, 4.5, 'Oct', 50],
  [7, 'Soapnut dish wash 500ml', 'Household', '🧼', 180, 220, 'Reetha Works', 'Bareilly, UP', 240, 'NPOP/2024/3320', 'Phosphate dish liquid', 40, 1, 4.4, 'Oct', 50],
  [8, 'Plant-based floor cleaner 1L', 'Household', '🧽', 230, 290, 'Reetha Works', 'Bareilly, UP', 240, 'NPOP/2024/3320', 'Chlorine floor cleaner', 45, 1, 4.2, 'Oct', 50],
  [9, 'Bamboo toothbrush (pack of 4)', 'Household', '🪥', 199, 260, 'Bamboo Basics', 'Guwahati, AS', 1700, '—', 'Plastic toothbrush', 60, 1, 4.3, 'Oct', 50],
  [10, 'Organic cotton tee', 'Clothing', '👕', 699, 899, 'Vidarbha Weavers', 'Nagpur, MH', 1050, 'GOTS/IN/8841', 'Polyester tee', 90, 0, 4.6, 'Oct', 50],
  [11, 'Jute shopping bag', 'Clothing', '👜', 149, 199, 'Jute Sisters', 'Kolkata, WB', 1300, '—', 'Plastic carry bag', 20, 1, 4.8, 'Oct', 50],
  [12, 'Organic turmeric powder 200g', 'Food', '🟡', 140, 180, 'Salem Farmers', 'Salem, TN', 2100, 'NPOP/2024/2987', 'Colour-added turmeric', 10, 1, 4.7, 'Jan', 50]
];
const seed = db.prepare(`INSERT OR IGNORE INTO products
  (id,name,category,emoji,price,mrp,farmer,location,distance_km,certificate,conventional,plastic_grams,plastic_free,rating,season,stock)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const seedAll = db.transaction(() => seedProducts.forEach(product => seed.run(...product)));
seedAll();

const productSelect = `SELECT id, name AS n, category AS cat, emoji AS e, price AS p, mrp AS m,
  farmer AS farm, location AS loc, distance_km AS km, certificate AS cert,
  conventional AS conv, plastic_grams AS pl, plastic_free AS eco, rating AS rt,
  season AS sea, stock, active FROM products`;
const publicProducts = db.prepare(`${productSelect} WHERE active=1 ORDER BY id`);
const cookieName = 'ecoswap_session';
const sessionDuration = 7 * 24 * 60 * 60 * 1000;
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use((req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.get('origin');
    if (origin) {
      try {
        if (new URL(origin).host !== req.get('host')) return res.status(403).json({ error: 'Cross-origin request rejected.' });
      } catch {
        return res.status(403).json({ error: 'Invalid request origin.' });
      }
    }
  }
  next();
});

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}
function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function setSession(res, userId, role) {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  db.prepare('INSERT INTO sessions(token_hash,user_id,role,expires_at) VALUES(?,?,?,?)')
    .run(tokenHash, userId, role, Date.now() + sessionDuration);
  res.cookie(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: sessionDuration
  });
}
function session(req, res, next) {
  const token = req.cookies?.[cookieName] || parseCookie(req.get('cookie'), cookieName);
  if (!token) return next();
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const row = db.prepare(`SELECT s.user_id AS userId,s.role,u.name,u.email
    FROM sessions s LEFT JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>?`).get(tokenHash, Date.now());
  if (row) {
    req.auth = { id: row.userId, role: row.role, name: row.name || 'Admin', email: row.email || process.env.ADMIN_EMAIL };
    req.sessionHash = tokenHash;
  }
  next();
}
function parseCookie(header, name) {
  const entry = (header || '').split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
}
app.use(session);
function requireCustomer(req, res, next) {
  if (!req.auth || req.auth.role !== 'customer') return res.status(401).json({ error: 'Sign in to continue.' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.auth || req.auth.role !== 'admin') return res.status(401).json({ error: 'Admin sign-in required.' });
  next();
}
function validEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}
const authAttempts = new Map();
function limitAuthAttempts(req, res, next) {
  const key = `${req.path}:${req.ip}`;
  const now = Date.now();
  const record = authAttempts.get(key);
  if (record && record.resetAt <= now) authAttempts.delete(key);
  const active = authAttempts.get(key);
  if (active && active.count >= 10) {
    res.set('Retry-After', String(Math.ceil((active.resetAt - now) / 1000)));
    return res.status(429).json({ error: 'Too many sign-in attempts. Please wait and try again.' });
  }
  if (active) active.count += 1;
  else authAttempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
  if (authAttempts.size > 10000) {
    for (const [entry, value] of authAttempts) if (value.resetAt <= now) authAttempts.delete(entry);
  }
  next();
}
function clearAuthAttempts(req) {
  authAttempts.delete(`${req.path}:${req.ip}`);
}
function cleanText(value, maxLength = 300) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}
function productRow(row) {
  return row ? { ...row, id: Number(row.id), stock: Number(row.stock), active: Boolean(row.active), eco: Number(row.eco), pl: Number(row.pl), km: Number(row.km), p: Number(row.p), m: Number(row.m), rt: Number(row.rt) } : null;
}

app.get('/api/products', (req, res) => res.json(publicProducts.all().map(productRow)));
app.get('/api/auth/me', (req, res) => {
  res.json({ user: req.auth?.role === 'customer' ? { name: req.auth.name, email: req.auth.email } : null });
});
app.post('/api/auth/register', limitAuthAttempts, (req, res) => {
  const name = cleanText(req.body?.name, 100);
  const email = cleanText(req.body?.email, 254).toLowerCase();
  const password = req.body?.password;
  if (name.length < 2 || !validEmail(email) || typeof password !== 'string' || password.length < 10 || password.length > 200) {
    return res.status(400).json({ error: 'Enter your name, a valid email, and a password with at least 10 characters.' });
  }
  const credentials = hashPassword(password);
  try {
    const result = db.prepare('INSERT INTO users(name,email,password_hash,password_salt) VALUES(?,?,?,?)')
      .run(name, email, credentials.hash, credentials.salt);
    clearAuthAttempts(req);
    setSession(res, Number(result.lastInsertRowid), 'customer');
    res.status(201).json({ user: { name, email } });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'An account with this email already exists.' });
    throw error;
  }
});
app.post('/api/auth/login', limitAuthAttempts, (req, res) => {
  const email = cleanText(req.body?.email, 254).toLowerCase();
  const password = req.body?.password;
  if (!validEmail(email) || typeof password !== 'string') return res.status(400).json({ error: 'Enter a valid email and password.' });
  const user = db.prepare('SELECT id,name,email,password_hash,password_salt FROM users WHERE email=? COLLATE NOCASE').get(email);
  const credentials = user ? hashPassword(password, user.password_salt) : null;
  if (!user || !safeEqual(credentials.hash, user.password_hash)) return res.status(401).json({ error: 'Email or password is incorrect.' });
  clearAuthAttempts(req);
  setSession(res, user.id, 'customer');
  res.json({ user: { name: user.name, email: user.email } });
});
app.post('/api/auth/logout', (req, res) => {
  if (req.sessionHash) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(req.sessionHash);
  res.clearCookie(cookieName, { httpOnly: true, sameSite: 'lax', path: '/' });
  res.status(204).end();
});
app.put('/api/account', requireCustomer, (req, res) => {
  const name = cleanText(req.body?.name, 100);
  if (name.length < 2) return res.status(400).json({ error: 'Your name must be at least 2 characters.' });
  db.prepare('UPDATE users SET name=? WHERE id=?').run(name, req.auth.id);
  req.auth.name = name;
  res.json({ user: { name, email: req.auth.email } });
});
const selectAddresses = db.prepare(`SELECT id,label,recipient_name AS name,phone,address,is_default AS isDefault
  FROM addresses WHERE user_id=? ORDER BY is_default DESC,id`);
app.get('/api/addresses', requireCustomer, (req, res) => res.json({ addresses: selectAddresses.all(req.auth.id) }));
app.post('/api/addresses', requireCustomer, (req, res) => {
  const label = cleanText(req.body?.label, 40);
  const name = cleanText(req.body?.name, 100);
  const phone = cleanText(req.body?.phone, 20);
  const address = cleanText(req.body?.address, 500);
  if (label.length < 2 || name.length < 2 || !/^\+?[0-9 ()-]{10,18}$/.test(phone) || address.length < 10) {
    return res.status(400).json({ error: 'Enter a label, recipient name, valid phone number, and complete address.' });
  }
  const makeDefault = req.body?.isDefault === true || selectAddresses.all(req.auth.id).length === 0;
  const saveAddress = db.transaction(() => {
    if (makeDefault) db.prepare('UPDATE addresses SET is_default=0 WHERE user_id=?').run(req.auth.id);
    db.prepare(`INSERT INTO addresses(user_id,label,recipient_name,phone,address,is_default) VALUES(?,?,?,?,?,?)
      ON CONFLICT(user_id,label) DO UPDATE SET recipient_name=excluded.recipient_name,phone=excluded.phone,
      address=excluded.address,is_default=excluded.is_default`)
      .run(req.auth.id, label, name, phone, address, Number(makeDefault));
  });
  saveAddress();
  res.status(201).json({ addresses: selectAddresses.all(req.auth.id) });
});
app.delete('/api/addresses/:id', requireCustomer, (req, res) => {
  const selected = db.prepare('SELECT is_default AS isDefault FROM addresses WHERE id=? AND user_id=?')
    .get(Number(req.params.id), req.auth.id);
  if (!selected) return res.status(404).json({ error: 'Address not found.' });
  const removeAddress = db.transaction(() => {
    db.prepare('DELETE FROM addresses WHERE id=? AND user_id=?').run(Number(req.params.id), req.auth.id);
    if (selected.isDefault) {
      const next = db.prepare('SELECT id FROM addresses WHERE user_id=? ORDER BY id LIMIT 1').get(req.auth.id);
      if (next) db.prepare('UPDATE addresses SET is_default=1 WHERE id=?').run(next.id);
    }
  });
  removeAddress();
  res.json({ addresses: selectAddresses.all(req.auth.id) });
});

app.get('/api/cart', requireCustomer, (req, res) => {
  const items = db.prepare(`SELECT c.product_id AS id,c.quantity,p.price AS price,p.stock,p.name AS name
    FROM carts c JOIN products p ON p.id=c.product_id WHERE c.user_id=? AND p.active=1`).all(req.auth.id);
  res.json({ items });
});
app.put('/api/cart/:productId', requireCustomer, (req, res) => {
  const productId = Number(req.params.productId);
  const quantity = Number(req.body?.quantity);
  const product = db.prepare('SELECT stock,active FROM products WHERE id=?').get(productId);
  if (!product || !product.active) return res.status(404).json({ error: 'Product is unavailable.' });
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 99) return res.status(400).json({ error: 'Quantity must be between 0 and 99.' });
  if (quantity > product.stock) return res.status(409).json({ error: `Only ${product.stock} in stock.` });
  if (!quantity) db.prepare('DELETE FROM carts WHERE user_id=? AND product_id=?').run(req.auth.id, productId);
  else db.prepare(`INSERT INTO carts(user_id,product_id,quantity) VALUES(?,?,?)
    ON CONFLICT(user_id,product_id) DO UPDATE SET quantity=excluded.quantity`).run(req.auth.id, productId, quantity);
  res.json({ items: db.prepare('SELECT product_id AS id,quantity FROM carts WHERE user_id=?').all(req.auth.id) });
});
app.get('/api/wishlist', requireCustomer, (req, res) => {
  res.json({ items: db.prepare('SELECT product_id AS id FROM wishlists WHERE user_id=?').all(req.auth.id).map(row => row.id) });
});
app.put('/api/wishlist/:productId', requireCustomer, (req, res) => {
  const productId = Number(req.params.productId);
  const product = db.prepare('SELECT id FROM products WHERE id=? AND active=1').get(productId);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  if (req.body?.saved === true) db.prepare('INSERT OR IGNORE INTO wishlists(user_id,product_id) VALUES(?,?)').run(req.auth.id, productId);
  else if (req.body?.saved === false) db.prepare('DELETE FROM wishlists WHERE user_id=? AND product_id=?').run(req.auth.id, productId);
  else return res.status(400).json({ error: 'Specify whether the product should be saved.' });
  res.json({ items: db.prepare('SELECT product_id AS id FROM wishlists WHERE user_id=?').all(req.auth.id).map(row => row.id) });
});

const orderItems = db.prepare(`SELECT product_id AS id,product_name AS name,unit_price AS price,quantity
  FROM order_items WHERE order_id=?`);
const customerOrders = db.prepare(`SELECT id,order_number AS number,customer_name AS customerName,phone,address,
  subtotal,shipping,total,payment_method AS paymentMethod,status,created_at AS createdAt
  FROM orders WHERE user_id=? ORDER BY id DESC`);
const paymentMethods = new Set([
  'Cash on delivery',
  'UPI (demo - not charged)',
  'Debit card (demo - not charged)',
  'Credit card (demo - not charged)',
  'Net banking (demo - not charged)',
  'Wallet (demo - not charged)'
]);
app.get('/api/orders', requireCustomer, (req, res) => {
  res.json({ orders: customerOrders.all(req.auth.id).map(order => ({ ...order, items: orderItems.all(order.id) })) });
});
app.post('/api/orders', requireCustomer, (req, res) => {
  const paymentMethod = req.body?.paymentMethod;
  if (!paymentMethods.has(paymentMethod)) {
    return res.status(400).json({ error: 'Choose a supported payment method. UPI, card, net banking, and wallet choices are demo-only and never charge you.' });
  }
  const savedAddressId = Number(req.body?.addressId) || null;
  const savedAddress = savedAddressId ? db.prepare(`SELECT recipient_name AS name,phone,address
    FROM addresses WHERE id=? AND user_id=?`).get(savedAddressId, req.auth.id) : null;
  if (savedAddressId && !savedAddress) return res.status(404).json({ error: 'The selected saved address was not found.' });
  const customerName = savedAddress?.name || cleanText(req.body?.name, 100);
  const phone = savedAddress?.phone || cleanText(req.body?.phone, 20);
  const address = savedAddress?.address || cleanText(req.body?.address, 500);
  if (customerName.length < 2 || !/^\+?[0-9 ()-]{10,18}$/.test(phone) || address.length < 10) {
    return res.status(400).json({ error: 'Enter your name, a valid phone number, and a complete delivery address.' });
  }
  const createOrder = db.transaction(() => {
    const lines = db.prepare(`SELECT c.product_id AS id,c.quantity,p.name,p.price,p.stock
      FROM carts c JOIN products p ON p.id=c.product_id
      WHERE c.user_id=? AND p.active=1 ORDER BY p.id`).all(req.auth.id);
    if (!lines.length) throw Object.assign(new Error('Your cart is empty.'), { status: 400 });
    for (const item of lines) {
      if (item.quantity > item.stock) throw Object.assign(new Error(`${item.name} has only ${item.stock} left in stock.`), { status: 409 });
    }
    const subtotal = lines.reduce((total, item) => total + item.price * item.quantity, 0);
    const shipping = subtotal >= 499 ? 0 : 49;
    const number = `ES${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const result = db.prepare(`INSERT INTO orders(order_number,user_id,customer_name,phone,address,subtotal,shipping,total,payment_method)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(number, req.auth.id, customerName, phone, address, subtotal, shipping, subtotal + shipping, paymentMethod);
    const orderId = Number(result.lastInsertRowid);
    const insertItem = db.prepare('INSERT INTO order_items(order_id,product_id,product_name,unit_price,quantity) VALUES(?,?,?,?,?)');
    const reduceStock = db.prepare('UPDATE products SET stock=stock-? WHERE id=? AND stock>=?');
    lines.forEach(item => {
      insertItem.run(orderId, item.id, item.name, item.price, item.quantity);
      if (reduceStock.run(item.quantity, item.id, item.quantity).changes !== 1) throw Object.assign(new Error(`${item.name} is no longer available in that quantity.`), { status: 409 });
    });
    if (req.body?.saveAddress === true && !savedAddress) {
      const hasAddresses = selectAddresses.all(req.auth.id).length > 0;
      const makeDefault = req.body?.isDefault === true || !hasAddresses;
      if (makeDefault) db.prepare('UPDATE addresses SET is_default=0 WHERE user_id=?').run(req.auth.id);
      const label = cleanText(req.body?.addressLabel, 40) || 'Home';
      db.prepare(`INSERT INTO addresses(user_id,label,recipient_name,phone,address,is_default) VALUES(?,?,?,?,?,?)
        ON CONFLICT(user_id,label) DO UPDATE SET recipient_name=excluded.recipient_name,phone=excluded.phone,
        address=excluded.address,is_default=excluded.is_default`)
        .run(req.auth.id, label, customerName, phone, address, Number(makeDefault));
    }
    db.prepare('DELETE FROM carts WHERE user_id=?').run(req.auth.id);
    return { id: orderId, number, total: subtotal + shipping, status: 'Placed', paymentMethod, items: lines.map(({ id, name, price, quantity }) => ({ id, name, price, quantity })) };
  });
  try {
    res.status(201).json({ order: createOrder() });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    throw error;
  }
});
app.post('/api/orders/:id/cancel', requireCustomer, (req, res) => {
  const cancelOrder = db.transaction(() => {
    const result = db.prepare(`UPDATE orders SET status='Cancelled',updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND user_id=? AND status='Placed'`).run(Number(req.params.id), req.auth.id);
    if (!result.changes) return false;
    const restore = db.prepare('UPDATE products SET stock=stock+? WHERE id=?');
    orderItems.all(Number(req.params.id)).forEach(item => restore.run(item.quantity, item.id));
    return true;
  });
  if (!cancelOrder()) return res.status(409).json({ error: 'Only placed orders can be cancelled.' });
  res.json({ ok: true });
});
app.post('/api/orders/:id/reorder', requireCustomer, (req, res) => {
  const order = db.prepare('SELECT id FROM orders WHERE id=? AND user_id=?').get(Number(req.params.id), req.auth.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  const items = orderItems.all(order.id);
  const reorder = db.transaction(() => {
    const current = db.prepare('SELECT stock FROM products WHERE id=? AND active=1');
    const inCart = db.prepare('SELECT quantity FROM carts WHERE user_id=? AND product_id=?');
    const add = db.prepare(`INSERT INTO carts(user_id,product_id,quantity) VALUES(?,?,?)
      ON CONFLICT(user_id,product_id) DO UPDATE SET quantity=MIN(99,quantity+excluded.quantity)`);
    for (const item of items) {
      const product = current.get(item.id);
      if (product?.stock) {
        const existing = inCart.get(req.auth.id, item.id)?.quantity || 0;
        const available = Math.max(0, product.stock - existing);
        if (available) add.run(req.auth.id, item.id, Math.min(item.quantity, available));
      }
    }
  });
  reorder();
  res.json({ items: db.prepare('SELECT product_id AS id,quantity FROM carts WHERE user_id=?').all(req.auth.id) });
});

app.get('/api/products/:id/reviews', (req, res) => {
  const reviews = db.prepare(`SELECT r.rating,r.body,r.created_at AS createdAt,u.name
    FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.product_id=? ORDER BY r.id DESC`).all(Number(req.params.id));
  res.json({ reviews });
});
app.post('/api/products/:id/reviews', requireCustomer, (req, res) => {
  const productId = Number(req.params.id);
  const rating = Number(req.body?.rating);
  const body = cleanText(req.body?.body, 1000);
  const purchased = db.prepare(`SELECT 1 FROM order_items i JOIN orders o ON o.id=i.order_id
    WHERE i.product_id=? AND o.user_id=? AND o.status!='Cancelled' LIMIT 1`).get(productId, req.auth.id);
  if (!purchased) return res.status(403).json({ error: 'Only customers who ordered this product can review it.' });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || body.length < 3) return res.status(400).json({ error: 'Choose a 1–5 star rating and write a review.' });
  db.prepare(`INSERT INTO reviews(product_id,user_id,rating,body) VALUES(?,?,?,?)
    ON CONFLICT(product_id,user_id) DO UPDATE SET rating=excluded.rating,body=excluded.body,created_at=CURRENT_TIMESTAMP`)
    .run(productId, req.auth.id, rating, body);
  db.prepare('UPDATE products SET rating=(SELECT ROUND(AVG(rating),1) FROM reviews WHERE product_id=?) WHERE id=?')
    .run(productId, productId);
  res.status(201).json({ ok: true });
});
app.get('/api/subscriptions', requireCustomer, (req, res) => {
  res.json({ subscriptions: db.prepare(`SELECT id,box_name AS box,price,frequency,status,created_at AS createdAt
    FROM subscriptions WHERE user_id=? ORDER BY id DESC`).all(req.auth.id) });
});
app.post('/api/subscriptions', requireCustomer, (req, res) => {
  const boxes = { 'Veg box': 499, 'Pantry box': 899, 'Home care box': 649 };
  const box = req.body?.box;
  const frequency = req.body?.frequency;
  if (!boxes[box] || !['Every week', 'Every 2 weeks', 'Every month'].includes(frequency)) {
    return res.status(400).json({ error: 'Choose a valid box and delivery frequency.' });
  }
  const result = db.prepare('INSERT INTO subscriptions(user_id,box_name,price,frequency) VALUES(?,?,?,?)')
    .run(req.auth.id, box, boxes[box], frequency);
  res.status(201).json({ id: Number(result.lastInsertRowid), box, price: boxes[box], frequency, status: 'Active' });
});
app.patch('/api/subscriptions/:id', requireCustomer, (req, res) => {
  const status = req.body?.status;
  if (!['Paused', 'Active', 'Cancelled'].includes(status)) return res.status(400).json({ error: 'Invalid subscription status.' });
  const result = db.prepare('UPDATE subscriptions SET status=? WHERE id=? AND user_id=?')
    .run(status, Number(req.params.id), req.auth.id);
  if (!result.changes) return res.status(404).json({ error: 'Subscription not found.' });
  res.json({ ok: true });
});

app.post('/api/admin/login', limitAuthAttempts, (req, res) => {
  const email = cleanText(req.body?.email, 254).toLowerCase();
  const password = req.body?.password;
  const adminEmail = cleanText(process.env.ADMIN_EMAIL, 254).toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword || adminPassword.length < 12 ||
    adminEmail === 'replace-with-your-admin-email' ||
    adminPassword === 'replace-with-a-unique-password-of-at-least-12-characters') {
    return res.status(503).json({ error: 'Configure ADMIN_EMAIL and a unique ADMIN_PASSWORD of at least 12 characters in .env.' });
  }
  if (email !== adminEmail || typeof password !== 'string' || !safeEqual(password, adminPassword)) {
    return res.status(401).json({ error: 'Admin email or password is incorrect.' });
  }
  clearAuthAttempts(req);
  setSession(res, null, 'admin');
  res.json({ admin: { email: adminEmail } });
});
app.get('/api/admin/me', (req, res) => {
  if (req.auth?.role !== 'admin') return res.json({ admin: null });
  res.json({ admin: { email: req.auth.email } });
});
app.get('/api/admin/analytics', requireAdmin, (req, res) => {
  const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? `${req.query.from} 00:00:00` : '0000-01-01 00:00:00';
  const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '') ? `${req.query.to} 23:59:59` : '9999-12-31 23:59:59';
  const range = { from, to };
  const totals = db.prepare(`SELECT COUNT(*) AS orders,COALESCE(SUM(total),0) AS orderValue,
    COALESCE(AVG(total),0) AS averageOrderValue FROM orders
    WHERE status!='Cancelled' AND created_at BETWEEN @from AND @to`).get(range);
  const rankings = db.prepare(`SELECT i.product_id AS id,i.product_name AS name,
    SUM(i.quantity) AS units,COUNT(DISTINCT o.id) AS orderCount,
    SUM(i.quantity*i.unit_price) AS orderValue
    FROM order_items i JOIN orders o ON o.id=i.order_id
    WHERE o.status!='Cancelled' AND o.created_at BETWEEN @from AND @to
    GROUP BY i.product_id ORDER BY units DESC,orderValue DESC LIMIT 20`).all(range);
  const daily = db.prepare(`SELECT substr(created_at,1,10) AS day,COUNT(*) AS orders,
    SUM(total) AS orderValue FROM orders WHERE status!='Cancelled'
    AND created_at BETWEEN @from AND @to GROUP BY day ORDER BY day`).all(range);
  res.json({ totals, rankings, daily });
});
app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const orders = db.prepare(`SELECT o.id,o.order_number AS number,o.customer_name AS customerName,
    o.phone,o.address,o.subtotal,o.shipping,o.total,o.payment_method AS paymentMethod,
    o.status,o.created_at AS createdAt,u.email FROM orders o JOIN users u ON u.id=o.user_id
    ORDER BY o.id DESC LIMIT 200`).all();
  res.json({ orders: orders.map(order => ({ ...order, items: orderItems.all(order.id) })) });
});
app.patch('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const status = req.body?.status;
  if (!['Placed', 'Packed', 'Shipped', 'Delivered', 'Cancelled'].includes(status)) return res.status(400).json({ error: 'Invalid order status.' });
  const updateStatus = db.transaction(() => {
    const order = db.prepare('SELECT status FROM orders WHERE id=?').get(Number(req.params.id));
    if (!order) return false;
    if (order.status === 'Cancelled' && status !== 'Cancelled') throw Object.assign(new Error('Cancelled orders cannot be reopened.'), { status: 409 });
    if (order.status !== 'Cancelled' && status === 'Cancelled') {
      const restore = db.prepare('UPDATE products SET stock=stock+? WHERE id=?');
      orderItems.all(Number(req.params.id)).forEach(item => restore.run(item.quantity, item.id));
    }
    db.prepare('UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status, Number(req.params.id));
    return true;
  });
  try {
    if (!updateStatus()) return res.status(404).json({ error: 'Order not found.' });
    res.json({ ok: true });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    throw error;
  }
});
app.get('/api/admin/products', requireAdmin, (req, res) => {
  res.json({ products: db.prepare(`${productSelect} ORDER BY id`).all().map(productRow) });
});
app.patch('/api/admin/products/:id', requireAdmin, (req, res) => {
  const price = Number(req.body?.price);
  const stock = Number(req.body?.stock);
  const active = req.body?.active;
  const product = db.prepare('SELECT id,mrp FROM products WHERE id=?').get(Number(req.params.id));
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  if (!Number.isInteger(price) || price < 1 || price > product.mrp || !Number.isInteger(stock) || stock < 0 || stock > 100000 || typeof active !== 'boolean') {
    return res.status(400).json({ error: 'Enter a valid price (not above MRP), stock count, and availability.' });
  }
  db.prepare('UPDATE products SET price=?,stock=?,active=? WHERE id=?').run(price, stock, Number(active), product.id);
  res.json({ ok: true });
});

app.use(express.static(__dirname, { extensions: ['html'], index: 'index.html' }));
app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: 'An unexpected server error occurred.' });
});
app.listen(port, () => console.log(`EcoSwap is running at http://localhost:${port}`));
