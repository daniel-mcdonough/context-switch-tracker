# Context Switcher Tracker

A Flask-based web application that integrates with Timewarrior and JIRA to track task switches and provide productivity metrics through interactive D3.js visualizations.

## Features

- 🔄 **Task Switching**: Switch between JIRA tickets and custom tasks
- ⏱️ **Timewarrior Integration**: Automatic time tracking using Timewarrior
- 📊 **Analytics Dashboard**: Visual metrics showing context-switch patterns
- 🎯 **JIRA Integration**: Fetch and work with your assigned tickets
- 🔁 **Time Sync**: Sync Timewarrior entries to JIRA worklogs with duplicate detection
- 📝 **Custom Tasks**: Create and track custom tasks beyond JIRA
- ✏️ **Time Editor**: Edit and manage historical time entries
- 🏷️ **Categorization**: Organize switches with notes and tags
- 📅 **Quarter Tracking**: US business quarter countdown widget

## Screenshots

The application provides a clean, tab-based interface with:
- Task switching dashboard
- Real-time metrics and visualizations
- Context-switch analytics

## Prerequisites

- Python 3.7+
- [Timewarrior](https://timewarrior.net/) installed and configured
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

# Timewarrior Configuration
TIMEWARRIOR_BIN=timew

# Database Configuration
DATABASE_URL=sqlite:///switches.db

# ActivityWatch Configuration (optional)
ACTIVITYWATCH_URL=http://localhost:5600
```

### JIRA Setup

To enable JIRA integration:

1. Go to your JIRA account settings
2. Create an API token under Security → API tokens
3. Add your JIRA URL, email, and token to the `.env` file

## Usage

### Task Switching

1. **View Current Task**: The dashboard shows your currently active Timewarrior task
2. **Switch Tasks**: Select from JIRA tickets or custom tasks to switch context
3. **Add Notes**: Include optional notes when switching tasks
4. **Stop Tasks**: End your current task when taking a break

### Custom Tasks

1. Navigate to the task switching tab
2. Use the "Add Custom Task" form to create new tasks
3. Custom tasks appear alongside JIRA tickets in the task list

### Analytics

1. Switch to the "Metrics" tab to view:
   - Daily/weekly/monthly switch counts
   - Context-switch patterns over time
   - Detailed switch logs with timestamps and durations
   - ActivityWatch integration for productivity hours

### Time Sync

1. Navigate to the "Time Sync" tab
2. Enter a JIRA ticket ID to load time entries
3. View side-by-side comparison of Timewarrior vs JIRA entries
4. Sync unmatched entries to JIRA with automatic duplicate detection

### Time Editor

1. Use the "Time Editor" tab to:
   - View and edit historical time entries
   - Update timestamps, tasks, notes, and tags
   - Delete incorrect entries
   - Export switch history as CSV

## Project Structure

```
context-switcher-tracker/
├── app/
│   ├── __init__.py
│   ├── app.py              # Main Flask application
│   ├── models.py           # SQLAlchemy database models
│   ├── timew.py           # Timewarrior integration
│   ├── timesync.py        # JIRA time sync functionality
│   ├── jira_client.py     # JIRA API client
│   ├── static/            # CSS, JavaScript, and assets
│   │   ├── script.js      # Main UI logic
│   │   ├── d3-metrics.js  # D3.js visualizations
│   │   ├── time-editor.js # Time editor functionality
│   │   ├── timesync.js    # Time sync UI
│   │   ├── analytics.js   # Analytics dashboard
│   │   ├── styles.css     # Application styles
│   │   └── ...
│   └── templates/
│       └── index.html     # Main application template
├── config.py              # Configuration management
├── requirements.txt       # Python dependencies
├── .env.example          # Environment variables template
├── CLAUDE.md             # Development documentation
└── README.md
```

## API Endpoints

### Task Management
- `GET /current` - Get current Timewarrior task and summary
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
- `GET /timesync/tickets` - Get Timewarrior entries for a specific ticket
- `POST /timesync/sync` - Sync selected intervals to JIRA

### Time Editor
- `GET /switches/list` - List switch entries with optional date filtering
- `PUT /switches/<id>` - Update a switch entry
- `DELETE /switches/<id>` - Delete a switch entry
- `GET /export/switches` - Export all switch history as CSV

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

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Troubleshooting

### Common Issues

**Timewarrior not found**
- Ensure Timewarrior is installed and accessible in your PATH
- Update `TIMEWARRIOR_BIN` in your `.env` file if needed

**JIRA connection issues**
- Verify your JIRA URL, username, and API token
- Check that your API token has the necessary permissions

**Database errors**
- Delete `switches.db` to reset the database
- Check file permissions in the application directory

## Acknowledgments

- [Timewarrior](https://timewarrior.net/) for excellent time tracking
- [D3.js](https://d3js.org/) for powerful data visualizations
- [Flask](https://flask.palletsprojects.com/) for the web framework