export interface TerminalProtocolSink {
  write(sequence: string): Promise<void> | void;
}
