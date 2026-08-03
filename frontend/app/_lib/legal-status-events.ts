export const LEGAL_STATUS_REFRESH_EVENT = 'lbb:legal-status-required';

export function requestLegalStatusRefresh(): void {
  window.dispatchEvent(new Event(LEGAL_STATUS_REFRESH_EVENT));
}
