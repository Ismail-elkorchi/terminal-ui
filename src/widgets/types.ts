import type { AccessibleNode } from '../accessibility/index.ts';
import type { MouseAction } from '../input/index.ts';

export interface Widget<TMessage = unknown> {
  readonly id?: string;
  readonly kind: WidgetKind;
  readonly props: WidgetProps;
  readonly children?: readonly Widget<TMessage>[];
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly mouseMap?: WidgetMouseMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export type WidgetKind =
  | 'text'
  | 'box'
  | 'stack'
  | 'row'
  | 'list'
  | 'table'
  | 'inputField'
  | 'statusBar'
  | 'progressBar'
  | 'spinner'
  | 'viewport'
  | 'custom';

export type WidgetProps = Record<string, unknown>;
export type WidgetChildren<TMessage> = readonly Widget<TMessage>[] | Widget<TMessage>;
export type WidgetKeyMap<TMessage> = Record<string, TMessage>;
export type WidgetMouseMap<TMessage> = Partial<Record<MouseAction, TMessage>>;
export type AccessibleNodeDefinition = AccessibleNode;

export interface TextWidgetOptions {
  readonly id?: string;
  readonly mouseMap?: WidgetMouseMap<never>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface BoxWidgetOptions<TMessage = never> {
  readonly id?: string;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly mouseMap?: WidgetMouseMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface StackWidgetOptions<TMessage = never> {
  readonly id?: string;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly mouseMap?: WidgetMouseMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface RowWidgetOptions<TMessage = never> {
  readonly id?: string;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly mouseMap?: WidgetMouseMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface ListWidgetOptions<TValue, TMessage> {
  readonly id?: string;
  readonly items: readonly TValue[];
  readonly selected?: number;
  readonly toMessage?: (value: TValue) => TMessage;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly mouseMap?: WidgetMouseMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface TableWidgetOptions<TMessage> {
  readonly id?: string;
  readonly rows: readonly unknown[];
  readonly message?: TMessage;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly mouseMap?: WidgetMouseMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface InputFieldWidgetOptions<TMessage> {
  readonly id?: string;
  readonly value?: string;
  readonly message?: TMessage;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly mouseMap?: WidgetMouseMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface StatusBarWidgetOptions<TMessage> {
  readonly id?: string;
  readonly text: string;
  readonly message?: TMessage;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly mouseMap?: WidgetMouseMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface ProgressBarWidgetOptions {
  readonly id?: string;
  readonly label?: string;
  readonly value?: number;
  readonly max?: number;
  readonly indeterminate?: boolean;
  readonly mouseMap?: WidgetMouseMap<never>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface SpinnerWidgetOptions {
  readonly id?: string;
  readonly label?: string;
  readonly mouseMap?: WidgetMouseMap<never>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface ViewportWidgetOptions<TMessage = never> {
  readonly id?: string;
  readonly scrollRow?: number;
  readonly scrollColumn?: number;
  readonly contentRows?: number;
  readonly contentColumns?: number;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly mouseMap?: WidgetMouseMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}
