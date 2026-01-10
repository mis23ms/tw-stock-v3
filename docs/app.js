/* 核心：顏色規則補件 [cite: 45-50] */
function getColorClass(pctStr) {
  if (!pctStr || pctStr === "-") return "";
  const val = parseFloat(pctStr);
  const abs = Math.abs(val);
  const prefix = val >= 0 ? "up" : "down";
  if (abs >= 3) return `${prefix}-lv3`;
  if (abs >= 1) return `${prefix}-lv2`;
  if (abs > 0) return `${prefix}-lv1`;
  return "";
}

/* 外資張數分級 [cite: 51-54] */
function getForeignClass(lots) {
  if (!lots || lots === "-") return "";
  const val = parseInt(lots);
  const abs = Math.abs(val);
  const prefix = val >= 0 ? "up" : "down";
  if (abs >= 3000) return `${prefix}-lv3`;
  if (abs >= 800) return `${prefix}-lv1`;
  return "";
}

/* 修改後的 renderStockCard：拿掉期貨，保留價格與顏色 */
function renderStockCard(s, data) {
  const card = document.createElement("div");
  card.className = "card";
  const p = s.price || {};
  const f = s.foreign_net_shares || {};
  const priceClass = getColorClass(p.change_pct);

  card.innerHTML = `
    <div class="row">
      <div style="width:100%">
        <div class="kv"><strong>${s.name}</strong> <small class="muted">${s.ticker}</small></div>
        <div style="margin-top:8px">
          <small>收盤</small> <strong>${p.close}</strong>
          <span class="pill ${priceClass}">${p.change} (${p.change_pct})</span>
        </div>
      </div>
    </div>
    <div id="news-${s.ticker}">新聞載入中...</div>
  `;
  return card;
}

/* 新增：最下方的期貨獨立渲染 [cite: 55-60] */
function renderFuturesSection(data) {
  const container = document.getElementById("futures-summary");
  if (!container || !data.stocks) return;

  container.innerHTML = data.stocks.map(s => {
    const fut = s.futures;
    if (!fut) return "";
    return `
      <div class="card">
        <strong>${s.name} 期貨 (${s.ticker})</strong>
        ${fut.error ? `<p class="bad">${fut.error}</p>` : `
          <div class="futures-grid" style="font-size:13px; margin-top:10px;">
            <div>前五大淨：<span class="${fut.top5.net >= 0 ? 'net-pos' : 'net-neg'}">${fut.top5.net}</span></div>
            <div>前十大淨：<span class="${fut.top10.net >= 0 ? 'net-pos' : 'net-neg'}">${fut.top10.net}</span></div>
            <div>未平倉量：${fut.oi}</div>
          </div>
        `}
      </div>
    `;
  }).join("");
}
