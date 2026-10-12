import logging

from datetime import datetime

from flask import Blueprint, jsonify, request, g

from extensions import db
from models.message import Message
from models.customer import Customer

from admin_auth import admin_required
from customer_auth import customer_required


logger = logging.getLogger(__name__)

message_bp = Blueprint(
    "message_bp",
    __name__
)


# ============================================================
# HELPER FUNCTIONS
# ============================================================

def get_customer_messages_query(customer_id):
    """
    Return messages belonging to one customer,
    ordered chronologically.
    """
    return (
        Message.query
        .filter_by(customer_id=customer_id)
        .order_by(
            Message.created_at.asc(),
            Message.id.asc()
        )
    )


def mark_customer_incoming_messages_read(customer_id):
    """
    Mark only unread messages sent by the customer as read.

    Admin replies are deliberately excluded.
    """
    updated_count = (
        Message.query
        .filter(
            Message.customer_id == customer_id,
            Message.sender == "customer",
            Message.is_read.is_(False)
        )
        .update(
            {Message.is_read: True},
            synchronize_session=False
        )
    )

    return updated_count


def mark_messages_delivered(query):
    """
    Record delivery for messages returned to the recipient.

    Existing delivery timestamps are preserved.
    """
    delivered_time = datetime.utcnow()

    updated_count = (
        query
        .filter(
            Message.delivered_at.is_(None)
        )
        .update(
            {
                Message.delivered_at: delivered_time
            },
            synchronize_session=False
        )
    )

    return updated_count


# ============================================================
# ADMIN: GET ALL MESSAGES
# ============================================================

@message_bp.route(
    "/api/admin/messages",
    methods=["GET"]
)
@admin_required
def get_messages():
    try:
        # The admin interface is retrieving customer messages.
        mark_messages_delivered(
            Message.query.filter(
                Message.sender == "customer"
            )
        )

        db.session.commit()

        messages = (
            Message.query
            .order_by(
                Message.created_at.asc(),
                Message.id.asc()
            )
            .all()
        )

        return jsonify([
            message.to_dict()
            for message in messages
        ]), 200

    except Exception:
        db.session.rollback()

        logger.exception(
            "Failed to retrieve all messages."
        )

        return jsonify({
            "status": "error",
            "message": "Failed to retrieve messages."
        }), 500


# ============================================================
# ADMIN: GET TOTAL UNREAD CUSTOMER MESSAGES
# ============================================================

@message_bp.route(
    "/api/admin/messages/unread-count",
    methods=["GET"]
)
@admin_required
def get_unread_message_count():
    try:
        unread_count = (
            Message.query
            .filter(
                Message.sender == "customer",
                Message.is_read.is_(False)
            )
            .count()
        )

        return jsonify({
            "status": "success",
            "unread_count": unread_count
        }), 200

    except Exception:
        db.session.rollback()

        logger.exception(
            "Failed to retrieve admin unread count."
        )

        return jsonify({
            "status": "error",
            "message": "Failed to retrieve unread count."
        }), 500


# ============================================================
# ADMIN: GET ONE CUSTOMER'S CONVERSATION
# ============================================================

@message_bp.route(
    "/api/admin/messages/customer/<int:customer_id>",
    methods=["GET"]
)
@admin_required
def get_customer_messages(customer_id):
    try:
        customer = db.session.get(
            Customer,
            customer_id
        )

        if not customer:
            return jsonify({
                "status": "error",
                "message": "Customer not found."
            }), 404

        # Record delivery of messages sent by this customer.
        mark_messages_delivered(
            Message.query.filter(
                Message.customer_id == customer_id,
                Message.sender == "customer"
            )
        )

        db.session.commit()

        messages = (
            get_customer_messages_query(customer_id)
            .all()
        )

        return jsonify([
            message.to_dict()
            for message in messages
        ]), 200

    except Exception:
        db.session.rollback()

        logger.exception(
            "Failed to retrieve messages for customer %s.",
            customer_id
        )

        return jsonify({
            "status": "error",
            "message": "Failed to retrieve customer messages."
        }), 500


