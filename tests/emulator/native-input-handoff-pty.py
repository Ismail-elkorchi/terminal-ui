#!/usr/bin/env python3
"""Check native stdin ownership and natural shutdown through a real Unix PTY.

Only ASCII transport is used: this regression is independent of runtime Unicode
segmentation differences. No terminal emulator, screen reader or ConPTY is tested.
"""
import argparse
import fcntl
import json
import os
from pathlib import Path
import platform
import pty
import select
import signal
import struct
import subprocess
import termios
import time
import tty


ROOT = Path(__file__).resolve().parents[2]
CYCLES = 3


def termios_snapshot(attributes):
    return dict(zip(['iflag', 'oflag', 'cflag', 'lflag', 'ispeed', 'ospeed', 'cc'],
                    [*attributes[:6], [value if isinstance(value, int) else value[0]
                                       for value in attributes[6]]]))


def termios_difference(before, after):
    initial, final = termios_snapshot(before), termios_snapshot(after)
    return {name: {'before': value, 'after': final[name],
                   **({'xor': value ^ final[name]} if isinstance(value, int) else {})}
            for name, value in initial.items() if value != final[name]}


def readable_input_bytes(slave):
    # FIONREAD does not dequeue input. On BSD it also settles deferred canonical
    # processing (PENDIN), so compare complete termios at this readiness boundary.
    # Never flush the terminal, mask flags, or retry the restoration assertion.
    return struct.unpack('i', fcntl.ioctl(slave, termios.FIONREAD, struct.pack('i', 0)))[0]


def verify_readiness_observation():
    """Prove the observation preserves queued bytes and persistent settings."""
    master, slave = pty.openpty()
    try:
        assert readable_input_bytes(slave) == 0
        initial = termios.tcgetattr(slave)
        tty.setraw(slave)
        os.write(master, b'keep')
        assert select.select([slave], [], [], 2)[0], 'Preservation control input did not arrive'
        assert readable_input_bytes(slave) == 4
        termios.tcsetattr(slave, termios.TCSANOW, initial)
        before_observation = termios.tcgetattr(slave)
        readable = readable_input_bytes(slave)
        settled = termios.tcgetattr(slave)
        assert settled == initial, termios_difference(initial, settled)
        os.write(master, b'\n')
        received = bytearray()
        deadline = time.monotonic() + 2
        while len(received) < 5 and time.monotonic() < deadline:
            if select.select([slave], [], [], max(0, deadline - time.monotonic()))[0]:
                received.extend(os.read(slave, 32))
        assert received == b'keep\n', f'Readiness observation changed queued input: {received!r}'
        assert readable_input_bytes(slave) == 0

        changed = [*initial[:6], list(initial[6])]
        changed[3] ^= termios.ECHO
        termios.tcsetattr(slave, termios.TCSANOW, changed)
        assert readable_input_bytes(slave) == 0
        observed = termios.tcgetattr(slave)
        assert observed == changed and observed != initial, 'Readiness observation hid a persistent mode change'
        return {'preservedInput': received.decode('ascii'), 'readableBeforeNewline': readable,
                'unsettledTermios': termios_snapshot(before_observation),
                'settledTermios': termios_snapshot(settled), 'termiosRestored': True,
                'persistentMismatchDetected': True}
    finally:
        os.close(master)
        os.close(slave)


def runtime_termios_controls(runtime, executable, environment):
    """Diagnose a failed equality using independent PTYs, without the library."""
    results = []
    programs = [
        ('startup', 'void 0;'),
        ('raw-round-trip', "const { default: process } = await import('node:process'); "
         'process.stdin.setRawMode(true); process.stdin.setRawMode(false); '
         'process.stdin.pause(); process.stdin.unref();'),
    ]
    for scenario, program in programs:
        master, slave = pty.openpty()
        before = termios.tcgetattr(slave)
        command = [executable, 'eval', program] if runtime == 'deno' else \
            [executable, '--input-type=module', '--eval', program]
        try:
            result = subprocess.run(command, stdin=slave, stdout=slave, stderr=slave,
                                    env=environment, start_new_session=True, timeout=5)
            after = termios.tcgetattr(slave)
            results.append({'scenario': scenario, 'exitCode': result.returncode,
                            'initial': termios_snapshot(before), 'final': termios_snapshot(after),
                            'difference': termios_difference(before, after)})
        except subprocess.TimeoutExpired:
            results.append({'scenario': scenario, 'timedOut': True})
        finally:
            os.close(master)
            os.close(slave)
    return results


