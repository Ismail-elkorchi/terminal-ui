import process from 'node:process';

export function cleanEnvironment(overrides = {}) {
  const inherited = [
    'DBUS_SESSION_BUS_ADDRESS',
    'DISPLAY',
    'FONTCONFIG_FILE',
    'FONTCONFIG_PATH',
    'HOME',
    'LD_LIBRARY_PATH',
    'LIBGL_ALWAYS_SOFTWARE',
    'LOGNAME',
    'PATH',
    'SHELL',
    'TMPDIR',
    'USER',
    'XAUTHORITY',
    'XDG_DATA_DIRS',
    'XDG_RUNTIME_DIR',
  ];
  return { ...Object.fromEntries([
    ...inherited.flatMap((name) => process.env[name] === undefined ? [] : [[name, process.env[name]]]),
    ['LC_ALL', 'C.UTF-8'],
    ['LANG', 'C.UTF-8'],
  ]), ...overrides };
}
