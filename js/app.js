const $ = selector => document.querySelector(selector);
const rs = value => `₹${Number(value || 0).toLocaleString('en-IN')}`;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const field = (form, name) => form.elements.namedItem(name);
const api = async (url, options = {}) => {
  const response = await fetch(`/api${url}`, {
    credentials: 'same-origin',
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
  });
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
};
const send = (url, method, body) => api(url, { method, body: JSON.stringify(body) });
const toast = message => {
  const element = $('#ts');
  element.textContent = message;
  element.style.display = 'block';
  clearTimeout(element.timer);
  element.timer = setTimeout(() => { element.style.display = 'none'; }, 2600);
};
const showError = error => toast(error.message || 'Something went wrong. Please try again.');

let D = [];
let cart = {};
let wl = [];
let orders = [];
let subscriptions = [];
let addresses = [];
let currentUser = null;
let currentAdmin = null;
let category = 'All';
let language = 'en';
let wishlistOnly = false;
let browseActive = false;
let carouselIndex = 0;
let carouselTimer;
const categoryDetails = {
  Food: { icon: '🥬', description: 'Pantry staples and seasonal farm picks.' },
  Skincare: { icon: '🫧', description: 'Gentle everyday care from thoughtful makers.' },
  Household: { icon: '🧼', description: 'Simple swaps for a lighter-cleaning home.' },
  Clothing: { icon: '👜', description: 'Wearable and reusable finds made with care.' }
};

const W = {
  Farming: ['Synthetic pesticides and fertiliser run off into rivers and groundwater, feeding algal blooms and oxygen-poor "dead zones". Residues can remain on produce, and heavy use harms bees and other pollinators.', 'Compost, crop rotation and natural pest control. Typically lower pesticide residues, richer soil life and more species on and around the farm.'],
  Soil: ['Repeated chemical inputs can degrade soil structure and microbial life over time, raising the need for more inputs.', 'Builds soil organic matter and water retention, which helps fields cope with dry spells.'],
  Plastic: ['Plastic packaging lasts for centuries, breaks into microplastics, harms marine life and is made from fossil fuels.', 'Paper, glass, jute, bamboo and compostable packaging that breaks down far more easily.'],
  Cleaning: ['Phosphates and chlorine compounds can pollute waterways and irritate skin and lungs.', 'Plant-based, biodegradable formulas such as soapnut.'],
  Textiles: ['Polyester and nylon shed microfibres in every wash. Conventional cotton is pesticide- and water-intensive.', 'Organic cotton, linen and hemp use far fewer synthetic inputs.']
};
const T = {
  hi: { h1: 'एक-एक चीज़ बदलिए।', hp: 'जो आप आज खरीदते हैं, उसे प्रमाणित जैविक विकल्प से बदलें। किसान-सत्यापित, पूरे भारत में डिलीवरी।', cta: 'स्वैप शुरू करें', shop: 'दुकान', why: 'जैविक क्यों?', box: 'साप्ताहिक बॉक्स' },
  en: { h1: 'Swap one thing at a time.', hp: 'Pick something you buy now and see what changes when it comes from a certified organic farm or a plastic-free maker. Farmer-verified, delivered across India.', cta: 'Start swapping', shop: 'Shop', why: 'Why organic?', box: 'Weekly boxes' }
};
const pid = id => D.find(product => product.id == id);
const updateStats = () => {
  const previousItems = orders.filter(order => order.status !== 'Cancelled').flatMap(order => order.items || []);
  const farmerIds = new Set();
  let plastic = 0;
  let quantity = 0;
  Object.entries(cart).forEach(([id, count]) => {
    const product = pid(id);
    if (!product) return;
    plastic += product.pl * count;
    quantity += count;
    farmerIds.add(product.farm);
  });
  previousItems.forEach(item => {
    const product = pid(item.id);
    if (!product) return;
    plastic += product.pl * item.quantity;
    quantity += item.quantity;
    farmerIds.add(product.farm);
  });
  $('#i1').textContent = plastic;
  $('#i2').textContent = quantity;
  $('#i3').textContent = farmerIds.size;
};
const updateCounts = () => {
  $('#cc').textContent = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);
  $('#wc').textContent = wl.length;
  updateStats();
};
const loadCustomerData = async () => {
  const [cartData, wishlist, orderData, subscriptionData, addressData] = await Promise.all([
    api('/cart'), api('/wishlist'), api('/orders'), api('/subscriptions'), api('/addresses')
  ]);
  cart = Object.fromEntries(cartData.items.map(item => [item.id, item.quantity]));
  wl = wishlist.items;
  orders = orderData.orders;
  subscriptions = subscriptionData.subscriptions;
  addresses = addressData.addresses;
  updateCounts();
};

