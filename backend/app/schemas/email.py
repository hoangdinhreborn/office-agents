from dataclasses import dataclass, field
from typing import List


@dataclass
class EmailAttachment:
    filename: str
    content_type: str
    data: bytes
    is_pdf: bool = False


@dataclass
class EmailMessage:
    id: str
    subject: str
    sender_name: str
    sender_email: str
    received_time: str
    body: str
    folder: str = "INBOX"
    has_attachments: bool = False
    attachments: List[EmailAttachment] = field(default_factory=list)