# ============================================================
# ADMIN: MARK ONE CUSTOMER'S INCOMING MESSAGES AS READ
# ============================================================

@message_bp.route(
    "/api/admin/messages/customer/<int:customer_id>/read",
    methods=["PUT"]
)
@admin_required
def mark_customer_messages_read(customer_id):
    try:
        customer = db.session.get(
            Customer,
            customer_id
        )

        if not customer:
            return jsonify({
                "status": "error",
                "message": "Customer not found."
            }), 404

        # Mark customer messages as read.
        updated_count = (
            mark_customer_incoming_messages_read(
                customer_id
            )
        )

        db.session.commit()

        return jsonify({
            "status": "success",
            "message": "Customer messages marked as read.",
            "customer_id": customer_id,
            "count": updated_count
        }), 200

    except Exception:
        db.session.rollback()

        logger.exception(
            "Failed to mark messages as read for customer %s.",
            customer_id
        )

        return jsonify({
            "status": "error",
            "message": "Failed to mark customer messages as read."
        }), 500


# ============================================================
# ADMIN: MARK ONE MESSAGE AS READ
# ============================================================

@message_bp.route(
    "/api/admin/messages/<int:message_id>/read",
    methods=["PUT"]
)
@admin_required
def mark_message_read(message_id):
    try:
        message = db.session.get(
            Message,
            message_id
        )

        if not message:
            return jsonify({
                "status": "error",
                "message": "Message not found."
            }), 404

        message.is_read = True

        # A read message must also have a delivery timestamp.
        if message.delivered_at is None:
            message.delivered_at = datetime.utcnow()

        db.session.commit()

        return jsonify({
            "status": "success",
            "message": "Message marked as read.",
            "data": message.to_dict()
        }), 200

    except Exception:
        db.session.rollback()

        logger.exception(
            "Failed to mark message %s as read.",
            message_id
        )

        return jsonify({
            "status": "error",
            "message": "Failed to mark message as read."
        }), 500
# ============================================================
# ADMIN: DELETE ONE MESSAGE
# ============================================================

@message_bp.route(
    "/api/admin/messages/<int:message_id>",
    methods=["DELETE"]
)
@admin_required
def delete_message(message_id):
    try:
        # Find the message.
        message = db.session.get(
            Message,
            message_id
        )

        if not message:
            return jsonify({
                "status": "error",
                "message": "Message not found."
            }), 404

        # Save the customer ID before deleting the message.
        customer_id = message.customer_id

        # Permanently delete the selected message.
        db.session.delete(message)
        db.session.commit()

        logger.info(
            "Admin deleted message %s from customer %s.",
            message_id,
            customer_id
        )

        return jsonify({
            "status": "success",
            "message": "Message deleted successfully.",
            "deleted_message_id": message_id,
            "customer_id": customer_id
        }), 200

    except Exception:
        db.session.rollback()

        logger.exception(
            "Failed to delete message %s.",
            message_id
        )

        return jsonify({
            "status": "error",
            "message": "Failed to delete message."
        }), 500

# ============================================================
# CUSTOMER: SEND A MESSAGE
# ============================================================

@message_bp.route(
    "/api/messages",
    methods=["POST"]
)
@customer_required
def create_message():
    try:
        data = request.get_json(
            silent=True
        ) or {}

        message_text = data.get("message")

        if (
            not isinstance(message_text, str)
            or not message_text.strip()
        ):
            return jsonify({
                "status": "error",
                "message": "A valid message is required."
            }), 400

        message = Message(
            customer_id=g.customer.id,
            sender="customer",
            message=message_text.strip(),
            is_read=False,
            delivered_at=None
        )

        db.session.add(message)
        db.session.commit()

        return jsonify({
            "status": "success",
            "message": "Message sent successfully.",
            "data": message.to_dict()
        }), 201

    except Exception:
        db.session.rollback()

        logger.exception(
            "Failed to create customer message."
        )

        return jsonify({
            "status": "error",
            "message": "Failed to send message."
        }), 500