function setLanguage(value) {
  language = value;
  document.documentElement.lang = value;
  document.querySelectorAll('[data-i]').forEach(element => {
    const text = T[value][element.dataset.i];
    if (text) element.textContent = text;
  });
  $('#q').placeholder = value === 'hi' ? 'खोजें' : 'Search products';
  $('#lang').textContent = value === 'hi' ? 'EN' : 'हिं';
}
$('#lang').onclick = () => setLanguage(language === 'en' ? 'hi' : 'en');
$('#th').onclick = () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
};
$('#acc').onclick = () => {
  if (currentAdmin || currentUser) return showAccount();
  openAuth('login', 'Sign in to see your account, orders and subscriptions.');
};

function renderCategories() {
  const categories = [...new Set(D.map(product => product.cat))];
  $('#category-cards').innerHTML = categories.map(item => {
    const product = D.find(entry => entry.cat === item);
    const details = categoryDetails[item] || { icon: product.e, description: `Explore our ${item.toLowerCase()} collection.` };
    const count = D.filter(entry => entry.cat === item).length;
    return `<a class="category-card" href="/products.html?category=${encodeURIComponent(item)}">
      <span class="category-art"><img src="images/p${product.id}.svg" alt=""><span>${details.icon}</span></span>
      <span class="category-copy"><span class="category-count">${count} THOUGHTFUL FINDS</span><b>${escapeHtml(item)}</b>
      <span>${escapeHtml(details.description)}</span><i aria-hidden="true">Explore collection →</i></span></a>`;
  }).join('');
}
window.browseCategory = value => {
  const query = value && value !== 'All' ? `?category=${encodeURIComponent(value)}` : '';
  window.location.href = `/products.html${query}`;
};
function render() {
  renderCategories();
  updateStats();
}
$('#q').onkeydown = event => {
  if (event.key === 'Enter' && $('#q').value.trim()) {
    window.location.href = `/products.html?q=${encodeURIComponent($('#q').value.trim())}`;
  }
};

window.toggleWishlist = async id => {
  if (currentAdmin) return toast('Open the Admin dashboard from Account to manage the store.');
  if (!currentUser) return openAuth('login', 'Sign in to save products to your wishlist.');
  try {
    wl = (await send(`/wishlist/${id}`, 'PUT', { saved: !wl.includes(id) })).items;
    render();
  } catch (error) { showError(error); }
};
$('#wlb').onclick = () => {
  if (!currentUser) return openAuth('login', 'Sign in to see your saved products.');
  window.location.href = '/products.html?wishlist=1';
};
window.add = async (id, amount = 1) => {
  if (currentAdmin) return toast('Open the Admin dashboard from Account to manage the store.');
  if (!currentUser) return openAuth('login', 'Sign in or create an account before adding items to your cart.');
  const product = pid(id);
  const quantity = (cart[id] || 0) + amount;
  if (quantity < 0) return;
  try {
    await send(`/cart/${id}`, 'PUT', { quantity });
    if (quantity === 0) delete cart[id];
    else cart[id] = quantity;
    updateCounts();
    if ($('#cd').classList.contains('on')) showCart();
    if (amount > 0) toast(`${product.n} added to your cart.`);
  } catch (error) { showError(error); }
};

