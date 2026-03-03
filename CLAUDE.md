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
