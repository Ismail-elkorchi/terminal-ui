export interface LabeledItem {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly disabled?: boolean;
}

export interface ChoiceItem<TValue = string> extends LabeledItem {
  readonly value: TValue;
}

export interface SearchEntry<TValue = string> extends ChoiceItem<TValue> {
  readonly group?: string;
  readonly keywords?: readonly string[];
  readonly preview?: string;
}
