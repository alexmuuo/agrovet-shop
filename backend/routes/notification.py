from flask import Blueprint, jsonify, request, g

from extensions import db
from models.notification import Notification
from customer_auth import customer_required


notification_bp = Blueprint(
    "notification_bp",
    __name__
)


# ============================================================
# GET CUSTOMER NOTIFICATIONS
# ============================================================

@notification_bp.route(
    "/api/notifications/customer/<int:customer_id>",
    methods=["GET"]
)
@customer_required
def get_customer_notifications(customer_id):
    try:
        if g.customer.id != customer_id:
            return jsonify({
                "status": "error",
                "message": "You cannot access another customer's notifications"
            }), 403

        notifications = Notification.query.filter_by(
            customer_id=g.customer.id
        ).order_by(
            Notification.created_at.desc()
        ).all()

        return jsonify({
            "status": "success",
            "data": [
                notification.to_dict()
                for notification in notifications
            ]
        })

    except Exception:
        return jsonify({
            "status": "error",
            "message": "Failed to retrieve notifications"
        }), 500


# ============================================================
# GET CUSTOMER UNREAD NOTIFICATION COUNT
# ============================================================

@notification_bp.route(
    "/api/notifications/customer/<int:customer_id>/unread-count",
    methods=["GET"]
)
@customer_required
def get_customer_unread_count(customer_id):
    try:
        if g.customer.id != customer_id:
            return jsonify({
                "status": "error",
                "message": "You cannot access another customer's notifications"
            }), 403

        unread_count = Notification.query.filter_by(
            customer_id=g.customer.id,
            is_read=False
        ).count()

        return jsonify({
            "status": "success",
            "unread_count": unread_count
        })

    except Exception:
        return jsonify({
            "status": "error",
            "message": "Failed to retrieve unread notification count"
        }), 500


# ============================================================
# MARK ONE NOTIFICATION AS READ
# ============================================================

@notification_bp.route(
    "/api/notifications/<int:notification_id>/read",
    methods=["PUT"]
)
@customer_required
def mark_notification_read(notification_id):
    try:
        notification = Notification.query.filter_by(
            id=notification_id,
            customer_id=g.customer.id
        ).first()

        if not notification:
            return jsonify({
                "status": "error",
                "message": "Notification not found"
            }), 404

        notification.is_read = True

        db.session.commit()

        return jsonify({
            "status": "success",
            "message": "Notification marked as read",
            "data": notification.to_dict()
        })

    except Exception:
        db.session.rollback()

        return jsonify({
            "status": "error",
            "message": "Failed to mark notification as read"
        }), 500


# ============================================================
# MARK ALL CUSTOMER NOTIFICATIONS AS READ
# ============================================================

@notification_bp.route(
    "/api/notifications/customer/<int:customer_id>/read-all",
    methods=["PUT"]
)
@customer_required
def mark_all_notifications_read(customer_id):
    try:
        if g.customer.id != customer_id:
            return jsonify({
                "status": "error",
                "message": "You cannot access another customer's notifications"
            }), 403

        notifications = Notification.query.filter_by(
            customer_id=g.customer.id,
            is_read=False
        ).all()

        for notification in notifications:
            notification.is_read = True

        db.session.commit()

        return jsonify({
            "status": "success",
            "message": "All notifications marked as read",
            "count": len(notifications)
        })

    except Exception:
        db.session.rollback()

        return jsonify({
            "status": "error",
            "message": "Failed to mark notifications as read"
        }), 500


# ============================================================
# CREATE NOTIFICATION
# INTERNAL BACKEND USE ONLY
# ============================================================
#
# Notifications should be created by trusted backend operations,
# such as order creation or order status changes.
#
# This public endpoint has intentionally been removed.
# The existing backend code should create notifications directly
# using the Notification model.
#
# Example:
#
# notification = Notification(
#     customer_id=customer_id,
#     type="order",
#     title="Order received",
#     message="Your order has been received.",
#     related_id=order_id,
#     is_read=False
# )
#
# db.session.add(notification)
# db.session.commit()
