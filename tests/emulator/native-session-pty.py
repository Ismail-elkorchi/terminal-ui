#!/usr/bin/env python3
"""Exercise the shared native qualification app through a real Unix PTY.

This is transport evidence only: no terminal emulator, hardware keyboard, IME,
screen reader, macOS Terminal or Windows ConPTY is exercised here.
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


ROOT = Path(__file__).resolve().parents[2]
PASTE = '-café e\u0301 世界 👩\u200d💻'


def set_size(slave, columns, rows):
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', rows, columns, 0, 0))


def run_case(runtime, executable, directory, mode, scenario, termination):
    report_path = directory / f'{runtime}-{mode}-{termination}.json'
    checkpoint_path = Path(f'{report_path}.checkpoint')
    checkpoint_path.unlink(missing_ok=True)
    report_path.unlink(missing_ok=True)
    master, slave = pty.openpty()
    set_size(slave, 96, 32)
    initial_termios = termios.tcgetattr(slave)
    environment = dict(os.environ, TERM='xterm-256color', COLORTERM='truecolor')
    # A synthetic PTY is not the parent emulator, display session, or tmux client.
    for name in ['TERM_PROGRAM', 'TERM_PROGRAM_VERSION', 'TMUX', 'WT_SESSION', 'KITTY_WINDOW_ID']:
        environment.pop(name, None)
    command = [executable]
    if runtime == 'deno':
        command += ['run', '--allow-read', '--allow-env', '--allow-write', '--allow-sys', '--allow-run=git']
    command += [
        'scripts/emulator/native.mjs', '--terminal=Unix PTY',
        f'--terminal-version=Python {platform.python_version()}',
        '--transport=pty.openpty', '--evidence=automated-pty',
        f'--output-mode={mode}', f'--scenario={scenario}', f'--output={report_path}',
    ]
    process = subprocess.Popen(command, cwd=ROOT, stdin=slave, stdout=slave, stderr=slave,
                               env=environment, start_new_session=True)
    output = bytearray()

    def collect(seconds):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            if select.select([master], [], [], min(.02, max(0, deadline - time.monotonic())))[0]:
                try:
                    chunk = os.read(master, 65536)
                except OSError:
                    break
                if not chunk:
                    break
                output.extend(chunk)
            elif process.poll() is not None:
                break

    def wait_for(predicate, label, timeout=12):
        deadline = time.monotonic() + timeout
        while not predicate() and process.poll() is None and time.monotonic() < deadline:
            collect(.05)
        assert predicate(), f'{label}; exit={process.poll()}; output={bytes(output[-5000:])!r}'

    def checkpoint():
        return json.loads(checkpoint_path.read_text()) if checkpoint_path.exists() else {}

    def send(value, predicate=None, label='Expected committed input effect'):
        os.write(master, value)
        if predicate is not None:
            wait_for(lambda: predicate(checkpoint()), label)

    def title(value):
        return lambda item: item.get('title', {}).get('value') == value

    def caret(value):
        return lambda item: item.get('title', {}).get('textPosition', {}).get('caretOffset') == value

    try:
        wait_for(checkpoint_path.exists, 'First native application frame was not committed')
        assert not (termios.tcgetattr(slave)[3] & termios.ICANON), 'Input never entered native raw mode'
        if scenario == 'output-failure':
            send(b'x')
        else:
            send(b'alpha', title('alpha'), 'ASCII edit was not committed')
            send(b'\xc3')
            send(b'\xa9', title('alphaé'), 'Split UTF-8 edit was not committed')
            # Several PTY writes, including UTF-8 and paste-fence boundaries. The OS may coalesce writes.
            paste = PASTE.encode('utf-8')
            send(b'\x1b[20')
            send(b'0~' + paste[:5])
            send(paste[5:9])
            send(paste[9:] + b'\x1b[201')
            value = 'alphaé' + PASTE
            send(b'~', title(value), 'Bracketed Unicode paste was not committed intact')
            end = len(value.encode('utf-16-le')) // 2
            # The final emoji is one grapheme with five UTF-16 code units.
            send(b'\x1b[D', caret(end - 5), 'Left did not move over the complete emoji grapheme')
            send(b'\x1b[C', caret(end), 'Right did not restore the caret')
            send(b'\x01', lambda item: item.get('title', {}).get('textPosition', {}).get('selection') ==
                 {'startOffset': 0, 'endOffsetExclusive': end}, 'Ctrl+A did not select the complete title')
            send(b'\x1b[C', lambda item: caret(end)(item) and
                 'selection' not in item.get('title', {}).get('textPosition', {}), 'Right did not clear selection')
            send(b'\x1b[1;3D', lambda item: item.get('title', {}).get('textPosition', {}).get('caretOffset', end) < end,
                 'Alt+Left did not move to the previous word')
            send(b'\x1b[F', caret(end), 'End did not restore the caret')
            send(b'\x1b[Z', lambda item: item.get('focusPath', [None])[-1] != 'task-title',
                 'Shift+Tab did not move focus')
            send(b'\t', lambda item: item.get('focusPath', [None])[-1] == 'task-title',
                 'Tab did not return focus')
            set_size(slave, 72, 24)
            os.killpg(process.pid, signal.SIGWINCH)
            wait_for(lambda: checkpoint().get('terminalSize') == {'columns': 72, 'rows': 24},
                     'Native resize was not committed')
            if termination == 'ctrl-c':
                send(b'\x03')
            elif termination == 'signal':
                os.killpg(process.pid, signal.SIGTERM)
            else:
                send(b'\x11')  # The shared application's normal Ctrl+Q exit.
        wait_for(lambda: process.poll() is not None, 'Native process did not exit', timeout=15)
        collect(.1)
        assert process.returncode == 0, f'Native runner failed: {bytes(output[-7000:])!r}'
        report = json.loads(report_path.read_text())
        assert report['evidence'] == 'automated-pty'
        assert report['observed']['omittedCheckpoints'] == 0, 'Compact checkpoint evidence was truncated'
        assert report['runtime']['name'] == runtime
        assert report['checks'] == {'expectedExit': True, 'restoreSucceeded': True, 'hostDisposed': True}, report['checks']
        assert termios.tcgetattr(slave) == initial_termios, 'Native termios state was not restored'
        assert b'\x1b_G' not in output, 'Graphics-free run sent a Kitty graphics command'
        if mode == 'visual':
            for sequence in [b'\x1b[?1049h', b'\x1b[?1049l', b'\x1b[?25h']:
                assert sequence in output, f'Session sequence not observed: {sequence!r}'
        else:
            assert b'\x1b[?1049h' not in output, 'Accessible mode entered alternate screen'
            assert b'\x1b[?25l' not in output, 'Accessible mode hid the cursor'
        if scenario == 'output-failure':
            assert report['status'] == 'error'
            assert report['failureInjection']['occurred']
            assert report['observed']['writes']['recovery'] > 0
            assert any(item['severity'] in ['error', 'fatal'] for item in report['diagnostics'])
        else:
            inputs = report['observed']['inputs']
            commits = report['observed']['checkpoints']
            assert any(item['terminalSize'] == {'columns': 72, 'rows': 24} for item in commits), commits
            assert len({tuple(item.get('focusPath', [])) for item in commits}) >= 2, 'Tab focus did not move'
            assert 'alphaé' + PASTE in json.dumps(report['observed']['snapshot'], ensure_ascii=False), \
                'Edited Unicode title was not retained in the semantic snapshot'
            assert not any(item['severity'] in ['error', 'fatal'] for item in report['diagnostics']), report['diagnostics']
            if termination == 'signal':
                assert any(item['kind'] == 'signal' and item['signal'] == 'SIGTERM' for item in inputs)
            elif termination == 'ctrl-c':
                assert report['status'] == 'completed' and report['reason'] == 'cancelled'
            else:
                assert report['status'] == 'completed'
                assert report['reason'] == 'quit'
        # External evidence is separate from the application report: this is an OS observation.
        return {'runtime': report['runtime'], 'outputMode': mode, 'termination': termination,
                'status': report['status'], 'termiosRestored': True, 'outputBytes': len(output),
                'report': str(report_path)}
    finally:
        (directory / f'{runtime}-{mode}-{termination}.terminal-output.bin').write_bytes(output)
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=3)
        os.close(master)
        os.close(slave)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', required=True, choices=['node', 'deno', 'bun'])
    parser.add_argument('--executable', required=True)
    parser.add_argument('--output-directory', required=True, type=Path)
    args = parser.parse_args()
    args.output_directory.mkdir(parents=True, exist_ok=True)
    cases = []
    for mode in ['visual', 'accessible']:
        for scenario, termination in [('complete', 'normal'), ('cancel', 'ctrl-c'),
                                      ('cancel', 'signal'), ('output-failure', 'output-failure')]:
            cases.append(run_case(args.runtime, args.executable, args.output_directory, mode, scenario, termination))
    summary = {'evidence': 'automated-unix-pty', 'operatingSystem': platform.platform(), 'cases': cases,
               'limitations': 'Synthetic input and signals; no terminal emulator, hardware keyboard, IME or screen reader observed'}
    (args.output_directory / f'{args.runtime}-summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps(summary))


if __name__ == '__main__':
    main()
