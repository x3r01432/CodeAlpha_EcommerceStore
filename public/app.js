const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '$' + Number(n).toFixed(2);
const session = () => JSON.parse(localStorage.getItem('shop_session') || 'null');
const cart = () => JSON.parse(localStorage.getItem('shop_cart') || '[]');
const saveCart = (c) => { localStorage.setItem('shop_cart', JSON.stringify(c)); renderHeader(); };

async function api(path, opts = {}) {
  const s = session();
  const res = await fetch('/api' + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(s ? { Authorization: 'Bearer ' + s.token } : {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
function toast(m) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); }
function renderHeader() {
  $('#cc').textContent = cart().reduce((a, i) => a + i.quantity, 0);
  const s = session();
  $('#who').innerHTML = s ? `<span class="badge">👤 ${esc(s.user.username)}</span> <a href="#" id="logout">Log out</a>` : '<a class="btn" href="#/login">Log in</a>';
  if (s) $('#logout').onclick = (e) => { e.preventDefault(); localStorage.removeItem('shop_session'); renderHeader(); location.hash = '#/'; };
}
function addToCart(p, qty = 1) {
  const c = cart(); const ex = c.find((i) => i.product_id === p.id);
  if (ex) ex.quantity += qty; else c.push({ product_id: p.id, name: p.name, price: p.price, image: p.image, quantity: qty });
  saveCart(c); toast(`Added ${p.name} to cart`);
}

const views = {
  async home() {
    const cats = await api('/categories');
    $('#view').innerHTML = `<div class="row between"><h1>Products</h1><div class="row" style="width:460px"><input id="q" placeholder="Search products…"><select id="cat" style="width:170px"><option value="">All categories</option>${cats.map((c) => `<option>${esc(c)}</option>`).join('')}</select></div></div><div class="grid" id="grid"></div>`;
    const load = async () => {
      const params = new URLSearchParams({ q: $('#q').value }); if ($('#cat').value) params.set('category', $('#cat').value);
      const ps = await api('/products?' + params);
      $('#grid').innerHTML = ps.map((p) => `<div class="card"><a href="#/product/${p.id}"><div class="pimg">${p.image}</div><h3>${esc(p.name)}</h3></a><span class="badge">${esc(p.category)}</span><div class="row between" style="margin-top:12px"><span class="price">${money(p.price)}</span><button class="btn" data-add="${p.id}">Add to cart</button></div></div>`).join('') || '<p class="muted">No products found.</p>';
      $('#grid').querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => addToCart(ps.find((p) => p.id == b.dataset.add))));
    };
    $('#q').oninput = load; $('#cat').onchange = load; load();
  },
  async product(id) {
    const p = await api('/products/' + id);
    $('#view').innerHTML = `<a href="#/">← Back to products</a><div class="detail card" style="margin-top:12px"><div class="pimg">${p.image}</div><div><span class="badge">${esc(p.category)}</span><h1>${esc(p.name)}</h1><p class="muted">${esc(p.description)}</p><p class="price">${money(p.price)}</p><p>${p.stock > 0 ? `✅ In stock (${p.stock} left)` : '❌ Out of stock'}</p><div class="row"><input id="qty" class="qty" type="number" min="1" max="${p.stock}" value="1"><button class="btn" id="add" ${p.stock ? '' : 'disabled'}>Add to cart</button></div></div></div>`;
    $('#add').onclick = () => addToCart(p, Math.max(1, parseInt($('#qty').value) || 1));
  },
  cart() {
    const c = cart();
    if (!c.length) { $('#view').innerHTML = '<h1>Your cart</h1><div class="card"><p>Your cart is empty. <a href="#/">Browse products</a></p></div>'; return; }
    const total = c.reduce((a, i) => a + i.price * i.quantity, 0);
    $('#view').innerHTML = `<h1>Your cart</h1><div class="card"><table><tr><th></th><th>Product</th><th>Price</th><th>Qty</th><th>Subtotal</th><th></th></tr>${c.map((i, n) => `<tr><td style="font-size:30px">${i.image}</td><td>${esc(i.name)}</td><td>${money(i.price)}</td><td><input class="qty" type="number" min="1" value="${i.quantity}" data-q="${n}"></td><td>${money(i.price * i.quantity)}</td><td><button class="btn danger" data-rm="${n}">Remove</button></td></tr>`).join('')}</table><div class="row between" style="margin-top:16px"><span class="price">Total: ${money(total)}</span><a class="btn" href="#/checkout">Proceed to checkout →</a></div></div>`;
    document.querySelectorAll('[data-q]').forEach((el) => (el.onchange = () => { const c2 = cart(); c2[el.dataset.q].quantity = Math.max(1, parseInt(el.value) || 1); saveCart(c2); views.cart(); }));
    document.querySelectorAll('[data-rm]').forEach((el) => (el.onclick = () => { const c2 = cart(); c2.splice(el.dataset.rm, 1); saveCart(c2); views.cart(); }));
  },
  checkout() {
    if (!session()) { location.hash = '#/login?next=checkout'; return; }
    const c = cart(); if (!c.length) { location.hash = '#/cart'; return; }
    const total = c.reduce((a, i) => a + i.price * i.quantity, 0);
    $('#view').innerHTML = `<h1>Checkout</h1><div class="detail"><div class="card"><h3>Shipping details</h3><label>Full name</label><input id="sn"><label>Address</label><textarea id="sa" rows="3"></textarea><label>Card number (demo – not charged)</label><input id="cardno" placeholder="4242 4242 4242 4242"><p class="err" id="err"></p><button class="btn" id="place">Place order</button></div><div class="card"><h3>Order summary</h3>${c.map((i) => `<div class="row between"><span>${i.image} ${esc(i.name)} × ${i.quantity}</span><span>${money(i.price * i.quantity)}</span></div>`).join('')}<hr><div class="row between price"><span>Total</span><span>${money(total)}</span></div></div></div>`;
    $('#place').onclick = async () => {
      try {
        const o = await api('/orders', { method: 'POST', body: { items: c.map(({ product_id, quantity }) => ({ product_id, quantity })), shipping_name: $('#sn').value, shipping_address: $('#sa').value } });
        saveCart([]);
        $('#view').innerHTML = `<div class="card auth" style="text-align:center"><div style="font-size:64px">🎉</div><h1>Order #${o.id} placed!</h1><p>Total charged: <b>${money(o.total)}</b><br>Status: <span class="badge">${o.status}</span></p><a class="btn" href="#/orders">View order history</a></div>`;
      } catch (e) { $('#err').textContent = e.message; }
    };
  },
  async orders() {
    if (!session()) { location.hash = '#/login?next=orders'; return; }
    const os = await api('/orders');
    $('#view').innerHTML = `<h1>Order history</h1>` + (os.map((o) => `<div class="card" style="margin-bottom:14px"><div class="row between"><h3>Order #${o.id}</h3><span class="badge">${esc(o.status)}</span></div><p class="muted">${esc(o.created_at)} UTC · Ship to ${esc(o.shipping_name)}, ${esc(o.shipping_address)}</p>${o.items.map((i) => `<div class="row between"><span>${i.image} ${esc(i.name)} × ${i.quantity}</span><span>${money(i.unit_price * i.quantity)}</span></div>`).join('')}<hr><b>Total ${money(o.total)}</b></div>`).join('') || '<div class="card">No orders yet.</div>');
  },
  login(params) {
    const next = new URLSearchParams(params).get('next') || '';
    $('#view').innerHTML = `<div class="card auth"><h2 id="t">Log in</h2><label>Username</label><input id="u"><label>Password</label><input id="p" type="password"><p class="err" id="err"></p><button class="btn" id="go" style="width:100%">Log in</button><p class="muted" style="text-align:center">No account? <a href="#" id="sw">Register</a></p></div>`;
    let mode = 'login';
    $('#sw').onclick = (e) => { e.preventDefault(); mode = mode === 'login' ? 'register' : 'login'; $('#t').textContent = $('#go').textContent = mode === 'login' ? 'Log in' : 'Create account'; $('#sw').textContent = mode === 'login' ? 'Register' : 'Log in'; };
    $('#go').onclick = async () => {
      try { const s = await api('/' + mode, { method: 'POST', body: { username: $('#u').value, password: $('#p').value } }); localStorage.setItem('shop_session', JSON.stringify(s)); renderHeader(); location.hash = '#/' + next; }
      catch (e) { $('#err').textContent = e.message; }
    };
  },
};

function route() {
  const [path, query] = location.hash.slice(2).split('?');
  const [name, arg] = path.split('/');
  Promise.resolve().then(() => (views[name] || views.home)(name === 'login' ? query : arg)).catch((e) => ($('#view').innerHTML = `<div class="card err">${esc(e.message)}</div>`));
  window.scrollTo(0, 0);
}
window.onhashchange = route; renderHeader(); route();
