import type { SelfImportFixture as ImportedSelfImportFixture } from './self-import-fixture.ts';

export interface SelfImportFixture {
  readonly next?: ImportedSelfImportFixture;
}
