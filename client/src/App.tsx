import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout/Layout';
import { Home } from './pages/Home/Home';
import { VideoToGif } from './pages/gif/VideoToGif';
import { ImagesToGif } from './pages/gif/ImagesToGif';
import { GifCropResize } from './pages/gif/GifCropResize';
import { GifSpeed } from './pages/gif/GifSpeed';
import { GifCompress } from './pages/gif/GifCompress';
import { VideoTrim } from './pages/video/VideoTrim';
import { VideoCrop } from './pages/video/VideoCrop';
import { VideoConvert } from './pages/video/VideoConvert';
import { VideoScreenshot } from './pages/video/VideoScreenshot';
import { VideoResize } from './pages/video/VideoResize';
import { ImageConvert } from './pages/image/ImageConvert';
import { AnimatedImageConvert } from './pages/image/AnimatedImageConvert';
import { FrameEditor } from './pages/gif/FrameEditor';
import { GifTextOverlay } from './pages/gif/GifTextOverlay';
import { VideoFilter } from './pages/video/VideoFilter';
import { ImageCompress } from './pages/image/ImageCompress';

/**
 * Root application component with routing.
 * Unimplemented tool routes redirect to the home page.
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/gif/video-to-gif" element={<VideoToGif />} />
          <Route path="/gif/images-to-gif" element={<ImagesToGif />} />
          <Route path="/gif/crop-resize" element={<GifCropResize />} />
          <Route path="/gif/speed" element={<GifSpeed />} />
          <Route path="/gif/compress" element={<GifCompress />} />
          <Route path="/video/trim" element={<VideoTrim />} />
          <Route path="/video/crop" element={<VideoCrop />} />
          <Route path="/video/convert" element={<VideoConvert />} />
          <Route path="/video/screenshot" element={<VideoScreenshot />} />
          <Route path="/video/resize" element={<VideoResize />} />
          <Route path="/image/convert" element={<ImageConvert />} />
          <Route path="/image/animated-convert" element={<AnimatedImageConvert />} />
          <Route path="/gif/frame-editor" element={<FrameEditor />} />
          <Route path="/gif/text-overlay" element={<GifTextOverlay />} />
          <Route path="/video/filter" element={<VideoFilter />} />
          <Route path="/image/compress" element={<ImageCompress />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
