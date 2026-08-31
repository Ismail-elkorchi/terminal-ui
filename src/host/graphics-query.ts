import { csiBody } from './terminal-response.ts';
import type { TerminalResponseClassification, TerminalResponseProtocol } from './terminal-response.ts';
import { wrapKittyControl } from '../protocol/kitty-graphics.ts';
import type { TerminalCellPixels } from '../protocol/index.ts';
import type { GraphicsProbeFacts, KittyGraphicsProbeFacts } from './capabilities.ts';

const ESC = '\u001b';
const ST = `${ESC}\\`;
const QUERY_IMAGE_ID = 31;

export function kittyGraphicsQueryRequest(): string {
  return kittyQuery();
}

export function kittyPassthroughQueryRequest(): string {
  return wrapKittyControl(kittyQuery(), 'tmux-passthrough');
}

export function cellPixelGeometryQueryRequest(): string {
  return `${ESC}[16t`;
}

export function primaryDeviceAttributesQueryRequest(): string {
  return `${ESC}[c`;
}

export function createKittyGraphicsResponseProtocol(): TerminalResponseProtocol<GraphicsProbeFacts['kitty']> {
  return {
    classify(control): TerminalResponseClassification<GraphicsProbeFacts['kitty']> | undefined {
      const kittyResponse = parseKittyResponse(control);
      return kittyResponse === undefined ? undefined : { kind: 'matched', value: kittyResponse };
    },
  };
}

export function createCellPixelGeometryResponseProtocol(): TerminalResponseProtocol<TerminalCellPixels> {
  return {
    classify(control): TerminalResponseClassification<TerminalCellPixels> | undefined {
      const csi = csiBody(control);
      if (csi === undefined) return undefined;
      const body = ascii(csi);
      const size = /^6;([1-9][0-9]*);([1-9][0-9]*)t$/u.exec(body);
      if (size === null) return undefined;
      const height = Number(size[1]);
      const width = Number(size[2]);
      return Number.isSafeInteger(width) && Number.isSafeInteger(height)
        ? { kind: 'matched', value: Object.freeze({ width, height }) }
        : undefined;
    },
  };
}

export function createPrimaryDeviceAttributesResponseProtocol(): TerminalResponseProtocol<GraphicsProbeFacts['sixel']> {
  return {
    classify(control): TerminalResponseClassification<GraphicsProbeFacts['sixel']> | undefined {
      const csi = csiBody(control);
      if (csi === undefined) return undefined;
      const body = ascii(csi);
      const attributes = /^\?([0-9]+(?:;[0-9]+)*);?c$/u.exec(body);
      if (attributes === null) return undefined;
      const parameters = attributes[1]?.split(';').map(Number) ?? [];
      return {
        kind: 'matched',
        value: parameters.includes(4) ? 'supported' : 'unsupported',
      };
    },
  };
}

export function createKittyPassthroughResponseProtocol(): TerminalResponseProtocol<KittyGraphicsProbeFacts> {
  return {
    classify(control): TerminalResponseClassification<KittyGraphicsProbeFacts> | undefined {
      const kitty = parseKittyResponse(control);
      return kitty === undefined
        ? undefined
        : {
            kind: 'matched',
            value: Object.freeze({
              kitty,
              ...(kitty === 'supported' ? { kittyTransport: 'tmux-passthrough' as const } : {}),
            }),
          };
    },
  };
}

function kittyQuery(): string {
  return `${ESC}_Gi=${String(QUERY_IMAGE_ID)},s=1,v=1,a=q,t=d,f=24;AAAA${ST}`;
}

function parseKittyResponse(control: Uint8Array): GraphicsProbeFacts['kitty'] | undefined {
  const text = ascii(control);
  const prefix = text.startsWith(`${ESC}_G`) ? `${ESC}_G` : text.startsWith('\u009fG') ? '\u009fG' : undefined;
  if (prefix === undefined) return undefined;
  const framedBody = text.slice(prefix.length);
  const body = framedBody.endsWith(`${ESC}\\`)
    ? framedBody.slice(0, -2)
    : framedBody.endsWith('\u009c') ? framedBody.slice(0, -1) : framedBody;
  if (!body.startsWith(`i=${String(QUERY_IMAGE_ID)};`)) return undefined;
  return body.endsWith(';OK') ? 'supported' : 'unsupported';
}

function ascii(value: Uint8Array): string {
  return new TextDecoder().decode(value);
}
