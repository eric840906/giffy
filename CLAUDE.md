## 專案：Giffy — GIF/影片/圖片編輯工具

## 產品概述

- 名稱：Giffy
- 定位：給自己和朋友用的 GIF / 影片 / 圖片線上編輯工具
- 平台：Web App，所有檔案處理在瀏覽器端完成（Client-side），不上傳伺服器
- 語系：繁體中文（預設）+ 英文
- 檔案限制：50MB
- UI 風格：現代、活潑可愛、圓角、有微動畫
- 主題：淺色為預設，可切換深色

## 技術棧

- 前端：React + TypeScript + Vite
- 後端：Node.js（Express，輕量 hosting）
- 核心處理：@ffmpeg/ffmpeg（ffmpeg.wasm）
- CSS：Tailwind CSS
- i18n：react-i18next（zh-TW + en）
- 路由：React Router
- 測試：Vitest + React Testing Library + Playwright
- 部署目標：Vercel

## 專案結構

```
giffy/
├── client/
│   ├── src/
│   │   ├── __tests__/
│   │   ├── components/
│   │   │   ├── Layout/
│   │   │   ├── Upload/
│   │   │   ├── Preview/
│   │   │   ├── WorkflowBar/
│   │   │   └── __tests__/
│   │   ├── pages/
│   │   │   ├── Home/
│   │   │   ├── gif/
│   │   │   ├── video/
│   │   │   ├── image/
│   │   │   └── __tests__/
│   │   ├── hooks/
│   │   │   ├── useFFmpeg.ts
│   │   │   └── useTheme.ts
│   │   ├── i18n/
│   │   │   ├── zh-TW.json
│   │   │   └── en.json
│   │   ├── utils/
│   │   └── App.tsx
│   ├── e2e/
│   │   ├── gif-tools.spec.ts
│   │   ├── video-tools.spec.ts
│   │   ├── image-tools.spec.ts
│   │   └── workflow.spec.ts
│   └── package.json
├── server/
│   ├── index.ts
│   └── package.json
├── CLAUDE.md
└── README.md
```

## 開發流程

每個功能嚴格按照以下五個階段執行：

### 階段 1：📐 架構設計

角色：系統架構師

- 分析功能需求
- 決定元件結構、資料流、state 管理
- 列出需要新增/修改的檔案清單
- 輸出：簡短的技術方案

### 階段 2：💻 實作

角色：前端工程師

- 依照技術方案寫程式碼
- 遵守專案的 coding style
- 元件要有 TypeScript 型別定義
- 每個函式要有 JSDoc 註解
- 支援 i18n（所有使用者看到的文字都要走語系檔）

### 階段 3：🧪 測試

角色：QA 工程師

- 寫單元測試（Vitest）
- 寫元件測試（React Testing Library）
- 寫 E2E 測試（Playwright）— 如果該功能涉及完整流程
- 執行所有測試，確保 100% 通過
- 如果有失敗，立刻修復後重跑

### 階段 4：🔍 Code Review

角色：資深審查者

- 檢查自己的程式碼：
  - 有無安全問題
  - 有無效能問題（特別是記憶體管理，ffmpeg.wasm 暫存檔要釋放）
  - 有無 accessibility 問題
  - 程式碼是否好讀好維護
- 如果發現問題，修改後回到階段 3 重跑測試

### 階段 5：📦 提交

角色：版控管理者

- git add 相關檔案
- 撰寫 commit message
- 執行 git commit
- 報告本次結果，等待使用者確認後才進入下一個功能

## Commit Message 格式

```
feat(scope): 簡短描述

- 具體變更 1
- 具體變更 2

Tests: X passed, 0 failed
Review: ✅ security / ✅ performance / ✅ a11y
```

## Phase 1 — MVP 功能需求

### 開發順序

```
Phase 1-0: 基礎框架 + 共用元件
Phase 1-1: G1 影片轉 GIF
Phase 1-2: G2 圖片合成 GIF
Phase 1-3: G3 GIF 裁切/調整大小
Phase 1-4: V1 影片裁切（時間）
Phase 1-5: V2 影片裁切（畫面）
Phase 1-6: I1 圖片格式轉換（批次）
Phase 1-7: 工作流串接
```