window.show = async id => {
  const product = pid(id);
  if (!product) return;
  let reviews = [];
  try { reviews = (await api(`/products/${id}/reviews`)).reviews; } catch (error) { showError(error); }
  const bought = orders.some(order => order.status !== 'Cancelled' && order.items.some(item => item.id === id));
  $('#pb').innerHTML = `<button class="x" onclick="cl('#pm')" aria-label="Close">×</button>
    <img class="mi" src="images/p${product.id}.svg" alt="${escapeHtml(product.n)}"><h2>${escapeHtml(product.n)}</h2>
    <p><span class="tag">Organic</span><span class="tag">Certificate ${escapeHtml(product.cert)}</span>
    ${product.cert !== '—' ? '<a href="https://jaivikbharat.fssai.gov.in" target="_blank" rel="noopener">Verify</a>' : ''}</p>
    <div class="trace"><div class="qr" aria-label="Traceability QR (sample)"></div><div><b>From ${escapeHtml(product.farm)}</b><br>${escapeHtml(product.loc)} · ${product.km} km away<br>Harvest: ${product.sea === 'Oct' ? 'Sep 2026' : 'Seasonal stock'}</div></div>
    <div class="cmp product-compare"><div class="bd"><b>Instead of: ${escapeHtml(product.conv)}</b></div><div class="gd"><b>This swap</b><br>${product.pl ? `Avoids about ${product.pl} g of plastic (estimate). ` : ''}${product.eco ? 'Plastic-free packaging. ' : ''}Fewer synthetic inputs.</div></div>
    <div class="price">${rs(product.p)} <s>${rs(product.m)}</s></div><p><button class="btn" ${product.stock ? '' : 'disabled'} onclick="add(${product.id})">${product.stock ? 'Add to cart' : 'Sold out'}</button></p>
    <h3>Customer reviews</h3>${reviews.length ? reviews.map(review => `<p><b>${escapeHtml(review.name)}</b> ${'★'.repeat(review.rating)} <small>${escapeHtml(review.createdAt.slice(0, 10))}</small><br>${escapeHtml(review.body)}</p>`).join('') : '<p class="sub">No reviews yet.</p>'}
    ${currentUser && bought ? `<form onsubmit="postReview(event,${id})"><label>Rating <select name="rating"><option value="5">5 ★</option><option value="4">4 ★</option><option value="3">3 ★</option><option value="2">2 ★</option><option value="1">1 ★</option></select></label><input name="body" placeholder="Your review" required minlength="3"><button class="btn">Post review</button></form>` : '<small>Sign in and order this item to post a review.</small>'}`;
  $('#pm').classList.add('on');
};
window.postReview = async (event, id) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await send(`/products/${id}/reviews`, 'POST', { rating: Number(form.rating.value), body: form.body.value });
    toast('Your review has been saved.');
    await window.show(id);
  } catch (error) { showError(error); }
};

const closeOverlay = selector => $(selector).classList.remove('on');
window.cl = closeOverlay;
document.querySelectorAll('.ov').forEach(overlay => {
  overlay.onclick = event => { if (event.target === overlay) overlay.classList.remove('on'); };
});
document.onkeydown = event => {
  if (event.key === 'Escape') document.querySelectorAll('.ov').forEach(overlay => overlay.classList.remove('on'));
};