def run_case(runtime, executable, directory, scenario):
    stem = directory / f'{runtime}-{scenario}'
    report_path = Path(f'{stem}.events.jsonl')
    report_path.unlink(missing_ok=True)
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 24, 80, 0, 0))
    initial_unsettled_termios = termios.tcgetattr(slave)
    assert readable_input_bytes(slave) == 0, 'Fresh PTY already contained readable input'
    initial_termios = termios.tcgetattr(slave)
    environment = dict(os.environ, TERM='xterm-256color', COLORTERM='truecolor')
    for name in ['TERM_PROGRAM', 'TERM_PROGRAM_VERSION', 'TMUX', 'WT_SESSION', 'KITTY_WINDOW_ID']:
        environment.pop(name, None)
    command = [executable]
    if runtime == 'deno':
        environment['DENO_DIR'] = str(directory / 'deno-cache')
        command += ['run', '--allow-read', '--allow-env', '--allow-write', '--allow-sys', '--allow-run=python3']
    command += ['tests/emulator/native-input-handoff-probe.mjs', scenario, str(report_path)]
    process = subprocess.Popen(command, cwd=ROOT, stdin=slave, stdout=slave, stderr=slave,
                               env=environment, start_new_session=True)
    output = bytearray()
    events = []
    sent = set()
    forced = False
    final_unsettled_termios = None
    final_readable_bytes = None

    def read_events():
        if not report_path.exists():
            return []
        # Ignore a last partially written line, never a complete malformed event.
        lines = report_path.read_text().splitlines(keepends=True)
        return [json.loads(line) for line in lines if line.endswith('\n')]

    def collect():
        if select.select([master], [], [], .02)[0]:
            try:
                output.extend(os.read(master, 65536))
            except OSError:
                pass

    try:
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            collect()
            events = read_events()
            for event in events:
                kind, cycle = event['kind'], event.get('cycle')
                key = (kind, cycle, event.get('phase'))
                if key in sent:
                    continue
                if kind == 'child-ready':
                    assert event['canonicalBefore'], 'Suspension did not restore canonical input before the child'
                    os.write(master, b'C')
                    sent.add(key)
                elif kind == 'replacement-ready':
                    os.write(master, b'R')
                    sent.add(key)
                elif kind == 'ui-ready':
                    assert event['rawMode'], 'runTui did not reacquire raw input'
                    os.write(master, b'\r' if event['phase'] == 'ready' else b'R')
                    sent.add(key)
            if process.poll() is not None:
                break
        assert process.poll() is not None, \
            f'Native process did not exit naturally; events={events!r}; output={bytes(output[-5000:])!r}'
        collect()
        events = read_events()
        assert process.returncode == 0, f'Native process failed; events={events!r}; output={bytes(output[-5000:])!r}'
        assert events[0] == {'kind': 'started', 'runtime': runtime, 'scenario': scenario, 'cycles': CYCLES}
        assert events[-1] == {'kind': 'complete', 'cycles': CYCLES}, events
        assert not any(event['kind'] == 'failure' for event in events), events
        for cycle in range(CYCLES):
            at_cycle = [event for event in events if event.get('cycle') == cycle]
            assert [event['data'] for event in at_cycle if event['kind'] == 'child-input'] == ['C']
            received = 'replacement-input' if scenario == 'direct' else 'ui-input'
            assert [event['data'] for event in at_cycle if event['kind'] == received] == ['R']
            assert [event['rawMode'] for event in at_cycle if event['kind'] == 'operation-start'] == [False]
            if scenario == 'direct':
                assert sum(event['kind'] == 'pending-read' for event in at_cycle) == 1
                assert sum(event['kind'] == 'reader-released' for event in at_cycle) == 1
            else:
                assert [event['phase'] for event in at_cycle if event['kind'] == 'ui-ready'] == ['ready', 'resumed']
        final_unsettled_termios = termios.tcgetattr(slave)
        final_readable_bytes = readable_input_bytes(slave)
        final_termios = termios.tcgetattr(slave)
        assert final_readable_bytes == 0, f'Native process left unread input: {final_readable_bytes}'
        assert final_termios == initial_termios, \
            'Native termios state was not restored at natural exit; ' + json.dumps({
                'initial': termios_snapshot(initial_termios),
                'unsettledFinal': termios_snapshot(final_unsettled_termios),
                'final': termios_snapshot(final_termios),
                'difference': termios_difference(initial_termios, final_termios),
                'PENDIN': getattr(termios, 'PENDIN', None),
                'runtimeControls': runtime_termios_controls(runtime, executable, environment),
                'events': events,
            })
        if scenario == 'visual':
            assert output.count(b'\x1b[?1049h') >= CYCLES + 1, 'Visual session was not reacquired after each handoff'
            assert output.count(b'\x1b[?1049l') >= CYCLES + 1, 'Visual session was not restored after each handoff'
        elif scenario == 'accessible':
            assert b'\x1b[?1049h' not in output, 'Accessible suspension entered the alternate screen'
            assert b'\x1b[?25l' not in output, 'Accessible suspension hid the cursor'
            assert b'Handoff input' in output, 'Accessible run did not emit semantic input context'
        return {'runtime': runtime, 'scenario': scenario, 'cycles': CYCLES,
                'naturalExit': True, 'termiosRestored': True, 'outputBytes': len(output),
                'readableInputBytesAtExit': final_readable_bytes,
                'termiosObservation': {'initial': termios_snapshot(initial_termios),
                                       'unsettledFinal': termios_snapshot(final_unsettled_termios),
                                       'final': termios_snapshot(final_termios)},
                'events': str(report_path)}
    finally:
        Path(f'{stem}.terminal-output.bin').write_bytes(output)
        if process.poll() is None:
            forced = True
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=2)
        Path(f'{stem}.supervisor.json').write_text(json.dumps({
            'forcedTermination': forced, 'exitCode': process.returncode,
            'termiosRestored': termios.tcgetattr(slave) == initial_termios,
            'initialUnsettledTermios': termios_snapshot(initial_unsettled_termios),
            'initialTermios': termios_snapshot(initial_termios),
            'finalUnsettledTermios': None if final_unsettled_termios is None else termios_snapshot(final_unsettled_termios),
            'finalTermios': termios_snapshot(termios.tcgetattr(slave)),
            'readableInputBytesAtExit': final_readable_bytes,
            'termiosDifference': termios_difference(initial_termios, termios.tcgetattr(slave)),
        }, indent=2) + '\n')
        os.close(master)
        os.close(slave)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', required=True, choices=['node', 'deno', 'bun'])
    parser.add_argument('--executable', required=True)
    parser.add_argument('--output-directory', required=True, type=Path)
    args = parser.parse_args()
    args.output_directory.mkdir(parents=True, exist_ok=True)
    readiness_observation = verify_readiness_observation()
    cases = [run_case(args.runtime, args.executable, args.output_directory, scenario)
             for scenario in ['direct', 'visual', 'accessible']]
    summary = {'evidence': 'automated-unix-pty', 'operatingSystem': platform.platform(), 'cases': cases,
               'readinessObservation': readiness_observation,
               'limitations': 'ASCII synthetic PTY input; no terminal emulator, hardware keyboard, IME or screen reader observed'}
    (args.output_directory / f'{args.runtime}-summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps(summary))


if __name__ == '__main__':
    main()
