import { row } from './factories.ts';
import type { Widget } from './types.ts';
import {
  navigationSeparator,
  navigationStatus
} from './navigation-visual.ts';

export type FileVisualEntryKind = 'file' | 'directory' | 'symlink' | 'other';

export interface FileVisualBreadcrumb {
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly kind: FileVisualEntryKind;
}

export function fileBreadcrumbRow<TMessage>(
  breadcrumbs: readonly FileVisualBreadcrumb[],
  id: string
): Widget<TMessage> {
  if (breadcrumbs.length === 0) return navigationStatus('No selection', id, 'metadata');
  const currentIndex = breadcrumbs.length - 1;
  return row<TMessage>(breadcrumbs.flatMap((part, index): readonly Widget<TMessage>[] => [
    ...(index === 0 ? [] : [navigationSeparator<TMessage>('/', `${id}:separator:${String(index)}`)]),
    navigationStatus<TMessage>(
      fileBreadcrumbLabel(part),
      `${id}:${part.id}`,
      index === currentIndex ? fileCurrentRole(part.kind) : 'metadata'
    )
  ]), {
    id,
    gap: 1,
    overflowPriority: 'important'
  });
}

export function filePreviewTitle(entry: FileVisualBreadcrumb | undefined): string {
  return entry === undefined ? 'Preview' : `Preview: ${entry.label}`;
}

function fileBreadcrumbLabel(part: FileVisualBreadcrumb): string {
  switch (part.kind) {
    case 'directory':
      return `${part.label}/`;
    case 'symlink':
      return `${part.label} ↪`;
    case 'file':
    case 'other':
      return part.label;
  }
}

function fileCurrentRole(kind: FileVisualEntryKind) {
  return kind === 'directory' ? 'heading' : kind === 'symlink' ? 'warning' : 'metric';
}
