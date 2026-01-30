from flask import Flask, jsonify, request, render_template
from app.models import init_db, SessionLocal, Switch
from sqlalchemy.exc import IntegrityError
from app.models import CustomTask, TagPreset, TodoItem, generate_internal_ticket_id
from app.timew import get_current_task, get_current_summary, switch_task, stop_task
from app.jira_client import get_assigned_tickets
from app.activitywatch import get_activitywatch_hours
from app.timesync import get_timewarrior_intervals, get_jira_worklogs, batch_sync_to_jira, get_timewarrior_by_ticket, get_single_ticket_data
from datetime import date, timedelta, datetime, timezone
from sqlalchemy import func, desc
import json
import csv
import time
from io import StringIO
from flask import Response

# Initialize database (creates tables if needed)
init_db()

app = Flask(__name__)

@app.route("/", methods=["GET"])
def index():
    """
    Serve the main context switcher UI.
    """
    from config import Config
    return render_template("index.html", jira_url=Config.JIRA_URL or '')

@app.route("/current", methods=["GET"])
def current():
    """
    Return the currently active Timewarrior task and its summary.
    """
    current_tag = get_current_task()
    summary = get_current_summary()
    return jsonify({"current": current_tag, "summary": summary}), 200

@app.route("/tickets", methods=["GET"])
def tickets():
    """
    Return a list of up-to-date Jira tickets assigned to the user.
    """
    try:
        issues = get_assigned_tickets()
        # issues is a list of (key, summary) tuples
        payload = [{"key": k, "summary": s} for k, s in issues]
        return jsonify(payload), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/switch", methods=["POST"])
def do_switch():
    """
    Switch tasks: stop current, start new, and log the switch.
    Expects JSON: {"to_task": "ABC-123", "note": "...", "tags": ["meeting:standup", "priority:high"]}
    """
    data = request.get_json(force=True)
    to_task = data.get("to_task")
    note = data.get("note")
    tags = data.get("tags", [])
    is_switch = data.get("is_switch", True)

    if not to_task:
        return jsonify({"error": "Missing 'to_task'"}), 400

    # Validate tags format
    if tags and not isinstance(tags, list):
        return jsonify({"error": "Tags must be an array"}), 400

    # Perform the Timewarrior switch
    from_task, new_task = switch_task(to_task)

    # Log into the database
    db = SessionLocal()
    
    # Set end_time for the previous task (if any)
    if from_task:
        # Find the most recent switch to the from_task and set its end_time
        previous_switch = db.query(Switch).filter(
            Switch.to_task == from_task,
            Switch.end_time.is_(None)
        ).order_by(Switch.timestamp.desc()).first()
        
        if previous_switch:
            # Store end time in UTC to match timestamp format
            previous_switch.end_time = datetime.now(timezone.utc).replace(tzinfo=None)
    
    # Serialize tags to JSON string for SQLite storage
    tags_json = json.dumps(tags) if tags else None

    record = Switch(
        from_task=from_task,
        to_task=new_task,
        note=note,
        category=None,  # No longer used, kept for backward compatibility
        tags=tags_json,
        is_switch=is_switch
    )
    db.add(record)
    db.commit()
    db.close()

    return jsonify({"from": from_task,
        "to": new_task,
        "note": note,
        "tags": tags}), 200

@app.route("/stop", methods=["POST"])
def stop_current():
    """
    Stop the current task by setting its end_time. No new record is created.
    """
    from_task = stop_task()
    
    # Log into the database
    db = SessionLocal()
    
    # Set end_time for the current task being stopped
    if from_task:
        # Find the most recent switch to the from_task and set its end_time
        current_switch = db.query(Switch).filter(
            Switch.to_task == from_task,
            Switch.end_time.is_(None)
        ).order_by(Switch.timestamp.desc()).first()
        
        if current_switch:
            # Store end time in UTC to match timestamp format
            current_switch.end_time = datetime.now(timezone.utc).replace(tzinfo=None)
            db.commit()
        
        db.close()
        return jsonify({"from": from_task, "to": ""}), 200
    else:
        db.close()
        return jsonify({"from": None, "to": ""}), 200

# --- Custom tasks and combined tasks endpoints ---

@app.route("/tasks", methods=["GET"])
def all_tasks():
    """
    Return a combined list of Jira tickets and active internal tasks.
    """
    db = SessionLocal()
    # Only get active internal tasks (not completed)
    active_internal = db.query(CustomTask).filter(CustomTask.status.in_(["todo", "in_progress"])).all()
    db.close()
    jira = get_assigned_tickets()  # list of (key, summary)
    
    # For internal tasks, use ticket_id and name
    internal_tasks = []
    for t in active_internal:
        # Use ticket_id as key and name as summary
        internal_tasks.append((t.ticket_id, t.name))
    
    combined = [(k, s) for k, s in jira] + internal_tasks
    return jsonify([{"key": k, "summary": s} for k, s in combined]), 200

