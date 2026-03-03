# Phase 1-0: 基礎框架 + 共用元件 設計文件

## 概述

建立 Giffy 專案的基礎架構，包含 Vite + React + TypeScript 前端、Express 後端、共用元件（Layout, Upload, Preview, WorkflowBar）、i18n、主題切換、ffmpeg.wasm 整合、測試框架設定。

## 專案結構

```
giffy/
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Layout/
│   │   │   │   ├── Header.tsx
│   │   │   │   └── Layout.tsx
│   │   │   ├── Upload/
│   │   │   │   └── Upload.tsx
│   │   │   ├── Preview/
│   │   │   │   └── Preview.tsx
│   │   │   └── WorkflowBar/
│   │   │       └── WorkflowBar.tsx
│   │   ├── pages/
│   │   │   └── Home/
│   │   │       └── Home.tsx
│   │   ├── hooks/
│   │   │   ├── useFFmpeg.ts
│   │   │   └── useTheme.ts
│   │   ├── i18n/
│   │   │   ├── index.ts
│   │   │   ├── zh-TW.json
│   │   │   └── en.json
│   │   ├── utils/
│   │   │   └── constants.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── e2e/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
├── server/
│   ├── index.ts
│   ├── package.json
│   └── tsconfig.json
├── .gitignore
├── CLAUDE.md
└── README.md
```

## 元件設計

### Layout/Header
- Logo 文字 "Giffy"
- 工具導航（GIF 工具、影片工具、圖片工具）
- 主題切換（sun/moon icon）
- 語系切換（ZH/EN toggle）

### useTheme hook
- localStorage 讀寫 `theme`
- 預設淺色，toggle `dark` class on `<html>`

### Home 首頁
- 6 張工具卡片（icon + 名稱 + 描述）
- hover scale + shadow 動畫

### Upload 元件
- 拖拉上傳 + 點擊選檔
- Props: `accept`, `multiple`, `maxSize` (50MB), `onFileSelect`
- 超過限制顯示 toast 錯誤

### Preview 元件
- 自動偵測：image → `<img>`, video → `<video>`
- Props: `file`, `type?`

### WorkflowBar 元件
- 下載 / 繼續編輯 / 傳到其他工具
- dropdown 可用工具列表
- Props: `file`, `fileName`, `currentTool`

### useFFmpeg hook
- `@ffmpeg/ffmpeg` + `@ffmpeg/util`
- 暴露 `loaded`, `loading`, `progress`, `ffmpeg`, `load()`

## 路由

| 路徑 | 頁面 |
|------|------|
| `/` | Home |
| `/gif/video-to-gif` | G1 影片轉 GIF |
| `/gif/images-to-gif` | G2 圖片合成 GIF |
| `/gif/crop-resize` | G3 GIF 裁切/調整大小 |
| `/video/trim` | V1 影片裁切（時間） |
| `/video/crop` | V2 影片裁切（畫面） |
| `/image/convert` | I1 圖片格式轉換 |

## 資料流

工具間傳檔：React Router state `{ file, fileName }`

## Server

Express + COOP/COEP headers + 靜態檔案服務

## 技術選型

- Tailwind CSS v4
- 獨立 package.json（client/server 各自管理）
