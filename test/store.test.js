const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { after, before, test } = require('node:test');

const root = path.join(__dirname, '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecoswap-test-'));
const databasePath = path.join(tempDir, 'test.sqlite');
const adminEmail = 'test-admin@ecoswap.local';
const adminPassword = 'TestAdminPassword-2026!';
let server;
let baseUrl;

async function availablePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => listener.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = listener.address();
  await new Promise(resolve => listener.close(resolve));
  return port;
}

async function request(route, { cookie, ...options } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...options.headers
    }
  });
  const data = response.status === 204 ? null : await response.json();
  const setCookie = response.headers.get('set-cookie');
  return { response, data, cookie: setCookie ? setCookie.split(';')[0] : cookie };
}

before(async () => {
  const port = await availablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [path.join(root, 'server.js')], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: databasePath,
      ADMIN_EMAIL: adminEmail,
      ADMIN_PASSWORD: adminPassword,
      NODE_ENV: 'test'
    },
    stdio: 'ignore'
  });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Test server exited with code ${server.exitCode}.`);
    try {
      const response = await fetch(`${baseUrl}/api/products`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Test server did not become ready.');
});

after(async () => {
  if (server && server.exitCode === null) {
    server.kill();
    await new Promise(resolve => server.once('exit', resolve));
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('customer shopping, fulfilment and admin analytics work end to end', async () => {
  let result = await request('/api/products');
  assert.equal(result.data.length, 12);
  assert.equal((await request('/api/orders')).response.status, 401);
  assert.equal((await request('/api/admin/me')).data.admin, null);

  const email = `customer-${Date.now()}@example.test`;
  result = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Test Customer', email, password: 'StrongTestPassword-2026' })
  });
  assert.equal(result.response.status, 201);
  const customerCookie = result.cookie;

  result = await request('/api/cart/1', { cookie: customerCookie, method: 'PUT', body: JSON.stringify({ quantity: 2 }) });
  assert.equal(result.response.status, 200);
  result = await request('/api/cart/1', { cookie: customerCookie, method: 'PUT', body: JSON.stringify({ quantity: 51 }) });
  assert.equal(result.response.status, 409);
  result = await request('/api/wishlist/2', { cookie: customerCookie, method: 'PUT', body: JSON.stringify({ saved: true }) });
  assert.deepEqual(result.data.items, [2]);

  result = await request('/api/account', { cookie: customerCookie, method: 'PUT', body: JSON.stringify({ name: 'Updated Customer' }) });
  assert.equal(result.data.user.name, 'Updated Customer');
  result = await request('/api/addresses', {
    cookie: customerCookie,
    method: 'POST',
    body: JSON.stringify({ label: 'Home', name: 'Updated Customer', phone: '9876543210', address: '12 Example Road, Test City, 110001' })
  });
  assert.equal(result.response.status, 201);
  const addressId = result.data.addresses[0].id;
  result = await request('/api/subscriptions', {
    cookie: customerCookie,
    method: 'POST',
    body: JSON.stringify({ box: 'Pantry box', frequency: 'Every month' })
  });
  assert.equal(result.response.status, 201);

  result = await request('/api/orders', {
    cookie: customerCookie,
    method: 'POST',
    body: JSON.stringify({ addressId, paymentMethod: 'UPI (demo - not charged)' })
  });
  assert.equal(result.response.status, 201);
  assert.equal(result.data.order.total, 469);
  assert.equal(result.data.order.paymentMethod, 'UPI (demo - not charged)');
  const orderId = result.data.order.id;

  result = await request('/api/orders', {
    cookie: customerCookie,
    method: 'POST',
    body: JSON.stringify({ addressId, paymentMethod: 'Credit card 4111111111111111' })
  });
  assert.equal(result.response.status, 400);

  result = await request('/api/products/1/reviews', {
    cookie: customerCookie,
    method: 'POST',
    body: JSON.stringify({ rating: 5, body: 'Verified purchase review' })
  });
  assert.equal(result.response.status, 201);

  result = await request('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email: adminEmail, password: adminPassword })
  });
  assert.equal(result.response.status, 200);
  const adminCookie = result.cookie;
  result = await request('/api/admin/analytics', { cookie: adminCookie });
  assert.equal(result.data.totals.orders, 1);
  assert.equal(result.data.totals.orderValue, 469);
  assert.equal(result.data.rankings.find(item => item.id === 1).units, 2);
  assert.equal(result.data.rankings.find(item => item.id === 1).orderCount, 1);
  assert.equal(result.data.rankings.find(item => item.id === 1).orderValue, 420);
  result = await request('/api/admin/orders', { cookie: adminCookie });
  assert.equal(result.data.orders[0].paymentMethod, 'UPI (demo - not charged)');

  result = await request(`/api/orders/${orderId}/cancel`, { cookie: customerCookie, method: 'POST', body: '{}' });
  assert.equal(result.response.status, 200);
  for (const paymentMethod of [
    'Cash on delivery',
    'Debit card (demo - not charged)',
    'Credit card (demo - not charged)',
    'Net banking (demo - not charged)',
    'Wallet (demo - not charged)'
  ]) {
    await request('/api/cart/1', { cookie: customerCookie, method: 'PUT', body: JSON.stringify({ quantity: 1 }) });
    const demoOrder = await request('/api/orders', {
      cookie: customerCookie,
      method: 'POST',
      body: JSON.stringify({
        name: 'Updated Customer',
        phone: '9876543210',
        address: '12 Example Road, Test City, 110001',
        paymentMethod
      })
    });
    assert.equal(demoOrder.response.status, 201);
    assert.equal(demoOrder.data.order.paymentMethod, paymentMethod);
    const cancel = await request(`/api/orders/${demoOrder.data.order.id}/cancel`, { cookie: customerCookie, method: 'POST', body: '{}' });
    assert.equal(cancel.response.status, 200);
  }
  result = await request('/api/admin/analytics', { cookie: adminCookie });
  assert.equal(result.data.totals.orders, 0);
  assert.equal(result.data.totals.orderValue, 0);
  result = await request('/api/admin/products', { cookie: adminCookie });
  assert.equal(result.data.products.find(product => product.id === 1).stock, 50);
  result = await request(`/api/addresses/${addressId}`, { cookie: customerCookie, method: 'DELETE' });
  assert.equal(result.response.status, 200);

  result = await request('/api/admin/products/1', {
    cookie: adminCookie,
    method: 'PATCH',
    headers: { origin: 'https://attacker.example' },
    body: JSON.stringify({ price: 200, stock: 49, active: false })
  });
  assert.equal(result.response.status, 403);
  result = await request('/api/admin/products', { cookie: customerCookie });
  assert.equal(result.response.status, 401);
});