@app.route("/tasks", methods=["POST"])
def add_internal_task():
    """
    Create a new internal task. Expects JSON {"name": "Fix deployment", "description": "Optional details"}.
    Generates auto ticket ID like INT-001.
    """
    data = request.get_json(force=True)
    name = data.get("name")
    description = data.get("description", "")
    if not name:
        return jsonify({"error": "Missing 'name'"}), 400
    
    # Generate internal ticket ID
    ticket_id = generate_internal_ticket_id()
    
    db = SessionLocal()
    task = CustomTask(
        ticket_id=ticket_id,
        name=name,
        description=description,
        status="todo"
    )
    db.add(task)
    try:
        db.commit()
        db.close()
        return jsonify({
            "ticket_id": ticket_id,
            "name": name,
            "description": description,
            "status": "todo"
        }), 201
    except IntegrityError:
        db.rollback()
        db.close()
        return jsonify({"error": "Database error"}), 500

@app.route("/tasks/<task_id>", methods=["DELETE"])
def delete_internal_task(task_id):
    """
    Delete an internal task by ticket ID.
    """
    db = SessionLocal()
    task = db.query(CustomTask).filter(CustomTask.ticket_id == task_id).first()

    if not task:
        db.close()
        return jsonify({"error": "Task not found"}), 404

    db.delete(task)
    db.commit()
    db.close()

    return jsonify({"message": f"Task {task_id} deleted successfully"}), 200

@app.route("/tasks/<task_id>", methods=["PUT"])
def update_internal_task(task_id):
    """
    Update an internal task's name and/or description.
    Expects JSON {"name": "...", "description": "..."}
    """
    data = request.get_json(force=True)
    name = data.get("name")
    description = data.get("description")

    if not name or not name.strip():
        return jsonify({"error": "Task name is required"}), 400

    db = SessionLocal()
    task = db.query(CustomTask).filter(CustomTask.ticket_id == task_id).first()

    if not task:
        db.close()
        return jsonify({"error": "Task not found"}), 404

    task.name = name.strip()
    task.description = description.strip() if description else None
    db.commit()
    db.close()

    return jsonify({
        "ticket_id": task_id,
        "name": task.name,
        "description": task.description,
        "message": f"Task {task_id} updated successfully"
    }), 200

@app.route("/tasks/<task_id>/status", methods=["PUT"])
def update_task_status(task_id):
    """
    Update task status for kanban workflow.
    Expects JSON {"status": "todo|in_progress|done"}
    """
    data = request.get_json(force=True)
    new_status = data.get("status")
    
    if new_status not in ["todo", "in_progress", "done"]:
        return jsonify({"error": "Invalid status. Must be: todo, in_progress, done"}), 400
    
    db = SessionLocal()
    task = db.query(CustomTask).filter(CustomTask.ticket_id == task_id).first()
    
    if not task:
        db.close()
        return jsonify({"error": "Task not found"}), 404
    
    task.status = new_status
    db.commit()
    db.close()
    
    return jsonify({
        "ticket_id": task_id,
        "status": new_status,
        "message": f"Task {task_id} moved to {new_status}"
    }), 200

@app.route("/tasks/internal", methods=["GET"])
def get_internal_tasks():
    """
    Return internal tasks grouped by status for kanban board.
    """
    status_filter = request.args.get("status")  # Optional filter by status
    
    db = SessionLocal()
    query = db.query(CustomTask).order_by(CustomTask.created_date.desc())
    
    if status_filter:
        query = query.filter(CustomTask.status == status_filter)
    
    internal_tasks = query.all()
    db.close()

    result = [{
        "ticket_id": task.ticket_id,
        "name": task.name,
        "description": task.description,
        "status": task.status,
        "created_date": task.created_date.isoformat() if task.created_date else None
    } for task in internal_tasks]
    
    return jsonify(result), 200

@app.route("/tags/presets", methods=["GET"])
def get_tag_presets():
    """
    Return available tag presets for UI assistance.
    """
    db = SessionLocal()
    presets = db.query(TagPreset).filter(TagPreset.is_active.is_(True)).order_by(TagPreset.tag_type, TagPreset.tag_value).all()
    db.close()

    result = [{"tag_type": preset.tag_type,
        "tag_value": preset.tag_value,
        "tag": f"{preset.tag_type}:{preset.tag_value}",
        "description": preset.description} for preset in presets]

    return jsonify(result), 200

@app.route("/tags/presets", methods=["POST"])
def add_tag_preset():
    """
    Add a new tag preset. Expects JSON: {"tag_type": "meeting", "tag_value": "standup", "description": "..."}
    """
    data = request.get_json(force=True)
    tag_type = data.get("tag_type", "").strip()
    tag_value = data.get("tag_value", "").strip()
    description = data.get("description", "").strip()

    if not tag_type or not tag_value:
        return jsonify({"error": "Both tag_type and tag_value are required"}), 400

    db = SessionLocal()
    preset = TagPreset(
        tag_type=tag_type,
        tag_value=tag_value,
        description=description,
        is_active=True
    )
    db.add(preset)

    try:
        db.commit()
        result = {"tag_type": tag_type,
            "tag_value": tag_value,
            "tag": f"{tag_type}:{tag_value}",
            "description": description}
        db.close()
        return jsonify(result), 201
    except IntegrityError:
        db.rollback()
        db.close()
        return jsonify({"error": f"Tag preset {tag_type}:{tag_value} already exists"}), 409