### Phase 1-0：基礎框架 + 共用元件

1. 專案初始化（Vite + React + TypeScript）
2. 安裝所有依賴
3. 設定 Tailwind CSS
4. 設定 React Router 路由
5. 設定 react-i18next（zh-TW + en 語系檔）
6. 實作 Layout（Header + 主內容區）
   - Header：Logo（文字即可）、工具導航、主題切換按鈕、語系切換按鈕
7. 實作主題切換（淺色預設，可切深色，偏好存 localStorage）
8. 實作首頁（工具卡片選擇頁）
   - 每個工具一張卡片：icon + 名稱 + 簡短描述
   - 卡片 hover 有微動畫
9. 實作 Upload 元件
   - 支援拖拉上傳 + 點擊選檔
   - 檔案大小驗證（超過 50MB 顯示友善錯誤提示）
   - 顯示上傳的檔案名稱和大小
10. 實作 Preview 元件（圖片/GIF/影片 預覽）
11. 實作 WorkflowBar 元件
    - 三個按鈕：下載 / 繼續編輯 / 傳到其他工具
    - 「傳到其他工具」顯示可用工具列表
12. 設定 ffmpeg.wasm
    - useFFmpeg hook 封裝
    - 首次載入顯示進度提示（ffmpeg.wasm ~30MB）
13. 設定 Vitest + React Testing Library + Playwright
14. 設定 .gitignore
15. Node.js 後端：Express 基本設定 + 提供靜態檔案 + CORS/SharedArrayBuffer headers

### Phase 1-1：G1 影片轉 GIF

1. 上傳影片後顯示影片播放器
2. 播放器下方有時間軸，可拖拉選擇起點和終點
3. 右側面板設定：寬度（px）、FPS（5-30，預設 10）、品質（1-100）
4. 即時預覽 GIF 效果（拖拉完自動生成預覽）
5. 按「轉換」生成最終 GIF
6. 生成後顯示 WorkflowBar（下載/繼續編輯/傳到其他工具）

### Phase 1-2：G2 圖片合成 GIF

1. 上傳多張圖片（拖拉或選檔）
2. 可拖拉排序圖片順序
3. 設定每幀延遲（毫秒）
4. 預覽動畫效果
5. 按「生成」輸出 GIF
6. 生成後顯示 WorkflowBar

### Phase 1-3：G3 GIF 裁切/調整大小

1. 上傳 GIF 後顯示預覽
2. 裁切：在預覽上拖拉選擇裁切區域
3. 調整大小：輸入寬/高，可鎖定比例
4. 按「套用」後顯示結果預覽
5. 顯示 WorkflowBar

### Phase 1-4：V1 影片裁切（時間）

1. 上傳影片 → 播放器 + 時間軸
2. 拖拉選擇起點終點
3. 按「裁切」輸出片段
4. 顯示 WorkflowBar

### Phase 1-5：V2 影片裁切（畫面）

1. 上傳影片 → 顯示影片畫面
2. 在畫面上拖拉選擇裁切區域
3. 按「裁切」輸出
4. 顯示 WorkflowBar

### Phase 1-6：I1 圖片格式轉換

1. 支援 PNG ↔ JPG ↔ WebP 互轉
2. 支援批次：一次上傳多張
3. 選擇目標格式
4. 全部轉換
5. 可單獨下載或一鍵全部下載（zip）
6. 每張都可傳到其他工具繼續編輯

### Phase 1-7：工作流串接

1. 確保所有工具的 WorkflowBar 正確運作
2. 「傳到其他工具」→ 選擇工具 → 自動帶入檔案 → 進入該工具頁面
3. 支援連續串接（A → B → C）
4. E2E 測試：影片 → 裁切 → 轉 GIF → 裁切 GIF → 下載

## Phase 2 功能開發

請按照 CLAUDE.md 的五階段流程（架構 → 實作 → 測試 → Review → Commit），依序開發以下功能：

### Phase 2-1：G4 GIF 速度調整

- 上傳 GIF 後預覽原始速度
- 提供速度倍率選擇：0.25x / 0.5x / 1x / 1.5x / 2x / 3x
- 也可自訂每幀延遲（毫秒）
- 按「套用」後顯示結果預覽
- 顯示 WorkflowBar

