from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any, Dict, Optional


class CalendarProvider(ABC):
    """
    Abstract interface for calendar integrations (Local, Google Calendar).
    """

    @abstractmethod
    def create_event(
        self,
        title: str,
        start_time: datetime,
        end_time: datetime,
        description: str = "",
        location: str = "",
        reminder_minutes: Optional[int] = None,
        stable_hash: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Creates an event in the calendar provider.
        Returns dictionary containing event details, provider id, and status.
        """
        pass

    @abstractmethod
    def update_event(self, event_id: str, **kwargs) -> bool:
        """
        Updates an existing event by its provider event ID.
        """
        pass

    @abstractmethod
    def delete_event(self, event_id: str) -> bool:
        """
        Deletes an event by its provider event ID.
        """
        pass

    @abstractmethod
    def find_duplicate(self, stable_hash: str) -> Optional[str]:
        """
        Checks if an event with the given stable hash already exists.
        Returns the existing provider event ID, or None if not found.
        """
        pass