@app.route("/metrics/counts", methods=["GET"])
def get_switch_counts():
    """
    Returns a list of {date: 'YYYY-MM-DD', count: N} for either
    the current week (Mon→Sun) or the current month, based on the
    'view' query parameter ('week' or 'month').
    """
    view = request.args.get("view", "week")
    today = date.today()

    db = SessionLocal()
    out = []

    if view == "month":
        # First day of current month
        start = today.replace(day=1)
        # Compute first day of next month
        if start.month == 12:
            next_month = date(start.year + 1, 1, 1)
        else:
            next_month = date(start.year, start.month + 1, 1)
        # Last day of current month
        last_day = next_month - timedelta(days=1)

        rows = (
            db.query(
                func.date(Switch.timestamp).label("day"),
                func.count(Switch.id).label("count")
            )
            .filter(Switch.timestamp >= start)
            .filter(Switch.timestamp < next_month)
            .filter(Switch.is_switch.is_(True))
            .group_by("day")
            .all()
        )
        counts = {r.day: r.count for r in rows}
        # Build output for each day of month
        day = start
        while day <= last_day:
            iso = day.isoformat()
            out.append({"date": iso, "count": counts.get(iso, 0)})
            day += timedelta(days=1)
    else:
        # Week view: current week Sunday→Saturday
        days_since_sunday = (today.weekday() + 1) % 7  # Convert Mon=0 to Sun=0
        week_start = today - timedelta(days=days_since_sunday)
        week_end = week_start + timedelta(days=6)
        rows = (
            db.query(
                func.date(Switch.timestamp).label("day"),
                func.count(Switch.id).label("count")
            )
            .filter(Switch.timestamp >= week_start)
            .filter(Switch.timestamp < week_end + timedelta(days=1))
            .filter(Switch.is_switch.is_(True))
            .group_by("day")
            .all()
        )
        counts = {r.day: r.count for r in rows}
        for i in range(7):
            d = week_start + timedelta(days=i)
            iso = d.isoformat()
            out.append({"date": iso, "count": counts.get(iso, 0)})

    db.close()
    return jsonify(out), 200

@app.route("/metrics/switches", methods=["GET"])
def get_switches():
    """
    Return the raw Switch records for the specified time period, ordered newest-first.
    View parameter: 'week' or 'month' (defaults to 'month')
    """
    view = request.args.get("view", "month")
    today = date.today()
    
    if view == "week":
        # Weekly view (Sunday-Saturday)
        days_since_sunday = (today.weekday() + 1) % 7  # Convert Mon=0 to Sun=0
        start_date = today - timedelta(days=days_since_sunday)
        end_date = start_date + timedelta(days=7)
    else:
        # Monthly view (entire current month)
        start_date = today.replace(day=1)
        if start_date.month == 12:
            end_date = date(start_date.year + 1, 1, 1)
        else:
            end_date = date(start_date.year, start_date.month + 1, 1)

    db = SessionLocal()
    rows = (
        db.query(Switch)
        .filter(Switch.timestamp >= start_date)
        .filter(Switch.timestamp < end_date)
        .filter(Switch.is_switch.is_(True))
        .order_by(Switch.timestamp.desc())
        .all()
    )
    db.close()

    out = [
        {"timestamp": r.timestamp.astimezone().isoformat(),
            "from": r.from_task,
            "to":   r.to_task,
            "note": r.note,
            "category": r.category}
        for r in rows
    ]
    return jsonify(out), 200

@app.route("/analytics/time-consumers", methods=["GET"])
def get_time_consumers():
    """
    Return top time consuming tasks based on duration between switches.
    View parameter: 'week' or 'month'
    """
    view = request.args.get("view", "week")
    today = date.today()

    if view == "month":
        # 30-day rolling window
        start_date = today - timedelta(days=30)
        end_date = today + timedelta(days=1)
    else:
        days_since_sunday = (today.weekday() + 1) % 7
        start_date = today - timedelta(days=days_since_sunday)
        end_date = start_date + timedelta(days=7)

    db = SessionLocal()

    # Get all switches in the time period (including non-context switches for time tracking)
    switches = (
        db.query(Switch)
        .filter(Switch.timestamp >= start_date)
        .filter(Switch.timestamp < end_date)
        .order_by(Switch.timestamp.asc())
        .all()
    )

    # Calculate time spent on each task
    task_durations = {}

    for i in range(len(switches) - 1):
        current_switch = switches[i]
        next_switch = switches[i + 1]

        if current_switch.to_task:
            duration = (next_switch.timestamp - current_switch.timestamp).total_seconds()
            task = current_switch.to_task

            if task not in task_durations:
                task_durations[task] = {'total_seconds': 0,
                    'switch_count': 0,
                    'avg_session': 0}

            task_durations[task]['total_seconds'] += duration
            task_durations[task]['switch_count'] += 1

    # Calculate averages and format results
    result = []
    for task, data in task_durations.items():
        if data['switch_count'] > 0:
            avg_session = data['total_seconds'] / data['switch_count']
            hours = data['total_seconds'] / 3600

            result.append({'task': task,
                'total_hours': round(hours, 2),
                'total_seconds': data['total_seconds'],
                'switch_count': data['switch_count'],
                'avg_session_minutes': round(avg_session / 60, 1)})

    # Sort by total time spent
    result.sort(key=lambda x: x['total_seconds'], reverse=True)

    db.close()
    return jsonify(result[:10]), 200  # Top 10

