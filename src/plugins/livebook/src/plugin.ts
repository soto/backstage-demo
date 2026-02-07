import {
  createPlugin,
  createApiFactory,
  discoveryApiRef,
  fetchApiRef,
  createRoutableExtension,
  createComponentExtension,
} from '@backstage/core-plugin-api';
import { livebookApiRef, LivebookClient } from './api';
import { rootRouteRef, entityContentRouteRef } from './routes';

export const livebookPlugin = createPlugin({
  id: 'livebook',
  apis: [
    createApiFactory({
      api: livebookApiRef,
      deps: {
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
      },
      factory: ({ discoveryApi, fetchApi }) =>
        new LivebookClient({ discoveryApi, fetchApi }),
    }),
  ],
  routes: {
    root: rootRouteRef,
    entityContent: entityContentRouteRef,
  },
});

export const LivebookIndexPage = livebookPlugin.provide(
  createRoutableExtension({
    name: 'LivebookIndexPage',
    component: () =>
      import('./components/LivebookIndexPage').then(m => m.LivebookIndexPage),
    mountPoint: rootRouteRef,
  }),
);

export const LivebookReaderPage = livebookPlugin.provide(
  createRoutableExtension({
    name: 'LivebookReaderPage',
    component: () =>
      import('./components/LivebookReaderPage').then(
        m => m.LivebookReaderPage,
      ),
    mountPoint: rootRouteRef,
  }),
);

export const EntityLivebookContent = livebookPlugin.provide(
  createComponentExtension({
    name: 'EntityLivebookContent',
    component: {
      lazy: () =>
        import('./components/EntityLivebookContent').then(
          m => m.EntityLivebookContent,
        ),
    },
  }),
);
