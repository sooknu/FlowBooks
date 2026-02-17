/**
 * Resolves the effective tax rate for a client.
 *
 * Logic:
 * 1. If taxHomeState is set and client is out-of-state → 0%
 * 2. Otherwise → defaultTaxRate
 *
 * @param {object} params
 * @param {string|null} params.clientBillingState - The client's billing state
 * @param {number} params.defaultTaxRate - The global fallback tax rate
 * @param {string|null} params.taxHomeState - Home state code (e.g. "CA"). Out-of-state clients get 0%.
 * @returns {{ rate: number, source: string }} The effective rate and a human-readable source label
 */
export function resolveEffectiveTaxRate({ clientBillingState, defaultTaxRate, taxHomeState }) {
  // Home state check: if client is out-of-state, no tax
  if (taxHomeState && clientBillingState) {
    const normalizedHome = taxHomeState.trim().toUpperCase();
    const normalizedClient = clientBillingState.trim().toUpperCase();
    if (normalizedClient !== normalizedHome) {
      return { rate: 0, source: 'out-of-state' };
    }
  }

  return { rate: defaultTaxRate, source: 'default' };
}