### Phase 2-2：G5 GIF 壓縮/優化

- 上傳 GIF，顯示原始檔案大小
- 提供壓縮選項：
  - 色彩數量（2-256）
  - 有損壓縮等級（lossy level）
  - 移除每 N 幀（降低幀數）
  - 調整大小（縮小尺寸）
- 即時顯示預估壓縮後大小
- 按「壓縮」後顯示：壓縮前 vs 壓縮後的大小比較
- 顯示 WorkflowBar

### Phase 2-3：V3 影片轉檔（MP4/WebM）

- 上傳影片，顯示原始格式和編碼資訊
- 選擇目標格式：MP4 / WebM
- 進階選項（可收合）：
  - 視訊編碼：H.264 / VP9
  - 音訊編碼：AAC / Opus
  - 畫質（CRF 值）
  - 解析度
- 顯示轉檔進度條
- 顯示 WorkflowBar

### Phase 2-4：V4 影片截圖

- 上傳影片，顯示播放器
- 播放到想要的畫面，按「截圖」擷取當前幀
- 也可在時間軸上點選特定時間點
- 輸出格式選擇：PNG / JPG
- 支援連續截圖（截多張）
- 每張截圖都可單獨下載或傳到其他工具

### Phase 2-5：V5 影片調整大小

- 上傳影片，顯示原始解析度
- 提供預設選項：1080p / 720p / 480p / 自訂
- 可鎖定/解鎖比例
- 預覽調整後的畫面
- 顯示 WorkflowBar

### Phase 2-6：I2 APNG / WebP 動圖支援

- 圖片格式轉換工具擴充：新增 APNG 和 WebP 動圖格式
- 支援：
  - GIF → APNG
  - GIF → WebP（動圖）
  - APNG → GIF
  - WebP（動圖）→ GIF
  - APNG ↔ WebP
- 上傳動圖後可預覽動畫
- 支援批次轉換
- 顯示 WorkflowBar

### 開發順序與 Commit

Phase 2-1: GIF 速度調整 → "feat(gif): GIF speed adjustment"
Phase 2-2: GIF 壓縮優化 → "feat(gif): GIF compression and optimization"
Phase 2-3: 影片轉檔 → "feat(video): video format converter"
Phase 2-4: 影片截圖 → "feat(video): video screenshot capture"
Phase 2-5: 影片調整大小 → "feat(video): video resize tool"
Phase 2-6: APNG/WebP 動圖 → "feat(image): APNG and WebP animated image support"

## Phase 3 功能開發

請按照 CLAUDE.md 的五階段流程（架構 → 實作 → 測試 → Review → Commit），依序開發以下功能：

### Phase 3-0：動圖幀編輯器（Frame Editor）

- 支援上傳 GIF / APNG / WebP 動圖
- 上傳後解析出所有幀，以 grid 縮圖排列顯示
- 每張幀顯示：縮圖、幀編號、目前延遲時間（ms）

#### 幀操作

- 選取：點擊單張選取，Shift+點擊範圍選取，Ctrl+點擊多選
- 刪除：選取後按刪除，即時更新 grid
- 排序：拖拉調整幀順序
- 複製：選取幀 → 複製到指定位置（可做停格效果）
- 反轉：一鍵反轉所有幀順序

#### 幀設定

- 全域設定：
  - 統一延遲時間（ms）
  - 速度倍率（0.25x / 0.5x / 1x / 1.5x / 2x / 3x）
  - 循環次數（無限 / 自訂次數）
- 單幀設定：
  - 選取特定幀，單獨調整該幀延遲時間
  - 用途：某些幀想停久一點（例如表情包的最後一幀）

#### 輸出設定

- 輸出格式選擇：GIF / APNG / WebP
- 輸出尺寸：維持原尺寸 / 自訂寬高

#### 預覽

- 右側或下方有動畫預覽區
- 即時播放編輯後的效果
- 播放/暫停/逐幀控制

#### 其他

- 顯示總幀數、預估檔案大小
- 按「生成」輸出新動圖
- 顯示 WorkflowBar

### Phase 3-1：G6 GIF 加文字

