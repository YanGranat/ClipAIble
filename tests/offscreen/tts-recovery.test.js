import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../scripts/utils/logging.js', ()=>({log:vi.fn(),logWarn:vi.fn(),logError:vi.fn(),logDebug:vi.fn(),criticalLog:vi.fn()}));
import {state} from '../../scripts/offscreen/state.js';
import {handleVoiceSwitching} from '../../scripts/offscreen/tts/voice-switching.js';
beforeEach(()=>state.reset());afterEach(()=>state.reset());

it('replaces the previous model worker before another voice is synthesized',async()=>{
  const previous={terminate:vi.fn()};state.setTTSWorker(previous);state.setLastUsedVoiceId('en_US-lessac-medium');state.setProcessingRunId('active-run');
  const replacement={terminate:vi.fn()};
  const initTTSWorker=vi.fn(async()=>{state.setTTSWorker(replacement);return replacement;});
  await handleVoiceSwitching({newVoiceId:'en_US-ljspeech-medium',messageId:'request',state,tts:{},initTTSWorker,initPiperTTS:async()=>({})});
  expect(previous.terminate).toHaveBeenCalledOnce();expect(initTTSWorker).toHaveBeenCalledOnce();
  expect(state.getTTSWorker()).toBe(replacement);expect(state.getProcessingRunId()).toBe('active-run');
});

it('does not retire a replacement when an earlier worker reports an error',()=>{
  const old={terminate:vi.fn()},replacement={terminate:vi.fn()};state.setTTSWorker(replacement);state.setProcessingRunId('new-run');
  expect(state.retireTTSWorker(old)).toBe(false);
  expect(state.getTTSWorker()).toBe(replacement);expect(replacement.terminate).not.toHaveBeenCalled();expect(state.getProcessingRunId()).toBe('new-run');
});
