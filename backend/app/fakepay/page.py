"""HTML of the CardPay Fake pages. Its own look, on purpose unlike the shop: this is "another company's" page."""

import json
from html import escape

_STYLE = """
:root { --bg:#0e1220; --panel:#171c2e; --line:#2a3150; --text:#eef1ff; --muted:#9aa3c7; --accent:#19d3a2;
        --accent-ink:#04261c; --warn:#ffcc33; --warn-ink:#2b2100; --err:#ff6b6b; }
* { box-sizing:border-box; }
body { margin:0; min-height:100vh; background:radial-gradient(1200px 600px at 10% -10%, #24305a 0%, var(--bg) 60%);
       color:var(--text); font:15px/1.5 "Trebuchet MS", "Segoe UI", system-ui, sans-serif; }
.top { display:flex; align-items:center; gap:10px; padding:18px 20px; }
.logo { width:34px; height:24px; border-radius:6px; background:linear-gradient(135deg, var(--accent), #5b7cff); }
.brand { font-weight:700; letter-spacing:.5px; font-size:18px; }
.brand small { color:var(--muted); font-weight:400; margin-left:6px; }
.warn { margin:0 16px; padding:12px 14px; border-radius:10px; background:var(--warn); color:var(--warn-ink);
        font-weight:700; text-align:center; }
.wrap { max-width:440px; margin:22px auto 40px; padding:0 16px; }
.panel { background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:22px; }
.who { color:var(--muted); font-size:13px; text-transform:uppercase; letter-spacing:1px; }
.amount { font:700 34px/1.2 "Consolas", "Courier New", monospace; margin:4px 0 18px; }
label { display:block; font-size:13px; color:var(--muted); margin:12px 0 4px; }
input { width:100%; padding:11px 12px; border-radius:10px; border:1px solid var(--line); background:#0f1424;
        color:var(--text); font:16px "Consolas", "Courier New", monospace; }
input:focus { outline:2px solid var(--accent); border-color:transparent; }
.row { display:flex; gap:10px; } .row > div { flex:1; }
button { width:100%; margin-top:18px; padding:13px; border:0; border-radius:10px; background:var(--accent);
         color:var(--accent-ink); font-weight:700; font-size:16px; cursor:pointer; }
button:disabled { opacity:.6; cursor:wait; }
.link { background:none; color:var(--muted); font-weight:400; margin-top:8px; text-decoration:underline; }
.errors { color:var(--err); margin-top:12px; min-height:1em; }
.tests { margin-top:18px; font-size:13px; color:var(--muted); }
.tests code { color:var(--text); }
.foot { text-align:center; color:var(--muted); font-size:12px; margin-top:16px; }
"""

_SCRIPT = """
const link = JSON.parse(document.getElementById('link').textContent);
const form = document.getElementById('pay'), errors = document.getElementById('errors');
const button = document.getElementById('submit'), cancel = document.getElementById('cancel');
const number = document.getElementById('number');
number.addEventListener('input', () => {
  const d = number.value.replace(/\\D/g, '').slice(0, 19);
  number.value = d.replace(/(.{4})/g, '$1 ').trim();
});
async function send(path, extra) {
  button.disabled = cancel.disabled = true; errors.textContent = '';
  try {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ ...link, ...extra }) });
    const data = await r.json().catch(() => ({}));
    if (r.ok) { window.location.assign(data.redirect); return; }
    const d = data.detail;
    errors.textContent = Array.isArray(d) ? d.map(x => typeof x === 'string' ? x : 'Check the fields').join('. ')
                                          : (d || 'Something went wrong, try again');
  } catch (e) { errors.textContent = 'No connection, try again'; }
  button.disabled = cancel.disabled = false;
}
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const [m, y] = document.getElementById('expiry').value.split('/').map(s => parseInt(s, 10));
  send('/fakepay/api/pay', { holder: document.getElementById('holder').value, number: number.value,
                            exp_month: m || 0, exp_year: y ? (y < 100 ? 2000 + y : y) : 0,
                            cvc: document.getElementById('cvc').value });
});
cancel.addEventListener('click', () => send('/fakepay/api/cancel', {}));
"""


def _frame(title: str, body: str) -> str:
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>{escape(title)}</title><style>{_STYLE}</style></head>
<body>
<div class="top"><div class="logo"></div><div class="brand">CardPay Fake<small>demo payment gateway</small></div></div>
<div class="warn">This is NOT a real payment. Do not type your real card. Use a test card, e.g. 4242 4242 4242 4242.</div>
{body}
</body></html>"""


def checkout(link: dict) -> str:
    amount = f"{float(link['amount']):,.0f}".replace(",", " ")
    # The link goes into a JSON block, never into HTML or the script text: no way to inject markup.
    data = json.dumps(link).replace("<", "\\u003c")
    return _frame("CardPay Fake · Pay", f"""
<div class="wrap"><div class="panel">
  <div class="who">KeyFive WMS · top-up {escape(link['ref'])}</div>
  <div class="amount">{escape(amount)} {escape(link['currency'])}</div>
  <form id="pay" autocomplete="off" novalidate>
    <label for="holder">Name on card</label><input id="holder" placeholder="AIGERIM NURLANOVA" maxlength="100">
    <label for="number">Card number</label>
    <input id="number" inputmode="numeric" placeholder="4242 4242 4242 4242" maxlength="23">
    <div class="row">
      <div><label for="expiry">Expiry (MM/YY)</label><input id="expiry" placeholder="12/29" maxlength="7"></div>
      <div><label for="cvc">CVC</label><input id="cvc" inputmode="numeric" placeholder="123" maxlength="4"></div>
    </div>
    <button id="submit" type="submit">Pay {escape(amount)} {escape(link['currency'])}</button>
    <button id="cancel" type="button" class="link">Cancel and go back to the shop</button>
    <div id="errors" class="errors" role="alert"></div>
  </form>
  <div class="tests">Test cards: <code>4242 4242 4242 4242</code> paid ·
    <code>4000 0000 0000 0002</code> declined · <code>4000 0000 0000 9995</code> not enough money.
    Any future expiry and any CVC.</div>
</div>
<div class="foot">CardPay Fake keeps nothing you type. No money moves anywhere.</div></div>
<script type="application/json" id="link">{data}</script>
<script>{_SCRIPT}</script>""")


def error(message: str) -> str:
    return _frame("CardPay Fake · Error", f"""
<div class="wrap"><div class="panel"><div class="who">Payment</div>
<p>{escape(str(message))}</p><p><a href="/account" style="color:var(--accent)">Back to the shop</a></p></div></div>""")