@app.route("/analytics/switch-leaders", methods=["GET"])
def get_switch_leaders():
    """
    Return tasks that cause the most context switches.
    View parameter: 'week' or 'month'
    """
    view = request.args.get("view", "week")
    today = date.today()

    if view == "month":
        # 30-day rolling window
        start_date = today - timedelta(days=30)
        end_date = today + timedelta(days=1)
    else:
        days_since_sunday = (today.weekday() + 1) % 7
        start_date = today - timedelta(days=days_since_sunday)
        end_date = start_date + timedelta(days=7)

    db = SessionLocal()

    # Count switches by task (both from and to)
    from_counts = (
        db.query(Switch.from_task, func.count().label('count'))
        .filter(Switch.timestamp >= start_date)
        .filter(Switch.timestamp < end_date)
        .filter(Switch.is_switch.is_(True))
        .filter(Switch.from_task.isnot(None))
        .filter(Switch.from_task != '')
        .group_by(Switch.from_task)
        .all()
    )

    to_counts = (
        db.query(Switch.to_task, func.count().label('count'))
        .filter(Switch.timestamp >= start_date)
        .filter(Switch.timestamp < end_date)
        .filter(Switch.is_switch.is_(True))
        .filter(Switch.to_task.isnot(None))
        .filter(Switch.to_task != '')
        .group_by(Switch.to_task)
        .all()
    )

    # Combine counts
    task_switches = {}

    for task, count in from_counts:
        if task not in task_switches:
            task_switches[task] = {'from_count': 0, 'to_count': 0}
        task_switches[task]['from_count'] = count

    for task, count in to_counts:
        if task not in task_switches:
            task_switches[task] = {'from_count': 0, 'to_count': 0}
        task_switches[task]['to_count'] = count

    # Calculate total and format results
    result = []
    for task, counts in task_switches.items():
        total_switches = counts['from_count'] + counts['to_count']
        result.append({'task': task,
            'total_switches': total_switches,
            'switched_from': counts['from_count'],
            'switched_to': counts['to_count']})

    # Sort by total switches
    result.sort(key=lambda x: x['total_switches'], reverse=True)

    db.close()
    return jsonify(result[:10]), 200  # Top 10

@app.route("/analytics/insights", methods=["GET"])
def get_productivity_insights():
    """
    Return productivity insights and statistics.
    """
    view = request.args.get("view", "week")
    today = date.today()

    if view == "month":
        # 30-day rolling window
        start_date = today - timedelta(days=30)
        end_date = today + timedelta(days=1)
    else:
        days_since_sunday = (today.weekday() + 1) % 7
        start_date = today - timedelta(days=days_since_sunday)
        end_date = start_date + timedelta(days=7)

    db = SessionLocal()

    # Total switches
    total_switches = (
        db.query(func.count(Switch.id))
        .filter(Switch.timestamp >= start_date)
        .filter(Switch.timestamp < end_date)
        .filter(Switch.is_switch.is_(True))
        .scalar()
    )

    # Average switches per day
    days_in_period = (end_date - start_date).days
    avg_switches_per_day = total_switches / days_in_period if days_in_period > 0 else 0

    # Most active day
    daily_switches = (
        db.query(
            func.date(Switch.timestamp).label('day'),
            func.count(Switch.id).label('count')
        )
        .filter(Switch.timestamp >= start_date)
        .filter(Switch.timestamp < end_date)
        .filter(Switch.is_switch.is_(True))
        .group_by('day')
        .order_by(desc('count'))
        .first()
    )

    # Most productive hour (fewest switches)
    hourly_switches = (
        db.query(
            func.extract('hour', Switch.timestamp).label('hour'),
            func.count(Switch.id).label('count')
        )
        .filter(Switch.timestamp >= start_date)
        .filter(Switch.timestamp < end_date)
        .filter(Switch.is_switch.is_(True))
        .group_by('hour')
        .order_by('count')
        .all()
    )

    db.close()

    insights = {'period': view,
        'total_switches': total_switches,
        'avg_switches_per_day': round(avg_switches_per_day, 1),
        'most_active_day': {'date': str(daily_switches.day) if daily_switches else None,
            'switches': daily_switches.count if daily_switches else 0},
        'hourly_distribution': [
            {'hour': int(h), 'switches': count}
            for h, count in hourly_switches
        ] if hourly_switches else []}

    return jsonify(insights), 200

