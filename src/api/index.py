import os
import sys
import json
import traceback

BACKEND_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "backend")
)

if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

try:
    from app import app

    @app.route("/api/vercel-backend-test")
    def vercel_backend_test():
        return {
            "status": "ok",
            "message": "Flask is running on Vercel",
            "backend_loaded": True
        }, 200

except Exception as exc:
    from flask import Flask, jsonify

    app = Flask(__name__)

    @app.route("/api/vercel-backend-test")
    def vercel_backend_test():
        return jsonify({
            "status": "error",
            "backend_loaded": False,
            "error": str(exc),
            "traceback": traceback.format_exc()
        }), 500
