/** Reject the selected response when the provider explicitly reports a failed generation. */
export function assertCompleteAIResponse(response, provider) {
  const reason = provider === 'claude'
    ? response?.stop_reason
    : provider === 'gemini'
      ? response?.candidates?.[0]?.finishReason
      : response?.choices?.[0]?.finish_reason;
  if (['length', 'max_tokens', 'MAX_TOKENS', 'CONTINUATION', 'model_context_window_exceeded'].includes(reason)) {
    const error = new Error('The AI response was truncated by the model output limit.');
    error.code = 'AI_RESPONSE_TRUNCATED';
    throw error;
  }
  const refusal = provider === 'gemini'
    ? ['SAFETY', 'OTHER', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'IMAGE_SAFETY'].includes(response?.promptFeedback?.blockReason) ||
      ['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY', 'IMAGE_PROHIBITED_CONTENT', 'IMAGE_RECITATION', 'ESCALATION', 'PUP_LIMITED_DISABLED'].includes(reason)
    : reason === 'refusal' || reason === 'content_filter' || Boolean(response?.choices?.[0]?.message?.refusal);
  if (refusal) {
    const error = new Error('The AI provider declined to produce the requested response.');
    error.code = 'AI_RESPONSE_REFUSED';
    throw error;
  }
  const incomplete = provider === 'gemini'
    ? ['LANGUAGE', 'OTHER', 'MALFORMED_FUNCTION_CALL', 'IMAGE_OTHER', 'NO_IMAGE', 'UNEXPECTED_TOOL_CALL', 'TOO_MANY_TOOL_CALLS', 'MISSING_THOUGHT_SIGNATURE', 'MALFORMED_RESPONSE'].includes(reason)
    : provider === 'deepseek' && ['aborted', 'insufficient_system_resource'].includes(reason);
  if (incomplete) {
    const error = new Error('The AI provider stopped before completing the requested response.');
    error.code = 'AI_RESPONSE_INCOMPLETE';
    throw error;
  }
}

/** These provider results cannot be replaced by untranslated or partial content. */
export function isTerminalAIResponseError(error) {
  return ['AI_RESPONSE_TRUNCATED', 'AI_RESPONSE_REFUSED', 'AI_RESPONSE_INCOMPLETE'].includes(error?.code);
}
