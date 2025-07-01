# app/timew.py

import subprocess
from config import Config

TIMEW_BIN = Config.TIMEWARRIOR_BIN

def get_current_task():
    """
    Returns the currently running Timewarrior context (or None if idle).
    """
    try:
        # 'timew get dom.active' prints the active tag or an empty string if none.
        output = subprocess.check_output(
            [TIMEW_BIN, 'get', 'dom.active'],
            text=True,
            stderr=subprocess.DEVNULL
        ).strip()
        return output or None
    except subprocess.CalledProcessError:
        return None


def switch_task(to_task):
    """
    Stops the current task (if any) and starts the new one.
    Returns a tuple (from_task, to_task).
    """
    from_task = get_current_task()

    # Stop current task, if running
    if from_task:
        subprocess.call([TIMEW_BIN, 'stop'])

    # Start the new task
    subprocess.call([TIMEW_BIN, 'start', to_task])

    return from_task, to_task


# New function: get_current_summary

def get_current_summary():
    """
    Returns the full Timewarrior summary for the active interval,
    including task name, start time, current time, and total.
    """
    try:
        output = subprocess.check_output(
            [TIMEW_BIN, 'summary'],
            text=True,
            stderr=subprocess.DEVNULL
        )
        return output.strip()
    except subprocess.CalledProcessError:
        return None


# New function: stop_task
def stop_task():
    """
    Stops the current Timewarrior task without starting a new one.
    Returns the stopped task or None.
    """
    from_task = get_current_task()
    if from_task:
        subprocess.call([TIMEW_BIN, 'stop'])
    return from_task