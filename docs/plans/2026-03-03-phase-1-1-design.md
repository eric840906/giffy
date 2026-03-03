# Phase 1-1: G1 影片轉 GIF 設計文件

## 概述

實作影片轉 GIF 功能頁面，使用者上傳影片後可選擇時間範圍、設定輸出參數（寬度、FPS、品質），手動觸發預覽或完整轉換，最終透過 WorkflowBar 下載或傳到其他工具。

## 頁面結構

- Upload 元件 (accept="video/*")
- 左側：影片播放器 + TimeRangeSlider
- 右側：GIF 設定面板（寬度、FPS、品質）+ 預覽/轉換按鈕
- 底部：GIF 預覽結果 + WorkflowBar

## 元件設計

### VideoToGif 頁面 (`pages/gif/VideoToGif.tsx`)
- 狀態：videoFile, startTime, endTime, width, fps, quality, outputGif, isConverting, conversionProgress
- 使用 useFFmpeg hook 載入 ffmpeg.wasm
- 預覽按鈕：低解析度快速轉換
- 轉換按鈕：完整品質轉換

### TimeRangeSlider 元件 (`components/TimeRangeSlider/TimeRangeSlider.tsx`)
- 雙滑桿選擇起點和終點
- Props: duration, start, end, onChange
- 顯示格式化時間文字
- 純 HTML range input，無額外依賴

### GIF 設定（內嵌 VideoToGif）
- 寬度：number input，預設 480px
- FPS：range 5-30，預設 10
- 品質：range 1-100，預設 75

## 轉換邏輯

ffmpeg 命令：
```
ffmpeg -i input -ss {start} -t {duration} -vf "fps={fps},scale={width}:-1" output.gif
```

品質映射：UI 1-100 → ffmpeg 品質參數（透過調整 GIF palette 最佳化）

## 資料流

Upload → videoFile → `<video>` 播放
TimeRangeSlider → start/end 時間
設定面板 → width/fps/quality
預覽/轉換 → ffmpeg → outputGif → Preview + WorkflowBar

## 檔案清單

1. `client/src/pages/gif/VideoToGif.tsx`
2. `client/src/components/TimeRangeSlider/TimeRangeSlider.tsx`
3. `client/src/App.tsx` (修改：加入路由)
4. `client/src/i18n/zh-TW.json` (修改：加入翻譯)
5. `client/src/i18n/en.json` (修改：加入翻譯)
6. 對應測試檔案