function cartTotals() {
  const entries = Object.entries(cart).filter(([id, quantity]) => quantity && pid(id));
  const subtotal = entries.reduce((sum, [id, quantity]) => sum + pid(id).p * quantity, 0);
  const shipping = subtotal === 0 || subtotal >= 499 ? 0 : 49;
  return { entries, subtotal, shipping, total: subtotal + shipping };
}
window.showCart = () => {
  if (currentAdmin) return toast('Open the Admin dashboard from Account to manage the store.');
  if (!currentUser) return openAuth('login', 'Sign in to manage your cart and place an order.');
  const { entries, subtotal, shipping, total } = cartTotals();
  const defaultAddress = addresses.find(address => address.isDefault) || addresses[0];
  $('#cbx').innerHTML = `<button class="x" onclick="cl('#cd')" aria-label="Close">×</button><h2>Your cart</h2>` +
    (entries.length ? entries.map(([id, quantity]) => {
      const product = pid(id);
      return `<div class="ln"><span><img class="th" src="images/p${product.id}.svg" alt=""></span>
        <span style="flex:1">${escapeHtml(product.n)}<br><b>${rs(product.p * quantity)}</b></span>
        <span class="q"><button onclick="add(${id},-1)" aria-label="Remove one">−</button> ${quantity}
        <button onclick="add(${id},1)" aria-label="Add one">+</button></span></div>`;
    }).join('') + `<p>Subtotal ${rs(subtotal)}<br>Delivery ${shipping ? rs(shipping) : 'Free'} <small>(free over ₹499)</small><br><b>Total ${rs(total)}</b></p>
      <form onsubmit="placeOrder(event)">${addresses.length ? `<label>Saved address<select name="addressId" onchange="chooseAddress(this.value)"><option value="">Enter a different address</option>${addresses.map(address => `<option value="${address.id}" ${defaultAddress?.id === address.id ? 'selected' : ''}>${escapeHtml(address.label)}${address.isDefault ? ' · Default' : ''} — ${escapeHtml(address.address)}</option>`).join('')}</select></label>` : ''}
      <label>Recipient name<input name="name" value="${escapeHtml(defaultAddress?.name || currentUser.name)}" oninput="clearSavedAddress()" required minlength="2"></label>
      <label>Mobile number<input name="phone" type="tel" value="${escapeHtml(defaultAddress?.phone || '')}" placeholder="10-digit mobile number" oninput="clearSavedAddress()" pattern="[0-9]{10}" required></label>
      <label>Complete delivery address<textarea name="address" placeholder="House, street, city, state and PIN code" oninput="clearSavedAddress()" required minlength="10">${escapeHtml(defaultAddress?.address || '')}</textarea></label>
      <label class="save-address"><input type="checkbox" name="saveAddress" ${defaultAddress ? '' : 'checked'}> Save this address to my account</label>
      <label>Address label<input name="addressLabel" value="Home" maxlength="40"></label>
      <label>Payment method<select name="paymentMethod" required>
        <option value="Cash on delivery">Cash on delivery · Pay at your door</option>
        <option value="UPI (demo - not charged)">UPI · Demo only</option>
        <option value="Debit card (demo - not charged)">Debit card · Demo only</option>
        <option value="Credit card (demo - not charged)">Credit card · Demo only</option>
        <option value="Net banking (demo - not charged)">Net banking · Demo only</option>
        <option value="Wallet (demo - not charged)">Wallet · Demo only</option>
      </select></label>
      <p class="payment-note"><b>Demo checkout — no online payment will be processed.</b><br>UPI, card, net banking and wallet choices are recorded as test selections only. Never enter payment details. Only cash on delivery is payable.</p>
      <button class="btn m" style="width:100%">Place order · ${rs(total)}</button></form>`
      : '<p class="sub">Your cart is empty. Pick a swap from the shop.</p>');
  $('#cd').classList.add('on');
};
$('#cb').onclick = window.showCart;
window.chooseAddress = id => {
  const address = addresses.find(item => item.id === Number(id));
  const form = $('#cbx form');
  if (!address || !form) return;
  form.name.value = address.name;
  form.phone.value = address.phone;
  form.address.value = address.address;
};
window.clearSavedAddress = () => {
  const selector = $('#cbx select[name=addressId]');
  if (selector) selector.value = '';
};
window.placeOrder = async event => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const result = await send('/orders', 'POST', {
      name: field(form, 'name').value, phone: field(form, 'phone').value, address: field(form, 'address').value,
      addressId: field(form, 'addressId')?.value || null,
      saveAddress: field(form, 'saveAddress').checked,
      addressLabel: field(form, 'addressLabel').value,
      paymentMethod: field(form, 'paymentMethod').value
    });
    cart = {};
    await loadCustomerData();
    closeOverlay('#cd');
    toast(result.order.paymentMethod === 'Cash on delivery'
      ? `Order ${result.order.number} placed. Payment is due on delivery.`
      : `Order ${result.order.number} placed as a demo payment choice. No money was charged.`);
    showAccount();
  } catch (error) { showError(error); }
};

