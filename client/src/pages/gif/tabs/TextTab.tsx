import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchFile } from '@ffmpeg/util';
import type { GifTabProps } from './SpeedTab';
import { FONTS, GOOGLE_FONTS_URL, loadFont, type FontDef } from '../../../utils/fonts';

/** Text box configuration */
interface TextBoxConfig {
  id: string;
  text: string;
  fontId: string;
  fontSize: number;
  textColor: string;
  strokeWidth: number;
  strokeColor: string;
  bold: boolean;
  italic: boolean;
  shadow: boolean;
  shadowColor: string;
  x: number;
  y: number;
  frameRange: 'all' | 'custom';
  frameStart: number;
  frameEnd: number;
}

/** Preset position definitions */
const PRESET_POSITIONS = [
  { key: 'posTopLeft', getPos: () => ({ x: 10, y: 10 }) },
  { key: 'posTopCenter', getPos: (w: number, tw: number) => ({ x: Math.round((w - tw) / 2), y: 10 }) },
  { key: 'posTopRight', getPos: (w: number, tw: number) => ({ x: w - tw - 10, y: 10 }) },
  { key: 'posMiddleLeft', getPos: (_w: number, _tw: number, _h: number, th: number) => ({ x: 10, y: Math.round((_h - th) / 2) }) },
  { key: 'posMiddleCenter', getPos: (w: number, tw: number, h: number, th: number) => ({ x: Math.round((w - tw) / 2), y: Math.round((h - th) / 2) }) },
  { key: 'posMiddleRight', getPos: (w: number, tw: number, h: number, th: number) => ({ x: w - tw - 10, y: Math.round((h - th) / 2) }) },
  { key: 'posBottomLeft', getPos: (_w: number, _tw: number, h: number, th: number) => ({ x: 10, y: h - th - 10 }) },
  { key: 'posBottomCenter', getPos: (w: number, tw: number, h: number, th: number) => ({ x: Math.round((w - tw) / 2), y: h - th - 10 }) },
  { key: 'posBottomRight', getPos: (w: number, tw: number, h: number, th: number) => ({ x: w - tw - 10, y: h - th - 10 }) },
] as const;

/** Unique ID counter for text boxes */
let textBoxIdCounter = 0;

/** Generate a unique text box ID */
function nextTextBoxId(): string {
  return `tb-${++textBoxIdCounter}`;
}

/** Create a default text box configuration */
function createDefaultTextBox(imgWidth: number): TextBoxConfig {
  return {
    id: nextTextBoxId(),
    text: '',
    fontId: 'roboto',
    fontSize: Math.max(16, Math.round(imgWidth / 10)),
    textColor: '#ffffff',
    strokeWidth: 2,
    strokeColor: '#000000',
    bold: false,
    italic: false,
    shadow: true,
    shadowColor: '#000000',
    x: 10,
    y: 10,
    frameRange: 'all',
    frameStart: 0,
    frameEnd: 0,
  };
}

/** Get the font family string from a font ID */
function getFontFamily(fontId: string): string {
  const font = FONTS.find((f) => f.id === fontId);
  return font ? font.family : 'sans-serif';
}

/** Get the CSS fallback category from a font ID */
function getFontCategory(fontId: string): string {
  const font = FONTS.find((f) => f.id === fontId);
  return font ? font.category : 'sans-serif';
}

/** Build a CSS font shorthand string */
function buildFontStr(box: TextBoxConfig): string {
  const italic = box.italic ? 'italic ' : '';
  const bold = box.bold ? 'bold ' : '';
  return `${italic}${bold}${box.fontSize}px "${getFontFamily(box.fontId)}", ${getFontCategory(box.fontId)}`;
}

/**
 * Text Overlay tab for the GIF Editor.
 * Provides draggable text boxes with font/color/shadow/stroke settings.
 * Uses Canvas API for rendering (ffmpeg.wasm drawtext doesn't support custom fonts).
 */
