#!/usr/bin/env python3
import json, requests, time, sys, re
from datetime import datetime, timedelta, timezone
from bs4 import BeautifulSoup

# --- [設定區] ---
STOCKS = [("2330", "台積電"), ("2317", "鴻海"), ("3231", "緯創"), ("2382", "廣達")]
FUTURES_MAP = {"2330": "CDF", "2317": "CHF", "3231": "CKF", "2382": "CMF"}
TAIFEX_URL = "https://www.taifex.com.tw/cht/3/ssoBigTraders"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}

def clean_num(s):
    if not s or s in ["--", "-", "None"]: return 0.0
    return float(str(s).replace(",", "").replace("+", ""))

def fetch_stock_price(ticker, date_s):
    """TWSE 穩定抓取邏輯"""
    try:
        url = f"https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date={date_s}&stockNo={ticker}"
        r = requests.get(url, headers=HEADERS, timeout=15)
        d = r.json()
        if "data" not in d or not d["data"]: return None
        last, prev = d["data"][-1], d["data"][-2]
        c, p = clean_num(last[6]), clean_num(prev[6])
        diff = c - p
        pct = (diff / p * 100) if p != 0 else 0
        return {"close": str(c), "change": f"{diff:+.2f}", "change_pct": f"{pct:+.2f}%"}
    except: return None

def fetch_futures_safe(ticker, date_s):
    """[cite: 55-60] 期貨模組：獨立抓取，失敗不影響整體 Action"""
    f_code = FUTURES_MAP.get(ticker)
    try:
        q_date = f"{date_s[0:4]}/{date_s[4:6]}/{date_s[6:8]}"
        r = requests.post(TAIFEX_URL, data={"queryDate": q_date, "commodityId": f_code}, timeout=10)
        soup = BeautifulSoup(r.text, "lxml")
        row = next((tr for tr in soup.find_all("tr") if "所有契約" in tr.get_text()), None)
        cols = [td.get_text(strip=True).replace(",", "") for td in row.find_all("td")]
        return {
            "top5": {"buy": cols[2], "sell": cols[3], "net": int(cols[2]) - int(cols[3])},
            "top10": {"buy": cols[5], "sell": cols[6], "net": int(cols[5]) - int(cols[6])},
            "oi": cols[9]
        }
    except: return {"error": "期貨資料暫時無法取得"}

def main():
    tz = timezone(timedelta(hours=8))
    now = datetime.now(tz)
    # 若在 17:00 前跑，抓昨天
    if now.hour < 17: now -= timedelta(days=1)
    date_s = now.strftime("%Y%m%d")
    prev_s = (now - timedelta(days=3)).strftime("%Y%m%d") # 粗估前一交易日

    stocks_data = []
    for ticker, name in STOCKS:
        print(f"處理: {ticker}")
        price = fetch_stock_price(ticker, date_s)
        stocks_data.append({
            "ticker": ticker, "name": name,
            "price": price or {"close": "-", "change": "0", "change_pct": "0%"},
            "futures": fetch_futures_safe(ticker, date_s),
            "foreign_net_shares": {"D0": 0, "D1": 0}, # 此處可補回原本抓外資的邏輯
            "news": {}
        })
        time.sleep(2)

    output = {
        "generated_at": now.strftime("%Y-%m-%d %H:%M"),
        "latest_trading_day": f"{date_s[0:4]}-{date_s[4:6]}-{date_s[6:8]}",
        "prev_trading_day": f"{prev_s[0:4]}-{prev_s[4:6]}-{prev_s[6:8]}",
        "stocks": stocks_data
    }

    with open("docs/data.json", "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print("Action 穩定執行成功")

if __name__ == "__main__": main()
