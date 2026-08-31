from kittens.tui.handler import result_handler
from kitty.fast_data_types import PRESS, RELEASE, send_mouse_event

# This helper runs inside Kitty and injects real emulator mouse events.

def main(args):
    return None


@result_handler(no_ui=True)
def handle_result(args, result, target_window_id, boss):
    screen = boss.active_window.screen
    for button in (1, 3, 2):
        send_mouse_event(screen, 2, 2, button, PRESS, 0)
        send_mouse_event(screen, 2, 2, button, RELEASE, 0)
    return "sent"
