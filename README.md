# 盤後一頁式台股戰報（可分享網址 / 自動更新）

這個專案做什麼：
- 每天用 GitHub Actions 自動抓取資料，輸出到 `docs/data.json`
- GitHub Pages 前端讀 `docs/data.json` 來顯示表格（頁面 UI 不會因為爬蟲改法而變）
- 讓你有一個「盤後一頁式戰報」可分享網址，且每天自動更新

---

# 給一般使用者（不用寫程式，只要照做）

## 你要的 3 個來源（都照用）
1) 4 檔（2330/2317/3231/2382）：
   - 今日收盤價與漲跌
   - 5 類新聞（法說/營收/重大訊息/產能/美國出口管制）
   - 外資買賣超（張數；當日與前一營業日）
2) 富邦 MoneyDJ：ZGB 6 大券商（摩根大通/台灣摩根士丹利/新加坡商瑞銀/美林/花旗環球/美商高盛）
3) 富邦 MoneyDJ：ZGK_D（外資買賣超排行頁）

---

## 你要做的（不需要寫程式，只要照做）

### A. 建 GitHub repo
1. 下載本專案（zip），解壓縮
2. 建一個新的 GitHub repo
3. 把整個資料夾內容 push 上去（或用 GitHub 上傳檔案也行）

### B. 開啟 GitHub Pages（變成可分享網址）
1. 到 repo → **Settings** → **Pages**
2. Source 選 **Deploy from a branch**
3. Branch 選 **main**，Folder 選 **/docs**
4. Save
5. 之後你的網址會是：`https://<你的帳號>.github.io/<repo 名>/`

### C. 讓它每天盤後自動更新（GitHub Actions 已寫好）
1. 到 repo → **Actions** → 找到「Update data」
2. 第一次可按 **Run workflow** 手動跑一次（馬上產生 docs/data.json）
3. 之後會在平日台北時間自動跑（時間由 `.github/workflows/update.yml` 的 cron 決定）

> 備註：抓不到富邦頁（例如偶發被擋）時，腳本會把錯誤寫進 data.json；前端會顯示紅框錯誤訊息，方便你定位問題。

---

# 重要：Update data 看不到 / 沒有「更新鍵」怎麼辦（最常見）

## 1) Actions 裡找不到「Update data」
99% 是 workflow 檔案放錯位置。GitHub Actions **只認**：
- ✅ `.github/workflows/update.yml`
- ❌ `workflows/update.yml`（放在根目錄會被忽略，Actions 不會出現 Update data）

請確認 repo 裡真的有這個路徑：  
`.github/workflows/update.yml`

## 2) Actions 跑了但 push 不回 repo
到：`Settings → Actions → General → Workflow permissions`  
要選：
- ✅ Read and write permissions

---

# 自動更新的時間：17:20 / 17:30 到底怎麼看？

GitHub Actions 的 `cron` 是用 **UTC**。台北時間 = UTC+8

- 想要 **台北 17:20** → UTC 是 09:20 → cron 寫：`20 9 * * 1-5`
- 想要 **台北 17:30** → UTC 是 09:30 → cron 寫：`30 9 * * 1-5`

你只要改「分鐘」就好（20 或 30），其他不用動。

---

# 標準 workflow（直接照抄，保證有手動更新鍵 + 自動更新）

請把以下內容放在：`.github/workflows/update.yml`

```yml
name: Update data

on:
  workflow_dispatch:
  schedule:
    # 週一到週五 17:20（台灣時間=UTC+8）=> UTC 09:20
    - cron: "20 9 * * 1-5"

permissions:
  contents: write

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt

      - name: Install Playwright browsers
        run: |
          python -m playwright install --with-deps chromium

      - name: Run updater
        run: |
          python scripts/update_data.py

      - name: Commit & push if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add -A
          git diff --cached --quiet || (git commit -m "Update data" && git push)

# 盤後一頁式台股戰報（自動更新 / 可分享網址）

✅ 你只要做兩件事：  
1) 開 GitHub Pages → 你就有網址  
2) Actions「Update data」會每天自動更新

---

## ✅ 我現在可以看到什麼
- 6 檔股票：收盤 / 漲跌 / 新聞分類 / 外資買賣超（張）
- 富邦 MoneyDJ：ZGB 六大券商進出（用 Playwright 抓，較穩）:contentReference[oaicite:6]{index=6}
- 富邦 MoneyDJ：ZGK_D 外資排行（日期常只有月日，需補年份 + 跨年保護）:contentReference[oaicite:7]{index=7}

---

## ✅ 快速開始（不用懂程式）
### 1) 上傳到 GitHub
把整個專案 push 到你的 repo

### 2) 開 GitHub Pages（產生可分享網址）
repo → Settings → Pages  
- Source: Deploy from a branch  
- Branch: main  
- Folder: /docs  
Save 後會得到網址：`https://<帳號>.github.io/<repo>/`

### 3) 第一次手動更新（確認正常）
repo → Actions → **Update data** → **Run workflow**

---

## 🟦 自動更新時間（台北時間）
GitHub Actions 的 cron 是 **UTC**（台北=UTC+8）：

| 你想要台北幾點跑 | cron 要寫成 |
|---|---|
| 17:20（平日） | `20 9 * * 1-5` |
| 17:30（平日） | `30 9 * * 1-5` |

> 只有差 10 分鐘，不是對錯，是你要它幾點跑。

---

## ✅ 必備 workflow（Update data 一定要出現 + 能自動更新）
檔案一定要放這個路徑（放錯就看不到 Update data）：  
✅ `.github/workflows/update.yml`  
❌ `workflows/update.yml`（根目錄這種 GitHub Actions 不認）

**.github/workflows/update.yml：**

```yml
name: Update data

on:
  workflow_dispatch:
  schedule:
    # 週一到週五 17:20（台北=UTC+8）=> UTC 09:20
    - cron: "20 9 * * 1-5"

permissions:
  contents: write

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt

      - name: Install Playwright browsers
        run: |
          python -m playwright install --with-deps chromium

      - name: Run updater
        run: |
          python scripts/update_data.py

      - name: Commit & push if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add -A
          git diff --cached --quiet || (git commit -m "Update data" && git push)