@app.route("/analytics/tags", methods=["GET"])
def get_tag_analytics():
    """
    Return analytics grouped by tags.
    """
    view = request.args.get("view", "week")
    today = date.today()

    if view == "month":
        # 30-day rolling window
        start_date = today - timedelta(days=30)
        end_date = today + timedelta(days=1)
    else:
        days_since_sunday = (today.weekday() + 1) % 7
        start_date = today - timedelta(days=days_since_sunday)
        end_date = start_date + timedelta(days=7)

    db = SessionLocal()

    # Get switches with tags
    switches = (
        db.query(Switch)
        .filter(Switch.timestamp >= start_date)
        .filter(Switch.timestamp < end_date)
        .filter(Switch.is_switch.is_(True))
        .filter(Switch.tags.isnot(None))
        .all()
    )

    # Count tags
    tag_counts = {}
    tag_type_counts = {}

    for switch in switches:
        if switch.tags:
            try:
                tags = json.loads(switch.tags)
                for tag in tags:
                    # Count individual tags
                    tag_counts[tag] = tag_counts.get(tag, 0) + 1

                    # Count tag types (e.g., "meeting" from "meeting:standup")
                    if ':' in tag:
                        tag_type = tag.split(':', 1)[0]
                        tag_type_counts[tag_type] = tag_type_counts.get(tag_type, 0) + 1
            except json.JSONDecodeError:
                continue

    # Sort and format results
    top_tags = sorted(tag_counts.items(), key=lambda x: x[1], reverse=True)[:10]
    top_tag_types = sorted(tag_type_counts.items(), key=lambda x: x[1], reverse=True)[:10]

    result = {'period': view,
        'top_tags': [{'tag': tag, 'count': count} for tag, count in top_tags],
        'top_tag_types': [{'type': tag_type, 'count': count} for tag_type, count in top_tag_types],
        'total_tagged_switches': len(switches)}

    db.close()
    return jsonify(result), 200

@app.route("/metrics/hours", methods=["GET"])
def get_estimated_hours():
    """
    Returns a list of {date: 'YYYY-MM-DD', hours: N} for either
    the current week (Mon→Sun) or the current month, based on the
    'view' query parameter ('week' or 'month').
    Calculates estimated work hours based on time between switches.
    """
    view = request.args.get("view", "week")
    today = date.today()

    db = SessionLocal()
    out = []

    if view == "month":
        # First day of current month
        start = today.replace(day=1)
        # Compute first day of next month
        if start.month == 12:
            next_month = date(start.year + 1, 1, 1)
        else:
            next_month = date(start.year, start.month + 1, 1)
        # Last day of current month
        last_day = next_month - timedelta(days=1)

        # Get all switches in the month
        switches = (
            db.query(Switch)
            .filter(Switch.timestamp >= start)
            .filter(Switch.timestamp < next_month)
            .order_by(Switch.timestamp.asc())
            .all()
        )

        # Calculate daily hours
        daily_hours = {}
        for i in range(len(switches) - 1):
            current_switch = switches[i]
            next_switch = switches[i + 1]
            
            if current_switch.to_task:  # Only count time when working on a task
                duration_hours = (next_switch.timestamp - current_switch.timestamp).total_seconds() / 3600
                # Cap individual sessions at 4 hours to avoid skewing data
                duration_hours = min(duration_hours, 4.0)
                
                switch_date = current_switch.timestamp.date().isoformat()
                daily_hours[switch_date] = daily_hours.get(switch_date, 0) + duration_hours

        # Build output for each day of month
        day = start
        while day <= last_day:
            iso = day.isoformat()
            out.append({"date": iso, "hours": round(daily_hours.get(iso, 0), 1)})
            day += timedelta(days=1)
    else:
        # Week view: current week Sunday→Saturday
        days_since_sunday = (today.weekday() + 1) % 7  # Convert Mon=0 to Sun=0
        week_start = today - timedelta(days=days_since_sunday)
        week_end = week_start + timedelta(days=6)
        
        # Get all switches in the week
        switches = (
            db.query(Switch)
            .filter(Switch.timestamp >= week_start)
            .filter(Switch.timestamp < week_end + timedelta(days=1))
            .order_by(Switch.timestamp.asc())
            .all()
        )

        # Calculate daily hours
        daily_hours = {}
        for i in range(len(switches) - 1):
            current_switch = switches[i]
            next_switch = switches[i + 1]
            
            if current_switch.to_task:  # Only count time when working on a task
                duration_hours = (next_switch.timestamp - current_switch.timestamp).total_seconds() / 3600
                # Cap individual sessions at 4 hours to avoid skewing data
                duration_hours = min(duration_hours, 4.0)
                
                switch_date = current_switch.timestamp.date().isoformat()
                daily_hours[switch_date] = daily_hours.get(switch_date, 0) + duration_hours

        for i in range(7):
            d = week_start + timedelta(days=i)
            iso = d.isoformat()
            out.append({"date": iso, "hours": round(daily_hours.get(iso, 0), 1)})

    db.close()
    return jsonify(out), 200

