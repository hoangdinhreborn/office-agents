// Report exports omit interactive source markers; persisted Markdown keeps them.
export function stripReportCitations(text: string): string {
  const cleaned = text
    .replace(/`?\[[^\[\]\n]*\]\(#cite:[^\s)]*\)`?/gi, '')
    .replace(/`?\[(?:[^\[\]\n|]+\s*\|\s*)?tr\.\s*\d+(?:\s*[–—-]\s*\d+)?(?:\s*[,;]\s*\d+(?:\s*[–—-]\s*\d+)?)*\s*(?:\|\s*"(?:\\.|[^"\\\n])*")?\s*\]`?(?!\()/gi, '');
  if (cleaned === text) return text;
  return cleaned
    .replace(/[ \t]+([,.;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+$/gm, '');
}
