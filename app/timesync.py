# app/timesync.py

import subprocess
import json
from datetime import datetime, timedelta
from config import Config
from app.jira_client import get_jira_client
import re

TIMEW_BIN = Config.TIMEWARRIOR_BIN


def get_timewarrior_intervals(start_date, end_date):
    """
    Get Timewarrior intervals between start_date and end_date.
    Returns list of intervals with JIRA ticket tags.
    """
    try:
        # Export timewarrior data as JSON
        # First try without date range to see if we get any data
        cmd = [TIMEW_BIN, 'export']
        
        output = subprocess.check_output(cmd, text=True, stderr=subprocess.STDOUT)
        
        if not output.strip():
            return []
            
        intervals = json.loads(output)
        
        # Filter for intervals with JIRA ticket tags
        jira_intervals = []
        jira_pattern = re.compile(r'^[A-Z]+-\d+$')
        
        for interval in intervals:
            if 'tags' not in interval:
                continue
                
            # Check if any tag matches JIRA ticket format
            jira_tags = [tag for tag in interval['tags'] if jira_pattern.match(tag)]
            
            if jira_tags:
                # Calculate duration in seconds
                # Timewarrior export format: 20250806T151630Z (UTC format)
                # But it's actually local time, so we need to handle this correctly
                try:
                    start_str = interval['start']
                    
                    # Timewarrior uses Z suffix but actually stores LOCAL time, not UTC
                    # So we need to parse without timezone, then assign local timezone
                    import zoneinfo
                    local_tz = datetime.now().astimezone().tzinfo
                    
                    if start_str.endswith('Z'):
                        # Timewarrior Z format is UTC time, convert to local timezone
                        from datetime import timezone
                        start_utc = datetime.strptime(start_str[:-1], '%Y%m%dT%H%M%S').replace(tzinfo=timezone.utc)
                        start = start_utc.astimezone(local_tz)
                    else:
                        start = datetime.fromisoformat(start_str)
                    
                    if 'end' in interval:
                        end_str = interval['end']
                        if end_str.endswith('Z'):
                            # Timewarrior Z format is UTC time, convert to local timezone
                            from datetime import timezone
                            end_utc = datetime.strptime(end_str[:-1], '%Y%m%dT%H%M%S').replace(tzinfo=timezone.utc)
                            end = end_utc.astimezone(local_tz)
                        else:
                            end = datetime.fromisoformat(end_str)
                    else:
                        end = datetime.now().astimezone()
                    
                    duration_seconds = int((end - start).total_seconds())
                    
                    # Skip entries less than 60 seconds (likely accidental starts/stops)
                    if duration_seconds < 60:
                        continue
                    
                    interval_data = {
                        'id': interval.get('id', 0),
                        'start': start.replace(tzinfo=None).isoformat(),
                        'end': end.replace(tzinfo=None).isoformat(),
                        'ticket': jira_tags[0],  # Use first JIRA ticket tag
                        'tags': interval['tags'],
                        'duration_seconds': duration_seconds,
                        'duration_formatted': format_duration(duration_seconds),
                        'note': None  # Will be populated from Switch records
                    }
                    
                    # Try to find a matching Switch record to get the note
                    try:
                        from app.models import SessionLocal, Switch
                        from datetime import timedelta
                        db = SessionLocal()
                        
                        # Convert start time to UTC naive datetime for database comparison
                        # The database stores UTC times without timezone info
                        start_utc = start.astimezone(timezone.utc).replace(tzinfo=None)
                        
                        # Look for a Switch record around this time (within 1 minute)
                        switch = db.query(Switch).filter(
                            Switch.to_task == jira_tags[0],
                            Switch.timestamp >= start_utc - timedelta(minutes=1),
                            Switch.timestamp <= start_utc + timedelta(minutes=1)
                        ).first()
                        
                        if switch and switch.note:
                            interval_data['note'] = switch.note
                        
                        db.close()
                    except Exception as e:
                        pass  # Silently ignore if we can't get the note
                    
                    jira_intervals.append(interval_data)
                except Exception as parse_error:
                    continue
        
        # Sort by start time (most recent first)
        jira_intervals.sort(key=lambda i: i['start'], reverse=True)
        return jira_intervals
        
    except subprocess.CalledProcessError as e:
        return []
    except json.JSONDecodeError as e:
        return []
    except Exception as e:
        return []


