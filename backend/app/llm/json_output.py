"""Strict JSON boundary shared by agent tool turns and generated drafts."""
import json


def parse_strict_json(text: str):
    def unique_keys(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError("Duplicate JSON key")
            result[key] = value
        return result
    return json.loads(text, object_pairs_hook=unique_keys,
                      parse_constant=lambda value: (_ for _ in ()).throw(ValueError("Non-finite JSON number")))
