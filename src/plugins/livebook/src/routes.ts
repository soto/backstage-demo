import { createRouteRef } from '@backstage/core-plugin-api';

export const rootRouteRef = createRouteRef({
  id: 'livebook',
});

export const entityContentRouteRef = createRouteRef({
  id: 'livebook:entity-content',
});
