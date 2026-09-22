"""
test_circuit_breaker.py — Unit tests for CircuitBreaker.

Tests cover:
    - Opens after exactly `failure_threshold` consecutive failures
    - Stays closed under threshold
    - Resets after cooldown window
    - A success resets the consecutive counter so threshold requires fresh streak
    - Probe failure after cooldown re-opens immediately
"""
import time
import unittest
from unittest.mock import patch

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.search.circuit_breaker import CircuitBreaker


class TestCircuitBreakerOpensAfterThreshold(unittest.TestCase):
    def test_opens_after_threshold(self):
        """Circuit opens when consecutive_failures reaches failure_threshold."""
        cb = CircuitBreaker(failure_threshold=5, reset_timeout_seconds=120)
        for _ in range(5):
            self.assertFalse(cb.is_open(), "Should be closed before threshold")
            cb.record_failure()
        self.assertTrue(cb.is_open(), "Should be open at threshold")

    def test_closed_under_threshold(self):
        """Circuit stays closed while below threshold."""
        cb = CircuitBreaker(failure_threshold=5, reset_timeout_seconds=120)
        for _ in range(4):
            cb.record_failure()
        self.assertFalse(cb.is_open(), "Should stay closed with 4 failures (threshold=5)")

    def test_exactly_at_threshold_is_open(self):
        """Boundary: threshold=1 should open after the very first failure."""
        cb = CircuitBreaker(failure_threshold=1, reset_timeout_seconds=120)
        cb.record_failure()
        self.assertTrue(cb.is_open())

    def test_invalid_threshold_raises(self):
        """Threshold < 1 should raise ValueError."""
        with self.assertRaises(ValueError):
            CircuitBreaker(failure_threshold=0)


class TestCircuitBreakerResetAfterCooldown(unittest.TestCase):
    def test_resets_after_cooldown(self):
        """
        After cooldown window, is_open() returns False and resets the breaker
        (allows the next call through as a probe).
        """
        cb = CircuitBreaker(failure_threshold=5, reset_timeout_seconds=120)
        for _ in range(5):
            cb.record_failure()
        self.assertTrue(cb.is_open())

        # Simulate cooldown elapsed by patching time.monotonic to return a future time
        original_opened_at = cb._opened_at  # noqa: SLF001 (test accesses internal for verification)
        with patch("time.monotonic", return_value=original_opened_at + 121):
            self.assertFalse(cb.is_open(), "Should auto-reset after cooldown")

    def test_probe_failure_reopens_immediately(self):
        """A failure during the probe (post-cooldown) re-opens the breaker."""
        cb = CircuitBreaker(failure_threshold=5, reset_timeout_seconds=120)
        for _ in range(5):
            cb.record_failure()
        self.assertTrue(cb.is_open())

        opened_at = cb._opened_at  # noqa: SLF001
        with patch("time.monotonic", return_value=opened_at + 121):
            # Cooldown elapsed — breaker is now closed (probe allowed)
            self.assertFalse(cb.is_open())
            # Probe fails
            cb.record_failure()
            # Should be open again
            self.assertTrue(cb.is_open())


class TestCircuitBreakerSuccessResetsCounter(unittest.TestCase):
    def test_success_resets_counter(self):
        """
        After 4 failures and then a success, the counter resets.
        4 more failures should still keep the breaker closed (not open),
        because the new streak is only 4 (threshold=5).
        """
        cb = CircuitBreaker(failure_threshold=5, reset_timeout_seconds=120)
        for _ in range(4):
            cb.record_failure()
        self.assertFalse(cb.is_open())

        cb.record_success()

        for _ in range(4):
            cb.record_failure()
        self.assertFalse(cb.is_open(), "Counter should have reset; 4 new failures < threshold 5")

    def test_success_closes_open_breaker(self):
        """record_success() after breaker is open should reset and close it."""
        cb = CircuitBreaker(failure_threshold=5, reset_timeout_seconds=120)
        for _ in range(5):
            cb.record_failure()
        self.assertTrue(cb.is_open())

        cb.record_success()
        # After success the counter and opened_at are reset
        self.assertFalse(cb.is_open())


class TestCircuitBreakerIsClosedProperty(unittest.TestCase):
    def test_is_closed_is_inverse_of_is_open(self):
        cb = CircuitBreaker(failure_threshold=2, reset_timeout_seconds=60)
        self.assertTrue(cb.is_closed)
        cb.record_failure()
        cb.record_failure()
        self.assertFalse(cb.is_closed)
        self.assertTrue(cb.is_open())


if __name__ == "__main__":
    unittest.main()
