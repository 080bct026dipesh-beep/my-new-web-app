"""Shared slowapi Limiter instance.

Kept separate from main.py so route modules (e.g. app/api/admin_auth.py)
can import `limiter` to decorate individual endpoints without creating a
circular import with the FastAPI app itself.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