window.reorder = async id => {
  try {
    const response = await send(`/orders/${id}/reorder`, 'POST', {});
    cart = Object.fromEntries(response.items.map(item => [item.id, item.quantity]));
    updateCounts();
    closeOverlay('#om');
    window.showCart();
  } catch (error) { showError(error); }
};
window.cancelOrder = async id => {
  if (!confirm('Cancel this order?')) return;
  try {
    await send(`/orders/${id}/cancel`, 'POST', {});
    await loadCustomerData();
    showAccount();
    toast('Order cancelled. Stock has been restored.');
  } catch (error) { showError(error); }
};
window.changeSubscription = async (id, status) => {
  try {
    await send(`/subscriptions/${id}`, 'PATCH', { status });
    await loadCustomerData();
    showAccount();
    toast(`Subscription ${status.toLowerCase()}.`);
  } catch (error) { showError(error); }
};
window.saveProfile = async event => {
  event.preventDefault();
  try {
    const { user } = await send('/account', 'PUT', { name: field(event.currentTarget, 'name').value });
    currentUser = user;
    showAccount();
    toast('Your profile has been updated.');
  } catch (error) { showError(error); }
};
window.saveAddress = async event => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const result = await send('/addresses', 'POST', {
      label: field(form, 'label').value, name: field(form, 'name').value, phone: field(form, 'phone').value,
      address: field(form, 'address').value, isDefault: field(form, 'isDefault').checked
    });
    addresses = result.addresses;
    showAccount();
    toast('Your address has been saved.');
  } catch (error) { showError(error); }
};
window.deleteAddress = async id => {
  try {
    addresses = (await api(`/addresses/${id}`, { method: 'DELETE' })).addresses;
    showAccount();
    toast('Saved address removed.');
  } catch (error) { showError(error); }
};
function showAccount() {
  if (currentAdmin) {
    $('#ob').innerHTML = `<button class="x" onclick="cl('#om')" aria-label="Close">×</button>
      <h2>Admin account</h2><p class="sub">${escapeHtml(currentAdmin.email)}</p>
      <div class="admin-account-card"><span class="admin-account-icon" aria-hidden="true">↗</span>
        <div><h3>Store dashboard</h3><p>View sales, top products, orders and inventory.</p></div>
        <button class="btn m" onclick="openAdminDashboard()">Open dashboard</button>
      </div>
      <button class="btn o" onclick="logout()">Sign out</button>`;
    $('#om').classList.add('on');
    return;
  }
  if (!currentUser) return openAuth('login', 'Sign in to see your account, orders and subscriptions.');
  const statuses = ['Placed', 'Packed', 'Shipped', 'Delivered'];
  $('#ob').innerHTML = `<button class="x" onclick="cl('#om')" aria-label="Close">×</button>
    <h2>Your account</h2><p class="sub">${escapeHtml(currentUser.name)} · ${escapeHtml(currentUser.email)}
    <button class="btn o account-logout" onclick="logout()">Sign out</button></p>
    <h3>Profile</h3><form class="account-form" onsubmit="saveProfile(event)"><label>Your name<input name="name" value="${escapeHtml(currentUser.name)}" minlength="2" maxlength="100" required></label><button class="btn o">Save profile</button></form>
    <h3 class="account-section">Saved addresses</h3>${addresses.length ? addresses.map(address => `<div class="box account-card">
      <b>${escapeHtml(address.label)} ${address.isDefault ? '<span class="tag">Default</span>' : ''}</b><br>
      ${escapeHtml(address.name)} · ${escapeHtml(address.phone)}<p>${escapeHtml(address.address)}</p>
      <button class="btn o" onclick="deleteAddress(${address.id})">Remove address</button></div>`).join('') : '<p class="sub">No saved addresses yet.</p>'}
    <form class="account-form" onsubmit="saveAddress(event)"><h3>Add or update an address</h3>
      <label>Address label<input name="label" placeholder="Home, Work" required minlength="2" maxlength="40"></label>
      <label>Recipient name<input name="name" value="${escapeHtml(currentUser.name)}" required minlength="2"></label>
      <label>Mobile number<input name="phone" type="tel" pattern="[0-9]{10}" required></label>
      <label>Complete address<textarea name="address" required minlength="10"></textarea></label>
      <label class="save-address"><input type="checkbox" name="isDefault"> Make this my default address</label>
      <button class="btn">Save address</button></form>
    <h3>Your orders</h3>${orders.length ? orders.map(order => `<div class="box account-card">
      <b>#${escapeHtml(order.number)}</b> · ${escapeHtml(order.createdAt.slice(0, 10))} · ${rs(order.total)} · ${escapeHtml(order.paymentMethod)}
      <div class="trk">${statuses.map((status, index) => `<i class="${order.status !== 'Cancelled' && statuses.indexOf(order.status) >= index ? 'd' : ''}"></i>`).join('')}</div>
      <small>Status: ${escapeHtml(order.status)}</small><p>${order.items.map(item => `${escapeHtml(item.name)} ×${item.quantity}`).join(', ')}</p>
      <button class="btn o" onclick="reorder(${order.id})">Reorder</button>
      ${order.status === 'Placed' ? `<button class="btn o" onclick="cancelOrder(${order.id})">Cancel order</button>` : ''}</div>`).join('') : '<p class="sub">No orders yet.</p>'}
    <h3 class="account-section">Your subscriptions</h3>${subscriptions.length ? subscriptions.map(subscription => `<div class="box account-card">
      <b>${escapeHtml(subscription.box)}</b> · ${rs(subscription.price)} · ${escapeHtml(subscription.frequency)} · ${escapeHtml(subscription.status)}
      ${subscription.status !== 'Cancelled' ? `<p><button class="btn o" onclick="changeSubscription(${subscription.id},'${subscription.status === 'Active' ? 'Paused' : 'Active'}')">${subscription.status === 'Active' ? 'Pause' : 'Resume'}</button> <button class="btn o" onclick="changeSubscription(${subscription.id},'Cancelled')">Cancel subscription</button></p>` : ''}</div>`).join('') : '<p class="sub">No active subscriptions yet.</p>'}
    <p class="account-section"><button class="btn o" onclick="closeAccount()">Close</button></p>`;
  $('#om').classList.add('on');
}
window.closeAccount = () => closeOverlay('#om');
window.openAdminDashboard = () => { window.location.href = '/admin.html'; };
window.logout = async () => {
  try {
    await api('/auth/logout', { method: 'POST' });
    currentUser = null;
    currentAdmin = null;
    cart = {};
    wl = [];
    orders = [];
    subscriptions = [];
    addresses = [];
    updateCounts();
    closeOverlay('#om');
    toast('You have signed out.');
  } catch (error) { showError(error); }
};

