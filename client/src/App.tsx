import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout/Layout';
import { Home } from './pages/Home/Home';
import { VideoToGif } from './pages/gif/VideoToGif';
import { ImagesToGif } from './pages/gif/ImagesToGif';
import { GifCropResize } from './pages/gif/GifCropResize';
import { VideoTrim } from './pages/video/VideoTrim';

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
          <Route path="/video/trim" element={<VideoTrim />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
