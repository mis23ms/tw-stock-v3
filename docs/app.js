async function main() {
  const metaEl = document.getElementById("meta");
  const stocksEl = document.getElementById("stocks");
  const zgbEl = document.getElementById("zgb");
  const zgkEl = document.getElementById("zgk");
  const extraEl = document.getElementById("extra");

  let data;
  try {
    const res = await fetch("./data.json", { cache: "no-store" });
    data = await res.json();
  } catch (e) {
    metaEl.textContent = "讀取 data.json 失敗。先去 GitHub Actions 跑一次 Update data。";
    metaEl.classList.add("bad");
    return;
  }

  metaEl.textContent = `更新時間：${data.generated_at}｜最新交易日：${data.latest_trading_day}｜前一交易日：${data.prev_trading_day}`;

  // ===== 自選股票 UI（最多 2 支）=====
  if (extraEl) renderExtraUI(extraEl);

  // ===== Stocks（先畫固定 4 檔：沿用你原本 data.json 的內容）=====
  stocksEl.innerHTML = "";

  const fixedTickers = new Set((data.stocks || []).map(s => String(s.ticker)));
  for (const s of (data.stocks || [])) {
    stocksEl.appendChild(renderStockCard(s, data));
  }

  // ===== Stocks（再加自選 2 檔：打開網頁時即時抓，追加到同一個 #stocks）=====
  const extraTickers = getExtraTickers()
    .filter(t => /^\d{4}$/.test(t))
    .filter(t => !fixedTickers.has(t))
    .slice(0, 2);

  if (extraTickers.length) {
    const loading = document.createElement("div");
    loading.className = "card";
    loading.innerHTML = `<p class="muted">載入自選股票中…（${extraTickers.join(" / ")}）</p>`;
    stocksEl.appendChild(loading);

    try {
      const extraStocks = await loadExtraStocks(extraTickers, data);
      loading.remove();
      for (const s of extraStocks) stocksEl.appendChild(renderStockCard(s, data));
    } catch (e) {
      loading.innerHTML = `<p class="bad">自選股票抓取失敗：${escapeHtml(String(e))}</p>`;
    }
  }

  // ===== ZGB（沿用你原本的畫法）=====
  const zgb = data.fubon_zgb || {};
  const zgbBrokers = zgb.brokers || [];
  zgbEl.innerHTML = `
    <div class="row">
      <div>
        <span class="pill">資料日期 ${zgb.date ?? "-"}</span>
        <span class="pill">單位 ${zgb.unit ?? "-"}</span>
      </div>
    </div>
    <table>
      <thead><tr><th>券商名稱</th><th>買進金額</th><th>賣出金額</th><th>差額</th></tr></thead>
      <tbody>
        ${zgbBrokers.map(b => `<tr><td>${escapeHtml(b.name)}</td><td>${escapeHtml(b.buy)}</td><td>${escapeHtml(b.sell)}</td><td>${escapeHtml(b.diff)}</td></tr>`).join("")}
      </tbody>
    </table>
    ${zgb.error ? `<p class="bad">ZGB 抓取錯誤：${escapeHtml(zgb.error)}</p>` : ""}
  `;

  // ===== ZGK_D（沿用你原本的畫法）=====
  const zgk = data.fubon_zgk_d || {};
  const buy = zgk.buy || [];
  const sell = zgk.sell || [];
  zgkEl.innerHTML = `
    <div class="row">
      <div>
        <span class="pill">資料日期 ${zgk.date ?? "-"}</span>
      </div>
    </div>
    <div class="grid">
      <div class="card" style="padding:0;border:none;background:transparent">
        <h3 style="margin:0 0 6px;font-size:16px">買超</h3>
        <table>
          <thead><tr><th>#</th><th>股票</th><th>超張數</th><th>收盤</th><th>漲跌</th></tr></thead>
          <tbody>
            ${buy.map(r => `<tr><td>${escapeHtml(r.rank)}</td><td>${escapeHtml(r.stock)}</td><td>${escapeHtml(r.net)}</td><td>${escapeHtml(r.close)}</td><td>${escapeHtml(r.change)}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
      <div class="card" style="padding:0;border:none;background:transparent">
        <h3 style="margin:0 0 6px;font-size:16px">賣超</h3>
        <table>
          <thead><tr><th>#</th><th>股票</th><th>超張數</th><th>收盤</th><th>漲跌</th></tr></thead>
          <tbody>
            ${sell.map(r => `<tr><td>${escapeHtml(r.rank)}</td><td>${escapeHtml(r.stock)}</td><td>${escapeHtml(r.net)}</td><td>${escapeHtml(r.close)}</td><td>${escapeHtml(r.change)}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>
    ${zgk.error ? `<p class="bad">ZGK_D 抓取錯誤：${escapeHtml(zgk.error)}</p>` : ""}
  `;
}

main();

/* -------------------- 固定 4 檔卡片（沿用原本 UI） -------------------- */
function renderStockCard(s, data) {
  const card = document.createElement("div");
  card.className = "card";
  const price = s.price || {};
  const f = s.foreign_net_shares || {};
  const ticker = String(s.ticker || "");
  const name = String(s.name || "");

  card.innerHTML = `
    <div class="row">
      <div>
        <div class="kv">
          <span class="pill">${escapeHtml(ticker)}</span>
          <strong>${escapeHtml(name)}</strong>
        </div>
        <div style="margin-top:6px">
          <small>收盤</small> <strong>${price.close ?? "-"}</strong>
          <span style="margin-left:10px"><small>漲跌</small> <strong>${price.change ?? "-"}</strong> <small>(${price.change_pct ?? "-"})</small></span>
        </div>
        <div style="margin-top:6px">
          <small>外資買賣超(張)</small>
          <div class="kv" style="margin-top:4px">
            <span class="pill">${data.latest_trading_day}: ${f.D0 ?? "-"}</span>
            <span class="pill">${data.prev_trading_day}: ${f.D1 ?? "-"}</span>
          </div>
        </div>
      </div>
    </div>
    <div class="tabs" id="tabs-${escapeAttr(ticker)}"></div>
    <div id="list-${escapeAttr(ticker)}"></div>
  `;

  const tabs = card.querySelector(`#tabs-${cssEscape(ticker)}`);
  const list = card.querySelector(`#list-${cssEscape(ticker)}`);
  const cats = ["法說", "營收", "重大訊息", "產能", "美國出口管制"];
  let active = cats[0];

  function renderList(cat) {
    active = cat;
    tabs.querySelectorAll("button").forEach(btn => btn.classList.toggle("active", btn.dataset.cat === active));
    const items = (s.news && s.news[cat]) ? s.news[cat] : [];
    if (!items.length) {
      list.innerHTML = `<p class="muted">這類今天沒有抓到新聞（或資料源暫時無回應）。</p>`;
      return;
    }
    const html = items
      .map(it => `<li><a href="${escapeAttr(it.link)}" target="_blank" rel="noreferrer">${escapeHtml(it.title)}</a><br><small>${escapeHtml(it.date)}</small></li>`)
      .join("");
    list.innerHTML = `<ul>${html}</ul>`;
  }

  for (const c of cats) {
    const btn = document.createElement("button");
    btn.className = "tab" + (c === active ? " active" : "");
    btn.textContent = c;
    btn.dataset.cat = c;
    btn.addEventListener("click", () => renderList(c));
    tabs.appendChild(btn);
  }
  renderList(active);

  return card;
}

/* -------------------- 自選股票：UI / LocalStorage -------------------- */
const EXTRA_KEY = "twstock_extra_2_v1";
const EXTRA_CACHE_KEY = "twstock_extra_cache_v1";

function renderExtraUI(host) {
  const saved = getExtraTickers();
  host.innerHTML = `
    <div class="row" style="align-items:flex-end;gap:10px;flex-wrap:wrap">
      <div>
        <small class="muted">加股票 1（4 碼）</small><br/>
        <input id="extra1" value="${escapeAttr(saved[0] || "")}" placeholder="例如 2603" style="padding:8px 10px;border-radius:10px;min-width:160px" />
      </div>
      <div>
        <small class="muted">加股票 2（4 碼）</small><br/>
        <input id="extra2" value="${escapeAttr(saved[1] || "")}" placeholder="例如 0050" style="padding:8px 10px;border-radius:10px;min-width:160px" />
      </div>
      <button id="btnExtraApply" class="tab" style="padding:10px 14px">套用</button>
      <button id="btnExtraClear" class="tab" style="padding:10px 14px">清空</button>
    </div>
    <p class="muted" style="margin-top:10px">
      這兩支是「你開網頁時即時抓」；每天 GitHub Actions 自動更新的固定 4 檔不受影響。
    </p>
  `;

  host.querySelector("#btnExtraApply").addEventListener("click", () => {
    const a = host.querySelector("#extra1").value.trim();
    const b = host.querySelector("#extra2").value.trim();
    const list = [a, b].filter(Boolean);

    for (const t of list) {
      if (!/^\d{4}$/.test(t)) {
        alert(`股票代號要 4 碼數字：${t}`);
        return;
      }
    }
    localStorage.setItem(EXTRA_KEY, JSON.stringify(list.slice(0, 2)));

    // 清掉快取，避免換股後還用舊資料
    localStorage.removeItem(EXTRA_CACHE_KEY);
    location.reload();
  });

  host.querySelector("#btnExtraClear").addEventListener("click", () => {
    localStorage.setItem(EXTRA_KEY, JSON.stringify([]));
    localStorage.removeItem(EXTRA_CACHE_KEY);
    location.reload();
  });
}

function getExtraTickers() {
  try {
    const v = JSON.parse(localStorage.getItem(EXTRA_KEY) || "[]");
    if (Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean).slice(0, 2);
  } catch {}
  return [];
}

/* -------------------- 自選股票：抓資料（TWSE + Google News RSS） -------------------- */
async function loadExtraStocks(tickers, baseData) {
  const latest = String(baseData.latest_trading_day || "").replaceAll("-", "");
  const prev = String(baseData.prev_trading_day || "").replaceAll("-", "");
  const dateKey = `${latest}_${prev}`;

  const cache = loadCache();
  const dayCache = cache[dateKey] || {};
  const out = [];

  for (const t of tickers) {
    if (dayCache[t]) {
      out.push(dayCache[t]);
      continue;
    }
    const s = await buildExtraStock(t, latest, prev);
    dayCache[t] = s;
    out.push(s);
  }

  cache[dateKey] = dayCache;
  saveCache(cache);
  return out;
}

function loadCache() {
  try { return JSON.parse(localStorage.getItem(EXTRA_CACHE_KEY) || "{}") || {}; } catch { return {}; }
}
function saveCache(obj) {
  try { localStorage.setItem(EXTRA_CACHE_KEY, JSON.stringify(obj || {})); } catch {}
}

async function buildExtraStock(ticker, latestYmd, prevYmd) {
  // 1) 股價（含名稱）
  const priceInfo = await fetchStockDayCloseAndName(ticker, latestYmd);

  // 2) 外資買賣超（張）：TWT38U 的買賣超股數 / 1000
  const [d0Shares, d1Shares] = await Promise.all([
    fetchForeignNetShares(ticker, latestYmd),
    fetchForeignNetShares(ticker, prevYmd),
  ]);

  const d0Lots = d0Shares == null ? null : Math.trunc(d0Shares / 1000);
  const d1Lots = d1Shares == null ? null : Math.trunc(d1Shares / 1000);

  // 3) 新聞（五類）
  const name = priceInfo.name || ticker;
  const news = await fetchNewsByCategories(ticker, name);

  return {
    ticker,
    name,
    price: priceInfo.price,
    foreign_net_shares: { D0: d0Lots, D1: d1Lots },
    news,
  };
}

async function fetchStockDayCloseAndName(ticker, dateYmd) {
  const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${dateYmd}&stockNo=${ticker}`;
  const payload = await fetchJsonSmart(url);

  const rows = Array.isArray(payload.data) ? payload.data : [];
  let name = null;

  // title 通常像：113年12月 2330 台積電 各日成交資訊
  if (payload.title && typeof payload.title === "string") {
    const m = payload.title.match(new RegExp(`${ticker}\\s+([^\\s]+)`));
    if (m) name = m[1];
  }

  if (rows.length < 2) {
    return { name, price: { close: null, change: null, change_pct: null } };
  }

  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];

  const close = parseNumber(last?.[6]);
  const prevClose = parseNumber(prev?.[6]);

  if (close == null || prevClose == null) {
    return { name, price: { close, change: null, change_pct: null } };
  }

  const change = close - prevClose;
  const pct = prevClose ? (change / prevClose) * 100 : null;

  return {
    name,
    price: {
      close: fmtNumber(close),
      change: fmtSigned(change),
      change_pct: pct == null ? null : `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`,
    },
  };
}

async function fetchForeignNetShares(ticker, dateYmd) {
  const url = `https://www.twse.com.tw/fund/TWT38U?response=json&date=${dateYmd}`;
  const payload = await fetchJsonSmart(url);

  if (!payload || (payload.stat && String(payload.stat).toUpperCase() !== "OK" && String(payload.stat).toUpperCase() !== "SUCCESS")) {
    return null;
  }

  const fields = Array.isArray(payload.fields) ? payload.fields : [];
  const data = Array.isArray(payload.data) ? payload.data : [];
  const idxCode = fields.findIndex(x => String(x).trim() === "證券代號");
  const idxNet = fields.findIndex(x => String(x).trim() === "買賣超股數");
  if (idxCode < 0 || idxNet < 0) return null;

  for (const row of data) {
    if (!Array.isArray(row)) continue;
    const code = String(row[idxCode] ?? "").trim();
    if (code === ticker) return parseIntSafe(row[idxNet]);
  }
  return null;
}

async function fetchNewsByCategories(ticker, name) {
  const cats = ["法說", "營收", "重大訊息", "產能", "美國出口管制"];
  const out = {};
  for (const c of cats) {
    const q = `${ticker} ${name} ${c}`;
    out[c] = await fetchGoogleNewsRss(q, 10);
  }
  return out;
}

async function fetchGoogleNewsRss(query, limit) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
  const xmlText = await fetchTextSmart(url);
  const xml = extractXml(xmlText);

  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const items = Array.from(doc.querySelectorAll("item")).slice(0, limit);
  return items.map(it => ({
    title: it.querySelector("title")?.textContent?.trim() || "",
    link: it.querySelector("link")?.textContent?.trim() || "",
    date: it.querySelector("pubDate")?.textContent?.trim() || "",
  })).filter(x => x.title && x.link);
}

/* -------------------- smart fetch（先直連，失敗再走 r.jina.ai） -------------------- */
async function fetchJsonSmart(url) {
  const txt = await fetchTextSmart(url);
  const json = extractJson(txt);
  return JSON.parse(json);
}

async function fetchTextSmart(url) {
  // 0) 先試直連
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return await r.text();
  } catch (e1) {
    // 1) 轉接站清單：一個掛了自動換下一個
    const proxies = [
      u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
      u => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`,
      u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
    ];

    let lastErr = e1;

    for (const makeProxy of proxies) {
      const purl = makeProxy(url);
      try {
        const r2 = await fetch(purl, { cache: "no-store" });
        if (!r2.ok) throw new Error(`proxy ${r2.status} ${r2.statusText}`);
        return await r2.text();
      } catch (e2) {
        lastErr = e2;
      }
    }

    // 全部都失敗才丟錯
    throw lastErr;
  }
}



function extractJson(txt) {
  const s = txt.indexOf("{");
  const e = txt.lastIndexOf("}");
  if (s >= 0 && e > s) return txt.slice(s, e + 1);
  return txt;
}

function extractXml(txt) {
  const s = txt.indexOf("<");
  const e = txt.lastIndexOf(">");
  if (s >= 0 && e > s) return txt.slice(s, e + 1);
  return txt;
}

/* -------------------- helpers -------------------- */
function parseNumber(v) {
  if (v == null) return null;
  const s = String(v).replace(/,/g, "").trim();
  if (!s || s === "--" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseIntSafe(v) {
  if (v == null) return null;
  const s = String(v).replace(/,/g, "").trim();
  if (!s || s === "--" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function fmtNumber(n) {
  if (n == null) return null;
  // 1495 / 145.5 這種呈現
  const s = String(n);
  if (s.includes(".")) return s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return s;
}

function fmtSigned(n) {
  if (n == null) return null;
  const sign = n >= 0 ? "+" : "";
  // 保留到小數 2 位再去尾 0
  const s = (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
  return `${sign}${s}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/`/g, "&#96;");
}
function cssEscape(s) {
  // 最低限度避免 querySelector 因特殊字元炸掉
  return String(s).replace(/[^a-zA-Z0-9\-_]/g, "\\$&");
}
