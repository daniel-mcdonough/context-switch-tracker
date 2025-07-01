# config.py
import os
from dotenv import load_dotenv

# load .env in project root
load_dotenv()

class Config:
    # Jira
    JIRA_URL       = os.getenv("JIRA_URL")
    JIRA_USER      = os.getenv("JIRA_USER")
    JIRA_TOKEN     = os.getenv("JIRA_TOKEN")

    # Timewarrior
    TIMEWARRIOR_BIN = os.getenv("TIMEWARRIOR_BIN", "timew")

    # Database (SQLite URI)
    DATABASE_URL    = os.getenv("DATABASE_URL", "sqlite:///switches.db")

# you can import Config elsewhere as:
# from config import Config