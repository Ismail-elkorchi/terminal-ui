#!/usr/bin/env python3
"""Unix PTY transport smoke; not a terminal emulator or display-latency measurement."""
import fcntl, json, os, pty, select, signal, struct, subprocess, termios, time
master, slave = pty.openpty()
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 40, 120, 0, 0))
env = dict(os.environ, TERM='xterm-256color', COLORTERM='truecolor')
proc = subprocess.Popen(['node', 'examples/tui/incident-workbench.ts'], stdin=slave, stdout=slave, stderr=slave, env=env, start_new_session=True)
os.close(slave)
output = bytearray()
def collect(seconds):
    end = time.monotonic() + seconds
    while time.monotonic() < end and proc.poll() is None:
        if select.select([master], [], [], min(.05, max(0,end-time.monotonic())))[0]:
            try: output.extend(os.read(master, 65536))
            except OSError: break
def wait_for_output(expected, timeout=20):
    end = time.monotonic() + timeout
    while expected not in output and proc.poll() is None and time.monotonic() < end:
        collect(.05)
    assert expected in output, 'Expected application output absent: ' + repr(expected)
try:
    wait_for_output(b'Incident Workbench')
    assert b'Incident Workbench' in output, 'Initial application frame absent'
    os.write(master, b'/palette\r')
    wait_for_output(b'Search 100,000')
    os.write(master, b'trace-42123')
    wait_for_output(b'INC-042123')
    os.write(master, b'\r')
    collect(.4)
    os.write(master, b'\x11')
    collect(2)
    assert proc.wait(timeout=5) == 0, 'Application exit failed'
    print(json.dumps({'transport':'Unix PTY, 120x40, TERM=xterm-256color', 'initialFrame':True,'palette':True,'queryResult':'INC-042123','accepted':True,'exitCode':0,'outputBytes':len(output),'limitations':'No terminal emulator, pixels or physical presentation latency measured'}))
finally:
    if proc.poll() is None:
        os.killpg(proc.pid, signal.SIGTERM)
        proc.wait(timeout=5)
    os.close(master)