def get_single_ticket_data(ticket_id, start_date=None, end_date=None):
    """
    Get Timewarrior intervals and JIRA data for a specific ticket.
    If no dates provided, defaults to past 3 months.
    """
    if not start_date or not end_date:
        # Default to past 3 months
        end = datetime.now()
        start = end - timedelta(days=90)
        start_date = start.strftime('%Y-%m-%d')
        end_date = end.strftime('%Y-%m-%d')
    # Get all intervals and filter for this specific ticket
    all_intervals = get_timewarrior_intervals(start_date, end_date)
    ticket_intervals = [i for i in all_intervals if i['ticket'] == ticket_id]
    
    if not ticket_intervals:
        # No Timewarrior data, but still get JIRA info
        ticket_data = {
            'ticket': ticket_id,
            'intervals': [],
            'total_seconds': 0,
            'total_formatted': '0h 0m',
            'interval_count': 0,
            'earliest_start': None,
            'latest_end': None
        }
    else:
        # Calculate totals
        total_seconds = sum(i['duration_seconds'] for i in ticket_intervals)
        earliest_start = min(i['start'] for i in ticket_intervals)
        latest_end = max(i['end'] for i in ticket_intervals)
        
        ticket_data = {
            'ticket': ticket_id,
            'intervals': ticket_intervals,
            'total_seconds': total_seconds,
            'total_formatted': format_duration(total_seconds),
            'interval_count': len(ticket_intervals),
            'earliest_start': earliest_start,
            'latest_end': latest_end
        }
    
    # Get JIRA info
    jira = get_jira_client()
    try:
        issue = jira.issue(ticket_id, expand='changelog', fields='summary')
        ticket_data['summary'] = issue.fields.summary
        
        # Get existing worklogs for this period - simplified approach
        existing_seconds = 0
        try:
            # Get all worklogs and filter by current user
            worklogs = jira.worklogs(ticket_id)
            
            for worklog in worklogs:
                try:
                    # Convert author to string for matching
                    author_str = str(worklog.author)
                    
                    # Check if current user is mentioned in the author string
                    # Try JIRA_DISPLAY_NAME first, fallback to JIRA_USER
                    user_identifier = Config.JIRA_DISPLAY_NAME or Config.JIRA_USER
                    if user_identifier and user_identifier.lower() in author_str.lower():
                        # Handle timezone properly for worklog date
                        worklog_start_str = worklog.started
                        if worklog_start_str.endswith('Z'):
                            worklog_date = datetime.fromisoformat(worklog_start_str.replace('Z', '+00:00'))
                        elif '+' in worklog_start_str or '-' in worklog_start_str.split('T')[-1]:
                            # Already has timezone info
                            worklog_date = datetime.fromisoformat(worklog_start_str)
                        else:
                            worklog_date = datetime.fromisoformat(worklog_start_str + '+00:00')
                        
                        start_dt = datetime.fromisoformat(start_date) if 'T' in start_date else datetime.strptime(start_date, '%Y-%m-%d').replace(tzinfo=worklog_date.tzinfo)
                        end_dt = datetime.fromisoformat(end_date + 'T23:59:59+00:00') if 'T' not in end_date else datetime.fromisoformat(end_date)
                        
                        if start_dt <= worklog_date <= end_dt:
                            existing_seconds += worklog.timeSpentSeconds
                except Exception as worklog_item_error:
                    continue
                    
        except Exception as worklog_error:
            print(f"Warning: Could not fetch worklogs for {ticket_id}: {worklog_error}")
            existing_seconds = 0
        
        ticket_data['existing_seconds'] = existing_seconds
        ticket_data['existing_formatted'] = format_duration(existing_seconds)
        ticket_data['new_seconds'] = ticket_data['total_seconds']
        ticket_data['new_formatted'] = format_duration(ticket_data['new_seconds'])
        
        # Get the actual worklog entries for display
        ticket_data['existing_worklogs'] = get_jira_worklogs(ticket_id, start_date)
        
    except Exception as e:
        ticket_data['summary'] = f"Error loading: {str(e)}"
        ticket_data['existing_seconds'] = 0
        ticket_data['existing_formatted'] = "0h 0m"
        ticket_data['new_seconds'] = ticket_data['total_seconds']
        ticket_data['new_formatted'] = ticket_data['total_formatted']
    
    return ticket_data


