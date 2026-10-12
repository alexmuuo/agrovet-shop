import logging

from flask import Blueprint, request, jsonify, g
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from extensions import db
from models.cashier import Cashier
from admin_auth import admin_required
from cashier_auth import (
    cashier_required,
    create_cashier_token,
)

logger = logging.getLogger(__name__)

cashier_bp = Blueprint(
    "cashier_bp",
    __name__,
    url_prefix="/api/cashier",
)


# ============================================================
# CASHIER LOGIN
# POST /api/cashier/login
# ============================================================

@cashier_bp.route("/login", methods=["POST"])
def cashier_login():
    data = request.get_json(silent=True) or {}

    username = data.get("username", "").strip()
    password = data.get("password", "")

    if not isinstance(username, str) or not isinstance(password, str):
        return jsonify({
            "status": "error",
            "message": "Invalid login details.",
        }), 400

    if not username or not password:
        return jsonify({
            "status": "error",
            "message": "Username and password are required.",
        }), 400

    try:
        cashier = Cashier.query.filter(
            func.lower(Cashier.username) == username.lower()
        ).first()

        if (
            cashier is None
            or not cashier.is_active
            or not cashier.check_password(password)
        ):
            return jsonify({
                "status": "error",
                "message": "Invalid username or password.",
            }), 401

        token = create_cashier_token(cashier)

        return jsonify({
            "status": "success",
            "message": "Login successful.",
            "token": token,
            "cashier": cashier.to_dict(),
        }), 200

    except RuntimeError:
        logger.exception("Cashier authentication configuration error.")

        return jsonify({
            "status": "error",
            "message": "Cashier authentication is not configured.",
        }), 500

    except Exception:
        logger.exception("Cashier login failed.")

        return jsonify({
            "status": "error",
            "message": "Unable to process login right now.",
        }), 500


# ============================================================
# CURRENT CASHIER
# GET /api/cashier/me
# ============================================================

@cashier_bp.route("/me", methods=["GET"])
@cashier_required
def get_current_cashier():
    return jsonify({
        "status": "success",
        "cashier": g.cashier.to_dict(),
    }), 200


# ============================================================
# CREATE CASHIER — ADMIN ONLY
# POST /api/cashier/create
# ============================================================

@cashier_bp.route("/create", methods=["POST"])
@admin_required
def create_cashier():
    data = request.get_json(silent=True) or {}

    username = data.get("username")
    full_name = data.get("full_name")
    password = data.get("password")

    if not all(
        isinstance(value, str)
        for value in (username, full_name, password)
    ):
        return jsonify({
            "status": "error",
            "message": "Username, full name and password are required.",
        }), 400

    username = username.strip()
    full_name = full_name.strip()

    if not username or not full_name or not password:
        return jsonify({
            "status": "error",
            "message": "All fields are required.",
        }), 400

    if len(username) > 80:
        return jsonify({
            "status": "error",
            "message": "Username cannot exceed 80 characters.",
        }), 400

    if len(full_name) > 150:
        return jsonify({
            "status": "error",
            "message": "Full name cannot exceed 150 characters.",
        }), 400

    if len(password) < 12:
        return jsonify({
            "status": "error",
            "message": "Password must contain at least 12 characters.",
        }), 400

    try:
        existing_cashier = Cashier.query.filter(
            func.lower(Cashier.username) == username.lower()
        ).first()

        if existing_cashier:
            return jsonify({
                "status": "error",
                "message": "That username is already registered.",
            }), 409

        cashier = Cashier(
            username=username,
            full_name=full_name,
        )

        cashier.set_password(password)

        db.session.add(cashier)
        db.session.commit()

        return jsonify({
            "status": "success",
            "message": "Cashier account created successfully.",
            "cashier": cashier.to_dict(),
        }), 201

    except IntegrityError:
        db.session.rollback()

        return jsonify({
            "status": "error",
            "message": "That username is already registered.",
        }), 409

    except Exception:
        db.session.rollback()
        logger.exception("Cashier account creation failed.")

        return jsonify({
            "status": "error",
            "message": "Unable to create cashier account.",
        }), 500