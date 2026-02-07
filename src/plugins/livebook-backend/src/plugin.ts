import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { CatalogClient } from '@backstage/catalog-client';
import { createRouter } from './router';

export const livebookPlugin = createBackendPlugin({
  pluginId: 'livebook',
  register(env) {
    env.registerInit({
      deps: {
        httpRouter: coreServices.httpRouter,
        logger: coreServices.logger,
        config: coreServices.rootConfig,
        discovery: coreServices.discovery,
        auth: coreServices.auth,
        httpAuth: coreServices.httpAuth,
      },
      async init({ httpRouter, logger, config, discovery, auth }) {
        const catalogApi = new CatalogClient({
          discoveryApi: discovery,
          fetchApi: {
            fetch: async (input: any, init?: any) => {
              const { token } = await auth.getPluginRequestToken({
                onBehalfOf: await auth.getOwnServiceCredentials(),
                targetPluginId: 'catalog',
              });
              const headers = new Headers(init?.headers);
              headers.set('Authorization', `Bearer ${token}`);
              return fetch(input, { ...init, headers });
            },
          },
        });

        httpRouter.use(
          await createRouter({
            logger,
            config,
            catalogApi,
          }),
        );

        httpRouter.addAuthPolicy({
          path: '/health',
          allow: 'unauthenticated',
        });
      },
    });
  },
});
