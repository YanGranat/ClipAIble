import {beforeEach, expect, it, vi} from 'vitest';
vi.mock('../../scripts/utils/logging.js', () => ({log:vi.fn(),logWarn:vi.fn(),logError:vi.fn(),logDebug:vi.fn(),criticalLog:vi.fn()}));
import {state} from '../../scripts/offscreen/state.js';
import {preloadWASMFiles} from '../../scripts/offscreen/tts/preload.js';
beforeEach(()=>state.reset());

it('can prefetch the catalogue without downloading unselected voice models', async()=>{
  const voices=vi.fn(async()=>[]),download=vi.fn(async()=>{});
  await preloadWASMFiles({voices,download,stored:async()=>[]});
  expect(voices).toHaveBeenCalledOnce();
  expect(download).not.toHaveBeenCalled();
});
