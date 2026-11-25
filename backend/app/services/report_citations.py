"""Remove app source markers from generated reports, leaving source data intact."""

import re


_CITATION_LINK = re.compile(r"`?\[[^\[\]\n]*\]\(#cite:[^\s)]*\)`?", re.IGNORECASE)
_SOURCE_CITATION = re.compile(
    r'`?\[(?:[^\[\]\n|]+\s*\|\s*)?tr\.\s*\d+'
    r'(?:\s*[–—-]\s*\d+)?(?:\s*[,;]\s*\d+(?:\s*[–—-]\s*\d+)?)*'
    r'\s*(?:\|\s*"(?:\\.|[^"\\\n])*")?\s*\]`?(?!\()',
    re.IGNORECASE,
)


def strip_report_citations(text: str) -> str:
    """Strip only recognized citations, preserving ordinary brackets and links."""
    cleaned = _SOURCE_CITATION.sub("", _CITATION_LINK.sub("", text))
    if cleaned == text:
        return text
    cleaned = re.sub(r"[ \t]+([,.;:!?])", r"\1", cleaned)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    return re.sub(r"[ \t]+$", "", cleaned, flags=re.MULTILINE)