let authMode = 'login';
let authReturnMessage = '';
function openAuth(mode = 'login', message = '') {
  authMode = mode;
  authReturnMessage = message;
  renderAuth();
  $('#am').classList.add('on');
}
function renderAuth() {
  const modeLabel = authMode === 'register' ? 'Create account' : authMode === 'admin' ? 'Admin sign in' : 'Customer sign in';
  $('#ab').innerHTML = `<button class="x" onclick="cl('#am')" aria-label="Close">×</button>
    <h2>${authMode === 'register' ? 'Create your account' : authMode === 'admin' ? 'Admin sign in' : 'Welcome back'}</h2>
    <p class="sub">${escapeHtml(authReturnMessage || 'Sign in to continue shopping and manage your orders.')}</p>
    <div class="bar auth-tabs"><button class="chip ${authMode === 'login' ? 'on' : ''}" onclick="setAuthMode('login')">Customer sign in</button>
    <button class="chip ${authMode === 'register' ? 'on' : ''}" onclick="setAuthMode('register')">Create account</button>
    <button class="chip ${authMode === 'admin' ? 'on' : ''}" onclick="setAuthMode('admin')">Admin sign in</button></div>
    <form onsubmit="submitAuth(event)">${authMode === 'register' ? '<label>Your name<input name="name" required minlength="2" maxlength="100" autocomplete="name"></label>' : ''}
    <label>${authMode === 'admin' ? 'Admin email' : 'Email'}<input name="email" type="email" required maxlength="254" autocomplete="email"></label>
    <label>Password<input name="password" type="password" required minlength="${authMode === 'register' ? '10' : '1'}" maxlength="200" autocomplete="${authMode === 'register' ? 'new-password' : 'current-password'}"></label>
    ${authMode === 'register' ? '<small>Use at least 10 characters for your password.</small>' : ''}
    <p><button class="btn m" style="width:100%">${authMode === 'register' ? 'Create account' : modeLabel}</button></p></form>`;
}
window.setAuthMode = mode => {
  if (!['login', 'register', 'admin'].includes(mode)) return;
  authMode = mode;
  renderAuth();
};
window.submitAuth = async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const endpoint = authMode === 'admin' ? '/admin/login' : authMode === 'login' ? '/auth/login' : '/auth/register';
  const body = { email: field(form, 'email').value, password: field(form, 'password').value };
  if (authMode === 'register') body.name = field(form, 'name').value;
  try {
    const response = await send(endpoint, 'POST', body);
    if (authMode === 'admin') {
      currentAdmin = response.admin;
      currentUser = null;
    } else {
      currentUser = response.user;
      currentAdmin = null;
      await loadCustomerData();
    }
    closeOverlay('#am');
    toast(currentAdmin ? 'Admin signed in.' : `Welcome${currentUser.name ? `, ${currentUser.name}` : ''}.`);
    render();
    if (currentAdmin) showAccount();
    else if (authReturnMessage.includes('cart') || authReturnMessage.includes('order')) window.showCart();
    else if (authReturnMessage.includes('orders and subscriptions')) showAccount();
  } catch (error) { showError(error); }
};

