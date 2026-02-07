import { Entity } from '@backstage/catalog-model';

const ANNOTATION_LIVEBOOK_REF = 'livebook.dev/ref';

export function isLivebookAvailable(entity: Entity): boolean {
  return Boolean(entity.metadata.annotations?.[ANNOTATION_LIVEBOOK_REF]);
}
