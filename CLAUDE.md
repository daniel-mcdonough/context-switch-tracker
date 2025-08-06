# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a Flask-based context switcher application that integrates with Timewarrior and JIRA to track task switches and productivity metrics. The app allows users to switch between tasks, stop tasks, and view switching patterns through a web interface with D3.js visualizations.

## Development Setup

### Environment Setup
- Python virtual environment located at `virtualenv/`
- Dependencies listed in `requirements.txt`
- Environment variables configured via `.env` file (not tracked in git)

### Required Environment Variables (.env)
```
JIRA_URL=https://your-instance.atlassian.net
JIRA_USER=your-email@domain.com
JIRA_TOKEN=your-api-token
TIMEWARRIOR_BIN=timew
DATABASE_URL=sqlite:///switches.db
```

### Running the Application
```bash
# Activate virtual environment
source virtualenv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the Flask app
python app/app.py
```

The app runs on `http://127.0.0.1:5000` by default.

## Architecture

### Backend (Flask)
- **app/app.py**: Main Flask application with REST endpoints
- **app/models.py**: SQLAlchemy models for Switch and CustomTask tables
- **app/timew.py**: Timewarrior integration for task tracking
- **app/jira_client.py**: JIRA API integration for fetching assigned tickets
- **config.py**: Configuration management using environment variables

### Frontend
- **app/templates/index.html**: Single-page application with tabs
- **app/static/script.js**: Main UI logic for task switching and metrics display
- **app/static/d3-metrics.js**: D3.js visualizations for context-switch metrics
- **app/static/d3-metrics.css**: Styles for the metrics visualizations

### Database
- SQLite database (`switches.db`) with two main tables:
  - `switches`: Records all task switches with timestamps, notes, and categories
  - `custom_tasks`: User-defined tasks beyond JIRA tickets

## Key API Endpoints

- `GET /current`: Get current Timewarrior task and summary
- `GET /tasks`: Combined list of JIRA tickets and custom tasks
- `POST /switch`: Switch from current task to new task
- `POST /stop`: Stop current task
- `POST /tasks`: Add custom task
- `GET /metrics/counts`: Get switch counts by day (week/month view)
- `GET /metrics/switches`: Get detailed switch log for current week

## External Dependencies

### Timewarrior Integration
- Requires `timew` command-line tool installed
- Uses subprocess calls to interact with Timewarrior
- Configurable via `TIMEWARRIOR_BIN` environment variable

### JIRA Integration
- Fetches unresolved tickets assigned to current user
- Uses JIRA Python library with basic authentication
- Sorts tickets by numeric ID (highest first)

## Development Notes

- The app creates database tables automatically on startup via `init_db()`
- Frontend uses vanilla JavaScript with D3.js for visualizations
- Tab-based UI with separate views for task switching and metrics
- All task switches are logged to database with optional notes and categories
- Supports both JIRA tickets and user-defined custom tasks