#!/usr/bin/env python3

from __future__ import annotations



import csv

import json

import re

import sys

from datetime import datetime, timedelta, timezone

from typing import Any, Dict, List, Optional, Tuple

from urllib.parse import quote_plus



import requests

from bs4 import BeautifulSoup



STOCKS = [

    ("2330", "台積電"),

    ("2317", "鴻海"),

    ("3231", "緯創"),

    ("2382", "廣達"),

]



FUBON_ZGB_URL = "https://fubon-ebrokerdj.fbs.com.tw/Z/ZG/ZGB/ZGB.djhtm"

FUBON_ZGK_D_URL = "https://fubon-ebrokerdj.fbs.com.tw/Z/ZG/ZGK_D.djhtm"



ZGB_BROKERS = [

    "摩根大通",

    "台灣摩根士丹利",

    "新加坡商瑞銀",

    "美林",

    "花旗環球",

    "美商高盛",

]



TWSE_STOCK_DAY = "https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date={date}&stockNo={stock}"

TWSE_TWT38U_JSON = "https://www.twse.com.tw/fund/TWT38U?response=json&date={date}"

TWSE_TWT38U_CSV = "https://www.twse.com.tw/fund/TWT38U?response=csv&date={date}"



GOOGLE_NEWS_RSS = "https://news.google.com/rss/search?q={q}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant"



NEWS_CATEGORIES = {

    "法說": ["法說", "法說會", "法說摘要", "財報電話會議", "線上法說"],

    "營收": ["營收", "月營收", "合併營收", "營收公布", "營收年增", "營收月增"],

    "重大訊息": ["重大訊息", "重訊", "公告", "暫停交易", "處置", "違約", "減資", "增資"],

    "產能": ["產能", "擴產", "投產", "產線", "產量", "CoWoS", "先進封裝", "capex", "資本支出"],

    "美國出口管制": ["出口管制", "美國", "禁令", "制裁", "管制", "BIS", "晶片禁令", "Entity List", "實體清單"],

}



HEADERS = {

    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36",

    "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",

    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

}



TAIPEI_TZ = timezone(timedelta(hours=8))





def fetch_text(url: str, *, encoding: Optional[str] = None, timeout: int = 25) -> str:

    r = requests.get(url, headers=HEADERS, timeout=timeout)

    r.raise_for_status()

    if encoding:

        r.encoding = encoding

    return r.text





def try_parse_int(s: str) -> Optional[int]:

    s = s.strip().replace(",", "")

    if not s or s in {"--", "-"}:

        return None

    try:

        return int(float(s))

    except Exception:

        return None





def try_parse_float(s: str) -> Optional[float]:

    s = s.strip().replace(",", "")

    if not s or s in {"--", "-"}:

        return None

    try:

        return float(s)

    except Exception:

        return None





def iso_now() -> str:

    return datetime.now(TAIPEI_TZ).replace(microsecond=0).isoformat()





def yyyymmdd(dt: datetime) -> str:

    return dt.strftime("%Y%m%d")





def to_iso_date(yyyymmdd_s: str) -> str:

    return f"{yyyymmdd_s[0:4]}-{yyyymmdd_s[4:6]}-{yyyymmdd_s[6:8]}"





def fetch_twt38u_json(date_yyyymmdd: str) -> Dict[str, Any]:

    # JSON first

    try:

        txt = fetch_text(TWSE_TWT38U_JSON.format(date=date_yyyymmdd))

        return json.loads(txt)

    except Exception:

        # fallback to CSV

        txt = fetch_text(TWSE_TWT38U_CSV.format(date=date_yyyymmdd))

        lines = [line for line in txt.splitlines() if line.strip()]

        header_idx = None

        for i, line in enumerate(lines[:40]):

            if "證券代號" in line and "買賣超股數" in line:

                header_idx = i

                break

        if header_idx is None:

            raise RuntimeError("CSV header not found")

        reader = csv.reader(lines[header_idx:])

        rows = list(reader)

        fields = rows[0]

        data = rows[1:]

        return {"stat": "OK", "fields": fields, "data": data, "date": date_yyyymmdd}





