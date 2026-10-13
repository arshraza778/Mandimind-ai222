"""
Simulated clock management and escalation evaluation
"""

from datetime import datetime, timezone, timedelta
from typing import List, Tuple
from sqlalchemy.orm import Session
from app.db.models import SimulatedClock, Task, TaskEvent
from config import load_config


DEFAULT_ANCHOR_TIME = datetime(2024, 1, 15, 9, 0, 0)


def get_or_create_clock(db: Session) -> SimulatedClock:
    """Retrieve the singleton clock or initialize it."""
    clock = db.query(SimulatedClock).filter(SimulatedClock.id == 1).first()
    if not clock:
        clock = SimulatedClock(
            id=1,
            current_time=DEFAULT_ANCHOR_TIME,
            anchor_time=DEFAULT_ANCHOR_TIME,
        )
        db.add(clock)
        db.commit()
        db.refresh(clock)
    return clock


def get_simulated_now(db: Session) -> datetime:
    """Returns the current simulated clock time."""
    clock = get_or_create_clock(db)
    return clock.current_time


def check_and_escalate_tasks(db: Session, current_time: datetime, escalation_hours: int = 48) -> List[int]:
    """
    Checks all tasks in 'sent' status.
    If (current_time - task.created_at) >= escalation_hours, moves to 'escalated'
    and logs a task_events audit row. Returns list of escalated task IDs.
    """
    escalated_ids = []
    sent_tasks = db.query(Task).filter(Task.status == "sent").all()

    for task in sent_tasks:
        elapsed_seconds = (current_time - task.created_at).total_seconds()
        elapsed_hours = elapsed_seconds / 3600.0

        if elapsed_hours >= escalation_hours:
            task.status = "escalated"
            task.updated_at = current_time

            event = TaskEvent(
                task_id=task.id,
                event="escalated_no_reply",
                actor="System Escalation Service",
                timestamp=current_time,
                notes=f"Auto-escalated to district after exceeding {escalation_hours}h without frontline response."
            )
            db.add(event)
            escalated_ids.append(task.id)

    if escalated_ids:
        db.commit()

    return escalated_ids


def advance_clock(db: Session, hours: float) -> Tuple[datetime, List[int]]:
    """
    Advances simulated clock by N hours and executes escalation evaluation.
    """
    cfg = load_config()
    escalation_hours = cfg.escalation_hours

    clock = get_or_create_clock(db)
    clock.current_time = clock.current_time + timedelta(hours=hours)
    db.commit()
    db.refresh(clock)

    escalated = check_and_escalate_tasks(db, clock.current_time, escalation_hours=escalation_hours)
    return clock.current_time, escalated


def reset_clock(db: Session, anchor_time: datetime = None) -> datetime:
    """
    Resets simulated clock back to anchor time.
    """
    clock = get_or_create_clock(db)
    if anchor_time is None:
        anchor_time = clock.anchor_time or DEFAULT_ANCHOR_TIME

    clock.current_time = anchor_time
    clock.anchor_time = anchor_time
    db.commit()
    db.refresh(clock)
    return clock.current_time