@app.route("/metrics/activitywatch-hours", methods=["GET"])
def get_activitywatch_hours_endpoint():
    """
    Returns a list of {date: 'YYYY-MM-DD', hours: N} for either
    the current week (Mon→Sun) or the current month, based on the
    'view' query parameter ('week' or 'month').
    Gets actual laptop activity time from ActivityWatch excluding AFK periods.
    """
    view = request.args.get("view", "week")
    
    try:
        hours_data = get_activitywatch_hours(view)
        return jsonify(hours_data), 200
    except Exception as e:
        # If ActivityWatch is not available, return empty data
        print(f"ActivityWatch error: {e}")
        return jsonify([]), 200

@app.route("/switches/list", methods=["GET"])
def list_switches():
    """
    List switch entries with optional date filtering.
    Query params: start_date, end_date (YYYY-MM-DD format)
    """
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    db = SessionLocal()
    query = db.query(Switch)
    
    # Apply date filters if provided
    if start_date:
        try:
            start = datetime.strptime(start_date, '%Y-%m-%d')
            query = query.filter(Switch.timestamp >= start)
        except ValueError:
            pass
    
    if end_date:
        try:
            # Add 1 day to include the entire end date
            end = datetime.strptime(end_date, '%Y-%m-%d') + timedelta(days=1)
            query = query.filter(Switch.timestamp < end)
        except ValueError:
            pass
    
    # Get switches ordered by timestamp (newest first)
    switches = query.order_by(Switch.timestamp.desc()).limit(500).all()
    db.close()
    
    # Convert to JSON-serializable format
    result = []
    for switch in switches:
        tags_list = []
        if switch.tags:
            try:
                tags_list = json.loads(switch.tags)
            except json.JSONDecodeError:
                pass
        
        # SQLite stores timestamps as naive (no timezone info)
        # We need to treat them as local time
        # The timestamp from the database is already in local time
        local_timestamp = switch.timestamp.isoformat()
        end_timestamp = switch.end_time.isoformat() if switch.end_time else None
        
        result.append({
            'id': switch.id,
            'timestamp': local_timestamp,
            'end_time': end_timestamp,
            'from_task': switch.from_task or '',
            'to_task': switch.to_task or '',
            'note': switch.note or '',
            'tags': tags_list,
            'is_switch': switch.is_switch,
            'category': switch.category or ''
        })
    
    return jsonify(result), 200

@app.route("/switches/<int:switch_id>", methods=["PUT"])
def update_switch(switch_id):
    """
    Update a switch entry.
    """
    data = request.get_json(force=True)
    
    db = SessionLocal()
    switch = db.query(Switch).filter(Switch.id == switch_id).first()
    
    if not switch:
        db.close()
        return jsonify({"error": "Switch entry not found"}), 404
    
    # Update fields if provided
    if 'from_task' in data:
        switch.from_task = data['from_task'] or None
    if 'to_task' in data:
        switch.to_task = data['to_task'] or None
    if 'note' in data:
        switch.note = data['note'] or None
    if 'tags' in data:
        if isinstance(data['tags'], list):
            switch.tags = json.dumps(data['tags']) if data['tags'] else None
        else:
            switch.tags = data['tags'] or None
    if 'is_switch' in data:
        switch.is_switch = bool(data['is_switch'])
    if 'timestamp' in data:
        try:
            # Frontend sends UTC time with Z removed, so just parse directly
            timestamp_str = data['timestamp']
            if timestamp_str:
                timestamp_str = timestamp_str.replace('Z', '')
                switch.timestamp = datetime.fromisoformat(timestamp_str)
        except (ValueError, AttributeError) as e:
            print(f"Error parsing timestamp '{data.get('timestamp')}': {e}")
            return jsonify({"error": f"Invalid timestamp format: {str(e)}"}), 400
    if 'end_time' in data:
        try:
            end_time_str = data.get('end_time')
            if end_time_str:
                # Frontend sends UTC time with Z removed, so just parse directly
                end_time_str = end_time_str.replace('Z', '')
                switch.end_time = datetime.fromisoformat(end_time_str)
            else:
                switch.end_time = None
        except (ValueError, AttributeError) as e:
            print(f"Error parsing end_time '{data.get('end_time')}': {e}")
            return jsonify({"error": f"Invalid end_time format: {str(e)}"}), 400
    
    try:
        db.commit()
        db.close()
        return jsonify({"message": "Switch entry updated successfully", "id": switch_id}), 200
    except Exception as e:
        db.rollback()
        db.close()
        return jsonify({"error": str(e)}), 500

@app.route("/switches/<int:switch_id>", methods=["DELETE"])
def delete_switch(switch_id):
    """
    Delete a switch entry.
    """
    db = SessionLocal()
    switch = db.query(Switch).filter(Switch.id == switch_id).first()
    
    if not switch:
        db.close()
        return jsonify({"error": "Switch entry not found"}), 404
    
    try:
        db.delete(switch)
        db.commit()
        db.close()
        return jsonify({"message": "Switch entry deleted successfully"}), 200
    except Exception as e:
        db.rollback()
        db.close()
        return jsonify({"error": str(e)}), 500

