#!/usr/bin/env python3
"""
CLI tool for managing todos in the context-switcher database.

Usage:
    todo add "Task description"
    todo add "Task description" --ticket PROJ-123
    todo add "Task description" -p high
    todo list                    # Show pending todos
    todo list --all              # Show all todos
    todo list --completed        # Show completed todos
    todo list --ticket PROJ-123  # Show todos for a specific ticket
    todo done <id>               # Mark as complete
    todo undone <id>             # Mark as incomplete
    todo delete <id>             # Delete a todo
    todo edit <id> "New content" # Edit todo content
"""

import sys
import argparse
from datetime import datetime, timezone
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from app.models import SessionLocal, TodoItem, init_db
from sqlalchemy import func


def add_todo(content: str, priority: int = 0, ticket_id: str = None):
    """Add a new todo item."""
    if not content.strip():
        print("Error: Content cannot be empty")
        return 1

    db = SessionLocal()
    try:
        max_pos = db.query(func.max(TodoItem.position)).scalar() or 0
        todo = TodoItem(
            content=content.strip(),
            priority=priority,
            ticket_id=ticket_id.strip() if ticket_id else None,
            position=max_pos + 1,
            completed=False
        )
        db.add(todo)
        db.commit()

        ticket_info = f" [{todo.ticket_id}]" if todo.ticket_id else ""
        print(f"Added todo #{todo.id}{ticket_info}: {todo.content}")
        return 0
    finally:
        db.close()


def list_todos(show_all: bool = False, show_completed: bool = False, ticket_id: str = None):
    """List todos."""
    db = SessionLocal()
    try:
        query = db.query(TodoItem).order_by(TodoItem.completed.asc(), TodoItem.position.asc())

        if ticket_id:
            query = query.filter(TodoItem.ticket_id == ticket_id)
        elif show_completed:
            query = query.filter(TodoItem.completed == True)
        elif not show_all:
            query = query.filter(TodoItem.completed == False)

        todos = query.all()

        if not todos:
            filter_desc = ""
            if ticket_id:
                filter_desc = f" for ticket {ticket_id}"
            elif show_completed:
                filter_desc = " (completed)"
            elif not show_all:
                filter_desc = " (pending)"
            print(f"No todos found{filter_desc}")
            return 0

        # Print header
        print(f"{'ID':>4}  {'Status':<6}  {'Pri':<3}  {'Ticket':<12}  Content")
        print("-" * 70)

        for todo in todos:
            status = "[x]" if todo.completed else "[ ]"
            pri = {0: "", 1: "!", 2: "!!"}[todo.priority]
            ticket = todo.ticket_id or ""
            # Truncate content if too long
            content = todo.content[:45] + "..." if len(todo.content) > 48 else todo.content
            print(f"{todo.id:>4}  {status:<6}  {pri:<3}  {ticket:<12}  {content}")

        return 0
    finally:
        db.close()


def mark_done(todo_id: int, completed: bool = True):
    """Mark a todo as complete or incomplete."""
    db = SessionLocal()
    try:
        todo = db.query(TodoItem).filter(TodoItem.id == todo_id).first()

        if not todo:
            print(f"Error: Todo #{todo_id} not found")
            return 1

        todo.completed = completed
        todo.completed_at = datetime.now(timezone.utc).replace(tzinfo=None) if completed else None
        db.commit()

        status = "completed" if completed else "reopened"
        print(f"Todo #{todo_id} marked as {status}")
        return 0
    finally:
        db.close()


def delete_todo(todo_id: int, force: bool = False):
    """Delete a todo."""
    db = SessionLocal()
    try:
        todo = db.query(TodoItem).filter(TodoItem.id == todo_id).first()

        if not todo:
            print(f"Error: Todo #{todo_id} not found")
            return 1

        if not force:
            confirm = input(f"Delete todo #{todo_id}: '{todo.content}'? [y/N] ")
            if confirm.lower() != 'y':
                print("Cancelled")
                return 0

        content = todo.content
        db.delete(todo)
        db.commit()
        print(f"Deleted todo #{todo_id}: {content}")
        return 0
    finally:
        db.close()


