import { csiBody } from './terminal-response.ts';
import type { TerminalResponseClassification, TerminalResponseProtocol } from './terminal-response.ts';
import { wrapGraphicsControl } from '../protocol/kitty-graphics.ts';
import type { TerminalCellPixels, TerminalGraphicsTransport } from '../protocol/index.ts';
import type { GraphicsProbeFacts } from './capabilities.ts';

const ESC = '\u001b';
const ST = `${ESC}\\`;
const QUERY_IMAGE_ID = 31;

export function graphicsQueryRequest(transport: TerminalGraphicsTransport): string {
  const kitty = `${ESC}_Gi=${String(QUERY_IMAGE_ID)},s=1,v=1,a=q,t=d,f=24;AAAA${ST}`;
  const cellPixels = `${ESC}[16t`;
  const deviceAttributes = `${ESC}[c`;
  if (transport === 'direct') return `${kitty}${cellPixels}${deviceAttributes}`;
  return [kitty, cellPixels, deviceAttributes]
    .map((control) => wrapGraphicsControl(control, transport))
    .join('');
}

export function createGraphicsResponseProtocol(
  transport: TerminalGraphicsTransport,
): TerminalResponseProtocol<GraphicsProbeFacts> {
  let kitty: GraphicsProbeFacts['kitty'] = 'unsupported';
  let cellPixels: TerminalCellPixels | undefined;
  return {
    classify(control): TerminalResponseClassification<GraphicsProbeFacts> | undefined {
      const kittyResponse = parseKittyResponse(control);
      if (kittyResponse !== undefined) {
        kitty = kittyResponse;
        return { kind: 'consume' };
      }
      const csi = csiBody(control);
      if (csi === undefined) return undefined;
      const body = ascii(csi);
      const size = /^6;([1-9][0-9]*);([1-9][0-9]*)t$/u.exec(body);
      if (size !== null) {
        const height = Number(size[1]);
        const width = Number(size[2]);
        if (Number.isSafeInteger(width) && Number.isSafeInteger(height)) {
          cellPixels = Object.freeze({ width, height });
          return { kind: 'consume' };
        }
      }
      const attributes = /^\?([0-9]+(?:;[0-9]+)*);?c$/u.exec(body);
      if (attributes === null) return undefined;
      const parameters = attributes[1]?.split(';').map(Number) ?? [];
      const sixel = parameters.includes(4) ? 'supported' : 'unsupported';
      return {
        kind: 'matched',
        value: Object.freeze({
          kitty,
          sixel,
          ...(kitty === 'supported' ? { kittyTransport: transport } : {}),
          ...(sixel === 'supported' ? { sixelTransport: transport } : {}),
          ...(cellPixels === undefined ? {} : { cellPixels }),
        }),
      };
    },
  };
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
