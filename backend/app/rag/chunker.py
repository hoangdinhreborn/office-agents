from dataclasses import dataclass
from math import ceil
import re
from typing import List


@dataclass
class TextChunk:
    chunk_index: int
    text: str
    token_estimate: int
    start_offset: int = 0
    end_offset: int = 0
    source_pages: tuple[int, ...] = ()


def estimate_tokens(text: str) -> int:
    """Word-based budget estimate, not a provider-specific tokenizer."""
    return ceil(len(text.split()) * 1.3)


def _limits(max_chunk_tokens, overlap_tokens):
    if max_chunk_tokens < 2 or not 0 <= overlap_tokens < max_chunk_tokens:
        raise ValueError("Chunk cần ít nhất 2 tokens và 0 <= overlap < kích thước chunk.")
    return max(1, int(max_chunk_tokens / 1.3)), ceil(overlap_tokens / 1.3)


def chunk_text(text: str, max_chunk_tokens: int = 1500, overlap_tokens: int = 200) -> List[TextChunk]:
    """Bound every window and retain the configured tail at every boundary."""
    size, overlap = _limits(max_chunk_tokens, overlap_tokens)
    words = list(re.finditer(r"\S+", text))
    chunks, offset = [], 0
    while offset < len(words):
        end = min(offset + size, len(words))
        start_char, end_char = words[offset].start(), words[end - 1].end()
        value = text[start_char:end_char]
        chunks.append(TextChunk(len(chunks), value, estimate_tokens(value), start_char, end_char))
        if end == len(words):
            break
        offset = end - min(overlap, end - offset - 1)
    return chunks


PAGE_MARKER = re.compile(r"(?m)^--- (?:(.+?) \| )?Trang (\d+) ---[ \t]*\n")


def chunk_with_sources(text: str, max_chunk_tokens: int = 2500, overlap_tokens: int = 200) -> List[TextChunk]:
    """Overlap across page boundaries and restore each fragment's actual page header."""
    markers = list(PAGE_MARKER.finditer(text))
    if not markers:
        return chunk_text(text, max_chunk_tokens, overlap_tokens)
    size, overlap = _limits(max_chunk_tokens, overlap_tokens)
    blocks, parts, cursor = [], [], 0
    sections = [(None, None, text[:markers[0].start()])]
    for index, marker in enumerate(markers):
        end = markers[index + 1].start() if index + 1 < len(markers) else len(text)
        sections.append((marker[1], int(marker[2]), text[marker.end():end]))
    for source, page, body in sections:
        if not body.strip():
            continue
        value = body + "\n\n"
        blocks.append((cursor, cursor + len(body), source, page))
        parts.append(value)
        cursor += len(value)
    plain = "".join(parts)
    words = list(re.finditer(r"\S+", plain))
    chunks, offset, block_index = [], 0, 0
    while offset < len(words):
        start_char = words[offset].start()
        while block_index < len(blocks) and blocks[block_index][1] <= start_char:
            block_index += 1
        end = min(offset + size, len(words))
        while True:
            end_char, fragments, pages = words[end - 1].end(), [], []
            for left, right, source, page in blocks[block_index:]:
                if left >= end_char:
                    break
                fragment = plain[max(left, start_char):min(right, end_char)].strip()
                if not fragment:
                    continue
                if page is not None:
                    header = f"--- {source} | Trang {page} ---" if source else f"--- Trang {page} ---"
                    fragment = header + "\n" + fragment
                    pages.append(page)
                fragments.append(fragment)
            value = "\n\n".join(fragments)
            tokens = estimate_tokens(value)
            if tokens <= max_chunk_tokens:
                break
            if end <= offset + 1:
                raise ValueError("Ngân sách chunk quá nhỏ để giữ nhãn nguồn và nội dung.")
            end = max(offset + 1, end - max(1, ceil((tokens - max_chunk_tokens) / 1.3)))
        chunks.append(TextChunk(len(chunks), value, tokens, start_char, end_char, tuple(dict.fromkeys(pages))))
        if end == len(words):
            break
        offset = end - min(overlap, end - offset - 1)
    return chunks
