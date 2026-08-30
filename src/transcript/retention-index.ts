export interface RetentionIndexEntry {
  readonly category: string;
}

export class RetentionIndex<TEntry extends RetentionIndexEntry> {
  readonly #evidence = new Set<TEntry>();
  readonly #categories = new Map<string, Set<TEntry>>();

  add(entry: TEntry): void {
    if (this.#evidence.has(entry)) {
      throw new TypeError('Retention index entries may be added only once.');
    }
    this.#evidence.add(entry);
    const category = this.#categories.get(entry.category) ?? new Set<TEntry>();
    category.add(entry);
    this.#categories.set(entry.category, category);
  }

  delete(entry: TEntry): void {
    this.#evidence.delete(entry);
    const category = this.#categories.get(entry.category);
    category?.delete(entry);
    if (category?.size === 0) this.#categories.delete(entry.category);
  }

  oldest(): TEntry | undefined {
    return this.#evidence.values().next().value;
  }

  oldestInCategory(category: string): TEntry | undefined {
    return this.#categories.get(category)?.values().next().value;
  }

  categoryValues(category: string): readonly TEntry[] {
    return [...(this.#categories.get(category) ?? [])];
  }

  get size(): number {
    return this.#evidence.size;
  }

  categorySize(category: string): number {
    return this.#categories.get(category)?.size ?? 0;
  }
}