@app.route("/export/switches", methods=["GET"])
def export_switches():
    """
    Export all switch history as CSV file.
    """
    db = SessionLocal()
    
    # Get all switches ordered by timestamp (newest first)
    switches = (
        db.query(Switch)
        .order_by(Switch.timestamp.desc())
        .all()
    )
    db.close()
    
    # Create CSV in memory
    output = StringIO()
    writer = csv.writer(output)
    
    # Write CSV header
    writer.writerow([
        'Timestamp',
        'From Task', 
        'To Task',
        'Note',
        'Tags',
        'Is Context Switch',
        'Category'
    ])
    
    # Write data rows
    for switch in switches:
        tags_str = ''
        if switch.tags:
            try:
                tags_list = json.loads(switch.tags)
                tags_str = ', '.join(tags_list)
            except json.JSONDecodeError:
                tags_str = switch.tags
        
        writer.writerow([
            switch.timestamp.astimezone().isoformat(),
            switch.from_task or '',
            switch.to_task or '',
            switch.note or '',
            tags_str,
            'Yes' if switch.is_switch else 'No',
            switch.category or ''
        ])
    
    # Create response with CSV content
    csv_content = output.getvalue()
    output.close()
    
    response = Response(
        csv_content,
        mimetype='text/csv',
        headers={
            'Content-Disposition': 'attachment; filename=context_switch_history.csv'
        }
    )
    
    return response

@app.route("/timesync/intervals", methods=["GET"])
def get_timesync_intervals():
    """
    Get Timewarrior intervals that can be synced to JIRA.
    """
    try:
        start_date = request.args.get('start_date', '')
        end_date = request.args.get('end_date', '')
        
        if not start_date or not end_date:
            # Default to last 7 days
            end = datetime.now()
            start = end - timedelta(days=7)
            start_date = start.strftime('%Y-%m-%d')
            end_date = end.strftime('%Y-%m-%d')
        
        intervals = get_timewarrior_intervals(start_date, end_date)
        
        # For each interval, check if worklog already exists
        for interval in intervals:
            worklogs = get_jira_worklogs(interval['ticket'], interval['start'])
            interval['has_worklog'] = len(worklogs) > 0
            interval['existing_worklogs'] = worklogs
        
        return jsonify(intervals), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/timesync/tickets", methods=["GET"])
def get_timesync_tickets():
    """
    Get Timewarrior entries for a specific ticket with hour comparisons.
    """
    try:
        ticket_id = request.args.get('ticket_id', '')
        
        if not ticket_id:
            return jsonify({"error": "ticket_id is required"}), 400
        
        # Get data for specific ticket (defaults to past 3 months)
        ticket_data = get_single_ticket_data(ticket_id)
        tickets_list = [ticket_data]
        
        return jsonify(tickets_list), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/timesync/worklogs/<ticket_id>", methods=["GET"])
def get_ticket_worklogs(ticket_id):
    """
    Get existing JIRA worklogs for a specific ticket.
    """
    try:
        start_date = request.args.get('start_date', None)
        worklogs = get_jira_worklogs(ticket_id, start_date)
        return jsonify(worklogs), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/timesync/sync", methods=["POST"])
