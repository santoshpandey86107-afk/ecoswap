const $ = selector => document.querySelector(selector);
const safe = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));
const money = value => `₹${Number(value || 0).toLocaleString('en-IN')}`;
const api = async (path, options = {}) => {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
  });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status}).`);
  return data;
};
const send = (path, method, body) => api(path, { method, body: JSON.stringify(body) });
let products = [];
let customer = null;
let admin = null;
let cart = {};
let wishlist = [];
let selectedCategory = 'All';
let authMode = 'login';
let postAuthAction = null;
const query = new URLSearchParams(location.search);
const toast = message => {
  const element = $('#product-toast');
  element.textContent = message;
  element.style.display = 'block';
  clearTimeout(element.timer);
  element.timer = setTimeout(() => { element.style.display = 'none'; }, 2600);
};
const noticeError = error => toast(error.message || 'Something went wrong.');
const close = selector => $(selector).classList.remove('on');

function renderCategories() {
  const categories = ['All', ...new Set(products.map(product => product.cat))];
  $('#product-categories').innerHTML = categories.map(category =>
    `<button class="chip ${category === selectedCategory ? 'on' : ''}" onclick="selectCategory('${safe(category)}')">${safe(category)}</button>`
  ).join('');
}
window.selectCategory = category => {
  selectedCategory = category;
  query.delete('wishlist');
  if (category === 'All') query.delete('category');
  else query.set('category', category);
  history.replaceState(null, '', `${location.pathname}${query.size ? `?${query}` : ''}`);
  render();
};
function filteredProducts() {
  const search = $('#product-search').value.trim().toLowerCase();
  let result = products.filter(product =>
    (selectedCategory === 'All' || product.cat === selectedCategory) &&
    (!query.has('wishlist') || wishlist.includes(product.id)) &&
    (!search || `${product.n} ${product.cat} ${product.conv} ${product.farm} ${product.loc}`.toLowerCase().includes(search)) &&
    (!$('#plastic-filter').checked || product.eco) &&
    (!$('#season-filter').checked || product.sea === new Intl.DateTimeFormat('en', { month: 'short' }).format(new Date())) &&
    (!$('#distance-filter').checked || product.km <= 500)
  );
  const sort = $('#product-sort').value;
  if (sort === 'price-asc') result.sort((a, b) => a.p - b.p);
  if (sort === 'price-desc') result.sort((a, b) => b.p - a.p);
  if (sort === 'rating') result.sort((a, b) => b.rt - a.rt);
  return result;
}
function render() {
  renderCategories();
  const result = filteredProducts();
  $('#result-count').textContent = `${result.length} ${result.length === 1 ? 'thoughtful find' : 'thoughtful finds'}`;
  $('#product-grid').innerHTML = result.map(product => `<article class="pc">
    <div class="im product-card-image"><img src="images/p${product.id}.svg" alt="${safe(product.n)}">
      <button class="wl" onclick="toggleWishlist(${product.id})" aria-label="${wishlist.includes(product.id) ? 'Remove from wishlist' : 'Add to wishlist'}">${wishlist.includes(product.id) ? '♥' : '♡'}</button></div>
    <div><span class="tag">Organic</span>${product.eco ? '<span class="tag">Plastic-free</span>' : ''}</div>
    <h3>${safe(product.n)}</h3><small>${safe(product.farm)}, ${safe(product.loc)} · ★${product.rt}</small>
    <small>Swaps out: ${safe(product.conv)}</small><small>${product.stock ? `${product.stock} in stock` : 'Currently out of stock'}</small>
    <div class="price">${money(product.p)} <s>${money(product.m)}</s></div>
    <div class="r"><button class="btn o" onclick="showProduct(${product.id})">Details</button>
    <button class="btn" ${product.stock ? '' : 'disabled'} onclick="addProduct(${product.id})">${product.stock ? 'Add to cart' : 'Sold out'}</button></div>
  </article>`).join('');
  $('#empty-results').classList.toggle('hid', result.length > 0);
}
$('#product-search').value = query.get('q') || '';
$('#product-search').oninput = render;
$('#product-sort').onchange = render;
['#plastic-filter', '#season-filter', '#distance-filter'].forEach(selector => $(selector).onchange = render);
$('#clear-filters').onclick = () => {
  $('#product-search').value = '';
  $('#plastic-filter').checked = false;
  $('#season-filter').checked = false;
  $('#distance-filter').checked = false;
  selectedCategory = 'All';
  query.delete('q');
  query.delete('category');
  query.delete('wishlist');
  history.replaceState(null, '', location.pathname);
  render();
};
$('#account-button').onclick = () => {
  if (customer || admin) location.href = '/?account=1';
  else openAuth('login');
};
$('#theme-toggle').onclick = () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
};
$('#wishlist-button').onclick = () => {
  if (!customer) return openAuth('login');
  query.set('wishlist', '1');
  selectedCategory = 'All';
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};
function renderCounts() {
  $('#cart-count').textContent = Object.values(cart).reduce((sum, count) => sum + count, 0);
  $('#wishlist-count').textContent = wishlist.length;
}
window.addProduct = async id => {
  if (!customer) {
    postAuthAction = () => addProduct(id);
    return openAuth('login');
  }
  const quantity = (cart[id] || 0) + 1;
  try {
    await send(`/cart/${id}`, 'PUT', { quantity });
    cart[id] = quantity;
    renderCounts();
    toast('Added to cart. Open the cart to check out.');
  } catch (error) { noticeError(error); }
};
window.toggleWishlist = async id => {
  if (!customer) {
    postAuthAction = () => toggleWishlist(id);
    return openAuth('login');
  }
  try {
    wishlist = (await send(`/wishlist/${id}`, 'PUT', { saved: !wishlist.includes(id) })).items;
    renderCounts();
    render();
  } catch (error) { noticeError(error); }
};
window.showProduct = async id => {
  const product = products.find(item => item.id === id);
  if (!product) return;
  let reviews = [];
  try { reviews = (await api(`/products/${id}/reviews`)).reviews; } catch (error) { noticeError(error); }
  let purchased = false;
  if (customer) {
    try {
      purchased = (await api('/orders')).orders.some(order =>
        order.status !== 'Cancelled' && order.items.some(item => item.id === id)
      );
    } catch (error) { noticeError(error); }
  }
  $('#product-details').innerHTML = `<button class="x" onclick="closeProductModal()" aria-label="Close">×</button>
    <img class="mi" src="images/p${product.id}.svg" alt="${safe(product.n)}"><p><span class="tag">${safe(product.cat)}</span><span class="tag">★ ${product.rt}</span></p>
    <h2>${safe(product.n)}</h2><p>${safe(product.farm)} · ${safe(product.loc)} · ${product.km} km</p>
    <p><b>Certificate:</b> ${safe(product.cert)} ${product.cert !== '—' ? '<a href="https://jaivikbharat.fssai.gov.in" target="_blank" rel="noopener">Verify</a>' : ''}</p>
    <p><b>Thoughtful swap for:</b> ${safe(product.conv)}</p>
    <div class="price">${money(product.p)} <s>${money(product.m)}</s></div>
    <p><button class="btn m" ${product.stock ? '' : 'disabled'} onclick="addProduct(${product.id})">${product.stock ? 'Add to cart' : 'Sold out'}</button></p>
    <h3>Customer reviews</h3>${reviews.length ? reviews.map(review => `<p><b>${safe(review.name)}</b> ${'★'.repeat(review.rating)}<br>${safe(review.body)}</p>`).join('') : '<p class="sub">No reviews yet.</p>'}
    ${purchased ? `<form onsubmit="postProductReview(event,${id})"><label>Rating<select name="rating"><option value="5">5 ★</option><option value="4">4 ★</option><option value="3">3 ★</option><option value="2">2 ★</option><option value="1">1 ★</option></select></label><label>Your review<textarea name="body" required minlength="3"></textarea></label><button class="btn">Post review</button></form>` : '<small>Order this product to post a verified-purchase review.</small>'}`;
  $('#product-modal').classList.add('on');
};
window.closeProductModal = () => close('#product-modal');
window.postProductReview = async (event, id) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await send(`/products/${id}/reviews`, 'POST', {
      rating: Number(form.elements.namedItem('rating').value),
      body: form.elements.namedItem('body').value
    });
    toast('Your review has been saved.');
    await showProduct(id);
  } catch (error) { noticeError(error); }
};
document.querySelectorAll('.ov').forEach(overlay => overlay.onclick = event => {
  if (event.target === overlay) {
    overlay.classList.remove('on');
    if (overlay.id === 'customer-modal') postAuthAction = null;
  }
});
document.onkeydown = event => {
  if (event.key === 'Escape') {
    document.querySelectorAll('.ov').forEach(overlay => overlay.classList.remove('on'));
    postAuthAction = null;
  }
};
function openAuth(mode) {
  authMode = mode;
  renderAuth();
  $('#customer-modal').classList.add('on');
}
function renderAuth() {
  $('#customer-auth').innerHTML = `<button class="x" onclick="closeAuth()" aria-label="Close">×</button>
    <h2>${authMode === 'register' ? 'Create your account' : 'Sign in to EcoSwap'}</h2>
    <p class="sub">Your account keeps your cart, wishlist and orders in sync.</p>
    <div class="bar"><button class="chip ${authMode === 'login' ? 'on' : ''}" onclick="switchAuth('login')">Sign in</button>
    <button class="chip ${authMode === 'register' ? 'on' : ''}" onclick="switchAuth('register')">Create account</button></div>
    <form onsubmit="submitAuth(event)">${authMode === 'register' ? '<label>Your name<input name="name" required minlength="2" maxlength="100" autocomplete="name"></label>' : ''}
    <label>Email<input name="email" type="email" required autocomplete="email"></label>
    <label>Password<input name="password" type="password" required minlength="${authMode === 'register' ? '10' : '1'}" autocomplete="${authMode === 'register' ? 'new-password' : 'current-password'}"></label>
    <button class="btn m" style="width:100%">${authMode === 'register' ? 'Create account' : 'Sign in'}</button></form></div>`;
}
window.switchAuth = mode => { authMode = mode; renderAuth(); };
window.closeAuth = () => {
  postAuthAction = null;
  close('#customer-modal');
};
window.submitAuth = async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const endpoint = authMode === 'register' ? '/auth/register' : '/auth/login';
  const body = {
    email: form.elements.namedItem('email').value,
    password: form.elements.namedItem('password').value
  };
  if (authMode === 'register') body.name = form.elements.namedItem('name').value;
  try {
    customer = (await send(endpoint, 'POST', body)).user;
    const [cartData, wishlistData] = await Promise.all([api('/cart'), api('/wishlist')]);
    cart = Object.fromEntries(cartData.items.map(item => [item.id, item.quantity]));
    wishlist = wishlistData.items;
    renderCounts();
    const action = postAuthAction;
    postAuthAction = null;
    closeAuth();
    toast(`Welcome, ${customer.name}.`);
    if (action) await action();
  } catch (error) { noticeError(error); }
};

async function start() {
  try {
    products = (await api('/products')).map(product => ({ ...product, id: Number(product.id) }));
    const requestedCategory = query.get('category');
    if (requestedCategory && products.some(product => product.cat === requestedCategory)) selectedCategory = requestedCategory;
    const [customerSession, adminSession] = await Promise.all([api('/auth/me'), api('/admin/me')]);
    customer = customerSession.user;
    admin = adminSession.admin;
    if (customer) {
      const [cartData, wishlistData] = await Promise.all([api('/cart'), api('/wishlist')]);
      cart = Object.fromEntries(cartData.items.map(item => [item.id, item.quantity]));
      wishlist = wishlistData.items;
    }
    renderCounts();
    render();
    if (query.has('wishlist') && !customer) openAuth('login');
  } catch (error) {
    noticeError(error);
    $('#product-grid').innerHTML = '<p class="sub">The product catalogue could not connect to the store. Please reload.</p>';
  }
}
start();
