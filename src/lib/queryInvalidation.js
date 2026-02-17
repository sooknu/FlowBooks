import { queryKeys } from '@/lib/queryKeys';
import { queryClient } from '@/lib/queryClient';

const entityMap = {
  client: queryKeys.clients.all,
  quote: queryKeys.quotes.all,
  invoice: queryKeys.invoices.all,
  product: queryKeys.products.all,
  settings: queryKeys.settings.all,
  user: queryKeys.users.all,
  profile: queryKeys.profile.all,
};

/**
 * Invalidate all queries for a given entity type.
 * Usage: invalidateByEntityType('invoice') → refetches all invoice queries.
 */
export function invalidateByEntityType(entityType) {
  const queryKey = entityMap[entityType];
  if (queryKey) {
    queryClient.invalidateQueries({ queryKey });
  }
}

/**
 * Push a full entity update directly into the cache (avoids network round-trip
 * when the server already sent the complete object, e.g. via WebSocket).
 * Falls back to invalidation if no detail key exists for the entity type.
 */
export function pushEntityUpdate(entityType, data) {
  const domain = queryKeys[entityType + 's'] || queryKeys[entityType];
  if (domain?.detail && data?.id) {
    queryClient.setQueryData(domain.detail(data.id), data);
    queryClient.invalidateQueries({ queryKey: domain.all });
  } else {
    invalidateByEntityType(entityType);
  }
}

/**
 * Invalidate all cached queries (e.g. after WebSocket reconnect).
 */
export function invalidateAll() {
  Object.values(entityMap).forEach((queryKey) => {
    queryClient.invalidateQueries({ queryKey });
  });
}
