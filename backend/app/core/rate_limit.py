"""Brute-force protection: in-memory sliding-window rate limits for login and sign up.

Sliding window log: for every key (an IP or an email) we keep the timestamps of its recent events. An event is
allowed while fewer than `limit` timestamps are younger than `window` seconds. Old timestamps fall out one by
one, so there is no "reset at the top of the minute" burst that a fixed window allows.

Login counts only FAILED attempts, by email and by IP:
- per email: stops guessing the password of one account, even from many IPs;
- per IP: stops one client from trying many accounts.
While a key is over its limit every attempt gets 429 - even with the right password - so the attacker cannot
learn whether a guess was correct. A successful login clears the email counter (not the IP one).

The state lives in the process memory: it is reset on restart and is per worker. The app runs one uvicorn
worker (start.sh), which is enough here; with several workers / instances move this to Redis or the database.
"""

import math
import threading
import time
from collections import deque
from collections.abc import Callable

from fastapi import HTTPException, Request, status

from app.core.config import settings


class SlidingWindowLimiter:
    def __init__(self, limit: int, window_seconds: float, clock: Callable[[], float] = time.monotonic):
        self.limit = limit
        self.window = window_seconds
        self._clock = clock
        self._events: dict[str, deque[float]] = {}
        self._lock = threading.Lock()  # sync endpoints run in a thread pool
        self._hits_since_sweep = 0

    def _prune(self, key: str, now: float) -> deque[float] | None:
        events = self._events.get(key)
        if events is None:
            return None
        while events and events[0] <= now - self.window:
            events.popleft()
        if not events:
            del self._events[key]
            return None
        return events

    def retry_after(self, key: str) -> int:
        """0 if the key may act now, otherwise seconds until the oldest event leaves the window."""
        with self._lock:
            now = self._clock()
            events = self._prune(key, now)
            if events is None or len(events) < self.limit:
                return 0
            return max(1, math.ceil(events[0] + self.window - now))

    def hit(self, key: str) -> None:
        with self._lock:
            now = self._clock()
            self._events.setdefault(key, deque()).append(now)
            self._hits_since_sweep += 1
            if self._hits_since_sweep >= 1000:  # drop idle keys so memory does not grow forever
                self._hits_since_sweep = 0
                for k in list(self._events):
                    self._prune(k, now)

    def reset(self, key: str) -> None:
        with self._lock:
            self._events.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._events.clear()
            self._hits_since_sweep = 0


login_fails_by_email = SlidingWindowLimiter(settings.LOGIN_MAX_FAILS_PER_EMAIL, settings.LOGIN_WINDOW_SECONDS)
login_fails_by_ip = SlidingWindowLimiter(settings.LOGIN_MAX_FAILS_PER_IP, settings.LOGIN_WINDOW_SECONDS)
signups_by_ip = SlidingWindowLimiter(settings.SIGNUP_MAX_PER_IP, settings.SIGNUP_WINDOW_SECONDS)
codes_sent_by_ip = SlidingWindowLimiter(settings.SEND_CODE_MAX_PER_IP, settings.SIGNUP_WINDOW_SECONDS)

ALL_LIMITERS = (login_fails_by_email, login_fails_by_ip, signups_by_ip, codes_sent_by_ip)


def client_ip(request: Request) -> str:
    # Behind a proxy uvicorn (--proxy-headers) has already put the X-Forwarded-For client here.
    return request.client.host if request.client else "unknown"


def _too_many(seconds: int) -> HTTPException:
    minutes = max(1, math.ceil(seconds / 60))
    return HTTPException(
        status.HTTP_429_TOO_MANY_REQUESTS,
        f"Too many attempts. Try again in {minutes} min.",
        headers={"Retry-After": str(seconds)},
    )


def check_login(ip: str, email: str) -> None:
    """Raise 429 if this IP or this email has too many recent failed logins. Call BEFORE checking the password."""
    if not settings.RATE_LIMIT_ENABLED:
        return
    wait = max(login_fails_by_email.retry_after(email), login_fails_by_ip.retry_after(ip))
    if wait:
        raise _too_many(wait)


def login_failed(ip: str, email: str) -> None:
    if settings.RATE_LIMIT_ENABLED:
        login_fails_by_email.hit(email)
        login_fails_by_ip.hit(ip)


def login_succeeded(email: str) -> None:
    login_fails_by_email.reset(email)


def _check(limiter: SlidingWindowLimiter, ip: str) -> None:
    if not settings.RATE_LIMIT_ENABLED:
        return
    wait = limiter.retry_after(ip)
    if wait:
        raise _too_many(wait)


def check_signup(ip: str) -> None:
    """Count a sign up attempt from this IP; raise 429 over the limit (stops mass account creation)."""
    _check(signups_by_ip, ip)
    if settings.RATE_LIMIT_ENABLED:
        signups_by_ip.hit(ip)


def check_send_code(ip: str) -> None:
    """Raise 429 if this IP has had too many sign-up code emails sent. The per-email resend cooldown does not stop
    one client from mailing codes to many different addresses (spam, mail-provider quota). Call BEFORE sending."""
    _check(codes_sent_by_ip, ip)


def code_sent(ip: str) -> None:
    """Count only emails really sent: a request refused for a typo or a taken address costs nothing."""
    if settings.RATE_LIMIT_ENABLED:
        codes_sent_by_ip.hit(ip)
