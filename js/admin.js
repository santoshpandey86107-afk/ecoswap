const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const money = value => `₹${Number(value || 0).toLocaleString('en-IN')}`;
const api = async (url, options = {}) => {
  const response = await fetch(`/api${url}`, {
    credentials: 'same-origin',
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
  });
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return data;
};
const send = (url, method, body) => api(url, { method, body: JSON.stringify(body) });
const notify = message => {
  const element = $('#dashboard-message');
  element.textContent = message;
  element.style.display = 'block';
  clearTimeout(element.timer);
  element.timer = setTimeout(() => { element.style.display = 'none'; }, 3000);
};
let analytics = { rankings: [] };

$('#login-form').onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget;
  $('#login-error').textContent = '';
  try {
    const result = await send('/admin/login', 'POST', { email: form.email.value, password: form.password.value });
    await showDashboard(result.admin.email);
  } catch (error) { $('#login-error').textContent = error.message; }
};
$('#admin-logout').onclick = async () => {
  try {
    await api('/auth/logout', { method: 'POST' });
    $('#dashboard').classList.add('hid');
    $('#admin-login').classList.remove('hid');
    $('#login-form').reset();
    notify('You have signed out.');
  } catch (error) { notify(error.message); }
};
$('#apply-filters').onclick = () => loadAnalytics().catch(error => notify(error.message));
$('#rank-by').onchange = renderRanking;
$('#export-csv').onclick = () => {
  const rows = [['Product', 'Units ordered', 'Orders containing product', 'Product order value'], ...analytics.rankings.map(item => [item.name, item.units, item.orderCount, item.orderValue])];
  const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const link = document.createElement('a');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  link.href = url;
  link.download = 'ecoswap-product-orders.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

async function showDashboard(email) {
  $('#admin-email').textContent = email;
  $('#admin-login').classList.add('hid');
  $('#dashboard').classList.remove('hid');
  const today = new Date().toISOString().slice(0, 10);
  const start = new Date();
  start.setDate(start.getDate() - 29);
  $('#from-date').value = start.toISOString().slice(0, 10);
  $('#to-date').value = today;
  await Promise.all([loadAnalytics(), loadOrders(), loadProducts()]);
}
async function loadAnalytics() {
  const from = $('#from-date').value;
  const to = $('#to-date').value;
  if (from && to && from > to) throw new Error('The start date must not be after the end date.');
  const query = new URLSearchParams();
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  analytics = await api(`/admin/analytics?${query}`);
  $('#kpi-orders').textContent = Number(analytics.totals.orders).toLocaleString('en-IN');
  $('#kpi-revenue').textContent = money(analytics.totals.orderValue);
  $('#kpi-average').textContent = money(analytics.totals.averageOrderValue);
  renderRanking();
  renderChart();
}
function renderRanking() {
  const key = $('#rank-by').value;
  const rankings = [...analytics.rankings].sort((a, b) => Number(b[key === 'orders' ? 'orderCount' : key]) - Number(a[key === 'orders' ? 'orderCount' : key]));
  $('#ranking-rows').innerHTML = rankings.length ? rankings.map((item, index) => `<tr>
    <td>${index + 1}</td><td>${escapeHtml(item.name)}</td><td>${Number(item.units).toLocaleString('en-IN')}</td>
    <td>${Number(item.orderCount).toLocaleString('en-IN')}</td><td>${money(item.orderValue)}</td></tr>`).join('') : '<tr><td colspan="5">No completed orders in this date range yet.</td></tr>';
}
function renderChart() {
  const days = analytics.daily || [];
  if (!days.length) { $('#sales-chart').innerHTML = '<p class="sub">Sales will appear here after the first order.</p>'; return; }
  const max = Math.max(...days.map(day => Number(day.orderValue)), 1);
  const width = Math.max(400, days.length * 58);
  const bars = days.map((day, index) => {
    const height = Math.max(3, Math.round(Number(day.orderValue) / max * 150));
    const x = index * 58 + 22;
    return `<g><title>${escapeHtml(day.day)}: ${money(day.orderValue)} · ${day.orders} orders</title>
      <rect x="${x}" y="${170 - height}" width="30" height="${height}" rx="5" fill="#2f8a5a"></rect>
      <text x="${x + 15}" y="193" text-anchor="middle">${escapeHtml(day.day.slice(5))}</text></g>`;
  }).join('');
  $('#sales-chart').innerHTML = `<div class="chart-scroll"><svg viewBox="0 0 ${width} 210" role="img" aria-label="Daily order value bar chart">
    <line x1="10" y1="170" x2="${width - 10}" y2="170" stroke="#dfeadb"></line>${bars}</svg></div>`;
}
async function loadOrders() {
  const { orders } = await api('/admin/orders');
  $('#order-rows').innerHTML = orders.length ? orders.map(order => `<tr>
    <td>#${escapeHtml(order.number)}<small>${escapeHtml(order.createdAt)}</small></td>
    <td>${escapeHtml(order.customerName)}<small>${escapeHtml(order.email)} · ${escapeHtml(order.phone)}</small></td>
    <td>${order.items.map(item => `${escapeHtml(item.name)} ×${item.quantity}`).join('<br>')}<small>${escapeHtml(order.address)}</small></td>
    <td>${money(order.total)}</td><td>${escapeHtml(order.paymentMethod)}${order.paymentMethod !== 'Cash on delivery' ? '<small>Demo selection — not charged</small>' : '<small>Pay on delivery</small>'}</td><td>${escapeHtml(order.status)}</td>
    <td><select aria-label="Update ${escapeHtml(order.number)} status" onchange="updateOrder(${order.id},this.value)">
      ${['Placed','Packed','Shipped','Delivered','Cancelled'].map(status => `<option ${status === order.status ? 'selected' : ''}>${status}</option>`).join('')}
    </select></td></tr>`).join('') : '<tr><td colspan="7">No orders yet.</td></tr>';
}
window.updateOrder = async (id, status) => {
  try {
    await send(`/admin/orders/${id}`, 'PATCH', { status });
    await Promise.all([loadOrders(), loadAnalytics(), loadProducts()]);
    notify('Order status updated.');
  } catch (error) { notify(error.message); loadOrders().catch(() => {}); }
};
async function loadProducts() {
  const { products } = await api('/admin/products');
  $('#product-rows').innerHTML = products.map(product => `<tr>
    <td>${escapeHtml(product.n)}</td><td><input type="number" min="1" max="${product.m}" value="${product.p}" aria-label="${escapeHtml(product.n)} price"></td>
    <td><input type="number" min="0" max="100000" value="${product.stock}" aria-label="${escapeHtml(product.n)} stock"></td>
    <td><input type="checkbox" ${product.active ? 'checked' : ''} aria-label="${escapeHtml(product.n)} visible"></td>
    <td><button class="btn save-product" data-id="${product.id}">Save</button></td></tr>`).join('');
  document.querySelectorAll('.save-product').forEach(button => {
    button.onclick = async () => {
      const row = button.closest('tr');
      const [price, stock, active] = row.querySelectorAll('input');
      try {
        await send(`/admin/products/${button.dataset.id}`, 'PATCH', {
          price: Number(price.value), stock: Number(stock.value), active: active.checked
        });
        notify('Product inventory saved.');
        await loadProducts();
      } catch (error) { notify(error.message); }
    };
  });
}

async function init() {
  try {
    const { admin } = await api('/admin/me');
    if (admin) await showDashboard(admin.email);
  } catch (error) {
    $('#admin-login').classList.remove('hid');
    if (error.status !== 401) $('#login-error').textContent = error.message;
  }
}
init();