def edit_todo(todo_id: int, content: str = None, ticket_id: str = None, priority: int = None):
    """Edit a todo's content, ticket, or priority."""
    db = SessionLocal()
    try:
        todo = db.query(TodoItem).filter(TodoItem.id == todo_id).first()

        if not todo:
            print(f"Error: Todo #{todo_id} not found")
            return 1

        if content:
            todo.content = content.strip()
        if ticket_id is not None:
            todo.ticket_id = ticket_id.strip() if ticket_id else None
        if priority is not None:
            todo.priority = priority

        db.commit()
        ticket_info = f" [{todo.ticket_id}]" if todo.ticket_id else ""
        print(f"Updated todo #{todo_id}{ticket_info}: {todo.content}")
        return 0
    finally:
        db.close()


def main():
    # Ensure database tables exist
    init_db()

    parser = argparse.ArgumentParser(
        description="Manage todos from the command line",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s add "Review pull request"
  %(prog)s add "Fix bug in auth" --ticket PROJ-123
  %(prog)s add "Urgent task" -p urgent
  %(prog)s list
  %(prog)s list --all
  %(prog)s list --ticket PROJ-123
  %(prog)s done 5
  %(prog)s edit 5 "Updated description"
  %(prog)s delete 5
        """
    )
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # Add command
    add_parser = subparsers.add_parser("add", help="Add a new todo")
    add_parser.add_argument("content", help="Todo content")
    add_parser.add_argument("--ticket", "-t", help="Link to a ticket (e.g., PROJ-123)")
    add_parser.add_argument("--priority", "-p", choices=["normal", "high", "urgent"],
                          default="normal", help="Priority level")

    # List command
    list_parser = subparsers.add_parser("list", aliases=["ls"], help="List todos")
    list_parser.add_argument("--all", "-a", action="store_true", help="Show all todos")
    list_parser.add_argument("--completed", "-c", action="store_true", help="Show only completed")
    list_parser.add_argument("--ticket", "-t", help="Filter by ticket ID")

    # Done command
    done_parser = subparsers.add_parser("done", help="Mark todo as complete")
    done_parser.add_argument("id", type=int, help="Todo ID")

    # Undone command
    undone_parser = subparsers.add_parser("undone", help="Mark todo as incomplete")
    undone_parser.add_argument("id", type=int, help="Todo ID")

    # Delete command
    del_parser = subparsers.add_parser("delete", aliases=["rm"], help="Delete a todo")
    del_parser.add_argument("id", type=int, help="Todo ID")
    del_parser.add_argument("--force", "-f", action="store_true", help="Skip confirmation")

    # Edit command
    edit_parser = subparsers.add_parser("edit", help="Edit a todo")
    edit_parser.add_argument("id", type=int, help="Todo ID")
    edit_parser.add_argument("content", nargs="?", help="New content")
    edit_parser.add_argument("--ticket", "-t", help="Link to ticket (use '' to clear)")
    edit_parser.add_argument("--priority", "-p", choices=["normal", "high", "urgent"],
                           help="Set priority")

    args = parser.parse_args()

    if args.command == "add":
        priority_map = {"normal": 0, "high": 1, "urgent": 2}
        return add_todo(args.content, priority_map[args.priority], args.ticket)
    elif args.command in ("list", "ls"):
        return list_todos(show_all=args.all, show_completed=args.completed, ticket_id=args.ticket)
    elif args.command == "done":
        return mark_done(args.id, completed=True)
    elif args.command == "undone":
        return mark_done(args.id, completed=False)
    elif args.command in ("delete", "rm"):
        return delete_todo(args.id, force=args.force)
    elif args.command == "edit":
        priority_map = {"normal": 0, "high": 1, "urgent": 2}
        priority = priority_map.get(args.priority) if args.priority else None
        return edit_todo(args.id, content=args.content, ticket_id=args.ticket, priority=priority)
    else:
        parser.print_help()
        return 0


if __name__ == "__main__":
    sys.exit(main())