# ============================================================
# CUSTOMER: GET OWN CONVERSATION
# ============================================================

@message_bp.route(
    "/api/messages/customer/<int:customer_id>",
    methods=["GET"]
)
@customer_required
def get_customer_conversation(customer_id):
    try:
        authenticated_customer_id = int(
            g.customer.id
        )

        # Customers may only access their own conversations.
        if authenticated_customer_id != int(customer_id):
            return jsonify({
                "status": "error",
                "message": (
                    "You cannot access another customer's "
                    "conversation."
                )
            }), 403

        # Retrieve the customer's conversation.
        messages_query = get_customer_messages_query(
            authenticated_customer_id
        )

        # Record delivery of admin replies.
        mark_messages_delivered(
            Message.query.filter(
                Message.customer_id == authenticated_customer_id,
                Message.sender == "seller"
            )
        )

        # Opening the conversation marks admin replies as read.
        (
            Message.query
            .filter(
                Message.customer_id == authenticated_customer_id,
                Message.sender == "seller",
                Message.is_read.is_(False)
            )
            .update(
                {Message.is_read: True},
                synchronize_session=False
            )
        )

        db.session.commit()

        messages = messages_query.all()

        return jsonify({
            "status": "success",
            "data": [
                message.to_dict()
                for message in messages
            ]
        }), 200

    except Exception:
        db.session.rollback()

        logger.exception(
            "Failed to retrieve customer conversation."
        )

        return jsonify({
            "status": "error",
            "message": "Failed to retrieve conversation."
        }), 500


# ============================================================
# ADMIN: REPLY TO A CUSTOMER
# ============================================================

@message_bp.route(
    "/api/admin/messages",
    methods=["POST"]
)
@admin_required
def seller_reply():
    try:
        data = request.get_json(
            silent=True
        ) or {}

        customer_id = data.get("customer_id")
        message_text = data.get("message")

        if customer_id is None:
            return jsonify({
                "status": "error",
                "message": "Customer ID is required."
            }), 400

        if (
            not isinstance(message_text, str)
            or not message_text.strip()
        ):
            return jsonify({
                "status": "error",
                "message": "A valid message is required."
            }), 400

        try:
            customer_id = int(customer_id)
        except (TypeError, ValueError):
            return jsonify({
                "status": "error",
                "message": "Invalid customer ID."
            }), 400

        customer = db.session.get(
            Customer,
            customer_id
        )

        if not customer:
            return jsonify({
                "status": "error",
                "message": "Customer not found."
            }), 404

        message = Message(
            customer_id=customer_id,
            sender="seller",
            message=message_text.strip(),
            is_read=False,
            delivered_at=None
        )

        db.session.add(message)
        db.session.commit()

        return jsonify({
            "status": "success",
            "message": "Reply sent successfully.",
            "data": message.to_dict()
        }), 201

    except Exception:
        db.session.rollback()

        logger.exception(
            "Failed to send admin reply."
        )

        return jsonify({
            "status": "error",
            "message": "Failed to send reply."
        }), 500


# ============================================================
# CUSTOMER: GET UNREAD ADMIN REPLY COUNT
# ============================================================

@message_bp.route(
    "/api/messages/unread-count",
    methods=["GET"]
)
@customer_required
def get_customer_unread_message_count():
    try:
        unread_count = (
            Message.query
            .filter(
                Message.customer_id == g.customer.id,
                Message.sender == "seller",
                Message.is_read.is_(False)
            )
            .count()
        )

        return jsonify({
            "status": "success",
            "unread_count": unread_count
        }), 200

    except Exception:
        db.session.rollback()

        logger.exception(
            "Failed to retrieve customer unread count."
        )

        return jsonify({
            "status": "error",
            "message": "Failed to retrieve unread count."
        }), 500