def get_timewarrior_by_ticket(start_date, end_date):
    """
    Get Timewarrior intervals grouped by JIRA ticket.
    Returns dict with ticket IDs as keys and aggregated data as values.
    """
    intervals = get_timewarrior_intervals(start_date, end_date)
    
    # Group by ticket
    tickets = {}
    for interval in intervals:
        ticket_id = interval['ticket']
        if ticket_id not in tickets:
            tickets[ticket_id] = {
                'ticket': ticket_id,
                'intervals': [],
                'total_seconds': 0,
                'earliest_start': interval['start'],
                'latest_end': interval['end']
            }
        
        tickets[ticket_id]['intervals'].append(interval)
        tickets[ticket_id]['total_seconds'] += interval['duration_seconds']
        
        # Update earliest/latest times
        if interval['start'] < tickets[ticket_id]['earliest_start']:
            tickets[ticket_id]['earliest_start'] = interval['start']
        if interval['end'] > tickets[ticket_id]['latest_end']:
            tickets[ticket_id]['latest_end'] = interval['end']
    
    # Format totals and get JIRA info
    jira = get_jira_client()
    for ticket_id, data in tickets.items():
        data['total_formatted'] = format_duration(data['total_seconds'])
        data['interval_count'] = len(data['intervals'])
        
        # Get ticket summary and existing worklogs
        try:
            issue = jira.issue(ticket_id, fields='summary')
            data['summary'] = issue.fields.summary
            
            # Get existing worklogs for this period - simplified approach
            existing_seconds = 0
            try:
                # Get all worklogs and filter by current user
                worklogs = jira.worklogs(ticket_id)
                
                for worklog in worklogs:
                    try:
                        # Convert author to string for matching
                        author_str = str(worklog.author)
                        
                        # Check if current user is mentioned in the author string
                        # Try JIRA_DISPLAY_NAME first, fallback to JIRA_USER
                        user_identifier = Config.JIRA_DISPLAY_NAME or Config.JIRA_USER
                        if user_identifier and user_identifier.lower() in author_str.lower():
                            # Handle timezone properly for worklog date
                            worklog_start_str = worklog.started
                            if worklog_start_str.endswith('Z'):
                                worklog_date = datetime.fromisoformat(worklog_start_str.replace('Z', '+00:00'))
                            elif '+' in worklog_start_str or '-' in worklog_start_str.split('T')[-1]:
                                # Already has timezone info
                                worklog_date = datetime.fromisoformat(worklog_start_str)
                            else:
                                worklog_date = datetime.fromisoformat(worklog_start_str + '+00:00')
                            
                            start_dt = datetime.fromisoformat(start_date) if 'T' in start_date else datetime.strptime(start_date, '%Y-%m-%d').replace(tzinfo=worklog_date.tzinfo)
                            end_dt = datetime.fromisoformat(end_date + 'T23:59:59+00:00') if 'T' not in end_date else datetime.fromisoformat(end_date)
                            
                            if start_dt <= worklog_date <= end_dt:
                                existing_seconds += worklog.timeSpentSeconds
                    except Exception as worklog_item_error:
                        continue
                        
            except Exception as worklog_error:
                print(f"Warning: Could not fetch worklogs for {ticket_id}: {worklog_error}")
                existing_seconds = 0
            
            data['existing_seconds'] = existing_seconds
            data['existing_formatted'] = format_duration(existing_seconds)
            data['new_seconds'] = data['total_seconds']  # Will be adjusted based on what's selected
            data['new_formatted'] = format_duration(data['new_seconds'])
            
            # Get the actual worklog entries for display
            data['existing_worklogs'] = get_jira_worklogs(ticket_id, start_date)
            
        except Exception as e:
            data['summary'] = f"Error loading: {str(e)}"
            data['existing_seconds'] = 0
            data['existing_formatted'] = "0h 0m"
            data['new_seconds'] = data['total_seconds']
            data['new_formatted'] = data['total_formatted']
    
    return tickets


def format_duration(seconds):
    """Format duration in seconds to human readable format."""
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    
    if hours > 0:
        return f"{hours}h {minutes}m"
    else:
        return f"{minutes}m"


