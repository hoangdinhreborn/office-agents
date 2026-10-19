import json
import re
from typing import List, Dict, Any


def format_reward_func(prompts: List[str], completions: List[str], **kwargs) -> List[float]:
    """
    Reward function that verifies:
    1. Proper <think>...</think> reasoning tags are generated.
    2. Final answer contains valid markdown or valid JSON.
    """
    rewards = []
    for completion in completions:
        score = 0.0
        # Check reasoning block
        if "<think>" in completion and "</think>" in completion:
            thought_text = completion.split("<think>")[1].split("</think>")[0].strip()
            if len(thought_text) > 40:
                score += 1.0
            else:
                score += 0.3
        else:
            score -= 1.0

        # Check JSON block if prompt asked for JSON
        if "```json" in completion and "```" in completion:
            try:
                json_part = completion.split("```json")[1].split("```")[0].strip()
                json.loads(json_part)
                score += 1.5
            except Exception:
                score -= 0.5

        rewards.append(score)
    return rewards


def calendar_accuracy_reward_func(
    prompts: List[str],
    completions: List[str],
    target_start_time: List[str] = None,
    target_reminder_minutes: List[int] = None,
    **kwargs
) -> List[float]:
    """
    Evaluates temporal and reminder extraction precision in Calendar Agent tasks.
    """
    rewards = []
    for i, completion in enumerate(completions):
        score = 0.0
        # Extract json from completion
        json_match = re.search(r"```(?:json)?\s*([\[{].*?[\]}])\s*```", completion, re.DOTALL)
        if json_match:
            try:
                data = json.loads(json_match.group(1))
                if isinstance(data, list) and len(data) > 0:
                    event = data[0]
                    # Verify ISO format for start_time
                    st = event.get("start_time", "")
                    if re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}", st):
                        score += 1.5

                    # Verify reminder_minutes is integer
                    rem = event.get("reminder_minutes")
                    if isinstance(rem, int) and rem > 0:
                        score += 1.0

                    # Check ground truth match if provided
                    if target_start_time and i < len(target_start_time) and target_start_time[i]:
                        if target_start_time[i] in st:
                            score += 2.0

                    if target_reminder_minutes and i < len(target_reminder_minutes):
                        if rem == target_reminder_minutes[i]:
                            score += 2.0
            except Exception:
                score -= 1.0
        else:
            score -= 0.5
        rewards.append(score)
    return rewards


def solution_quality_reward_func(prompts: List[str], completions: List[str], **kwargs) -> List[float]:
    """
    Rewards multi-tier solution proposals covering:
    - Root cause analysis
    - Immediate / workaround solution
    - Mid-term systemic fix
    - Long-term prevention
    - Action items / timeline
    """
    rewards = []
    required_keywords = [
        ("nguyên nhân", 1.0),
        ("ngắn hạn", 1.0),
        ("trung hạn", 1.0),
        ("dài hạn", 1.0),
        ("rủi ro", 0.5),
        ("kế hoạch", 0.5),
    ]

    for completion in completions:
        score = 0.0
        comp_lower = completion.lower()
        for kw, weight in required_keywords:
            if kw in comp_lower:
                score += weight

        # Penalize overly brief responses
        if len(completion) < 300:
            score -= 2.0
        elif len(completion) > 800:
            score += 1.0

        rewards.append(score)
    return rewards
