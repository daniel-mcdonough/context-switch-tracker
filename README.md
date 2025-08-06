# Context Switcher Tracker

A Flask-based web application that integrates with Timewarrior and JIRA to track task switches and provide productivity metrics through interactive D3.js visualizations.

## Features

- 🔄 **Task Switching**: Switch between JIRA tickets and custom tasks
- ⏱️ **Timewarrior Integration**: Automatic time tracking using Timewarrior
- 📊 **Analytics Dashboard**: Visual metrics showing context-switch patterns
- 🎯 **JIRA Integration**: Fetch and work with your assigned tickets
- 📝 **Custom Tasks**: Create and track custom tasks beyond JIRA
- 🏷️ **Categorization**: Organize switches with notes and categories

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

# Timewarrior Configuration
TIMEWARRIOR_BIN=timew

# Database Configuration
DATABASE_URL=sqlite:///switches.db
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

## Project Structure

```
context-switcher-tracker/
├── app/
│   ├── __init__.py
│   ├── app.py              # Main Flask application
│   ├── models.py           # SQLAlchemy database models
│   ├── timew.py           # Timewarrior integration
│   ├── jira_client.py     # JIRA API client
│   ├── static/            # CSS, JavaScript, and assets
│   │   ├── script.js      # Main UI logic
│   │   ├── d3-metrics.js  # D3.js visualizations
│   │   ├── styles.css     # Application styles
│   │   └── ...
│   └── templates/
│       └── index.html     # Main application template
├── config.py              # Configuration management
├── requirements.txt       # Python dependencies
├── .env.example          # Environment variables template
└── README.md
```

## API Endpoints

- `GET /current` - Get current Timewarrior task and summary
- `GET /tasks` - Combined list of JIRA tickets and custom tasks
- `POST /switch` - Switch from current task to new task
- `POST /stop` - Stop current task
- `POST /tasks` - Add custom task
- `GET /metrics/counts` - Get switch counts by day (week/month view)
- `GET /metrics/switches` - Get detailed switch log for current week

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
- `switches`: Records all task switches with timestamps, notes, and categories
- `custom_tasks`: User-defined tasks beyond JIRA tickets

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