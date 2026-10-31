"""
Vercel entrypoint for the Flask backend.

The Flask code lives in ../backend and uses top-level imports such as
`from extensions import db`, so the backend folder is added to the
import path before the app is loaded. Vercel serves the `app` object
below as the /api/* function.
"""

import os
import sys

BACKEND_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "backend")
)

if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app import app  # noqa: E402,F401
