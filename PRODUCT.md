# DriftScope — 產品規格書

**版本：** v0.6（2026-03-27）
**作者：** Chieh-Lee Hung

---

## 目錄

1. [背景與問題定義](#1-背景與問題定義)
2. [解決方案概覽](#2-解決方案概覽)
3. [核心概念](#3-核心概念)
4. [系統架構](#4-系統架構)
5. [目前實作狀況](#5-目前實作狀況)
6. [Demo 場景](#6-demo-場景)
7. [競爭分析](#7-競爭分析)
8. [研究脈絡與論文對齊](#8-研究脈絡與論文對齊)
9. [已知限制](#9-已知限制)
10. [Demo Day 策略](#10-demo-day-策略)

---

## 1. 背景與問題定義

> **AI agent 的行為改變了，但沒有人知道。**

現有 LLMOps 工具（LangSmith、LangWatch、Arize）監控的是 **infrastructure metrics**：latency、cost、error rate、token count。這些指標可以告訴你系統有沒有壞掉，但 agent 的行為改變通常不會觸發任何工程指標的異常。

### 三個真實場景

**場景 A：Knowledge base 被悄悄更新**

PM 更新了退款政策文件（加了例外條款）→ 沒有 code change，沒有 deployment → LangSmith 全綠 → 四天後用戶投訴「上週可以退款，這週說不行」→ 工程師完全不知道原因。

**場景 B：Model provider 悄悄更新 model**

OpenAI 對 gpt-4o 做了 silent patch → 同一個 model name → 所有 metrics 沒有異常 → Agent 對同類問題的回答風格、工具使用方式都改變了。

**場景 C：System prompt 被小改了一行**

工程師修改了一個邊角 case → 影響 30% 的 query 的處理路徑 → 沒有 regression test 涵蓋到 → 兩週後才在用戶投訴中發現。

### 為什麼現有工具做不到

| 工具 | 監控什麼 | 缺少什麼 |
|------|----------|----------|
| LangSmith | latency, cost, error | trajectory-level behavior |
| LangWatch | production traces, simulation testing | unsupervised drift detection |
| Arize | output embedding drift | trajectory drift（agent 怎麼思考的） |
| 自建 regression test | 預先定義的 eval metric | 偵測未預期的行為改變 |

**核心差距：** 現有工具要麼只看 output，要麼需要你事先知道要測什麼（supervised）。DriftScope 是 **unsupervised behavioral monitoring**，自動偵測你沒有預期到的行為改變。

---

## 2. 解決方案概覽

DriftScope 同時監控兩個維度：

- **Output Drift**：agent 說了什麼（最終答案的語義）
- **Trajectory Drift**：agent 怎麼思考的（tool call 執行路徑）

把這兩個維度結合，得到四種狀況：

### 四象限分類

```
                    Output Drift
                    低              高
               ┌──────────────┬──────────────┐
Trajectory     │              │              │
Drift  低      │  ✅ 正常     │  🔵 Input   │
               │              │    Drift     │
               ├──────────────┼──────────────┤
               │  🟠 Hidden  │              │
       高      │    Drift     │  🔴 Severe  │
               │  (最危險)    │              │
               └──────────────┴──────────────┘
```

| 象限 | Output | Trajectory | 代表什麼 | 建議行動 |
|------|--------|------------|----------|----------|
| ✅ 正常 | 低 | 低 | 一切正常 | 無 |
| 🔵 Input Drift | 高 | 低 | 用戶問的問題類型改變了，agent 路徑沒變。通常是正常現象。 | 觀察 |
| 🟠 Hidden Drift | 低 | 高 | **最危險**：agent 走了完全不同的路徑，但給了看起來語義相似的答案。 | 立即調查 |
| 🔴 Severe | 高 | 高 | 行為和結果都改變了，嚴重問題。 | 立即 alert |

**Hidden Drift（🟠）是 DriftScope 最核心的差異化能力**，也是目前沒有任何工具能偵測到的場景。

---

## 3. 核心概念

### Trajectory

Trajectory 是 agent 處理一個 query 的完整執行記錄：query + 每個 tool call（name, args, result summary, timestamp）+ 最終 output。

### Trajectory Embedding

把 trajectory 轉成向量，捕捉「agent 怎麼處理這個問題」的語義。例如：

```
Query: 「我的蘋果壞了」
Path: search_knowledge_base → check_order_status → process_refund
→ 轉成文字後 embed 成 1536 維向量
```

### MMD（Maximum Mean Discrepancy）

比較兩組向量的分布差距：

- **Baseline**：過去兩週正常運作時的 trajectories
- **Current**：最近 24 小時的 trajectories
- **MMD score**：0 = 完全一樣，1 = 完全不同

不同於直接比較平均值，MMD 比較的是整個分布的形狀，對 subtle 的 drift 更敏感。

### Input Drift 的分離

如果用戶突然開始問很多不同類型的問題，trajectory 自然會不一樣——這不是 agent 的問題。DriftScope 先用 cosine similarity 配對同類問題（threshold 0.85），只比較「問了同類問題但 agent 走了不同路徑」的情況。

### Secondary Diagnostics

- **Response Consistency**：同類 query 的回答穩定性（受 Agent Drift 論文啟發）
- **Tool Usage Distribution**：每個 tool 被呼叫的頻率分布是否改變（Jensen-Shannon divergence）

---

## 4. 系統架構

```
用戶的 Agent（LangChain / 任何框架）
         │
         │ @ds.trace 或 DriftScopeCallback
         ▼
┌─────────────────────────────┐
│  Layer 1: Capture SDK       │
│  - 攔截 tool calls          │
│  - 記錄 trajectory          │
│  - 非同步存儲，不影響 latency │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  Layer 2: Embedding Engine  │
│  - trajectory → vector      │
│  - output → vector          │
│  - model: text-embedding-3-small（+ local fallback） │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  Layer 3: Drift Detector    │
│  - MMD 計算分布差距          │
│  - Input vs Behavior 分離   │
│  - 四象限分類               │
│  - Response Consistency     │
│  - Tool Usage Distribution  │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  Layer 4: Dashboard         │
│  - 四象限散佈圖             │
│  - Timeline（每天 drift score）│
│  - Tool Usage Shift         │
│  - Behavior Drift Examples  │
└─────────────────────────────┘
```

**Storage：SQLite**（MVP 版本，不需要 PostgreSQL 或 vector DB）

---

## 5. 目前實作狀況

### 模組狀態

| 模組 | 狀態 | 說明 |
|------|------|------|
| Capture SDK | ✅ 完成 | `@ds.trace`、`record_tool_call()`、SQLite 非同步寫入 |
| SQLite Store | ✅ 完成 | trajectories / analyses schema 與讀寫 API |
| Embedding Engine | ✅ 完成 | OpenAI embedding + deterministic local fallback |
| Drift Detector | ✅ 完成 | MMD、四象限、input/behavior separation、response consistency、tool frequency drift |
| Demo Pipeline (Picnic) | ✅ 完成 | 30 queries × 2 phases，寫入 `demo/output/` |
| Quickstart Demo | ✅ 完成 | `demo/quickstart.py` — 15 queries × 2 phases，無 domain 依賴 |
| Next.js Dashboard | ✅ 完成 | 見下方 Dashboard 實作細節（v0.5 patch） |
| Dashboard API | ✅ 完成 | `/api/dashboard`、`/api/dashboard/trajectories`、Python SQLite bridge |
| LangChain Integration | ✅ 完成 | callback 攔截 tool start/end/error |
| OpenClaw Integration | ✅ 完成 | agent wrapper + tool wrapper |
| Settings Page | ✅ 完成 | `/settings`：接入說明、storage 路徑、detection 演算法 |
| Production API / Auth / Multi-project UI | ❌ 未完成 | 單機 demo / local prototype |

---

### Dashboard 實作細節（v0.6 patch）

#### v0.5 修正項目

| 問題 | 原因 | 修正 |
|------|------|------|
| **Scatter 點全部擠在 x=0** | outputProxy 用 output 長度差，normal traces 幾乎相同長度 | X 軸改為 **step growth ratio** `(curr_steps − base_steps) / base_steps`，drifted traces 天然散到右側 |
| **Sankey 視覺一條厚帶（第一次修）** | drifted / normal traces Y spread 相同 | 分三層：drifted 上半，normal 下半，baseline 中央 |
| **Timeline KB marker 不明顯** | 灰色小字 "KB updated" | 改為橙色背景 tag「⚡ KB Updated」，配橙色虛線 |
| **hr-agent / search-agent 假 project** | Sidebar hardcode 三個 project，後兩個無資料 | 移除假 project，只保留 picnic-support；新增「+ Connect project」入口 |
| **無 end-to-end quickstart** | 只有 Picnic demo | 新增 `demo/quickstart.py`（15 queries × 2 phases，零 domain 依賴） |

#### v0.6 修正項目 — Agent Path Divergence 視覺完全重設計

**問題根本原因：** 即使把 normal/drifted 分層，10 條橙色線（drifted）仍被 90 條綠色線的體積蓋掉，視覺比例錯誤，分叉看不出來。

**方案：Split Timeline（分叉流程圖）**

```
ALL TRACES           →      DIVERGES HERE
                            ┌─ 90% — same path (27) ────→ process_refund
search_kb → check_order ────┤
                            └─ 10% — drifted (3) ────→ check_seller
                                                      → verify_photo
                                                      → escalate
                                                      → process_refund
```

**實作細節：**

| 元素 | 說明 |
|------|------|
| **Common prefix** | 計算 baseline / normal current / drifted current 三條代表路徑的最長公共前綴 |
| **代表路徑** | 每組取 `mostCommon(paths)`（最高頻路徑，Levenshtein 替代方案） |
| **Fork bezier** | `M(lastPrefixX, midY) C(+55, midY) (firstTailX-30, branchY) (firstTailX, branchY)` — 水平出發，平滑曲入分支 |
| **線寬比例** | `minThick + (count/total) * (maxThick - minThick)`，3px → 18px，90/10 分布自動呈現粗細差異 |
| **Normal branch** | 上方（normalY = PT + ph*0.22），灰色，線寬比例粗（~16px） |
| **Drifted branch** | 下方（driftedY = PT + ph*0.78），橙色，線寬比例細（~4px），新工具節點橙色+NEW標籤 |
| **分隔線** | fork 點畫垂直虛線 + "COMMON PREFIX" / "DIVERGES HERE" 小標 |
| **Fallback** | 無 drifted traces 時正常顯示（只有 normal branch，無 fork） |

#### ClassificationQuadrant 軸定義（v0.5）

- **Y 軸：Path Edit Distance** — 歸一化 Levenshtein(currTools, baseTools)，0=完全相同，1=完全不同
- **X 軸：Step Growth Ratio** — `(curr_steps − base_steps) / max(base_steps, 1)`，clamp [0,1]，0=步數不變，1=步數倍增
- **四象限標籤更新：**
  - 左下：Normal（步數不變，路徑不變）
  - 右下：Expanded（步數增加，但路徑結構類似）
  - 左上：Rerouted（步數相同，但換了不同工具）
  - 右上：Diverged（步數大增 + 路徑完全不同） ← demo 的 drifted traces 在這裡
- **Aggregate dot：** 所有 scatter points 的均值，非 analysis.trajectory_drift/output_drift

#### Agent Path Divergence 視覺分層（v0.5）

```
                midY − 8  ←── drifted current (橙, 最多 −34px spread)
midY − 14 ... midY + 14  ←── baseline (灰, center band)
                midY + 8  ←── normal current (綠, 最多 +32px spread)
```

#### Quickstart Demo（`demo/quickstart.py`）

- 15 queries，baseline 2 步（search_kb + generate_response），current 3-4 步（+ lookup_order_context + 隨機 verify_customer_eligibility）
- 完全不依賴 Picnic / OpenAI，工具呼叫是 mock
- 跑完自動寫入 `dashboard/web/public/data/`（analysis.json + trajectories.json）
- 評審可以把自己的 `record_tool_call()` 換進去，10 分鐘接完

---

### Dashboard 實作細節（v0.4）

#### 版面 — 1920×1080 優化

| 元素 | 舊值 | 新值 |
|------|------|------|
| Sidebar 寬度 | 216px | 240px |
| 頁面最大寬度 | 1200px | 1440px |
| Page inner padding | 20px 28px | 24px 36px |
| `stat-label` | 11px | 12px |
| `stat-value` | 28px | 30px |
| `panel-super` / `section-label` | 11px | 12px |
| `panel-title` | 1rem | 1.05rem |
| `sb-nav-item` | 0.82rem | 0.875rem |
| `bt-table` / `tt-table` | 0.82rem | 0.875rem |
| Chart row / detail row gap | 16px | 20px |

---

#### ClassificationQuadrant — 每條 trace 一個散佈點

**舊版：** 單一聚合點（analysis.trajectory_drift, analysis.output_drift）

**新版：** 所有 trace 以散佈圖顯示 + 聚合 AVG 點。

**計算流程（server-side in `page.tsx`）：**
1. `loadTrajectoryData({ limit: 200 })` 取得所有 baseline + current records
2. 依 `query` 文字配對 current ↔ baseline
3. 每條 trace 計算：
   - `pathDrift` = `seqEditDist(currTools, baseTools)` — 歸一化 Levenshtein 距離（0=完全相同, 1=完全不同）
   - `outputProxy` = `|curr.output.length − base.output.length| / max(lengths)` — 輸出長度差作為 proxy
4. 以 `driftedSet`（來自 `behavior_drift_examples`）標記各點是否 drifted

**視覺：**
- 灰點 = normal trace，橙點 = drifted trace
- 大脈衝圓 = 聚合 AVG，顏色對應四象限分類（orange / red / blue / green）
- 軸 Y = Path Edit Distance↑，軸 X = Output Change (length proxy)→

---

#### PathSankey — 全部 traces 疊加顯示

**舊版：** 只取 `behavior_drift_examples`（僅 drifted queries），依 link count 畫粗細不同的聚合弧線。標籤固定寫「Baseline (V1) / Current (V2)」。

**新版：** 全部 `trajectoryPayload.baseline` + `trajectoryPayload.current` 每條各畫一條細線疊加。

**實作：**
- 每條 trace 提取 `steps.map(s => s.tool)` 作為 tool sequence
- Column assignment：每個 tool 取其在所有 trace 中出現的最大 index 位置
- 每條 trace 畫連續 Bezier 段（相鄰 tool 間的 cubic bezier），加輕微 Y spread（±9px）避免完全重疊
- 顏色分層：
  - Baseline：`#a1a1aa`，opacity 0.22
  - Current normal：`var(--green)`，opacity 0.30
  - Current drifted：`var(--orange)`，opacity 0.45（最後繪製，顯示在最上層）
- Legend 顯示實際 trace 數量：`Baseline (30)` / `Current — Normal (6)` / `Current — Drifted (24)`
- New tools（從未在 baseline 出現）節點顯示橙色 NEW 標籤

**新增演算法工具：**

```typescript
// 歸一化 Levenshtein，用於 scatter + 未來 per-trace 分析
function seqEditDist(a: string[], b: string[]): number
```

---

#### 導航修正 — 假按鈕全部修復

| 元素 | 舊狀態 | 新狀態 |
|------|--------|--------|
| Explorer（sidebar） | `<div>` disabled，title="Coming soon" | `<Link href="/traces?filter=drifted">` 真實跳轉 |
| Settings（sidebar） | `<div>` disabled | `<Link href="/settings">` 真實跳轉 |
| Acknowledge（alerts） | `cursor: not-allowed; opacity: 0.5` 假按鈕 | `<AcknowledgeButton>` client component，localStorage persist |
| Version tag | `v0.3 · Demo` | `v0.4 · alpha` |

**`AcknowledgeButton` (`components/acknowledge-button.tsx`)：**
- `"use client"` component
- `useEffect` on mount：讀 `localStorage.getItem("ack:{alertId}")` 還原狀態
- Click：寫入 `localStorage`，顯示 `✓ Acknowledged {HH:MM}`
- 已 acknowledge 的 alert 重新整理後仍保持已讀狀態

---

#### Settings Page（`/settings`）

新頁面 `app/settings/page.tsx`，包含：
1. **Integration** — SDK 接入 code block（`pip install`、`@ds.trace` decorator、`run_demo.py`）
2. **Data Sources** — 四個 storage 路徑對照表（baseline.db、current.db、analysis.json、trajectories.json）
3. **Detection** — 四種演算法說明（MMD、Cosine Similarity、Normalized Levenshtein、Tool Frequency Share Delta）
4. **Project** — 顯示 active project name、data source、last updated、alert threshold

---

### 核心檔案

**SDK：** `driftscope/capture.py`、`store.py`、`embedding.py`、`detector.py`

**Integrations：** `driftscope/integrations/langchain.py`、`openclaw.py`

**Demo：** `demo/picnic_agent.py`、`demo/run_demo.py`

**Frontend：**
- `dashboard/web/app/page.tsx` — 主頁，含 ClassificationQuadrant scatter + PathSankey 全 trace 疊加
- `dashboard/web/app/globals.css` — 版面與字型（1440px 寬版優化）
- `dashboard/web/app/components/sidebar.tsx` — 導航，Explorer + Settings 已修復為真實連結
- `dashboard/web/app/components/acknowledge-button.tsx` — client-side localStorage ack
- `dashboard/web/app/settings/page.tsx` — 完整設定與演算法說明頁
- `dashboard/load_dashboard_data.py` — Python SQLite bridge

---

### 啟動方式

```bash
# 1. 生成 demo 資料（跑一次即可）
cd /path/to/driftscope
python demo/run_demo.py

# 2. 啟動 dashboard
cd dashboard/web
npm run dev
# → http://localhost:3000
```

接入真實 agent：
```python
from driftscope import DriftScope
ds = DriftScope(project="my-agent")

@ds.trace
def run_agent(query: str) -> str:
    return agent.run(query)
```

---

## 6. Demo 場景

### 設定

**背景：** Picnic 線上超市的客服 AI agent。

**事件：** PM 更新了退款政策文件，加了三個例外條款（需要照片、高價值需人工審核、第三方賣家需聯繫賣家），沒有通知工程師。

**時間線：**

```
Day 0：PM 更新知識庫
Day 1-3：LangSmith 全綠，沒有任何 alert
Day 4：DriftScope 偵測到 Trajectory Drift 0.657，Drift Type = Hidden
Day 4（手動）：工程師發現原因，通知 PM 確認
```

### Trajectory 差異（Hidden Drift 的核心）

```
# V1 典型路徑（3 步）
search_knowledge_base → check_order_status → process_refund

# V2 典型路徑（5-6 步）
search_knowledge_base → check_order_status
→ check_seller_type        ← 新增
→ verify_photo_evidence    ← 新增
→ escalate_to_human        ← 條件觸發
→ process_refund
```

Output 語義相似（都說「退款處理中」）→ Output Drift ≈ 0.0 → 現有工具偵測不到。

### Demo 數字

| 指標 | 值 |
|------|----|
| Trajectory Drift | 0.657 |
| Output Drift | 0.0 |
| Drift Type | 🟠 Hidden Drift |
| Alert | true |

---

## 7. 競爭分析

### 直接競爭

| 工具 | 他們做什麼 | DriftScope 的差距 |
|------|-----------|-------------------|
| **Arize** | Output embedding drift | 沒有 trajectory drift；需要 supervised labels |
| **LangSmith** | Metric-based drift（需事先定義 eval） | Unsupervised；trajectory-level；不需要 label |
| **LangWatch** | Production monitoring + simulation testing | Deploy 後的 unsupervised monitoring |

### 定位矩陣

```
                        Deploy 前               Deploy 後
              ┌─────────────────────┬──────────────────────────┐
 Supervised   │ LangSmith eval      │ LangSmith drift          │
（需要 label）│ LangWatch Scenario  │ Arize output drift       │
              ├─────────────────────┼──────────────────────────┤
Unsupervised  │                     │                          │
（不需 label）│     （空白）         │  ← DriftScope            │
              └─────────────────────┴──────────────────────────┘
```

**DriftScope 的定位：Deploy 後的 unsupervised behavioral monitoring。這個象限目前是空白的。**

### 為什麼用 MMD

| 方法 | 缺點 | 結論 |
|------|------|------|
| **MMD** | 計算量 O(n²) | ✅ 使用 — 比較整個分布，不需要 label，對 subtle drift 敏感 |
| Euclidean（平均值） | 平均值相同但分布不同時偵測不到 | ❌ |
| KL Divergence | 高維時不穩定 | ❌ |
| Simple rule（steps > N） | 不知道 threshold，無法區分 input drift | ❌ |

### 常見問題與答案

| 問題 | 答案 |
|------|------|
| **「用 steps > N 不就好了？」** | Rule 不知道 N 設多少；不同 domain baseline 完全不同。更重要的是，user 問了更難的問題，steps 自然變多——這不是 drift。MMD 分離了這兩種情況。 |
| **「直接比 output embedding 不就好了？」** | Output embedding 只看最終答案。兩個不同路徑可能給出語義相似的答案（Hidden Drift）。Trajectory embedding 捕捉過程，不只是結果。 |
| **「跑 regression test 不就好了？」** | Regression test 要事先知道要測什麼。DriftScope 是 unsupervised，自動偵測沒有預期到的行為改變，特別是 data change 造成的改變。 |
| **「LangSmith 有 drift detection？」** | LangSmith 的 drift 是 metric-based，需要事先定義 eval metric。DriftScope 是 unsupervised，不需要定義任何 metric。 |
| **「這是 feature not product？」** | Trajectory embedding 設計和 MMD calibration 需要 domain expertise；input vs behavior 分離邏輯不是三行 code 能加的 feature；而且 framework-agnostic，可以監控任何 agent。 |
| **「False positive 怎麼辦？」** | 四象限設計讓 input drift 和 behavior drift 分開。Input drift（用戶問不同的問題）不會觸發 alert。 |

---

## 8. 研究脈絡與論文對齊

### 核心論文

| 論文 | 重點 | 用途 |
|------|------|------|
| **Gretton et al. (2012)** — "A Kernel Two-Sample Test", JMLR | MMD 的理論基礎 | 「我們用的方法是 JMLR 認可的 two-sample test」 |
| **Rabanser et al. (2019)** — "Failing Loudly", NeurIPS | 系統比較各種 drift detection 方法，MMD 表現最佳 | 「independent benchmark 顯示 MMD 優於均值比較和 KL divergence」 |
| **Sculley et al. (2015)** — "Hidden Technical Debt in ML Systems", NeurIPS | 生產 ML 系統難以監控的根本原因 | 「連 Google 都說 ML 系統最難監控的部分是 behavior drift」 |

### Agent 行為研究（2025-2026）

近期研究把 agent drift 拆成：semantic drift / behavioral drift / coordination drift。對應到 DriftScope：

| 論文分類 | DriftScope |
|---------|------------|
| semantic drift | output drift |
| behavioral drift | trajectory drift |
| coordination drift | 尚未支援（multi-agent extension） |

2026-03 研究指出：當 tool outputs 被污染時，傳統 quality metrics 仍可能維持穩定，但 agent 的 trajectory 已經改變。這與 Hidden Drift 直接對齊。

**Pitch 敘事：**
> 「2012 年，數學家建立了比較分布的理論工具（MMD）。2015 年，Google 指出生產 ML 系統的行為監控是最難的問題。2019 年，empirical study 確認 MMD 是最適合 high-dimensional shift detection 的方法。2026 年，agent 是新的生產 ML 系統。DriftScope 把這些結合起來，做第一個真正的 agent behavioral monitor。」

---

## 9. 已知限制

| 限制 | 說明 |
|------|------|
| **資料量需求** | 至少需要 50-100 個 baseline trajectories 才能計算可靠的 drift score。新上線的 agent 無法使用。 |
| **Threshold 靈敏度** | `similarity_threshold = 0.85` 是固定值，不同 domain 可能需要調整。 |
| **Batch 分析** | 分析是手動觸發，沒有自動排程或 webhook 通知。 |
| **Demo 資料是合成的** | Picnic agent 是 deterministic 模擬，尚未在真實 production agent 上做 end-to-end 驗證。 |
| **單機 SQLite** | 不是 server DB，不支援多機部署。 |

---

## 10. Demo Day 策略

### 題目評估

| 維度 | 評分 | 說明 |
|------|------|------|
| 問題真實性 | ⭐⭐⭐⭐⭐ | Agent 行為無聲改變是所有用 LLM 做產品的人都真實遇到的問題 |
| 差異化 | ⭐⭐⭐⭐⭐ | Hidden Drift 是所有現有工具都偵測不到的盲區 |
| 技術深度 | ⭐⭐⭐⭐ | MMD 是有理論根據的方法（JMLR 2012），不是 rule-based heuristic |
| Demo 可視化 | ⭐⭐⭐⭐ | 四象限、before/after trajectory 對比、timeline 都夠視覺 |
| 時機 | ⭐⭐⭐⭐⭐ | 2026 年 agent monitoring 是最熱的話題，學術界剛開始正式定義這個問題 |

### 三個關鍵畫面

**畫面 1：「一切正常」的假象（第 0-1 分鐘）**

展示 LangSmith 全綠截圖：Latency 穩定、Error rate 0%、Cost 無異常。

台詞：**「這是你今天早上看到的畫面。一切正常。」**

**畫面 2：DriftScope 的橙色警告（第 2-4 分鐘）**

切換到 DriftScope dashboard：橙色 Hidden Drift badge、Trajectory Drift 0.657、Output Drift 0.0。

台詞：**「這是同一個 agent，同一段時間，DriftScope 看到的畫面。」**

這個對比是整個 demo 的 money shot。

**畫面 3：Root Cause（第 4-6 分鐘）**

點進 Behavior Drift Examples，展示同一個 query：
- Baseline：`search_kb → check_order → process_refund`（3 步）
- Current：`search_kb → check_order → check_seller_type → verify_photo → escalate_to_human → process_refund`（6 步）

台詞：**「同一個問題，agent 走了完全不同的路。不是 code change，是 knowledge base 被悄悄更新了。LangSmith 永遠不會給你這個線索。」**

### 8 分鐘腳本

**00:00–00:45** — 開場 hook

> 「三週前，Picnic 的一個工程師開始收到用戶投訴：上週說可以退款，這週說不行。她打開 LangSmith。全綠。Error rate 0%。她花了兩天找問題。」

**00:45–01:30** — 問題框架

> 「現有工具監控的是 infrastructure：系統有沒有壞。但 agent 的行為改變了，不是系統壞了。Deploy 後、不需要 label 的 unsupervised behavioral monitoring——這個格子是空的。這就是 DriftScope 要做的事。」

**01:30–03:30** — DriftScope 登場

> 「DriftScope 同時監控兩個維度：agent 說了什麼（output），和 agent 怎麼思考的（trajectory）。這個橙色區域叫做 Hidden Drift——最危險的場景：output 看起來正常，但 agent 在用完全不同的路徑做決策。」

**03:30–05:30** — Root cause

> 「你可以點進去看是哪些 query 受影響。同一個問題，query similarity 0.97，但 agent 從 3 步走到了 6 步，多了照片驗證和人工審核。這不是 bug，是 knowledge base 在四天前被悄悄更新了。」

**05:30–06:30** — 接入有多簡單

> 「接 DriftScope 只需要三行。LangChain 的 callback 自動攔截所有 tool calls，不需要改 agent 邏輯，不影響 latency。」

**06:30–08:00** — 技術 + Closer

> 「我們用 Maximum Mean Discrepancy（Gretton et al. 2012）比較 trajectory 的分布，不是單一數字的比較。」

> （對著評審）「你們的 agent 每天處理幾千個客服問題。你現在知道它今天的行為跟上週一樣嗎？」

### 關鍵差異化一句話

> **「現有工具告訴你 agent 有沒有壞。DriftScope 告訴你 agent 有沒有『變』。」**