def sync_intervals():
    """
    Sync selected Timewarrior intervals to JIRA.
    """
    try:
        data = request.json
        intervals = data.get('intervals', [])

        if not intervals:
            return jsonify({"error": "No intervals provided"}), 400

        results = batch_sync_to_jira(intervals)

        # Count successes and failures
        success_count = sum(1 for r in results if r['success'])
        failure_count = len(results) - success_count

        return jsonify({
            "results": results,
            "summary": {
                "total": len(results),
                "success": success_count,
                "failed": failure_count
            }
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/analytics/chaos", methods=["GET"])
def get_chaos_metrics():
    """
    Get chaos metrics from the chaos-tracker database.
    Returns daily chaos scores for visualization.
    """
    try:
        from pathlib import Path
        from sqlalchemy import create_engine, text

        # Get view parameter (week or month)
        view = request.args.get("view", "week")

        # Determine limit based on view
        if view == "month":
            limit = 30
        else:
            limit = 7

        # Look for chaos.db in project root or user home
        chaos_db_path = None
        possible_paths = [
            Path(__file__).parent.parent / 'chaos.db',
            Path.home() / 'chaos.db',
            Path('../chaos-tracker/chaos.db').expanduser()
        ]

        for path in possible_paths:
            if path.exists():
                chaos_db_path = path
                break

        if not chaos_db_path:
            return jsonify({"error": "Chaos database not found. Run chaos-tracker first."}), 404

        # Query the chaos database
        engine = create_engine(f'sqlite:///{chaos_db_path}')

        with engine.connect() as conn:
            # Get chaos metrics based on view
            result = conn.execute(text(f"""
                SELECT
                    date,
                    avg_chaos_score,
                    max_chaos_score,
                    total_branch_switches,
                    total_app_switches,
                    active_hours
                FROM daily_summary
                ORDER BY date DESC
                LIMIT :limit
            """), {"limit": limit})

            summaries = []
            for row in result:
                summaries.append({
                    'date': row[0],
                    'avg_score': round(row[1], 1) if row[1] else 0,
                    'max_score': round(row[2], 1) if row[2] else 0,
                    'branches': row[3] or 0,
                    'apps': row[4] or 0,
                    'active_hours': round(row[5], 1) if row[5] else 0
                })

            # Reverse to get chronological order
            summaries.reverse()

            return jsonify(summaries), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# =============================================================================
# Todo Sidebar Endpoints
# =============================================================================

@app.route("/todos", methods=["GET"])
def get_todos():
    """
    Return todos, optionally filtered by completion status or ticket_id.
    Query params: ?completed=true/false, ?ticket_id=PROJ-123
    """
    completed_filter = request.args.get('completed')
    ticket_filter = request.args.get('ticket_id')

    db = SessionLocal()
    try:
        query = db.query(TodoItem).order_by(TodoItem.position.asc(), TodoItem.created_at.desc())

        if completed_filter is not None:
            completed = completed_filter.lower() == 'true'
            query = query.filter(TodoItem.completed == completed)

        if ticket_filter:
            query = query.filter(TodoItem.ticket_id == ticket_filter)

        todos = query.all()

        result = [{
            'id': todo.id,
            'content': todo.content,
            'completed': todo.completed,
            'priority': todo.priority,
            'ticket_id': todo.ticket_id,
            'created_at': todo.created_at.isoformat() if todo.created_at else None,
            'completed_at': todo.completed_at.isoformat() if todo.completed_at else None,
            'position': todo.position
        } for todo in todos]

        return jsonify(result), 200
    finally:
        db.close()


@app.route("/todos", methods=["POST"])
def create_todo():
    """
    Create a new todo item.
    Expects JSON: {"content": "...", "priority": 0, "ticket_id": "PROJ-123"}
    """
    data = request.get_json(force=True)
    content = data.get("content", "").strip()
    priority = data.get("priority", 0)
    ticket_id = data.get("ticket_id")

    if not content:
        return jsonify({"error": "Content is required"}), 400

    db = SessionLocal()
    try:
        # Get max position for new item
        max_pos = db.query(func.max(TodoItem.position)).scalar() or 0

        todo = TodoItem(
            content=content,
            priority=priority,
            ticket_id=ticket_id.strip() if ticket_id else None,
            position=max_pos + 1,
            completed=False
        )
        db.add(todo)
        db.commit()

        result = {
            'id': todo.id,
            'content': todo.content,
            'priority': todo.priority,
            'ticket_id': todo.ticket_id,
            'position': todo.position
        }
        return jsonify(result), 201
    finally:
        db.close()


@app.route("/todos/<int:todo_id>", methods=["PUT"])
def update_todo(todo_id):
    """
    Update a todo item's content, priority, or ticket_id.
    """
    data = request.get_json(force=True)

    db = SessionLocal()
    try:
        todo = db.query(TodoItem).filter(TodoItem.id == todo_id).first()

        if not todo:
            return jsonify({"error": "Todo not found"}), 404

        if 'content' in data:
            content = data['content'].strip()
            if not content:
                return jsonify({"error": "Content cannot be empty"}), 400
            todo.content = content

        if 'priority' in data:
            todo.priority = data['priority']

        if 'ticket_id' in data:
            todo.ticket_id = data['ticket_id'].strip() if data['ticket_id'] else None

        if 'position' in data:
            todo.position = data['position']

        db.commit()

        return jsonify({
            'id': todo.id,
            'content': todo.content,
            'priority': todo.priority,
            'ticket_id': todo.ticket_id,
            'position': todo.position
        }), 200
    finally:
        db.close()


@app.route("/todos/<int:todo_id>/complete", methods=["PUT"])
def toggle_todo_complete(todo_id):
    """
    Toggle todo completion status.
    """
    db = SessionLocal()
    try:
        todo = db.query(TodoItem).filter(TodoItem.id == todo_id).first()

        if not todo:
            return jsonify({"error": "Todo not found"}), 404

        todo.completed = not todo.completed
        todo.completed_at = datetime.now(timezone.utc).replace(tzinfo=None) if todo.completed else None
        db.commit()

        return jsonify({
            "id": todo_id,
            "completed": todo.completed,
            "completed_at": todo.completed_at.isoformat() if todo.completed_at else None
        }), 200
    finally:
        db.close()


@app.route("/todos/<int:todo_id>", methods=["DELETE"])
def delete_todo(todo_id):
    """
    Delete a todo item.
    """
    db = SessionLocal()
    try:
        todo = db.query(TodoItem).filter(TodoItem.id == todo_id).first()

        if not todo:
            return jsonify({"error": "Todo not found"}), 404

        db.delete(todo)
        db.commit()

        return jsonify({"message": f"Todo {todo_id} deleted"}), 200
    finally:
        db.close()


if __name__ == "__main__":
    # Default host/port; override with FLASK_RUN_HOST/PORT if desired
    app.run(host="127.0.0.1", port=5000)
