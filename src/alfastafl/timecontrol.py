"""Authoritative, serializable tafl clock rules (no UI or operating-system clocks).

The Store supplies elapsed monotonic time and controls when clocks run.
No OS timestamp or monotonic origin is persisted as a running clock.
"""

MODES = ('unlimited', 'move', 'total')
DEFAULT_GRACE_SECONDS = 15
DEFAULT_RECONNECT_SECONDS = 300


def normalize_settings(value):
    """Validate creation options without breaking pre-clock historical saves."""
    if value is None:
        value = {}
    if not isinstance(value, dict):
        raise ValueError('Invalid game settings')
    settings = dict(value)
    tc = settings.get('time_control') or {'mode': 'unlimited'}
    if not isinstance(tc, dict):
        raise ValueError('Invalid time control')
    mode = tc.get('mode', 'unlimited')
    if mode not in MODES:
        raise ValueError('Invalid time-control mode')
    raw_seconds = tc.get('seconds', 0) if mode == 'unlimited' else tc.get('seconds')
    if mode == 'unlimited':
        seconds = 0
    elif type(raw_seconds) is not int or not 1 <= raw_seconds <= 86400:
        raise ValueError('Time limit must be an integer between 1 and 86400 seconds')
    else:
        seconds = raw_seconds
    settings['time_control'] = {'mode': mode, 'seconds': seconds}
    reconnect = settings.get('reconnect_timeout_seconds', DEFAULT_RECONNECT_SECONDS)
    if type(reconnect) is not int or not 15 <= reconnect <= 3600:
        raise ValueError('Reconnection timeout must be between 15 and 3600 seconds')
    settings['reconnect_timeout_seconds'] = reconnect
    grace = settings.get('disconnect_grace_seconds', DEFAULT_GRACE_SECONDS)
    if type(grace) is not int or not 3 <= grace <= 60:
        raise ValueError('Disconnection grace must be between 3 and 60 seconds')
    settings['disconnect_grace_seconds'] = grace
    return settings


def new_clock(settings):
    tc = settings['time_control']
    seconds = tc['seconds']
    return {
        'mode': tc['mode'],
        'seconds': seconds,
        'remaining': {'elf': float(seconds) if tc['mode'] == 'total' else None,
                      'dwarf': float(seconds) if tc['mode'] == 'total' else None},
        'turn_remaining': float(seconds) if tc['mode'] == 'move' else None,
        'started': False,
    }


def charge(clock, side, elapsed):
    """Consume time; return True on an expiration, and never run backwards."""
    if clock['mode'] == 'unlimited' or not clock['started']:
        return False
    elapsed = max(0.0, float(elapsed))
    if clock['mode'] == 'move':
        clock['turn_remaining'] = max(0.0, clock['turn_remaining'] - elapsed)
        return clock['turn_remaining'] <= 0.0
    clock['remaining'][side] = max(0.0, clock['remaining'][side] - elapsed)
    return clock['remaining'][side] <= 0.0


def switch_turn(clock):
    if clock['mode'] == 'move':
        clock['turn_remaining'] = float(clock['seconds'])
