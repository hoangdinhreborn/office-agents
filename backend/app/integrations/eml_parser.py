import email
from email.header import decode_header
import hashlib
import logging
from pathlib import Path
import re
from typing import List, Optional, Tuple

from app.schemas.email import EmailAttachment, EmailMessage

logger = logging.getLogger(__name__)


def _decode_header_value(header_val: Optional[str]) -> str:
    if not header_val:
        return ""
    decoded_fragments = decode_header(header_val)
    parts = []
    for content, encoding in decoded_fragments:
        if isinstance(content, bytes):
            try:
                parts.append(content.decode(encoding or "utf-8", errors="ignore"))
            except Exception:
                parts.append(content.decode("utf-8", errors="ignore"))
        else:
            parts.append(str(content))
    return "".join(parts)


def _clean_html_tags(html_text: str) -> str:
    cleaned = re.sub(r"<style.*?</style>", "", html_text, flags=re.DOTALL | re.IGNORECASE)
    cleaned = re.sub(r"<script.*?</script>", "", cleaned, flags=re.DOTALL | re.IGNORECASE)
    cleaned = re.sub(r"<[^>]+>", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def parse_eml_bytes(
    raw_bytes: bytes,
    fallback_id: Optional[str] = None,
    folder_name: str = "Local_EML",
) -> EmailMessage:
    """
    Parses raw RFC-822 (.eml) bytes into standard EmailMessage dataclass.
    Extracts sender, subject, body, received time, and PDF attachments.
    """
    msg = email.message_from_bytes(raw_bytes)

    subject = _decode_header_value(msg.get("Subject", "(Không có tiêu đề)"))
    from_header = _decode_header_value(msg.get("From", ""))
    date_header = msg.get("Date", "")
    message_id = msg.get("Message-ID", fallback_id or hashlib.sha256(raw_bytes).hexdigest()[:16])

    # Parse sender name and email
    sender_name = from_header
    sender_email = from_header
    if "<" in from_header and ">" in from_header:
        sender_name = from_header.split("<")[0].strip(" \"'")
        sender_email = from_header.split("<")[1].split(">")[0].strip().lower()

    plain_text_parts: List[str] = []
    html_parts: List[str] = []
    attachments: List[EmailAttachment] = []

    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            content_disp = str(part.get("Content-Disposition", ""))
            filename = part.get_filename()

            if filename:
                decoded_fn = _decode_header_value(filename)
                is_pdf = decoded_fn.lower().endswith(".pdf")
                att_data = part.get_payload(decode=True) or b""
                attachments.append(
                    EmailAttachment(
                        filename=decoded_fn,
                        content_type=content_type,
                        data=att_data,
                        is_pdf=is_pdf,
                    )
                )
            elif content_type == "text/plain" and "attachment" not in content_disp:
                payload = part.get_payload(decode=True)
                if payload:
                    charset = part.get_content_charset() or "utf-8"
                    plain_text_parts.append(payload.decode(charset, errors="ignore"))
            elif content_type == "text/html" and "attachment" not in content_disp:
                payload = part.get_payload(decode=True)
                if payload:
                    charset = part.get_content_charset() or "utf-8"
                    html_parts.append(payload.decode(charset, errors="ignore"))
    else:
        payload = msg.get_payload(decode=True)
        if payload and isinstance(payload, bytes):
            charset = msg.get_content_charset() or "utf-8"
            content_type = msg.get_content_type()
            decoded_text = payload.decode(charset, errors="ignore")
            if content_type == "text/html":
                html_parts.append(decoded_text)
            else:
                plain_text_parts.append(decoded_text)

    # Prefer plain text over HTML
    if plain_text_parts:
        body = "\n".join(plain_text_parts).strip()
    elif html_parts:
        body = _clean_html_tags("\n".join(html_parts))
    else:
        body = ""

    return EmailMessage(
        id=str(message_id),
        subject=subject,
        sender_name=sender_name or sender_email,
        sender_email=sender_email,
        received_time=date_header,
        body=body,
        folder=folder_name,
        has_attachments=len(attachments) > 0,
        attachments=attachments,
    )


def load_eml_file(file_path: Path, folder_name: str = "Local_EML") -> EmailMessage:
    raw_bytes = file_path.read_bytes()
    return parse_eml_bytes(
        raw_bytes=raw_bytes,
        fallback_id=file_path.stem,
        folder_name=folder_name,
    )


def load_eml_folder(
    folder_path: Path,
    allowed_senders: Optional[List[str]] = None,
    limit: int = 50,
) -> List[EmailMessage]:
    """
    Reads all .eml files from a local directory, with optional sender filtering.
    """
    if not folder_path.exists():
        return []

    eml_files = sorted(folder_path.glob("*.eml"), key=lambda f: f.stat().st_mtime, reverse=True)
    messages: List[EmailMessage] = []

    for f in eml_files:
        if len(messages) >= limit:
            break
        try:
            msg = load_eml_file(f, folder_name=folder_path.name)
            if allowed_senders:
                sender_low = msg.sender_email.lower()
                if not any(s.lower() in sender_low for s in allowed_senders):
                    continue
            messages.append(msg)
        except Exception as exc:
            logger.warning(f"Lỗi khi đọc file .eml '{f.name}': {exc}")

    return messages
