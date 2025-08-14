# app/models.py

from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    Text,
    Boolean,
    create_engine,
    func,
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from config import Config
import re

# 1) Engine & session factory
engine = create_engine(Config.DATABASE_URL, echo=False, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

# 2) Base class
Base = declarative_base()



# 3) Switch record model
class Switch(Base):
    __tablename__ = "switches"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    from_task = Column(String, nullable=True)
    to_task = Column(String, nullable=False)
    note = Column(Text, nullable=True)
    category = Column(String, nullable=True)  # Keep for backward compatibility
    tags = Column(Text, nullable=True)  # JSON as text for SQLite
    is_switch = Column(Boolean, nullable=False, server_default="1")



# CustomTask model for internal kanban tasks
class CustomTask(Base):
    __tablename__ = "custom_tasks"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(String, unique=True, nullable=False)  # INT-001, INT-002, etc.
    name = Column(String, nullable=False)  # Task title
    description = Column(Text, nullable=True)  # Task details
    status = Column(String, nullable=False, default="todo")  # todo, in_progress, done
    created_date = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


def generate_internal_ticket_id():
    """Generate the next internal ticket ID (INT-001, INT-002, etc.)"""
    db = SessionLocal()
    try:
        # Find the highest existing internal ticket number
        internal_tickets = db.query(CustomTask).filter(
            CustomTask.ticket_id.like('INT-%')
        ).all()
        
        if not internal_tickets:
            return "INT-001"
        
        # Extract numbers from existing tickets
        numbers = []
        for ticket in internal_tickets:
            match = re.search(r'INT-(\d+)', ticket.ticket_id)
            if match:
                numbers.append(int(match.group(1)))
        
        if not numbers:
            return "INT-001"
        
        # Return next number
        next_num = max(numbers) + 1
        return f"INT-{next_num:03d}"
        
    finally:
        db.close()



# TagPreset model for common tag combinations
class TagPreset(Base):
    __tablename__ = "tag_presets"

    id = Column(Integer, primary_key=True, index=True)
    tag_type = Column(String(50), nullable=False)
    tag_value = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, server_default="1")



# 4) Create the table (run once at startup)
def init_db():
    Base.metadata.create_all(bind=engine)