def twt38u_has_data(payload: Dict[str, Any]) -> bool:

    if not isinstance(payload, dict):

        return False

    stat = payload.get("stat")

    if stat and str(stat).upper() not in {"OK", "SUCCESS"}:

        return False

    data = payload.get("data")

    return isinstance(data, list) and len(data) > 0





def find_last_two_trading_days(max_lookback_days: int = 15) -> Tuple[str, str]:

    today = datetime.now(TAIPEI_TZ).date()

    found: List[str] = []

    for i in range(max_lookback_days):

        d = datetime.combine(today - timedelta(days=i), datetime.min.time(), tzinfo=TAIPEI_TZ)

        ds = yyyymmdd(d)

        try:

            payload = fetch_twt38u_json(ds)

            if twt38u_has_data(payload):

                found.append(ds)

                if len(found) == 2:

                    return found[0], found[1]

        except Exception:

            continue

    raise RuntimeError("找不到最近兩個有資料的交易日（資料源異常或 lookback 太短）")





def extract_foreign_net_shares_for_stocks(date_yyyymmdd: str, tickers: List[str]) -> Dict[str, Optional[int]]:

    payload = fetch_twt38u_json(date_yyyymmdd)

    if not twt38u_has_data(payload):

        raise RuntimeError(f"TWT38U 無資料：{date_yyyymmdd}")

    fields = payload.get("fields") or []

    data = payload.get("data") or []



    def find_idx(name: str) -> int:

        for i, f in enumerate(fields):

            if str(f).strip() == name:

                return i

        raise RuntimeError(f"欄位不存在：{name}")



    idx_code = find_idx("證券代號")

    idx_net = find_idx("買賣超股數")



    # 1 張 = 1000 股；來源是「股數」，這裡轉成「張數」
    def shares_to_lots(v: Optional[int]) -> Optional[int]:

        if v is None:

            return None

        return int(round(v / 1000.0))



    out: Dict[str, Optional[int]] = {t: None for t in tickers}

    for row in data:

        if not isinstance(row, list) or len(row) <= max(idx_code, idx_net):

            continue

        code = str(row[idx_code]).strip()

        if code in out:

            out[code] = shares_to_lots(try_parse_int(str(row[idx_net])))

    return out





def fetch_stock_close_and_change(ticker: str, date_hint: str) -> Tuple[Optional[float], Optional[float], Optional[str]]:

    url = TWSE_STOCK_DAY.format(date=date_hint, stock=ticker)

    payload = json.loads(fetch_text(url))

    rows = payload.get("data") or []

    if len(rows) < 2:

        return None, None, None

    last = rows[-1]

    prev = rows[-2]

    close = try_parse_float(last[6]) if len(last) > 6 else None

    prev_close = try_parse_float(prev[6]) if len(prev) > 6 else None

    if close is None or prev_close is None:

        return close, None, None

    change = close - prev_close

    pct = (change / prev_close * 100.0) if prev_close else None

    pct_str = f"{pct:+.2f}%" if pct is not None else None

    return close, change, pct_str