def get_jira_worklogs(ticket_id, start_date=None):
    """
    Get existing worklogs from JIRA for a specific ticket.
    Optionally filter by start_date.
    """
    try:
        jira = get_jira_client()
        worklogs_list = jira.worklogs(ticket_id)
        
        worklogs = []
        for worklog in worklogs_list:
            # Check if this worklog is by the current user using string matching
            if hasattr(worklog, 'author'):
                try:
                    author_str = str(worklog.author)
                    author_display = author_str  # Use the string representation as display name
                    
                    # Check if current user is mentioned in the author string
                    # Try JIRA_DISPLAY_NAME first, fallback to JIRA_USER
                    user_identifier = Config.JIRA_DISPLAY_NAME or Config.JIRA_USER
                    is_current_user = user_identifier and user_identifier.lower() in author_str.lower()
                    
                    if not is_current_user:
                        continue
                except Exception:
                    continue
            else:
                continue
                
            worklog_data = {
                'id': worklog.id,
                'author': author_display,
                'started': worklog.started,
                'timeSpentSeconds': worklog.timeSpentSeconds,
                'timeSpent': worklog.timeSpent,
                'comment': getattr(worklog, 'comment', '')
            }
            
            # Filter by start date if provided
            if start_date:
                # Handle timezone properly for worklog date
                worklog_start_str = worklog.started
                
                # Clean up duplicate timezone suffixes if present
                if '+00:00' in worklog_start_str and ('-' in worklog_start_str[:19] or '+' in worklog_start_str[:19]):
                    worklog_start_str = worklog_start_str.replace('+00:00', '')
                
                if worklog_start_str.endswith('Z'):
                    worklog_date = datetime.fromisoformat(worklog_start_str.replace('Z', '+00:00'))
                elif '+' in worklog_start_str or '-' in worklog_start_str.split('T')[-1]:
                    # Already has timezone info (like -0400 or +0000)
                    worklog_date = datetime.fromisoformat(worklog_start_str)
                else:
                    # No timezone info, assume UTC
                    worklog_date = datetime.fromisoformat(worklog_start_str + '+00:00')
                
                # Handle timezone for filter date
                if 'T' in start_date:
                    filter_date = datetime.fromisoformat(start_date)
                else:
                    filter_date = datetime.strptime(start_date, '%Y-%m-%d').replace(tzinfo=worklog_date.tzinfo)
                
                if worklog_date < filter_date:
                    continue
                    
            worklogs.append(worklog_data)
        
        # Sort by started time (most recent first)
        worklogs.sort(key=lambda w: w['started'], reverse=True)
        return worklogs
        
    except Exception as e:
        print(f"Error fetching worklogs for {ticket_id}: {e}")
        return []


def check_duplicate_worklog(ticket_id, start_time, duration_seconds, tolerance_minutes=5):
    """
    Check if a worklog already exists for this ticket around the given time.
    Returns True if duplicate found.
    """
    worklogs = get_jira_worklogs(ticket_id)
    
    # Handle timezone properly - clean up duplicate timezone suffixes
    if '+00:00' in start_time and ('-' in start_time[:19] or '+' in start_time[:19]):
        start_time = start_time.replace('+00:00', '')
    
    if start_time.endswith('Z'):
        start_dt = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
    elif '+' in start_time or '-' in start_time.split('T')[-1]:
        start_dt = datetime.fromisoformat(start_time)
    else:
        start_dt = datetime.fromisoformat(start_time + '+00:00')
        
    tolerance = timedelta(minutes=tolerance_minutes)
    
    for worklog in worklogs:
        worklog_start_str = worklog['started']
        
        # Clean up duplicate timezone suffixes if present
        if '+00:00' in worklog_start_str and ('-' in worklog_start_str[:19] or '+' in worklog_start_str[:19]):
            worklog_start_str = worklog_start_str.replace('+00:00', '')
        
        if worklog_start_str.endswith('Z'):
            worklog_start = datetime.fromisoformat(worklog_start_str.replace('Z', '+00:00'))
        elif '+' in worklog_start_str or '-' in worklog_start_str.split('T')[-1]:
            worklog_start = datetime.fromisoformat(worklog_start_str)
        else:
            worklog_start = datetime.fromisoformat(worklog_start_str + '+00:00')
        
        # Check if start times are within tolerance
        if abs(worklog_start - start_dt) <= tolerance:
            # Check if durations are similar (within 10%)
            if abs(worklog['timeSpentSeconds'] - duration_seconds) < duration_seconds * 0.1:
                return True
                
    return False


