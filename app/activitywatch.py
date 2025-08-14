"""
ActivityWatch API client for querying laptop activity time data.
"""
import requests
import json
from datetime import datetime, timedelta
from typing import List, Dict, Optional


class ActivityWatchClient:
    def __init__(self, base_url: str = "http://localhost:5600"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api/0"
    
    def _make_request(self, method: str, endpoint: str, **kwargs) -> Optional[Dict]:
        """Make HTTP request to ActivityWatch API with error handling."""
        try:
            url = f"{self.api_url}{endpoint}"
            response = requests.request(method, url, timeout=5, **kwargs)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.ConnectionError:
            print("ActivityWatch not running or not accessible")
            return None
        except requests.exceptions.RequestException as e:
            print(f"ActivityWatch API error: {e}")
            return None
    
    def get_buckets(self) -> Optional[List[str]]:
        """Get list of available buckets."""
        buckets = self._make_request("GET", "/buckets")
        return list(buckets.keys()) if buckets else None
    
    def query_active_time(self, start_date: datetime, end_date: datetime) -> Optional[List[Dict]]:
        """Query ActivityWatch for active time (excluding AFK) within date range."""
        
        # Convert to UTC for ActivityWatch query (ActivityWatch stores in UTC)
        from datetime import timezone
        
        # If start_date/end_date are naive, assume they're local time
        if start_date.tzinfo is None:
            # Use system local timezone
            start_date = start_date.replace(tzinfo=datetime.now().astimezone().tzinfo)
        if end_date.tzinfo is None:
            # Use system local timezone  
            end_date = end_date.replace(tzinfo=datetime.now().astimezone().tzinfo)
        
        # Convert to UTC for the query
        start_utc = start_date.astimezone(timezone.utc)
        end_utc = end_date.astimezone(timezone.utc)
        
        # Format dates for ActivityWatch query
        start_str = start_utc.strftime("%Y-%m-%dT%H:%M:%S")
        end_str = end_utc.strftime("%Y-%m-%dT%H:%M:%S")
        
        # ActivityWatch query to get active time excluding AFK periods
        query = f"""
        afk_events = query_bucket(find_bucket("aw-watcher-afk_"));
        window_events = query_bucket(find_bucket("aw-watcher-window_"));
        active_events = filter_period_intersect(window_events, 
            filter_keyvals(afk_events, "status", ["not-afk"]));
        RETURN = active_events;
        """
        
        query_data = {
            "timeperiods": [f"{start_str}/{end_str}"],
            "query": [query.strip()]
        }
        
        result = self._make_request("POST", "/query", json=query_data)
        return result[0] if result and len(result) > 0 else []
    
    def calculate_daily_hours(self, start_date: datetime, end_date: datetime) -> Dict[str, float]:
        """Calculate daily active hours from ActivityWatch data."""
        active_events = self.query_active_time(start_date, end_date)
        
        if not active_events:
            return {}
        
        daily_hours = {}
        
        for event in active_events:
            # Parse event timestamp and duration
            timestamp = datetime.fromisoformat(event['timestamp'].replace('Z', '+00:00'))
            duration_seconds = event['duration']
            
            # Convert to local timezone and get date key (YYYY-MM-DD)
            local_timestamp = timestamp.astimezone()
            date_key = local_timestamp.date().isoformat()
            
            # Add duration to daily total (convert seconds to hours)
            if date_key not in daily_hours:
                daily_hours[date_key] = 0
            daily_hours[date_key] += duration_seconds / 3600
        
        # Round to 1 decimal place
        return {date: round(hours, 1) for date, hours in daily_hours.items()}


def get_activitywatch_hours(view: str = "week") -> List[Dict]:
    """Get ActivityWatch hours data for the specified time period."""
    from datetime import date
    
    client = ActivityWatchClient()
    today = date.today()
    
    if view == "month":
        # First day of current month
        start = today.replace(day=1)
        # First day of next month
        if start.month == 12:
            next_month = date(start.year + 1, 1, 1)
        else:
            next_month = date(start.year, start.month + 1, 1)
        end = next_month
    else:
        # Week view: current week Sunday→Saturday
        days_since_sunday = (today.weekday() + 1) % 7
        start = today - timedelta(days=days_since_sunday)
        end = start + timedelta(days=7)
    
    # Convert to datetime for ActivityWatch API
    start_dt = datetime.combine(start, datetime.min.time())
    end_dt = datetime.combine(end, datetime.min.time())
    
    # Get daily hours from ActivityWatch
    daily_hours = client.calculate_daily_hours(start_dt, end_dt)
    
    # Build output in same format as other endpoints
    out = []
    current_date = start
    while current_date < end:
        date_str = current_date.isoformat()
        hours = daily_hours.get(date_str, 0)
        out.append({"date": date_str, "hours": hours})
        current_date += timedelta(days=1)
    
    return out