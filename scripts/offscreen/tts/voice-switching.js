// @ts-check
import { log } from '../../utils/logging.js';

/** Keep each worker's inference session bound to its selected voice. */
export async function handleVoiceSwitching({ newVoiceId, messageId, state, tts, initTTSWorker }) {
  const previousVoiceId = state.getLastUsedVoiceId();
  const voiceChanged = previousVoiceId !== null && previousVoiceId !== newVoiceId;
  state.setLastUsedVoiceId(newVoiceId);
  if (voiceChanged) {
    const worker = state.getTTSWorker();
    state.retireTTSWorker(worker);
    await initTTSWorker();
  }
  log('[ClipAIble TTS] Voice selected', { messageId, previousVoiceId, newVoiceId, voiceChanged });
  return { voiceChanged, tts };
}
