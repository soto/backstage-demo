import React from 'react';
import {
  Content,
  ContentHeader,
  Header,
  Page,
  SupportButton,
  Table,
  TableColumn,
} from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import {
  catalogApiRef,
  CATALOG_FILTER_EXISTS,
  entityRouteRef,
} from '@backstage/plugin-catalog-react';
import { useAsync } from 'react-use';
import { Entity, stringifyEntityRef } from '@backstage/catalog-model';
import { useRouteRef } from '@backstage/core-plugin-api';
import { Link } from '@backstage/core-components';

type LivebookEntity = {
  name: string;
  kind: string;
  namespace: string;
  entityRef: string;
  owner: string;
  type: string;
};

const columns: TableColumn<LivebookEntity>[] = [
  {
    title: 'Name',
    field: 'name',
    render: row => (
      <Link to={`/livebook/${row.namespace}/${row.kind}/${row.name}`}>
        {row.name}
      </Link>
    ),
  },
  { title: 'Kind', field: 'kind' },
  { title: 'Type', field: 'type' },
  { title: 'Owner', field: 'owner' },
];

export const LivebookIndexPage = () => {
  const catalogApi = useApi(catalogApiRef);

  const { value: entities, loading, error } = useAsync(async () => {
    const response = await catalogApi.getEntities({
      filter: {
        'metadata.annotations.livebook.dev/ref': CATALOG_FILTER_EXISTS,
      },
      fields: [
        'metadata.name',
        'metadata.namespace',
        'kind',
        'spec.type',
        'spec.owner',
      ],
    });
    return response.items.map(
      (entity: Entity): LivebookEntity => ({
        name: entity.metadata.name,
        kind: entity.kind,
        namespace: entity.metadata.namespace || 'default',
        entityRef: stringifyEntityRef(entity),
        owner: (entity.spec?.owner as string) || 'unknown',
        type: (entity.spec?.type as string) || '',
      }),
    );
  }, [catalogApi]);

  return (
    <Page themeId="documentation">
      <Header title="Livebooks" subtitle="Interactive Elixir notebooks" />
      <Content>
        <ContentHeader title="">
          <SupportButton>
            Browse Livebook (.livemd) notebooks associated with your catalog
            entities.
          </SupportButton>
        </ContentHeader>
        <Table
          title="Entities with Livebooks"
          options={{ search: true, paging: true, pageSize: 20 }}
          columns={columns}
          data={entities || []}
          isLoading={loading}
          emptyContent={
            error ? (
              <div style={{ padding: 20, textAlign: 'center' }}>
                Error loading livebook entities: {error.message}
              </div>
            ) : (
              <div style={{ padding: 20, textAlign: 'center' }}>
                No entities with livebook annotations found. Add{' '}
                <code>livebook.dev/ref</code> annotations to your catalog
                entities to get started.
              </div>
            )
          }
        />
      </Content>
    </Page>
  );
};
