import os

from flask import Blueprint, request, jsonify
from werkzeug.security import check_password_hash

from admin_auth import create_admin_token


admin_auth_bp = Blueprint("admin_auth_bp", __name__)


@admin_auth_bp.route("/api/admin/login", methods=["POST"])
def admin_login():
    data = request.get_json(silent=True) or {}

    username = data.get("username", "").strip()
    password = data.get("password", "")

    if not username or not password:
        return jsonify({
            "status": "error",
            "message": "Username and password are required."
        }), 400

    admin_username = os.getenv("ADMIN_USERNAME")
    admin_password_hash = os.getenv("ADMIN_PASSWORD_HASH")

    if not admin_username or not admin_password_hash:
        return jsonify({
            "status": "error",
            "message": "Admin login is not configured."
        }), 500

    if (
        username != admin_username
        or not check_password_hash(admin_password_hash, password)
    ):
        return jsonify({
            "status": "error",
            "message": "Invalid username or password."
        }), 401

    try:
        token = create_admin_token(username)

        return jsonify({
            "status": "success",
            "message": "Admin login successful.",
            "token": token,
            "admin": {
                "username": username,
                "role": "admin"
            }
        })

    except RuntimeError:
        return jsonify({
            "status": "error",
            "message": "Admin authentication is not configured."
        }), 500