def sync_interval_to_jira(ticket_id, start_time, duration_seconds, comment=None):
    """
    Add a worklog entry to JIRA for the given ticket.
    Returns success status and message.
    """
    try:
        # Check for duplicates first
        if check_duplicate_worklog(ticket_id, start_time, duration_seconds):
            return False, f"Worklog already exists for {ticket_id} at {start_time}"
        
        jira = get_jira_client()
        
        # Format comment - use provided note or default message
        if comment:
            # If we have a note from the Switch record, use it
            comment = comment.strip()
            # Add a footer to indicate it was synced
            if not comment.endswith('.'):
                comment += '.'
            comment += " (Synced from Timewarrior)"
        else:
            comment = "Time tracked via Timewarrior sync"
        
        # Add worklog
        # The database stores LOCAL times (from Timewarrior), not UTC times
        # But JIRA is treating them as UTC and converting to EDT
        # So we need to add timezone info to tell JIRA this is already local time
        
        import time
        from datetime import timezone
        
        # Parse the timestamp as a naive datetime (no timezone)
        if start_time.endswith('Z'):
            # If it has Z, remove it and parse
            started_naive = datetime.fromisoformat(start_time.replace('Z', ''))
        elif '+' in start_time.split('T')[-1] or '-' in start_time.split('T')[-1]:
            # If it has timezone offset, parse and convert to naive
            started_with_tz = datetime.fromisoformat(start_time)
            started_naive = started_with_tz.replace(tzinfo=None)
        else:
            # No timezone info - parse as is (local time)
            started_naive = datetime.fromisoformat(start_time)
        
        # Create a timezone-aware datetime in local timezone
        # For EDT, the offset is -4 hours from UTC
        local_offset_seconds = -time.altzone if time.daylight else -time.timezone
        local_tz = timezone(timedelta(seconds=local_offset_seconds))
        started = started_naive.replace(tzinfo=local_tz)
        
        # Send the timezone-aware local time to JIRA
        
        jira.add_worklog(
            issue=ticket_id,
            timeSpentSeconds=duration_seconds,
            started=started,
            comment=comment
        )
        
        return True, f"Successfully synced {format_duration(duration_seconds)} to {ticket_id}"
        
    except Exception as e:
        return False, f"Error syncing to {ticket_id}: {str(e)}"


def batch_sync_to_jira(intervals):
    """
    Sync multiple Timewarrior intervals to JIRA.
    Returns list of results.
    """
    results = []
    
    for interval in intervals:
        # Use the note that's already included in the interval data
        comment = interval.get('note', None)
        
        # If no note in interval data, try to look it up from the database
        if not comment:
            from app.models import SessionLocal, Switch
            db = SessionLocal()
            try:
                # Parse the start time to match against Switch records
                start_str = interval['start']
                if 'T' in start_str:
                    # The interval start time is in ISO format, already in local time converted to UTC naive
                    # We need to parse it as a naive datetime to match the database
                    from datetime import timedelta
                    # interval['start'] is already a UTC naive datetime string from get_timewarrior_intervals
                    start_dt = datetime.fromisoformat(start_str)
                    
                    # Look for a Switch record around this time (within 1 minute)
                    # and with the matching ticket ID
                    switch = db.query(Switch).filter(
                        Switch.to_task == interval['ticket'],
                        Switch.timestamp >= start_dt - timedelta(minutes=1),
                        Switch.timestamp <= start_dt + timedelta(minutes=1)
                    ).first()
                    
                    if switch and switch.note:
                        comment = switch.note
                    
                    db.close()
            except Exception as e:
                print(f"Warning: Could not lookup note for interval: {e}")
        
        success, message = sync_interval_to_jira(
            interval['ticket'],
            interval['start'],
            interval['duration_seconds'],
            comment=comment
        )
        
        results.append({
            'ticket': interval['ticket'],
            'start': interval['start'],
            'duration': interval['duration_formatted'],
            'success': success,
            'message': message,
            'comment': comment or 'No note'
        })
    
    return results