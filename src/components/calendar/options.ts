import type { CalendarControlTransition, CalendarView } from '../../behavior/calendar.ts';
import type { ComponentMetadataOptions } from '../../component/contracts.ts';
import type { ComponentMessage } from '../../component/message.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { RetainedCallbacks } from '../shared/availability.ts';
import type { CalendarStylePart } from '../style-parts.ts';


interface CalendarOptionsBase {
  readonly id: string;
  readonly label: string;
  readonly view: CalendarView;
  readonly error?: string;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<CalendarStylePart, 'focused' | 'selected' | 'disabled'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
}

export type CalendarOptions<TMessage extends ComponentMessage = never> =
  | ActiveCalendarOptions<TMessage>
  | DisabledCalendarOptions<TMessage>;

export interface ActiveCalendarOptions<TMessage extends ComponentMessage> extends CalendarOptionsBase {
  readonly onTransition: (transition: CalendarControlTransition) => MessageResolution<TMessage>;
  readonly disabled?: boolean;
}

export type DisabledCalendarOptions<TMessage extends ComponentMessage = never> = CalendarOptionsBase & {
  readonly disabled: true;
} & RetainedCallbacks<ActiveCalendarOptions<TMessage>>;
