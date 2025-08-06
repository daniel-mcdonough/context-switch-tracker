from flask import Flask, jsonify, request, render_template
from config import Config
from app.models import init_db, SessionLocal, Switch
from sqlalchemy.exc import IntegrityError
from app.models import CustomTask
from app.timew import get_current_task, get_current_summary, switch_task, stop_task
from app.jira_client import get_assigned_tickets
from datetime import date, timedelta, datetime
from sqlalchemy import func, desc
from app.models import Switch  # ensure Switch is imported for queries

# Initialize database (creates tables if needed)
init_db()


app = Flask(__name__)


@app.route("/", methods=["GET"])
def index():
    """
    Serve the main context switcher UI.
    """
    return render_template("index.html")


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
    Expects JSON: { "to_task": "ABC-123", "note": "...", "category": "bug" }
    """
    data = request.get_json(force=True)
    to_task = data.get("to_task")
    note = data.get("note")
    category = data.get("category")

    if not to_task:
        return jsonify({"error": "Missing 'to_task'"}), 400

    # Perform the Timewarrior switch
    from_task, new_task = switch_task(to_task)

    # Log into the database
    db = SessionLocal()
    record = Switch(
        from_task=from_task,
        to_task=new_task,
        note=note,
        category=category,
        is_switch=True
    )
    db.add(record)
    db.commit()
    db.close()

    return jsonify({
        "from": from_task,
        "to": new_task,
        "note": note,
        "category": category
    }), 200

@app.route("/stop", methods=["POST"])
def stop_current():
    """
    Stop the current task and log it.
    """
    from_task = stop_task()
    # Log into the database
    db = SessionLocal()
    record = Switch(from_task=from_task, to_task="", is_switch=False)
    db.add(record)
    db.commit()
    db.close()
    return jsonify({"from": from_task, "to": ""}), 200


# --- Custom tasks and combined tasks endpoints ---

@app.route("/tasks", methods=["GET"])
def all_tasks():
    """
    Return a combined list of Jira tickets and custom tasks.
    """
    db = SessionLocal()
    custom = db.query(CustomTask).all()
    db.close()
    jira = get_assigned_tickets()  # list of (key, summary)
    combined = [(k, s) for k, s in jira] + [(t.key, t.name or "") for t in custom]
    return jsonify([{"key": k, "summary": s} for k, s in combined]), 200

@app.route("/tasks", methods=["POST"])
def add_custom_task():
    """
    Add a new custom task. Expects JSON { "key": "BREAK", "name": "Coffee break" }.
    """
    data = request.get_json(force=True)
    key = data.get("key")
    name = data.get("name", "")
    if not key:
        return jsonify({"error": "Missing 'key'"}), 400
    db = SessionLocal()
    task = CustomTask(key=key, name=name)
    db.add(task)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        db.close()
        return jsonify({"error": "Task key already exists"}), 409
    db.close()
    return jsonify({"key": key, "name": name}), 201

@app.route("/tasks/<task_key>", methods=["DELETE"])
def delete_custom_task(task_key):
    """
    Delete a custom task by key.
    """
    db = SessionLocal()
    task = db.query(CustomTask).filter(CustomTask.key == task_key).first()
    
    if not task:
        db.close()
        return jsonify({"error": "Task not found"}), 404
    
    db.delete(task)
    db.commit()
    db.close()
    
    return jsonify({"message": f"Task {task_key} deleted successfully"}), 200

@app.route("/tasks/custom", methods=["GET"])
def get_custom_tasks():
    """
    Return only custom tasks for management.
    """
    db = SessionLocal()
    custom_tasks = db.query(CustomTask).order_by(CustomTask.key).all()
    db.close()
    
    result = [{"key": task.key, "name": task.name or ""} for task in custom_tasks]
    return jsonify(result), 200

@app.route("/metrics/counts", methods=["GET"])
def get_switch_counts():
    """
    Returns a list of { date: 'YYYY-MM-DD', count: N } for either
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
            .filter(Switch.is_switch == True)
            .group_by("day")
            .all()
        )
        counts = { r.day: r.count for r in rows }
        # Build output for each day of month
        day = start
        while day <= last_day:
            iso = day.isoformat()
            out.append({ "date": iso, "count": counts.get(iso, 0) })
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
            .filter(Switch.is_switch == True)
            .group_by("day")
            .all()
        )
        counts = { r.day: r.count for r in rows }
        for i in range(7):
            d = week_start + timedelta(days=i)
            iso = d.isoformat()
            out.append({ "date": iso, "count": counts.get(iso, 0) })

    db.close()
    return jsonify(out), 200

@app.route("/metrics/switches", methods=["GET"])
def get_weekly_switches():
    """
    Return the raw Switch records for the current week (Sunday-Saturday), ordered newest-first.
    """
    today = date.today()
    days_since_sunday = (today.weekday() + 1) % 7  # Convert Mon=0 to Sun=0
    week_start = today - timedelta(days=days_since_sunday)

    db = SessionLocal()
    rows = (
        db.query(Switch)
        .filter(Switch.timestamp >= week_start)
        .filter(Switch.is_switch == True)
        .order_by(Switch.timestamp.desc())
        .all()
    )
    db.close()

    out = [
        {
            "timestamp": r.timestamp.isoformat(),
            "from": r.from_task,
            "to":   r.to_task,
            "note": r.note,
            "category": r.category
        }
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
                task_durations[task] = {
                    'total_seconds': 0,
                    'switch_count': 0,
                    'avg_session': 0
                }
            
            task_durations[task]['total_seconds'] += duration
            task_durations[task]['switch_count'] += 1
    
    # Calculate averages and format results
    result = []
    for task, data in task_durations.items():
        if data['switch_count'] > 0:
            avg_session = data['total_seconds'] / data['switch_count']
            hours = data['total_seconds'] / 3600
            
            result.append({
                'task': task,
                'total_hours': round(hours, 2),
                'total_seconds': data['total_seconds'],
                'switch_count': data['switch_count'],
                'avg_session_minutes': round(avg_session / 60, 1)
            })
    
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
        .filter(Switch.is_switch == True)
        .filter(Switch.from_task.isnot(None))
        .filter(Switch.from_task != '')
        .group_by(Switch.from_task)
        .all()
    )
    
    to_counts = (
        db.query(Switch.to_task, func.count().label('count'))
        .filter(Switch.timestamp >= start_date)
        .filter(Switch.timestamp < end_date)
        .filter(Switch.is_switch == True)
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
        result.append({
            'task': task,
            'total_switches': total_switches,
            'switched_from': counts['from_count'],
            'switched_to': counts['to_count']
        })
    
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
        .filter(Switch.is_switch == True)
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
        .filter(Switch.is_switch == True)
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
        .filter(Switch.is_switch == True)
        .group_by('hour')
        .order_by('count')
        .all()
    )
    
    db.close()
    
    insights = {
        'period': view,
        'total_switches': total_switches,
        'avg_switches_per_day': round(avg_switches_per_day, 1),
        'most_active_day': {
            'date': str(daily_switches.day) if daily_switches else None,
            'switches': daily_switches.count if daily_switches else 0
        },
        'hourly_distribution': [
            {'hour': int(h), 'switches': count} 
            for h, count in hourly_switches
        ] if hourly_switches else []
    }
    
    return jsonify(insights), 200

if __name__ == "__main__":
    # Default host/port; override with FLASK_RUN_HOST/PORT if desired
    app.run(host="127.0.0.1", port=5000)