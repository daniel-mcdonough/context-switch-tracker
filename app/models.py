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
    category = Column(String, nullable=True)
    is_switch = Column(Boolean, nullable=False, server_default="1")

# CustomTask model for custom tasks
class CustomTask(Base):
    __tablename__ = "custom_tasks"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=True)

# 4) Create the table (run once at startup)
def init_db():
    Base.metadata.create_all(bind=engine)