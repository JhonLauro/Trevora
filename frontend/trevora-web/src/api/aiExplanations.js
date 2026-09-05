import { apiRequest } from './http';

/**
 * The plain-language explanation for one confirmed record.
 *
 * <p>The language goes to the server rather than being applied here, because
 * the prose is written by the model at request time -- there is no string to
 * look up. The server puts it in the prompt, and because the cache fingerprint
 * is a hash of that prompt, switching language invalidates the stored
 * explanation on its own and the next view regenerates.
 */
export function getServiceRecordAIExplanation(recordId, language = 'en') {
  return apiRequest(
    `/service-records/${recordId}/ai-explanation?lang=${encodeURIComponent(language)}`,
  );
}