- 上傳 GIF 後預覽
- 文字編輯面板：
  - 輸入文字內容
  - 字型選擇（提供 5-8 種 Google Fonts，含中文字型）
  - 字體大小、顏色、描邊顏色、描邊粗細
  - 粗體 / 斜體
  - 文字位置：拖拉定位或選擇預設位置（上/中/下 × 左/中/右）
  - 文字陰影（可開關）
- 支援多組文字（可加多個文字框）
- 可設定文字出現的幀範圍（例如只在第 5-15 幀顯示）
- 按「套用」後顯示結果預覽
- 顯示 WorkflowBar

### Phase 3-2：V6 影片加濾鏡

- 上傳影片後預覽
- 提供濾鏡選項：
  - 亮度（brightness）
  - 對比度（contrast）
  - 飽和度（saturation）
  - 灰階（grayscale）
  - 復古（sepia）
  - 模糊（blur）
  - 銳化（sharpen）
  - 反轉色（invert）
- 每個濾鏡有 slider 可調整程度
- 可同時套用多個濾鏡
- 按「套用」後顯示結果預覽
- 顯示 WorkflowBar

### Phase 3-3：I3 圖片壓縮

- 上傳圖片（支援 PNG / JPG / WebP），顯示原始檔案大小和解析度
- 壓縮選項：
  - 品質 slider（1-100）
  - 最大寬度/高度（自動等比縮放）
  - 輸出格式選擇（維持原格式或轉換）
- 即時顯示預估壓縮後大小
- 按「壓縮」後顯示：
  - 壓縮前 vs 壓縮後的大小比較（含壓縮率百分比）
  - 前後對比預覽
- 支援批次壓縮
- 顯示 WorkflowBar

### 開發順序與 Commit

Phase 3-0: 動圖幀編輯器 → "feat(gif): animated image frame editor with grid view"
Phase 3-1: GIF 加文字 → "feat(gif): GIF text overlay with multi-text support"
Phase 3-2: 影片加濾鏡 → "feat(video): video filters with adjustable parameters"
Phase 3-3: 圖片壓縮 → "feat(image): batch image compression with preview"

### 完成後

1. 每個功能完成五階段後報告結果，進行 playwright E2E 測試後，等我確認才進入下一個
2. Phase 3 全部完成後，執行所有測試（Phase 1 + 2 + 3），確保 100% 通過
3. 全部通過後，更新 README.md：
   - 專案介紹
   - 功能列表（標註完成狀態）
   - 技術棧
   - 本地開發指令（install / dev / test / build）
   - 部署說明（Vercel）
   - 螢幕截圖區塊（之後補圖）
4. Commit: "docs: update README with full feature list and setup guide"

## UI/UX 設計要求

- 風格：現代、活潑可愛、圓角、有微動畫
- 配色：主色用亮色系（可愛感），淺色主題為預設
- 首頁：工具以卡片形式呈現，hover 有放大/陰影動畫
- 轉場：頁面切換有淡入效果
- Loading：處理中顯示進度條 + 百分比
- 錯誤：檔案太大、格式不支援等要有友善提示（toast 通知）
- RWD：桌面和手機都能正常使用

## Coding Style

- 元件用 function component + hooks
- 檔案命名：PascalCase（元件）、camelCase（工具函式）
- 一個元件一個檔案
- hooks 放 hooks/，以 use 開頭
- 所有 UI 文字走 i18n，禁止 hardcode
- 使用 Tailwind CSS，不寫自訂 CSS（除非必要）

## ⚠️ 重要注意事項

- 所有檔案處理在瀏覽器端完成（ffmpeg.wasm），不上傳伺服器
- ffmpeg.wasm 需要 SharedArrayBuffer，server 必須設定正確的 CORS headers：
  - Cross-Origin-Embedder-Policy: require-corp
  - Cross-Origin-Opener-Policy: same-origin
- ffmpeg.wasm 初次載入約 30MB，必須有載入進度提示
- 處理完的暫存檔要及時呼叫 ffmpeg.FS('unlink') 釋放記憶體
- 大檔案處理時要顯示進度，不能讓使用者以為當機
- 每個功能完成五階段後報告結果，等我確認才進入下一個。Phase 2 全部完成後，執行所有測試（包含 Phase 1），確保 100% 通過。
