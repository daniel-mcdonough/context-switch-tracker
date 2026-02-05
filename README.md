# Context Switcher Tracker

A Flask-based web application that integrates with JIRA to track task switches and provide productivity metrics through interactive D3.js visualizations.

## Features

- Switch between JIRA tickets and custom internal tasks
- TUI command-line tool (`track`) with fuzzy search for quick switching
- D3.js analytics dashboard showing context-switch patterns
- JIRA integration for fetching assigned tickets and syncing worklogs
- Time editor for fixing historical entries
- Todo sidebar with ticket linking
- Notes and tags on each switch

## Prerequisites

- Python 3.7+
- JIRA account with API token (optional)

## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/context-switcher-tracker.git
   cd context-switcher-tracker
   ```

2. **Create virtual environment**
   ```bash
   python -m venv virtualenv
   source virtualenv/bin/activate  # On Windows: virtualenv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

5. **Run the application**
   ```bash
   python app/app.py
   ```

The application will be available at `http://127.0.0.1:5000`

## Configuration

### Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# JIRA Configuration (optional)
JIRA_URL=https://your-instance.atlassian.net
JIRA_USER=your-email@domain.com
JIRA_TOKEN=your-api-token
JIRA_DISPLAY_NAME=Your Name  # Optional: for worklog matching

# Database Configuration
DATABASE_URL=sqlite:///switches.db

# ActivityWatch Configuration (optional)
ACTIVITYWATCH_URL=http://localhost:5600
```

### JIRA Setup

Create an API token at your JIRA account settings (Security → API tokens), then add your URL, email, and token to `.env`.

## Usage

### CLI Tools

**track** - Task switching with fuzzy search:
```bash
track switch    # Interactive fuzzy search, select ticket, add note
track stop      # Stop current task
track status    # Show current task and elapsed time
track summary   # Show today's time by task
track log       # Show recent switches
```

**todo** - Manage todos:
```bash
todo add "Task description"
todo add "Fix bug" --ticket PROJ-123
todo list
todo done 1
```

### Web Interface

- **Switcher tab**: Switch tasks, add notes/tags, create internal tasks
- **Metrics tab**: Calendar heatmaps of switches and hours worked
- **Analytics tab**: Top time consumers, switch patterns
- **Time Sync tab**: Compare local entries with JIRA, sync unmatched hours
- **Time Editor tab**: Fix historical entries, export CSV
- **Todo sidebar**: Always-visible todo list on the right

## Project Structure

```
context-switcher-tracker/
├── app/
│   ├── __init__.py
│   ├── app.py              # Main Flask application
│   ├── models.py           # SQLAlchemy database models
│   ├── timesync.py        # JIRA time sync functionality
│   ├── jira_client.py     # JIRA API client
│   ├── static/            # CSS, JavaScript, and assets
│   │   ├── script.js      # Main UI logic
│   │   ├── d3-metrics.js  # D3.js visualizations
│   │   ├── time-editor.js # Time editor functionality
│   │   ├── timesync.js    # Time sync UI
│   │   ├── analytics.js   # Analytics dashboard
│   │   ├── todo.js        # Todo sidebar functionality
│   │   ├── styles.css     # Application styles
│   │   └── ...
│   └── templates/
│       └── index.html     # Main application template
├── config.py              # Configuration management
├── track                  # Task tracking TUI CLI
├── todo_cli.py            # Todo CLI tool
├── requirements.txt       # Python dependencies
├── .env.example          # Environment variables template
├── CLAUDE.md             # Development documentation
└── README.md
```

## API Endpoints

### Task Management
- `GET /current` - Get current task and summary
- `GET /tasks` - Combined list of JIRA tickets and custom tasks
- `POST /switch` - Switch from current task to new task
- `POST /stop` - Stop current task
- `POST /tasks` - Add custom task

### Metrics & Analytics
- `GET /metrics/counts` - Get switch counts by day (week/month view)
- `GET /metrics/switches` - Get detailed switch log for current week
- `GET /analytics/switch-leaders` - Get tasks causing most context switches
- `GET /activitywatch/hours` - Get ActivityWatch productivity data

### Time Sync
- `GET /timesync/tickets` - Get time entries for a specific ticket
- `POST /timesync/sync` - Sync selected intervals to JIRA

### Time Editor
- `GET /switches/list` - List switch entries with optional date filtering
- `PUT /switches/<id>` - Update a switch entry
- `DELETE /switches/<id>` - Delete a switch entry
- `GET /export/switches` - Export all switch history as CSV

### Todo
- `GET /todos` - List todos (filter: `?completed=true/false`, `?ticket_id=X`)
- `POST /todos` - Create todo `{content, priority, ticket_id}`
- `PUT /todos/<id>` - Update todo
- `PUT /todos/<id>/complete` - Toggle completion
- `DELETE /todos/<id>` - Delete todo

## Development

### Running in Development Mode

```bash
# Activate virtual environment
source virtualenv/bin/activate

# Set Flask environment
export FLASK_ENV=development

# Run the application
python app/app.py
```

### Database

The application uses SQLite by default. The database file (`switches.db`) will be created automatically on first run.

**Tables:**
- `switches`: Records all task switches with timestamps, end_times, notes, and tags
- `custom_tasks`: User-defined tasks beyond JIRA tickets
- `tag_presets`: Predefined tags for categorizing switches
- `todo_items`: Todo list items with ticket linking and priority

## Troubleshooting

**JIRA connection issues**
- Verify your JIRA URL, username, and API token
- Check that your API token has the necessary permissions

**Database errors**
- Delete `switches.db` to reset the database
- Check file permissions in the application directory