import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { FFmpegProvider } from './hooks/useFFmpeg';
import { Layout } from './components/Layout/Layout';
import { Home } from './pages/Home/Home';
import { VideoToGif } from './pages/gif/VideoToGif';
import { ImagesToGif } from './pages/gif/ImagesToGif';
import { GifEditor } from './pages/gif/GifEditor';
import { VideoEditor } from './pages/video/VideoEditor';
import { VideoConvert } from './pages/video/VideoConvert';
import { ImageConvert } from './pages/image/ImageConvert';
import { AnimatedImageConvert } from './pages/image/AnimatedImageConvert';
import { FrameEditor } from './pages/gif/FrameEditor';
import { ImageCompress } from './pages/image/ImageCompress';

/**
 * Root application component with routing.
 * Unimplemented tool routes redirect to the home page.
 */
export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <FFmpegProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/gif/video-to-gif" element={<VideoToGif />} />
          <Route path="/gif/images-to-gif" element={<ImagesToGif />} />
          <Route path="/gif/editor" element={<GifEditor />} />
          {/* Redirects from old GIF tool paths */}
          <Route path="/gif/crop-resize" element={<Navigate to="/gif/editor" state={{ tab: 'crop' }} replace />} />
          <Route path="/gif/speed" element={<Navigate to="/gif/editor" state={{ tab: 'speed' }} replace />} />
          <Route path="/gif/compress" element={<Navigate to="/gif/editor" state={{ tab: 'compress' }} replace />} />
          <Route path="/gif/text-overlay" element={<Navigate to="/gif/editor" state={{ tab: 'text' }} replace />} />
          <Route path="/video/editor" element={<VideoEditor />} />
          {/* Redirects from old video tool paths */}
          <Route path="/video/trim" element={<Navigate to="/video/editor" state={{ tab: 'trim' }} replace />} />
          <Route path="/video/crop" element={<Navigate to="/video/editor" state={{ tab: 'crop' }} replace />} />
          <Route path="/video/resize" element={<Navigate to="/video/editor" state={{ tab: 'resize' }} replace />} />
          <Route path="/video/filter" element={<Navigate to="/video/editor" state={{ tab: 'filter' }} replace />} />
          <Route path="/video/convert" element={<VideoConvert />} />
          <Route path="/image/convert" element={<ImageConvert />} />
          <Route path="/image/animated-convert" element={<AnimatedImageConvert />} />
          <Route path="/gif/frame-editor" element={<FrameEditor />} />
          <Route path="/image/compress" element={<ImageCompress />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      </FFmpegProvider>
    </BrowserRouter>
  );
}