def parse_fubon_zgb() -> Dict[str, Any]:

    """

    富邦 ZGB：券商分點進出金額排行



    為什麼不用 requests/BeautifulSoup？

    - 富邦這種頁面常有反爬/動態載入，你用 requests 會抓到不完整 HTML，

      最後前端就只會顯示 '-' 或錯數字。

    - Playwright 是「真的開一個無頭瀏覽器」，等網頁把資料畫出來後再讀 DOM，最穩。

    """

    try:

        import asyncio

        from playwright.async_api import async_playwright



        async def _run():

            url = FUBON_ZGB_URL



            async with async_playwright() as p:

                # headless=True：GitHub Actions 沒螢幕，只能用無頭模式

                browser = await p.chromium.launch(headless=True)



                # 偽裝一般瀏覽器，降低被當成機器人的機率

                context = await browser.new_context(

                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

                )



                page = await context.new_page()



                # wait_until="networkidle"：等主要網路請求都穩定下來（避免 DOM 還沒畫完）

                await page.goto(url, wait_until="networkidle")



                # 多等一下（保險）：有些頁面 networkidle 了但表格還在最後渲染

                await page.wait_for_timeout(1500)



                targets = ZGB_BROKERS  # 你指定的 6 家外資



                result = await page.evaluate(

                    """(targets) => {

                        const bodyText = document.body?.innerText || "";



                        // 從整頁文字抓「資料日期」「單位」

                        const dm = bodyText.match(/資料日期\\s*[:：]\\s*(\\d{8})/);

                        const um = bodyText.match(/單位\\s*[:：]\\s*([^\\s]+)/);



                        // ZGB 最大的坑：常見「買超 + 賣超」左右合併在同一張表

                        // 一列可能有 8 個 td：

                        // 左邊 0..3 = 買超(券商,買進,賣出,差額)

                        // 右邊 4..7 = 賣超(券商,買進,賣出,差額)

                        const tables = Array.from(document.querySelectorAll("table"));

                        let targetTable = null;



                        for (const t of tables) {

                          const head = (t.innerText || "");

                          if (head.includes("券商名稱") && head.includes("買進金額") && head.includes("賣出金額") && head.includes("差額")) {

                            targetTable = t;

                            break;

                          }

                        }



                        const emptyRow = (name) => ({ name, buy: "-", sell: "-", diff: "-" });



                        if (!targetTable) {

                          return {

                            date: dm ? dm[1] : null,

                            unit: um ? um[1] : null,

                            brokers: targets.map(emptyRow),

                            error: "找不到含欄位標題的 ZGB 表格"

                          };

                        }



                        const map = new Map();

                        const rows = Array.from(targetTable.querySelectorAll("tr"));



                        const setIfMatch = (nameCell, buyCell, sellCell, diffCell) => {

                          const name = (nameCell?.innerText || "").trim();

                          if (!name) return;



                          for (const want of targets) {

                            if (name.includes(want)) {

                              map.set(want, {

                                name: want,

                                buy:  (buyCell?.innerText  || "").trim() || "-",

                                sell: (sellCell?.innerText || "").trim() || "-",

                                diff: (diffCell?.innerText || "").trim() || "-"

                              });

                            }

                          }

                        };



                        for (const tr of rows) {

                          const tds = tr.querySelectorAll("td");

                          if (!tds || tds.length < 4) continue;



                          // 左半（買超）

                          setIfMatch(tds[0], tds[1], tds[2], tds[3]);



                          // 右半（賣超）——只有在真的有 8 欄時才處理

                          if (tds.length >= 8) {

                            setIfMatch(tds[4], tds[5], tds[6], tds[7]);

                          }

                        }



                        return {

                          date: dm ? dm[1] : null,

                          unit: um ? um[1] : null,

                          brokers: targets.map((n) => map.get(n) || emptyRow(n))

                        };

                    }""",

                    targets,

                )



                await browser.close()

                return result



        # 這支腳本是 CLI 跑的（GitHub Actions 也是 CLI），asyncio.run 最穩

        return asyncio.run(_run())



    except Exception as e:

        return {"date": None, "unit": None, "brokers": [], "error": str(e)}