export function TextTab({
  gifFile,
  gifUrl,
  imageWidth,
  imageHeight,
  ffmpeg,
  ffmpegLoaded,
  isProcessing,
  onProcessStart,
  onProcessProgress,
  onProcessComplete,
  onProcessError,
}: GifTabProps) {
  const { t } = useTranslation();
  const abortRef = useRef(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  const dragRef = useRef<{
    active: boolean;
    boxId: string;
    startMouseX: number;
    startMouseY: number;
    startBoxX: number;
    startBoxY: number;
  }>({ active: false, boxId: '', startMouseX: 0, startMouseY: 0, startBoxX: 0, startBoxY: 0 });

  const [totalFrames, setTotalFrames] = useState(0);
  const [textBoxes, setTextBoxes] = useState<TextBoxConfig[]>([]);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [fontsInjected, setFontsInjected] = useState(false);

  /** Abort on unmount */
  useEffect(() => {
    return () => { abortRef.current = true; };
  }, []);

  /** Inject Google Fonts <link> on mount */
  useEffect(() => {
    if (fontsInjected) return;
    const existing = document.querySelector(`link[href="${GOOGLE_FONTS_URL}"]`);
    if (!existing) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = GOOGLE_FONTS_URL;
      document.head.appendChild(link);
    }
    setFontsInjected(true);
  }, [fontsInjected]);

  /** Probe total frame count from the GIF using ffmpeg log parsing */
  useEffect(() => {
    if (!gifFile || !ffmpegLoaded || imageWidth === 0) return;

    let cancelled = false;

    const probeFrames = async () => {
      try {
        const inputName = 'probe_input.gif';
        await ffmpeg.writeFile(inputName, await fetchFile(gifFile));
        if (cancelled) return;

        const logLines: string[] = [];
        const onLog = ({ message }: { message: string }) => {
          logLines.push(message);
        };
        ffmpeg.on('log', onLog);

        await ffmpeg.exec(['-i', inputName, '-f', 'null', '-threads', '1', '-']);
        ffmpeg.off('log', onLog);

        if (cancelled) return;

        let count = 0;
        for (const line of logLines) {
          const match = line.match(/frame=\s*(\d+)/);
          if (match) {
            count = Math.max(count, parseInt(match[1], 10));
          }
        }

        if (!cancelled) {
          setTotalFrames(count);
        }

        try { await ffmpeg.deleteFile(inputName); } catch { /* ignore */ }
      } catch (err) {
        console.error('Frame probe failed:', err);
      }
    };

    probeFrames();

    return () => {
      cancelled = true;
    };
  }, [gifFile, ffmpegLoaded, ffmpeg, imageWidth]);

  /** Add a new text box */
  const handleAddTextBox = useCallback(() => {
    const box = createDefaultTextBox(imageWidth);
    box.frameEnd = Math.max(0, totalFrames - 1);
    setTextBoxes((prev) => [...prev, box]);
    setSelectedBoxId(box.id);
  }, [imageWidth, totalFrames]);

  /** Update a text box field */
  const updateTextBox = useCallback((id: string, updates: Partial<TextBoxConfig>) => {
    setTextBoxes((prev) =>
      prev.map((box) => (box.id === id ? { ...box, ...updates } : box)),
    );
  }, []);

  /** Remove a text box */
  const handleRemoveTextBox = useCallback((id: string) => {
    setTextBoxes((prev) => prev.filter((box) => box.id !== id));
    setSelectedBoxId((prev) => (prev === id ? null : prev));
  }, []);

  /** Apply a preset position to the selected text box */
  const handlePresetPosition = useCallback(
    (presetIndex: number) => {
      if (!selectedBoxId) return;
      const box = textBoxes.find((b) => b.id === selectedBoxId);
      if (!box) return;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.font = buildFontStr(box);
      const metrics = ctx.measureText(box.text || 'Text');
      const textW = Math.ceil(metrics.width);
      const textH = box.fontSize;

      const preset = PRESET_POSITIONS[presetIndex];
      const pos = preset.getPos(imageWidth, textW, imageHeight, textH);
      updateTextBox(selectedBoxId, {
        x: Math.max(0, Math.min(pos.x, imageWidth - 10)),
        y: Math.max(0, Math.min(pos.y, imageHeight - 10)),
      });
    },
    [selectedBoxId, textBoxes, imageWidth, imageHeight, updateTextBox],
  );

  // --- Drag logic ---

  /** Convert client coordinates to image-space coordinates */
  const toImageCoords = useCallback(
    (clientX: number, clientY: number) => {
      const rect = overlayRef.current!.getBoundingClientRect();
      const scaleX = imageWidth / rect.width;
      const scaleY = imageHeight / rect.height;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      };
    },
    [imageWidth, imageHeight],
  );

  /** Handle mouse move during drag */
  const handleDragMove = useCallback(
    (e: MouseEvent) => {
      const state = dragRef.current;
      if (!state.active) return;

      const { x: imgX, y: imgY } = toImageCoords(e.clientX, e.clientY);
      const dx = imgX - state.startMouseX;
      const dy = imgY - state.startMouseY;

      const newX = Math.max(0, Math.min(state.startBoxX + dx, imageWidth - 10));
      const newY = Math.max(0, Math.min(state.startBoxY + dy, imageHeight - 10));

      updateTextBox(state.boxId, { x: Math.round(newX), y: Math.round(newY) });
    },
    [toImageCoords, imageWidth, imageHeight, updateTextBox],
  );

  /** Handle mouse up after drag */
  const handleDragEnd = useCallback(() => {
    dragRef.current.active = false;
    window.removeEventListener('mousemove', handleDragMove);
    window.removeEventListener('mouseup', handleDragEnd);
  }, [handleDragMove]);

  /** Start dragging a text box on the overlay */
  const handleTextDragStart = useCallback(
    (boxId: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setSelectedBoxId(boxId);

      const box = textBoxes.find((b) => b.id === boxId);
      if (!box) return;

      const { x: imgX, y: imgY } = toImageCoords(e.clientX, e.clientY);

      dragRef.current = {
        active: true,
        boxId,
        startMouseX: imgX,
        startMouseY: imgY,
        startBoxX: box.x,
        startBoxY: box.y,
      };

      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('mouseup', handleDragEnd);
    },
    [textBoxes, toImageCoords, handleDragMove, handleDragEnd],
  );

  /** Clean up window listeners on unmount */
  useEffect(() => {
    return () => {
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
    };
  }, [handleDragMove, handleDragEnd]);

  /**
   * Apply text overlays: extract frames → canvas render → reassemble as GIF.
   */
  const handleApply = useCallback(async () => {
    if (!gifFile || !ffmpegLoaded || textBoxes.length === 0) return;

    abortRef.current = false;
    onProcessStart();

    try {
      const inputName = 'text_input.gif';
      await ffmpeg.writeFile(inputName, await fetchFile(gifFile));
      if (abortRef.current) return;

      // Probe timing
      const logLines: string[] = [];
      const onLog = ({ message }: { message: string }) => {
        logLines.push(message);
      };
      ffmpeg.on('log', onLog);

      await ffmpeg.exec(['-i', inputName, '-f', 'null', '-threads', '1', '-']);
      ffmpeg.off('log', onLog);
      if (abortRef.current) return;

      const ptsTimes: number[] = [];
      for (const line of logLines) {
        const match = line.match(/pts_time[=:]\s*([\d.]+)/);
        if (match) {
          ptsTimes.push(parseFloat(match[1]));
        }
      }

      onProcessProgress(5);

      // Extract frames as PNGs
      const onExtractProgress = ({ progress }: { progress: number }) => {
        onProcessProgress(5 + Math.round(progress * 15));
      };
      ffmpeg.on('progress', onExtractProgress);

      await ffmpeg.exec(['-i', inputName, '-threads', '1', '-y', 'frame_%04d.png']);
      ffmpeg.off('progress', onExtractProgress);
      if (abortRef.current) return;

      onProcessProgress(20);

      // Read frames
      const frameBlobs: Blob[] = [];
      const frameDelays: number[] = [];
      let i = 1;
      while (true) {
        const frameName = `frame_${String(i).padStart(4, '0')}.png`;
        try {
          const data = await ffmpeg.readFile(frameName);
          if (abortRef.current) break;

          frameBlobs.push(new Blob([data], { type: 'image/png' }));

          let delay = 100;
          if (ptsTimes.length >= i + 1) {
            delay = Math.round((ptsTimes[i] - ptsTimes[i - 1]) * 1000);
            if (delay <= 0 || delay > 10000) delay = 100;
          }
          frameDelays.push(delay);

          try { await ffmpeg.deleteFile(frameName); } catch { /* ignore */ }
          i++;
        } catch {
          break;
        }
      }

      try { await ffmpeg.deleteFile(inputName); } catch { /* ignore */ }
      if (abortRef.current || frameBlobs.length === 0) return;

      // Preload font variants
      const fontLoadPromises: Promise<boolean>[] = [];
      for (const box of textBoxes) {
        if (!box.text) continue;
        const font = FONTS.find((f) => f.id === box.fontId);
        if (font) {
          fontLoadPromises.push(loadFont(font.family, box.bold, box.italic));
        }
      }
      await Promise.all(fontLoadPromises);

      // Canvas text rendering per frame
      for (let fi = 0; fi < frameBlobs.length; fi++) {
        if (abortRef.current) return;

        const bitmap = await createImageBitmap(frameBlobs[fi]);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();

        for (const box of textBoxes) {
          if (!box.text) continue;
          if (box.frameRange === 'custom' && (fi < box.frameStart || fi > box.frameEnd)) continue;

          ctx.font = buildFontStr(box);
          ctx.textBaseline = 'top';

          if (box.shadow) {
            ctx.fillStyle = box.shadowColor;
            ctx.fillText(box.text, box.x + 2, box.y + 2);
          }

          if (box.strokeWidth > 0) {
            ctx.strokeStyle = box.strokeColor;
            ctx.lineWidth = box.strokeWidth * 2;
            ctx.lineJoin = 'round';
            ctx.strokeText(box.text, box.x, box.y);
          }

          ctx.fillStyle = box.textColor;
          ctx.fillText(box.text, box.x, box.y);
        }

        const blob = await new Promise<Blob>((resolve) =>
          canvas.toBlob((b) => resolve(b!), 'image/png'),
        );
        const arrayBuf = await blob.arrayBuffer();
        const outName = `out_frame_${String(fi + 1).padStart(4, '0')}.png`;
        await ffmpeg.writeFile(outName, new Uint8Array(arrayBuf));

        onProcessProgress(20 + Math.round(((fi + 1) / frameBlobs.length) * 60));
      }

      if (abortRef.current) return;

      // Reassemble as GIF (two-pass palette)
      let listContent = '';
      for (let fi = 0; fi < frameBlobs.length; fi++) {
        const name = `out_frame_${String(fi + 1).padStart(4, '0')}.png`;
        const durationSec = (frameDelays[fi] / 1000).toFixed(4);
        listContent += `file '${name}'\nduration ${durationSec}\n`;
      }
      const lastName = `out_frame_${String(frameBlobs.length).padStart(4, '0')}.png`;
      listContent += `file '${lastName}'\n`;

      await ffmpeg.writeFile('list.txt', new TextEncoder().encode(listContent));
      if (abortRef.current) return;

      // Pass 1: palettegen
      let ret = await ffmpeg.exec([
        '-f', 'concat', '-safe', '0', '-i', 'list.txt',
        '-vf', 'palettegen=max_colors=256',
        '-threads', '1',
        '-y', 'palette.png',
      ]);
      if (abortRef.current) return;
      if (ret !== 0) throw new Error(`palettegen exited with code ${ret}`);

      // Pass 2: paletteuse
      const onGenProgress = ({ progress }: { progress: number }) => {
        onProcessProgress(80 + Math.round(progress * 20));
      };
      ffmpeg.on('progress', onGenProgress);

      ret = await ffmpeg.exec([
        '-f', 'concat', '-safe', '0', '-i', 'list.txt',
        '-i', 'palette.png',
        '-filter_complex', '[0:v][1:v]paletteuse',
        '-loop', '0',
        '-threads', '1',
        '-filter_threads', '1',
        '-filter_complex_threads', '1',
        '-y', 'output.gif',
      ]);
      ffmpeg.off('progress', onGenProgress);
      if (abortRef.current) return;
      if (ret !== 0) throw new Error(`paletteuse exited with code ${ret}`);

      const outputData = await ffmpeg.readFile('output.gif');
      if (abortRef.current) return;

      onProcessComplete(new Blob([outputData], { type: 'image/gif' }));
    } catch (err) {
      console.error('Processing failed:', err);
      if (!abortRef.current) {
        onProcessError(t('gifTextOverlay.error'));
      }
    } finally {
      // Cleanup temp files
      const cleanupNames = ['list.txt', 'palette.png', 'output.gif', 'text_input.gif'];
      for (const name of cleanupNames) {
        try { await ffmpeg.deleteFile(name); } catch { /* ignore */ }
      }
      for (let ci = 1; ci <= 9999; ci++) {
        const name = `out_frame_${String(ci).padStart(4, '0')}.png`;
        try { await ffmpeg.deleteFile(name); } catch { break; }
      }
    }
  }, [gifFile, ffmpegLoaded, ffmpeg, textBoxes, onProcessStart, onProcessProgress, onProcessComplete, onProcessError, t]);

  return (
    <div className="flex flex-col gap-4">
      {/* GIF info bar */}
      {imageWidth > 0 && (
        <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
          <span>{t('gifTextOverlay.imageSize', { width: imageWidth, height: imageHeight })}</span>
          {totalFrames > 0 && (
            <span>{t('gifTextOverlay.totalFrames', { count: totalFrames })}</span>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column: Preview with text overlays */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          <div
            ref={overlayRef}
            className="relative overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700"
            data-testid="text-overlay-container"
          >
            <img
              src={gifUrl}
              alt=""
              draggable={false}
              className="block h-auto w-full"
            />

            {textBoxes.map((box) => {
              if (!box.text) return null;
              const leftPct = (box.x / imageWidth) * 100;
              const topPct = (box.y / imageHeight) * 100;
              const font = FONTS.find((f) => f.id === box.fontId) as FontDef;
              const isSelected = box.id === selectedBoxId;
              const fontSizePct = (box.fontSize / imageHeight) * 100;

              return (
                <div
                  key={box.id}
                  data-testid="text-overlay-box"
                  className={`absolute cursor-move select-none whitespace-nowrap ${
                    isSelected
                      ? 'ring-2 ring-mint-500 ring-offset-1'
                      : ''
                  }`}
                  style={{
                    left: `${leftPct}%`,
                    top: `${topPct}%`,
                    fontFamily: `"${font.family}", ${font.category}`,
                    fontSize: `${fontSizePct}vh`,
                    fontWeight: box.bold ? 'bold' : 'normal',
                    fontStyle: box.italic ? 'italic' : 'normal',
                    color: box.textColor,
                    WebkitTextStroke: box.strokeWidth > 0
                      ? `${box.strokeWidth}px ${box.strokeColor}`
                      : undefined,
                    textShadow: box.shadow
                      ? `2px 2px 0 ${box.shadowColor}`
                      : undefined,
                    paintOrder: 'stroke fill',
                  }}
                  onMouseDown={(e) => handleTextDragStart(box.id, e)}
                >
                  {box.text}
                </div>
              );
            })}
          </div>

          <p className="text-xs text-gray-400 dark:text-gray-500">
            {t('gifTextOverlay.dragToPosition')}
          </p>
        </div>

        {/* Right column: Settings panel */}
        <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
            {t('gifTextOverlay.settings')}
          </h2>

          {/* Add text button */}
          <button
            onClick={handleAddTextBox}
            disabled={isProcessing}
            className="w-full rounded-xl border-2 border-dashed border-mint-300 px-4 py-2 text-sm font-medium text-mint-600 transition-colors hover:bg-mint-50 disabled:opacity-50 dark:border-mint-700 dark:text-mint-400 dark:hover:bg-mint-950/20"
          >
            + {t('gifTextOverlay.addText')}
          </button>

          {/* Text box list */}
          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
            {textBoxes.map((box, index) => {
              const isActive = box.id === selectedBoxId;

              return (
                <div
                  key={box.id}
                  className={`flex flex-col gap-2 rounded-xl border p-3 transition-colors ${
                    isActive
                      ? 'border-mint-400 bg-mint-50/50 dark:border-mint-600 dark:bg-mint-950/20'
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                  onClick={() => setSelectedBoxId(box.id)}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                      {t('gifTextOverlay.textBoxLabel', { num: index + 1 })}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRemoveTextBox(box.id); }}
                      disabled={isProcessing}
                      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                    >
                      {t('gifTextOverlay.removeText')}
                    </button>
                  </div>

                  {/* Text content */}
                  <div>
                    <label className="mb-0.5 block text-xs text-gray-500 dark:text-gray-400">
                      {t('gifTextOverlay.textContent')}
                    </label>
                    <input
                      type="text"
                      value={box.text}
                      onChange={(e) => updateTextBox(box.id, { text: e.target.value })}
                      placeholder={t('gifTextOverlay.textPlaceholder')}
                      className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>

                  {/* Font + size row */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-0.5 block text-xs text-gray-500 dark:text-gray-400">
                        {t('gifTextOverlay.font')}
                      </label>
                      <select
                        value={box.fontId}
                        onChange={(e) => updateTextBox(box.id, { fontId: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      >
                        {FONTS.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-0.5 block text-xs text-gray-500 dark:text-gray-400">
                        {t('gifTextOverlay.fontSize')}
                      </label>
                      <input
                        type="number"
                        min={8}
                        max={500}
                        value={box.fontSize}
                        onChange={(e) =>
                          updateTextBox(box.id, { fontSize: Math.max(8, Number(e.target.value) || 8) })
                        }
                        className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      />
                    </div>
                  </div>

                  {/* Color row */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-0.5 block text-xs text-gray-500 dark:text-gray-400">
                        {t('gifTextOverlay.textColor')}
                      </label>
                      <input
                        type="color"
                        value={box.textColor}
                        onChange={(e) => updateTextBox(box.id, { textColor: e.target.value })}
                        className="h-8 w-full cursor-pointer rounded-lg border border-gray-300 dark:border-gray-600"
                      />
                    </div>
                    <div>
                      <label className="mb-0.5 block text-xs text-gray-500 dark:text-gray-400">
                        {t('gifTextOverlay.strokeColor')}
                      </label>
                      <input
                        type="color"
                        value={box.strokeColor}
                        onChange={(e) => updateTextBox(box.id, { strokeColor: e.target.value })}
                        className="h-8 w-full cursor-pointer rounded-lg border border-gray-300 dark:border-gray-600"
                      />
                    </div>
                  </div>

                  {/* Stroke width */}
                  <div>
                    <label className="mb-0.5 block text-xs text-gray-500 dark:text-gray-400">
                      {t('gifTextOverlay.strokeWidth')}
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={box.strokeWidth}
                      onChange={(e) =>
                        updateTextBox(box.id, { strokeWidth: Math.max(0, Number(e.target.value) || 0) })
                      }
                      className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>

                  {/* Toggles: bold, italic, shadow */}
                  <div className="flex flex-wrap gap-3">
                    <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={box.bold}
                        onChange={(e) => updateTextBox(box.id, { bold: e.target.checked })}
                        className="rounded"
                      />
                      {t('gifTextOverlay.bold')}
                    </label>
                    <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={box.italic}
                        onChange={(e) => updateTextBox(box.id, { italic: e.target.checked })}
                        className="rounded"
                      />
                      {t('gifTextOverlay.italic')}
                    </label>
                    <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={box.shadow}
                        onChange={(e) => updateTextBox(box.id, { shadow: e.target.checked })}
                        className="rounded"
                      />
                      {t('gifTextOverlay.shadow')}
                    </label>
                  </div>

                  {/* Shadow color (conditional) */}
                  {box.shadow && (
                    <div>
                      <label className="mb-0.5 block text-xs text-gray-500 dark:text-gray-400">
                        {t('gifTextOverlay.shadowColor')}
                      </label>
                      <input
                        type="color"
                        value={box.shadowColor}
                        onChange={(e) => updateTextBox(box.id, { shadowColor: e.target.value })}
                        className="h-8 w-full cursor-pointer rounded-lg border border-gray-300 dark:border-gray-600"
                      />
                    </div>
                  )}

                  {/* Preset positions (3x3 grid) */}
                  <div>
                    <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
                      {t('gifTextOverlay.presetPosition')}
                    </label>
                    <div className="grid grid-cols-3 gap-1">
                      {PRESET_POSITIONS.map((preset, pi) => (
                        <button
                          key={preset.key}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedBoxId(box.id);
                            handlePresetPosition(pi);
                          }}
                          disabled={isProcessing}
                          className="rounded border border-gray-300 px-1 py-0.5 text-[10px] text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
                        >
                          {t(`gifTextOverlay.${preset.key}`)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Frame range */}
                  <div>
                    <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
                      {t('gifTextOverlay.frameRange')}
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); updateTextBox(box.id, { frameRange: 'all' }); }}
                        className={`rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
                          box.frameRange === 'all'
                            ? 'bg-mint-600 text-white'
                            : 'border border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
                        }`}
                      >
                        {t('gifTextOverlay.allFrames')}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); updateTextBox(box.id, { frameRange: 'custom' }); }}
                        className={`rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
                          box.frameRange === 'custom'
                            ? 'bg-mint-600 text-white'
                            : 'border border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
                        }`}
                      >
                        {t('gifTextOverlay.customRange')}
                      </button>
                    </div>
                    {box.frameRange === 'custom' && (
                      <div className="mt-1 flex items-center gap-1">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {t('gifTextOverlay.fromFrame')}
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={Math.max(0, totalFrames - 1)}
                          value={box.frameStart}
                          onChange={(e) =>
                            updateTextBox(box.id, {
                              frameStart: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className="w-16 rounded border border-gray-300 bg-white px-1 py-0.5 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                        />
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {t('gifTextOverlay.toFrame')}
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={Math.max(0, totalFrames - 1)}
                          value={box.frameEnd}
                          onChange={(e) =>
                            updateTextBox(box.id, {
                              frameEnd: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className="w-16 rounded border border-gray-300 bg-white px-1 py-0.5 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                        />
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {t('gifTextOverlay.frameUnit')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Apply button */}
          <div className="mt-2">
            <button
              onClick={handleApply}
              disabled={isProcessing || !ffmpegLoaded || textBoxes.length === 0}
              className="w-full rounded-xl bg-mint-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-mint-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('gifTextOverlay.apply')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
