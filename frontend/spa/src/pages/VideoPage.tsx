import { MpaTabPage } from '@/components/MpaTabPage';

/** Production video.html — reels player and cream top tabs. */
export function VideoPage() {
  return (
    <MpaTabPage htmlPath="/video.html" routePrefix="/video" title="Video" remountOnSearch />
  );
}
