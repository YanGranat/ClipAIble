import { describe, expect, it } from 'vitest';
import { detectVideoPlatform, isVideoPage } from '../../scripts/utils/video.js';

describe('Video URL routing', () => {
  it.each([
    ['https://www.youtube.com/watch?feature=share&v=sample-video', 'youtube', 'sample-video'],
    ['https://m.youtube.com/watch?v=sample-video', 'youtube', 'sample-video'],
    ['https://www.youtube.com/shorts/sample-video', 'youtube', 'sample-video'],
    ['https://www.youtube.com/embed/sample-video', 'youtube', 'sample-video'],
    ['https://www.youtube.com/live/sample-video', 'youtube', 'sample-video'],
    ['https://youtu.be/sample-video?t=10', 'youtube', 'sample-video'],
    ['https://vimeo.com/123456789/private-token', 'vimeo', '123456789']
  ])('routes the supported video URL %s', (url, platform, videoId) => {
    expect(detectVideoPlatform(url)).toEqual({ platform, videoId });
    expect(isVideoPage(url)).toBe(true);
  });

  it.each([
    'https://www.youtube.com/results?search_query=sample',
    'https://www.youtube.com/channel/sample-channel',
    'https://www.youtube.com/@sample-channel/videos',
    'https://www.youtube.com/playlist?list=sample-list',
    'https://www.youtube.com/watch?feature=share',
    'https://www.youtube.com/shorts/',
    'https://www.youtube.com/watch?v=bad%2Fidentifier',
    'https://www.youtube.com.evil.example/watch?v=sample-video',
    'https://example.com/youtube.com/watch?v=sample-video',
    'https://youtu.be/',
    'https://vimeo.com/123abc',
    'file:///youtube.com/watch?v=sample-video',
    'invalid', '', null
  ])('keeps a non-video URL on the article route: %s', url => {
    expect(detectVideoPlatform(url)).toBeNull();
    expect(isVideoPage(url)).toBe(false);
  });
});
