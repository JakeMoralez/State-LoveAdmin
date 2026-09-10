"""Secret comparison helpers."""

from __future__ import annotations

import hmac


def secrets_equal(provided: str | None, expected: str) -> bool:
    """Constant-time compare; False if either side empty/missing."""
    if not expected or provided is None:
        return False
    a = provided.encode("utf-8")
    b = expected.encode("utf-8")
    if len(a) != len(b):
        # Still run compare on equal-length dummy to keep timing flatter;
        # unequal length cannot use compare_digest safely on some Pythons.
        hmac.compare_digest(b, b)
        return False
    return hmac.compare_digest(a, b)
