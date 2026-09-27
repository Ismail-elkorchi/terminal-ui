import type { ComponentMetadataOptions } from '../../component/contracts.ts';
import type { ComponentMessage } from '../../component/message.ts';
import type { ElementTextRole } from '../../element/metadata.ts';
import type { Element, ElementMessage } from '../../element/types.ts';
import type { KeyModifiers, MouseButton, MouseModifiers } from '../../input/types.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { InlineContent } from '../../visual/inline-content.ts';
import type { TerminalLink } from '../../visual/render-content.ts';
import type { DisclosureTransition } from '../disclosure.ts';
import type { RetainedCallbacks } from '../shared/availability.ts';
import type { DisclosureStylePart, RichTextStylePart, TextStylePart } from '../style-parts.ts';


export interface TextOptions {
  readonly id?: string;
  readonly content: string;
  readonly textRole?: ElementTextRole;
  readonly headingLevel?: number;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<TextStylePart>;
  readonly meta?: ComponentMetadataOptions<readonly ['styles', 'layer']>;
}

export interface RichTextLinkActivateEvent {
  readonly kind: 'activate';
  readonly link: TerminalLink;
  readonly trigger:
    | { readonly kind: 'keyboard'; readonly modifiers: KeyModifiers }
    | { readonly kind: 'pointer'; readonly button: MouseButton; readonly modifiers: MouseModifiers };
}

export interface RichTextOptions<TMessage extends ComponentMessage = never> {
  readonly id?: string;
  readonly segments: InlineContent;
  readonly wrap?: boolean | RichTextWrapOptions;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<
    RichTextStylePart,
    'focused' | 'hovered' | 'pressed'
  >;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'styles', 'layer']>;
  readonly onLinkActivate?: (event: RichTextLinkActivateEvent) => MessageResolution<TMessage>;
}

export interface RichTextWrapOptions {
  readonly preserveWords?: boolean;
}

interface DisclosureOptionsBase<TChild extends Element<unknown>> {
  readonly id: string;
  readonly label: string;
  readonly summary?: InlineContent;
  readonly expanded: boolean;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<DisclosureStylePart, 'focused' | 'hovered' | 'pressed' | 'disabled'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
  readonly slots: { readonly content: TChild };
}

export interface ActiveDisclosureOptions<
  TMessage extends ComponentMessage,
  TChild extends Element<ComponentMessage>
>
  extends DisclosureOptionsBase<TChild> {
  readonly disabled?: boolean;
  readonly onTransition: (transition: DisclosureTransition) => MessageResolution<TMessage>;
}

export type DisabledDisclosureOptions<
  TChild extends Element<ComponentMessage>,
  TMessage extends ComponentMessage = never,
> = DisclosureOptionsBase<TChild> & {
  readonly disabled: true;
} & RetainedCallbacks<ActiveDisclosureOptions<TMessage, TChild>>;

export type DisclosureOptions<
  TMessage extends ComponentMessage = never,
  TChild extends Element<ComponentMessage> = Element
> =
  | ActiveDisclosureOptions<TMessage, TChild>
  | DisabledDisclosureOptions<TChild, TMessage>;

export type DisclosureMessage<
  TMessage extends ComponentMessage,
  TChild extends Element<ComponentMessage>
> = TMessage | ElementMessage<TChild>;
