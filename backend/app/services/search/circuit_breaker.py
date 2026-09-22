"""
circuit_breaker.py — A simple per-provider circuit breaker.

States:
    CLOSED  — normal operation; requests pass through.
    OPEN    — provider is presumed faulty; requests are rejected immediately.
    HALF_OPEN — cooldown elapsed; one probe allowed. On success → CLOSED.
                On failure → OPEN immediately.

Transitions:
    CLOSED    → OPEN      after `failure_threshold` consecutive failures.
    OPEN      → HALF_OPEN after `reset_timeout_seconds` have elapsed.
    HALF_OPEN → CLOSED    on record_success().
    HALF_OPEN → OPEN      on record_failure() (probe failed, re-open).

Thread/coroutine safety: all state mutations are protected by a threading.Lock
so the breaker can be shared across asyncio tasks that run sync wrappers via
thread-pool executors.
"""

from __future__ import annotations

import threading
import time
from enum import Enum, auto


class _State(Enum):
    CLOSED = auto()
    OPEN = auto()
    HALF_OPEN = auto()


class CircuitBreaker:
    """
    Tracks consecutive failures for one upstream provider.

    Usage::

        breaker = CircuitBreaker(failure_threshold=5, reset_timeout_seconds=120)

        if breaker.is_open():
            raise SearchProviderError("circuit open")
        try:
            result = call_upstream()
            breaker.record_success()
        except Exception:
            breaker.record_failure()
            raise
    """

    def __init__(
        self,
        failure_threshold: int = 5,
        reset_timeout_seconds: float = 120.0,
    ) -> None:
        if failure_threshold < 1:
            raise ValueError("failure_threshold must be >= 1")
        self._threshold = failure_threshold
        self._reset_timeout = reset_timeout_seconds

        self._state: _State = _State.CLOSED
        self._consecutive_failures: int = 0
        self._opened_at: float | None = None   # monotonic timestamp when breaker opened
        self._lock = threading.Lock()

    # ── Public API ──────────────────────────────────────────────────────

    def is_open(self) -> bool:
        """
        Return True if the circuit should block the caller (OPEN state).

        HALF_OPEN is NOT open — the probe call is allowed through.
        Transitions OPEN → HALF_OPEN when cooldown elapses.
        """
        with self._lock:
            if self._state == _State.CLOSED:
                return False
            if self._state == _State.HALF_OPEN:
                return False   # probe allowed
            # OPEN
            if self._opened_at is not None and (time.monotonic() - self._opened_at) >= self._reset_timeout:
                # Transition to HALF_OPEN: allow one probe through
                self._state = _State.HALF_OPEN
                return False
            return True

    def record_success(self) -> None:
        """Reset to CLOSED."""
        with self._lock:
            self._consecutive_failures = 0
            self._opened_at = None
            self._state = _State.CLOSED

    def record_failure(self) -> None:
        """
        Increment the consecutive-failure counter.
        - In HALF_OPEN state: probe failed → re-open immediately.
        - In CLOSED state: increment counter; open if threshold reached.
        - In OPEN state: do nothing (caller should not have called us, but be safe).
        """
        with self._lock:
            if self._state == _State.HALF_OPEN:
                # Probe failed — re-open immediately
                self._consecutive_failures = 1
                self._opened_at = time.monotonic()
                self._state = _State.OPEN
                return

            if self._state == _State.OPEN:
                # Should not happen if caller checks is_open() correctly, but be safe
                return

            # CLOSED
            self._consecutive_failures += 1
            if self._consecutive_failures >= self._threshold:
                self._opened_at = time.monotonic()
                self._state = _State.OPEN

    @property
    def consecutive_failures(self) -> int:
        with self._lock:
            return self._consecutive_failures

    @property
    def is_closed(self) -> bool:
        return not self.is_open()

    def __repr__(self) -> str:  # pragma: no cover
        with self._lock:
            return (
                f"CircuitBreaker(state={self._state.name}, "
                f"consecutive_failures={self._consecutive_failures}, "
                f"threshold={self._threshold}, "
                f"reset_timeout={self._reset_timeout}s)"
            )