$('#wt').innerHTML = Object.keys(W).map((key, index) =>
  `<button class="chip ${index ? '' : 'on'}" data-k="${key}">${key}</button>`
).join('');
function why(key) {
  $('#wb').textContent = W[key][0];
  $('#wg').textContent = W[key][1];
  document.querySelectorAll('#wt .chip').forEach(button => button.classList.toggle('on', button.dataset.k === key));
}
$('#wt').onclick = event => { if (event.target.dataset.k) why(event.target.dataset.k); };
why('Farming');

function visibleCarouselCards() {
  if (window.matchMedia('(max-width: 600px)').matches) return 1;
  if (window.matchMedia('(max-width: 900px)').matches) return 2;
  return 3;
}
function renderCarousel() {
  $('#product-carousel').innerHTML = D.map(product => `<article class="carousel-card">
    <button class="carousel-product" onclick="browseCategory('${escapeHtml(product.cat)}')" aria-label="Browse ${escapeHtml(product.cat)} products">
      <span class="carousel-image"><img src="images/p${product.id}.svg" alt="${escapeHtml(product.n)}" loading="${product.id > 4 ? 'lazy' : 'eager'}">
      <span class="carousel-tag">${escapeHtml(product.cat)}</span></span>
      <span class="carousel-caption"><b>${escapeHtml(product.n)}</b><small>From ${escapeHtml(product.farm)}</small>
      <span class="carousel-explore">Explore category <span aria-hidden="true">↗</span></span></span>
    </button></article>`).join('');
  $('#carousel-dots').innerHTML = D.map((product, index) =>
    `<button class="glide-dot ${index === carouselIndex ? 'on' : ''}" aria-label="Show ${escapeHtml(product.n)}" onclick="setCarouselSlide(${index})"></button>`
  ).join('');
  updateCarousel();
  startCarousel();
}
function stopCarousel() {
  if (carouselTimer) clearInterval(carouselTimer);
  carouselTimer = null;
}
function startCarousel() {
  stopCarousel();
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    carouselTimer = setInterval(() => advanceCarousel(1), 3600);
  }
}
function updateCarousel() {
  const track = $('#product-carousel');
  const firstCard = track.firstElementChild;
  if (!firstCard) return;
  const style = getComputedStyle(track);
  const gap = parseFloat(style.columnGap) || parseFloat(style.gap) || 0;
  const step = firstCard.getBoundingClientRect().width + gap;
  const maxOffset = Math.max(0, track.scrollWidth - track.parentElement.clientWidth);
  const offset = Math.min(maxOffset, carouselIndex * step);
  track.style.transform = `translateX(-${offset}px)`;
  $('#carousel-count').textContent = `${String(carouselIndex + 1).padStart(2, '0')} / ${String(D.length).padStart(2, '0')} · A few of our favourites`;
  document.querySelectorAll('.glide-dot').forEach((dot, index) => dot.classList.toggle('on', index === carouselIndex));
}
function advanceCarousel(direction) {
  const visible = visibleCarouselCards();
  const lastStart = Math.max(0, D.length - visible);
  carouselIndex = direction > 0
    ? carouselIndex >= lastStart ? 0 : carouselIndex + 1
    : carouselIndex <= 0 ? lastStart : carouselIndex - 1;
  updateCarousel();
}
window.setCarouselSlide = index => {
  carouselIndex = Math.min(Math.max(0, index), Math.max(0, D.length - visibleCarouselCards()));
  updateCarousel();
};
$('#slide-prev').onclick = () => advanceCarousel(-1);
$('#slide-next').onclick = () => advanceCarousel(1);
$('#product-carousel').parentElement.addEventListener('mouseenter', stopCarousel);
$('#product-carousel').parentElement.addEventListener('mouseleave', startCarousel);
$('#product-carousel').parentElement.addEventListener('focusin', stopCarousel);
$('#product-carousel').parentElement.addEventListener('focusout', event => {
  if (!event.currentTarget.contains(event.relatedTarget)) startCarousel();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopCarousel();
  else startCarousel();
});
window.addEventListener('resize', updateCarousel);

