"""
Vercel entry point for DharMarnatee backend API.

Vercel's @vercel/python runtime detects the 'app' variable (a Flask/WSGI
callable) and uses it to handle all incoming HTTP requests.

Local development is unchanged:
    cd backend && py app.py
"""
import sys
import os

# Make backend/ importable so app.py resolves locations.json and relative paths correctly
sys.path.insert(
    0,
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"),
)

from app import app  # noqa: E402

# Vercel's @vercel/python runtime auto-detects the 'app' WSGI callable.
