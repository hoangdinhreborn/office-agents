from dataclasses import dataclass
from typing import List


@dataclass
class TextChunk:
    chunk_index: int
    text: str
    token_estimate: int


def estimate_tokens(text: str) -> int:
    """
    Approximates token count for Vietnamese and English text.
    Roughly 1.3 words per token on average.
    """
    words = len(text.split())
    return int(words * 1.3)


def chunk_text(
    text: str,
    max_chunk_tokens: int = 1500,
    overlap_tokens: int = 200,
) -> List[TextChunk]:
    """
    Splits text into coherent chunks based on paragraphs, sentences, or word boundaries.
    """
    if not text.strip():
        return []

    # If text is already small enough, return as single chunk
    if estimate_tokens(text) <= max_chunk_tokens:
        return [TextChunk(chunk_index=0, text=text.strip(), token_estimate=estimate_tokens(text))]

    paragraphs = text.split("\n\n")
    chunks: List[str] = []
    current_chunk: List[str] = []
    current_tokens = 0

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        para_tokens = estimate_tokens(para)

        # If a single paragraph is larger than max_chunk_tokens, split by sentences
        if para_tokens > max_chunk_tokens:
            sentences = para.replace(". ", ".\n").splitlines()
            for sent in sentences:
                sent = sent.strip()
                if not sent:
                    continue
                sent_tokens = estimate_tokens(sent)
                if current_tokens + sent_tokens > max_chunk_tokens and current_chunk:
                    chunks.append("\n\n".join(current_chunk))
                    current_chunk = []
                    current_tokens = 0
                current_chunk.append(sent)
                current_tokens += sent_tokens
        else:
            if current_tokens + para_tokens > max_chunk_tokens and current_chunk:
                chunks.append("\n\n".join(current_chunk))
                # Retain overlap from end of current chunk
                overlap_text = current_chunk[-1] if current_chunk else ""
                current_chunk = [overlap_text] if estimate_tokens(overlap_text) < overlap_tokens else []
                current_tokens = estimate_tokens("\n\n".join(current_chunk))

            current_chunk.append(para)
            current_tokens += para_tokens

    if current_chunk:
        chunks.append("\n\n".join(current_chunk))

    return [
        TextChunk(chunk_index=i, text=ch.strip(), token_estimate=estimate_tokens(ch))
        for i, ch in enumerate(chunks)
        if ch.strip()
    ]
