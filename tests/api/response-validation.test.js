import { describe, expect, it } from 'vitest';
import { assertCompleteAIResponse } from '../../scripts/api/response-validation.js';

describe('AI response completion', () => {
  it.each(['openai', 'grok', 'openrouter', 'deepseek'])('rejects reported truncation from %s', provider => {
    expect(() => assertCompleteAIResponse({ choices: [{ finish_reason: 'length' }] }, provider)).toThrow(/truncated/);
    expect(() => assertCompleteAIResponse({ choices: [{ finish_reason: 'stop' }, { finish_reason: 'length' }] }, provider)).not.toThrow();
  });
  it('checks the selected Anthropic response', () => {
    expect(() => assertCompleteAIResponse({ stop_reason: 'max_tokens' }, 'claude')).toThrow(/truncated/);
    expect(() => assertCompleteAIResponse({ stop_reason: 'model_context_window_exceeded' }, 'claude')).toThrow(/truncated/);
    expect(() => assertCompleteAIResponse({ stop_reason: 'end_turn' }, 'claude')).not.toThrow();
  });
  it('rejects a refusal even when a text block is present', () => {
    expect(() => assertCompleteAIResponse({ stop_reason: 'refusal', content: [{ type: 'text', text: 'Partial answer' }] }, 'claude')).toThrow(/declined/);
    try { assertCompleteAIResponse({ stop_reason: 'refusal' }, 'claude'); }
    catch (error) { expect(error.code).toBe('AI_RESPONSE_REFUSED'); }
  });
  it('checks only the selected Gemini candidate', () => {
    expect(() => assertCompleteAIResponse({ candidates: [{ finishReason: 'MAX_TOKENS' }] }, 'gemini')).toThrow(/truncated/);
    expect(() => assertCompleteAIResponse({ candidates: [{ finishReason: 'CONTINUATION' }] }, 'gemini')).toThrow(/truncated/);
    expect(() => assertCompleteAIResponse({ candidates: [{ finishReason: 'STOP' }, { finishReason: 'MAX_TOKENS' }] }, 'gemini')).not.toThrow();
  });
  it('does not invent a completion status for responses without one', () => {
    expect(() => assertCompleteAIResponse({}, 'openai')).not.toThrow();
  });
  it.each(['openai', 'deepseek', 'grok', 'openrouter'])('rejects filtered text from the selected %s choice only', provider => {
    expect(() => assertCompleteAIResponse({ choices: [{ finish_reason: 'content_filter', message: { content: 'Partial answer' } }] }, provider)).toThrow(/declined/);
    expect(() => assertCompleteAIResponse({ choices: [{ finish_reason: 'stop' }, { finish_reason: 'content_filter' }] }, provider)).not.toThrow();
    expect(() => assertCompleteAIResponse({ choices: [{ finish_reason: 'stop', message: { refusal: 'Refusal reported by provider' } }] }, provider)).toThrow(/declined/);
    expect(() => assertCompleteAIResponse({ choices: [{ finish_reason: 'stop' }, { message: { refusal: 'Unused choice refusal' } }] }, provider)).not.toThrow();
  });
  it.each(['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY', 'IMAGE_PROHIBITED_CONTENT', 'IMAGE_RECITATION', 'ESCALATION', 'PUP_LIMITED_DISABLED'])('rejects selected Gemini %s content', finishReason => {
    expect(() => assertCompleteAIResponse({ candidates: [{ finishReason, content: { parts: [{ text: 'Partial answer' }] } }] }, 'gemini')).toThrow(/declined/);
    expect(() => assertCompleteAIResponse({ candidates: [{ finishReason: 'STOP' }, { finishReason }] }, 'gemini')).not.toThrow();
  });
  it.each(['aborted', 'insufficient_system_resource'])('rejects DeepSeek %s interruption', finish_reason => {
    expect(() => assertCompleteAIResponse({ choices: [{ finish_reason, message: { content: 'Partial answer' } }] }, 'deepseek')).toThrow(/before completing/);
  });
  it.each(['LANGUAGE', 'OTHER', 'MALFORMED_FUNCTION_CALL', 'IMAGE_OTHER', 'NO_IMAGE', 'UNEXPECTED_TOOL_CALL', 'TOO_MANY_TOOL_CALLS', 'MISSING_THOUGHT_SIGNATURE', 'MALFORMED_RESPONSE'])('rejects selected Gemini %s failure', finishReason => {
    expect(() => assertCompleteAIResponse({ candidates: [{ finishReason }] }, 'gemini')).toThrow(/before completing/);
  });
  it.each(['SAFETY', 'OTHER', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'IMAGE_SAFETY'])('rejects prompt-level Gemini %s blocks without candidates', blockReason => {
    expect(() => assertCompleteAIResponse({ promptFeedback: { blockReason }, candidates: [] }, 'gemini')).toThrow(/declined/);
    expect(() => assertCompleteAIResponse({ promptFeedback: { blockReason: 'BLOCK_REASON_UNSPECIFIED' }, candidates: [{ finishReason: 'STOP' }] }, 'gemini')).not.toThrow();
  });
});
