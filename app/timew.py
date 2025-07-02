# app/timew.py

import subprocess
import re
from config import Config

TIMEW_BIN = Config.TIMEWARRIOR_BIN

def get_current_task():
    """
    Returns the tag of the most recent Timewarrior interval.
    Uses 'timew summary :id @1' to fetch the latest entry.
    Parses the first data row for the tag immediately following '@1'.
    """
    try:
        output = subprocess.check_output(
            [TIMEW_BIN, 'summary', ':id', '@1'],
            text=True,
            stderr=subprocess.DEVNULL
        )
    except subprocess.CalledProcessError:
        return None

    # Each data row starts with a week number and date; skip header and separator lines
    for line in output.splitlines():
        # Look for the line containing '@1'
        if '@1' in line and not line.strip().startswith(('Wk', '---')):
            parts = line.split()
            try:
                idx = parts.index('@1')
                # Tag is the token immediately after '@1'
                return parts[idx + 1]
            except (ValueError, IndexError):
                continue
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