def parse_fubon_zgk_d(limit: int = 50, base_year: Optional[int] = None) -> Dict[str, Any]:

    try:

        html = fetch_text(FUBON_ZGK_D_URL, encoding="big5")

        m = re.search(r"資料日期\s*[:：]\s*(\d{8})", html)

        date = m.group(1) if m else None

        if date is None:

            m2 = re.search(r"日期\s*[:：]\s*(\d{1,2})/(\d{1,2})", html)

            if m2:

                mm = int(m2.group(1))

                dd = int(m2.group(2))

                y = int(base_year) if base_year is not None else datetime.now(TAIPEI_TZ).year

                date = f"{y:04d}{mm:02d}{dd:02d}"



        soup = BeautifulSoup(html, "lxml")

        table = soup.find("table")

        if table is None:

            raise RuntimeError("找不到 ZGK_D 表格")



        buy_rows = []

        sell_rows = []

        for tr in table.find_all("tr"):

            cols = [c.get_text(" ", strip=True) for c in tr.find_all(["td", "th"])]

            if not cols or "名次" in " ".join(cols):

                continue

            if len(cols) < 10:

                continue

            if cols[0].isdigit():

                buy_rows.append({"rank": cols[0], "stock": cols[1], "net": cols[2], "close": cols[3], "change": cols[4]})

            if cols[5].isdigit():

                sell_rows.append({"rank": cols[5], "stock": cols[6], "net": cols[7], "close": cols[8], "change": cols[9]})



        return {"date": date, "buy": buy_rows[:limit], "sell": sell_rows[:limit]}

    except Exception as e:

        return {"date": None, "buy": [], "sell": [], "error": str(e)}





def fetch_rss_items(query: str, limit: int = 30) -> List[Dict[str, str]]:

    url = GOOGLE_NEWS_RSS.format(q=quote_plus(query))

    xml = fetch_text(url)

    soup = BeautifulSoup(xml, "xml")

    items = []

    for it in soup.find_all("item")[:limit]:

        title = (it.title.get_text() if it.title else "").strip()

        link = (it.link.get_text() if it.link else "").strip()

        pub = (it.pubDate.get_text() if it.pubDate else "").strip()

        desc = (it.description.get_text() if it.description else "").strip()

        items.append({"title": title, "link": link, "date": pub, "desc": desc})

    return items





def classify_news(items: List[Dict[str, str]]) -> Dict[str, List[Dict[str, str]]]:

    out = {k: [] for k in NEWS_CATEGORIES.keys()}

    for it in items:

        text = f"{it.get('title','')} {it.get('desc','')}"

        for cat, kws in NEWS_CATEGORIES.items():

            if any(kw in text for kw in kws):

                out[cat].append({"title": it["title"], "link": it["link"], "date": it["date"]})

                break

    for k in list(out.keys()):

        out[k] = out[k][:8]

    return out





def main() -> None:

    latest, prev = find_last_two_trading_days()

    tickers = [t for t, _ in STOCKS]



    foreign_latest = extract_foreign_net_shares_for_stocks(latest, tickers)

    foreign_prev = extract_foreign_net_shares_for_stocks(prev, tickers)



    stocks_out = []

    for ticker, name in STOCKS:

        close, change, pct = fetch_stock_close_and_change(ticker, latest)

        items = fetch_rss_items(f"{ticker} {name}")

        news = classify_news(items)

        stocks_out.append({

            "ticker": ticker,

            "name": name,

            "price": {"close": close, "change": change, "change_pct": pct},

            "foreign_net_shares": {"D0": foreign_latest.get(ticker), "D1": foreign_prev.get(ticker)},

            "news": news,

        })



    out = {

        "generated_at": iso_now(),

        "latest_trading_day": to_iso_date(latest),

        "prev_trading_day": to_iso_date(prev),

        "stocks": stocks_out,

        "fubon_zgb": parse_fubon_zgb(),

        "fubon_zgk_d": parse_fubon_zgk_d(limit=50, base_year=int(latest[:4])),

    }



    with open("docs/data.json", "w", encoding="utf-8") as f:

        json.dump(out, f, ensure_ascii=False, indent=2)



    print("OK: docs/data.json updated")





if __name__ == "__main__":

    try:

        main()

    except Exception as e:

        print(f"ERROR: {e}", file=sys.stderr)

        sys.exit(1)