$('#sf').onsubmit = async event => {
  event.preventDefault();
  if (!currentUser) return openAuth('login', 'Sign in to start and manage your weekly box subscription.');
  const form = event.currentTarget;
  const box = field(form, 'bx').value.split(' ₹')[0].replace('Home box', 'Home care box');
  try {
    await send('/subscriptions', 'POST', { box, frequency: field(form, 'fr').value });
    await loadCustomerData();
    $('#sm').textContent = `Subscribed to ${box}, ${form.fr.value.toLowerCase()}. Manage it under Account.`;
    toast('Subscription started.');
  } catch (error) { showError(error); }
};

async function start() {
  setLanguage('en');
  try {
    D = (await api('/products')).map(product => ({ ...product, id: Number(product.id) }));
    const [customerSession, adminSession] = await Promise.all([api('/auth/me'), api('/admin/me')]);
    currentAdmin = adminSession.admin;
    currentUser = currentAdmin ? null : customerSession.user;
    if (currentUser) await loadCustomerData();
    renderCategories();
    renderCarousel();
    render();
    updateCounts();
    if (new URLSearchParams(location.search).has('cart')) window.showCart();
    else if (new URLSearchParams(location.search).has('account')) showAccount();
  } catch (error) {
    showError(error);
    $('#category-cards').innerHTML = '<p class="sub">The store could not connect to its backend. Start the server and reload.</p>';
  }
}
start();
