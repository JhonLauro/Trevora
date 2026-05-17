import { apiRequest } from './http';

export function getServiceRecordAIExplanation(recordId) {
  return apiRequest(`/service-records/${recordId}/ai-explanation`);
}
