import { tSync } from '../locales.js';

const QUOTA_CODES = new Set([
  'insufficient_quota', 'billing_hard_limit_reached', 'billing_not_active', 'credit_balance_too_low',
  'organization_spend_limit_exceeded'
]);
const PROVIDER_CODES = new Set([
  ...QUOTA_CODES,
  'rate_limit_exceeded', 'rate_limit_error', 'invalid_api_key', 'authentication_error',
  'permission_denied', 'model_not_found', 'context_length_exceeded', 'invalid_request_error',
  'invalid_argument', 'unsupported_parameter', 'unsupported_value', 'resource_exhausted',
  'server_error', 'internal_error', 'overloaded_error', 'service_unavailable'
]);
const REQUEST_PARAMETERS = new Set([
  'model', 'messages', 'max_tokens', 'max_completion_tokens', 'max_output_tokens', 'temperature',
  'response_format', 'reasoning_effort', 'thinking', 'budget_tokens', 'input', 'voice', 'speed',
  'size', 'quality', 'output_format', 'tools', 'n'
]);

export function isApiBoundaryError(error) {
  return Boolean(error?.translationKey || error?.retryable === false || error?.retryExhausted ||
    ['AbortError', 'TimeoutError'].includes(error?.name));
}

/** @param {unknown} code */
export function isApiQuotaCode(code) {
  return typeof code === 'string' && QUOTA_CODES.has(code.toLowerCase());
}

/**
 * Keep actionable machine diagnostics without copying an untrusted response body.
 * @param {Response} response
 * @param {string} [provider]
 */
export async function createApiError(response, provider) {
  let payload;
  try { payload = await (response.clone ? response.clone() : response).json(); } catch {}
  const remote = payload?.error;
  const candidates = [remote?.code, remote?.type, remote?.status, payload?.code];
  const providerCode = candidates.map(value => typeof value === 'string' ? value.toLowerCase() : '')
    .find(value => PROVIDER_CODES.has(value));
  const parameter = REQUEST_PARAMETERS.has(remote?.param) ? remote.param : undefined;
  const status = response.status;
  const quota = isApiQuotaCode(providerCode);
  let translationKey = 'errorApiError';
  /** @type {{status?: number, reason?: string}} */
  let translationParams = { status };
  if (status === 401) { translationKey = 'errorApiKeyInvalid'; translationParams = {}; }
  else if (status === 403) { translationKey = 'errorApiAccessForbidden'; translationParams = {}; }
  else if (quota) { translationKey = 'errorApiQuotaExceeded'; translationParams = {}; }
  else if (providerCode) {
    translationKey = 'errorApiRequestRejected';
    translationParams = { status, reason: parameter ? `${providerCode}: ${parameter}` : providerCode };
  } else if (status === 429) { translationKey = 'errorRateLimit'; translationParams = {}; }
  const retryWithoutResponseFormat = status === 400 && (parameter === 'response_format' ||
    (typeof remote?.message === 'string' && /response_format/i.test(remote.message) && /unsupported|not supported|unrecognized|unknown/i.test(remote.message)));
  return Object.assign(new Error(tSync(translationKey, 'en', translationParams)), {
    status, response, provider, providerCode, parameter,
    code: status === 401 || status === 403 ? 'auth_error' : status === 429 ? 'rate_limit' : 'provider_error',
    retryable: !quota && [408, 429, 500, 502, 503, 504].includes(status),
    translationKey, translationParams, retryWithoutResponseFormat
  });
}
