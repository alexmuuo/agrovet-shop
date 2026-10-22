import os
import sys

# Locate the existing Flask backend.

BACKEND_DIR = os.path.abspath(
os.path.join(os.path.dirname(__file__), "..", "backend")
)

if BACKEND_DIR not in sys.path:
sys.path.insert(0, BACKEND_DIR)

# Import the existing Flask application.

from app import app
