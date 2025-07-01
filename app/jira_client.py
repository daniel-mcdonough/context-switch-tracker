# app/jira_client.py

from jira import JIRA
from config import Config

def get_jira_client():
    """
    Instantiate and return a JIRA client using credentials from Config.
    """
    return JIRA(
        server=Config.JIRA_URL,
        basic_auth=(Config.JIRA_USER, Config.JIRA_TOKEN)
    )

def get_assigned_tickets(max_results: int = 50):
    """
    Fetches up to `max_results` issues assigned to the current user that are unresolved.
    Returns a list of (issue_key, summary) tuples.
    """
    j = get_jira_client()
    jql = 'assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC'
    issues = j.search_issues(jql, maxResults=max_results)
    results = [(issue.key, issue.fields.summary) for issue in issues]
    # Sort by numeric part of the ticket key, descending (highest number first)
    results.sort(key=lambda x: int(x[0].split('-', 1)[1]), reverse=True)
    return results