
import logging
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify, request, g
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from extensions import db
from models.order import Order, OrderItem
from models.product import Product
from models.customer import Customer
from models.notification import Notification
from models.cash_collection import CashCollection
from admin_auth import admin_required


admin_bp = Blueprint("admin_bp", __name__)
logger = logging.getLogger(__name__)


# ============================================================
# HELPER FUNCTIONS — REPORTS
# ============================================================

def parse_report_dates():
    """
    Read optional start_date and end_date query parameters.

    Expected format: YYYY-MM-DD.
    The end date is exclusive internally.
    """

    start_value = request.args.get("start_date")
    end_value = request.args.get("end_date")

    try:
        start_date = (
            datetime.strptime(start_value, "%Y-%m-%d")
            if start_value
            else None
        )

        end_date = (
            datetime.strptime(end_value, "%Y-%m-%d")
            + timedelta(days=1)
            if end_value
            else None
        )

    except ValueError as error:
        raise ValueError(
            "Invalid date format. Use YYYY-MM-DD."
        ) from error

    if start_date and end_date and start_date >= end_date:
        raise ValueError(
            "The start date must be on or before the end date."
        )

    return start_date, end_date


def get_filtered_orders(start_date=None, end_date=None):
    """Return orders within the optional date range."""

    query = Order.query

    if start_date:
        query = query.filter(Order.created_at >= start_date)

    if end_date:
        query = query.filter(Order.created_at < end_date)

    return query


def get_date_range():
    """Parse report date filters."""

    return parse_report_dates()


def money(value):
    """Convert numeric database values into JSON-friendly floats."""

    return float(value or Decimal("0.00"))


def get_order_amount(order):
    """Convert an order total into Decimal safely."""

    return Decimal(str(order.total or "0.00"))


def report_date_filters(start_date, end_date):
    """Return the selected date range in the API response."""

    return {
        "start_date": (
            start_date.date().isoformat()
            if start_date
            else None
        ),
        "end_date": (
            (end_date - timedelta(days=1)).date().isoformat()
            if end_date
            else None
        ),
    }


# ============================================================
# PAYMENT HELPER FUNCTIONS
# ============================================================

def normalize_payment_value(value):
    """Normalize a payment-related value for comparisons."""

    if not isinstance(value, str):
        return ""

    return value.strip().lower().replace("-", "_").replace(" ", "_")


def is_electronic_payment_method(payment_method):
    """
    Identify payment methods that must not be manually confirmed
    without verified payment-provider confirmation.

    Extend this set if additional electronic payment methods
    are introduced in the application.
    """

    method = normalize_payment_value(payment_method)

    electronic_methods = {
        "mpesa",
        "m_pesa",
        "stk",
        "stk_push",
        "mpesa_stk",
        "mpesa_stk_push",
        "paybill",
        "buy_goods",
        "card",
        "credit_card",
        "debit_card",
        "online",
        "online_payment",
        "bank_transfer",
        "digital_payment",
    }

    return method in electronic_methods


def get_manual_payment_eligibility(order):
    """
    Determine whether an order can be manually marked as paid.

    Cash orders are eligible.

    Pickup orders are eligible only when their payment method
    is not an electronic payment method.

    Electronic payments must be confirmed through their
    verified payment-provider flow.
    """

    payment_method = normalize_payment_value(
        order.payment_method
    )

    order_type = normalize_payment_value(
        order.order_type
    )

    if is_electronic_payment_method(payment_method):
        return False, (
            "Electronic payments must be verified through "
            "the payment provider before they can be marked paid."
        )

    is_cash_order = payment_method == "cash"
    is_pickup_order = order_type in {
        "pickup",
        "pick_up",
        "collection",
        "self_pickup",
    }

    if is_cash_order or is_pickup_order:
        return True, None

    return False, (
        "Only eligible cash or pickup orders can be "
        "manually marked as paid."
    )


# ============================================================
# GET ALL ORDERS — ADMIN ONLY
# GET /api/admin/orders
# ============================================================

@admin_bp.route("/api/admin/orders", methods=["GET"])
@admin_required
def get_orders():
    try:
        orders = Order.query.order_by(
            Order.created_at.desc()
        ).all()

        return jsonify([
            order.to_dict()
            for order in orders
        ]), 200

    except Exception:
        db.session.rollback()
        logger.exception("Failed to retrieve orders.")

        return jsonify({
            "status": "error",
            "message": "Unable to retrieve orders."
        }), 500


# ============================================================
# MARK ORDER AS PAID — ADMIN ONLY
#
# POST /api/admin/orders/<order_id>/mark-paid
#
# BACKWARD-COMPATIBLE ROUTE:
# POST /api/admin/orders/<order_id>/cash-payment
# ============================================================

@admin_bp.route(
    "/api/admin/orders/<int:order_id>/mark-paid",
    methods=["POST"]
)
@admin_bp.route(
    "/api/admin/orders/<int:order_id>/cash-payment",
    methods=["POST"]
)
@admin_required
def mark_order_as_paid(order_id):
    try:
        # Lock the order row where supported by the database.
        # This reduces the chance of concurrent confirmations.
        order = db.session.execute(
            select(Order)
            .where(Order.id == order_id)
            .with_for_update()
        ).scalar_one_or_none()

        if not order:
            return jsonify({
                "status": "error",
                "message": "Order not found."
            }), 404

        # Cancelled orders must not receive a new payment record.
        if normalize_payment_value(order.status) == "cancelled":
            return jsonify({
                "status": "error",
                "message": (
                    "Payment cannot be confirmed for a cancelled order."
                )
            }), 400

        # Do not allow the manual endpoint to override verified
        # payment-provider flows or manually mark M-Pesa payments.
        eligible, eligibility_message = (
            get_manual_payment_eligibility(order)
        )

        if not eligible:
            return jsonify({
                "status": "error",
                "message": eligibility_message
            }), 400

        # A payment can be confirmed only once.
        existing_collection = CashCollection.query.filter_by(
            order_id=order.id
        ).first()

        if (
            normalize_payment_value(order.payment_status) == "paid"
            or existing_collection is not None
        ):
            return jsonify({
                "status": "error",
                "message": "This order has already been paid."
            }), 409

        # Validate the order amount before creating the record.
        try:
            amount = get_order_amount(order)

        except (InvalidOperation, ValueError, TypeError):
            return jsonify({
                "status": "error",
                "message": "The order total is invalid."
            }), 400

        if not amount.is_finite() or amount <= Decimal("0.00"):
            return jsonify({
                "status": "error",
                "message": (
                    "The order total must be greater than zero."
                )
            }), 400

        # Verify the authenticated admin identity.
        admin_data = getattr(g, "admin", {}) or {}

        if not isinstance(admin_data, dict):
            return jsonify({
                "status": "error",
                "message": (
                    "The authenticated admin identity "
                    "could not be verified."
                )
            }), 401

        admin_username = admin_data.get("username")

        if (
            not isinstance(admin_username, str)
            or not admin_username.strip()
        ):
            return jsonify({
                "status": "error",
                "message": (
                    "The authenticated admin identity "
                    "could not be verified."
                )
            }), 401

        admin_username = admin_username.strip()

        # This endpoint confirms a payment received manually.
        # The electronic payment flow must confirm electronic
        # payments through its own verified backend callback.
        collection = CashCollection(
            order_id=order.id,
            amount=amount,
            method="cash",
            confirmed_by=admin_username,
            notes=(
                "Manual payment confirmed by admin for an "
                "eligible cash or pickup order."
            )
        )

        db.session.add(collection)

        # Keep payment status independent from order and delivery
        # statuses. Only this explicit payment confirmation changes it.
        order.payment_status = "paid"

        # Flush first so database constraint violations are detected
        # before preparing the success response.
        db.session.flush()

        collection_data = collection.to_dict()
        updated_order = order.to_dict()

        # The payment record and payment status are committed together.
        db.session.commit()

        return jsonify({
            "status": "success",
            "message": "Payment confirmed successfully.",
            "order": updated_order,
            "order_id": order.id,
            "order_number": order.order_number,
            "payment_status": order.payment_status,
            "cash_collection": collection_data
        }), 200

    except IntegrityError:
        # The unique constraint on CashCollection.order_id protects
        # against duplicate collection records.
        db.session.rollback()

        logger.warning(
            "Duplicate or conflicting payment confirmation "
            "attempt for order ID %s.",
            order_id
        )

        return jsonify({
            "status": "error",
            "message": (
                "A payment record already exists for this order, "
                "or the payment could not be saved because of a "
                "database constraint."
            )
        }), 409

    except Exception:
        db.session.rollback()

        logger.exception(
            "Payment confirmation failed for order ID %s.",
            order_id
        )

        return jsonify({
            "status": "error",
            "message": (
                "Unable to confirm payment right now. "
                "Please try again."
            )
        }), 500


# ============================================================
# UPDATE ORDER STATUS — ADMIN ONLY
# RESTORE STOCK WHEN AN ORDER IS CANCELLED
# PUT /api/admin/orders/<order_id>/status
# ============================================================

@admin_bp.route(
    "/api/admin/orders/<int:order_id>/status",
    methods=["PUT"]
)
@admin_required
def update_order_status(order_id):
    try:
        order = (
            Order.query
            .filter_by(id=order_id)
            .with_for_update()
            .first()
        )

        if not order:
            return jsonify({
                "status": "error",
                "message": "Order not found."
            }), 404

        data = request.get_json(silent=True) or {}
        new_status = data.get("status")

        allowed_statuses = [
            "pending",
            "confirmed",
            "ready",
            "completed",
            "cancelled"
        ]

        if new_status not in allowed_statuses:
            return jsonify({
                "status": "error",
                "message": (
                    "Invalid status. Allowed statuses: "
                    + ", ".join(allowed_statuses)
                )
            }), 400

        old_status = order.status

        if old_status == "cancelled" and new_status != "cancelled":
            return jsonify({
                "status": "error",
                "message": (
                    "A cancelled order cannot be reopened. "
                    "Create a new order if necessary."
                )
            }), 400

        if old_status == new_status:
            return jsonify({
                "status": "success",
                "message": "Order status is already up to date.",
                "order": order.to_dict()
            }), 200

        # Restore stock only when the order is first cancelled.
        if new_status == "cancelled":
            if order.payment_status == "paid":
                return jsonify({
                    "status": "error",
                    "message": (
                        "This order is already paid. Resolve its "
                        "payment/refund before cancelling it."
                    )
                }), 409

            order_items = OrderItem.query.filter_by(
                order_id=order.id
            ).all()

            product_ids = sorted({
                item.product_id
                for item in order_items
            })

            products = (
                Product.query
                .filter(Product.id.in_(product_ids))
                .order_by(Product.id)
                .with_for_update()
                .all()
            ) if product_ids else []

            products_by_id = {
                product.id: product
                for product in products
            }

            # Validate all products before restoring any stock.
            for item in order_items:
                if item.product_id not in products_by_id:
                    db.session.rollback()

                    return jsonify({
                        "status": "error",
                        "message": (
                            "Stock could not be restored because "
                            "a product in this order no longer exists."
                        )
                    }), 409

            for item in order_items:
                products_by_id[item.product_id].stock += item.quantity

        order.status = new_status

        status_messages = {
            "pending": {
                "title": "Order Status Updated",
                "message": (
                    f"Your order {order.order_number} "
                    "is now pending."
                )
            },
            "confirmed": {
                "title": "Order Confirmed",
                "message": (
                    f"Good news! Your order {order.order_number} "
                    "has been confirmed."
                )
            },
            "ready": {
                "title": "Order Ready",
                "message": (
                    f"Your order {order.order_number} is ready. "
                    "Please check your order details for next steps."
                )
            },
            "completed": {
                "title": "Order Completed",
                "message": (
                    f"Your order {order.order_number} has been "
                    "marked as completed. Thank you for shopping "
                    "with us!"
                )
            },
            "cancelled": {
                "title": "Order Cancelled",
                "message": (
                    f"Your order {order.order_number} has been "
                    "cancelled and the ordered stock returned "
                    "to inventory."
                )
            }
        }

        details = status_messages[new_status]

        db.session.add(Notification(
            customer_id=order.customer_id,
            type="order_status",
            title=details["title"],
            message=details["message"],
            related_id=order.id
        ))

        db.session.commit()

        return jsonify({
            "status": "success",
            "message": (
                "Order cancelled and stock restored successfully."
                if new_status == "cancelled"
                else "Order status updated successfully."
            ),
            "order": order.to_dict()
        }), 200

    except Exception:
        db.session.rollback()

        logger.exception(
            "Failed to update order status for order ID %s.",
            order_id
        )

        return jsonify({
            "status": "error",
            "message": (
                "Unable to update order status. Please try again."
            )
        }), 500


# ============================================================
# GET DELIVERY ORDERS — ADMIN ONLY
# GET /api/admin/deliveries
# ============================================================

@admin_bp.route("/api/admin/deliveries", methods=["GET"])
@admin_required
def get_deliveries():
    try:
        orders = Order.query.filter(
            Order.order_type == "delivery"
        ).order_by(
            Order.created_at.desc()
        ).all()

        return jsonify([
            order.to_dict()
            for order in orders
        ]), 200

    except Exception:
        db.session.rollback()
        logger.exception("Failed to retrieve deliveries.")

        return jsonify({
            "status": "error",
            "message": "Unable to retrieve deliveries."
        }), 500


# ============================================================
# ASSIGN DELIVERY PERSON — ADMIN ONLY
# PUT /api/admin/orders/<order_id>/delivery/assign
# ============================================================

@admin_bp.route(
    "/api/admin/orders/<int:order_id>/delivery/assign",
    methods=["PUT"]
)
@admin_required
def assign_delivery_person(order_id):
    try:
        order = db.session.get(Order, order_id)

        if not order:
            return jsonify({
                "status": "error",
                "message": "Order not found."
            }), 404

        if order.order_type != "delivery":
            return jsonify({
                "status": "error",
                "message": "This order is not a delivery order."
            }), 400

        if order.status == "cancelled":
            return jsonify({
                "status": "error",
                "message": "Cannot assign delivery for a cancelled order."
            }), 400

        data = request.get_json(silent=True) or {}

        delivery_person = data.get("delivery_person")
        delivery_phone = data.get("delivery_phone")

        if (
            not isinstance(delivery_person, str)
            or not delivery_person.strip()
        ):
            return jsonify({
                "status": "error",
                "message": "Delivery person's name is required."
            }), 400

        if (
            not isinstance(delivery_phone, str)
            or not delivery_phone.strip()
        ):
            return jsonify({
                "status": "error",
                "message": "Delivery person's phone number is required."
            }), 400

        order.delivery_person = delivery_person.strip()
        order.delivery_phone = delivery_phone.strip()

        if order.delivery_status == "pending":
            order.delivery_status = "assigned"

        db.session.add(Notification(
            customer_id=order.customer_id,
            type="delivery",
            title="Delivery Person Assigned",
            message=(
                f"A delivery person has been assigned to order "
                f"{order.order_number}."
            ),
            related_id=order.id
        ))

        db.session.commit()

        return jsonify({
            "status": "success",
            "message": "Delivery person assigned successfully.",
            "order": order.to_dict()
        }), 200

    except Exception:
        db.session.rollback()

        logger.exception(
            "Failed to assign delivery person to order ID %s.",
            order_id
        )

        return jsonify({
            "status": "error",
            "message": "Unable to assign delivery person."
        }), 500


# ============================================================
# UPDATE DELIVERY STATUS — ADMIN ONLY
# PUT /api/admin/orders/<order_id>/delivery/status
# ============================================================

@admin_bp.route(
    "/api/admin/orders/<int:order_id>/delivery/status",
    methods=["PUT"]
)
@admin_required
def update_delivery_status(order_id):
    try:
        order = db.session.get(Order, order_id)

        if not order:
            return jsonify({
                "status": "error",
                "message": "Order not found."
            }), 404

        if order.order_type != "delivery":
            return jsonify({
                "status": "error",
                "message": "This order is not a delivery order."
            }), 400

        if order.status == "cancelled":
            return jsonify({
                "status": "error",
                "message": (
                    "Delivery status cannot be changed for a "
                    "cancelled order."
                )
            }), 400

        data = request.get_json(silent=True) or {}
        new_status = data.get("delivery_status")

        allowed_statuses = [
            "pending",
            "assigned",
            "dispatched",
            "in_transit",
            "delivered",
            "failed"
        ]

        if new_status not in allowed_statuses:
            return jsonify({
                "status": "error",
                "message": (
                    "Invalid delivery status. Allowed statuses: "
                    + ", ".join(allowed_statuses)
                )
            }), 400

        if (
            new_status in ("dispatched", "in_transit", "delivered")
            and not order.delivery_person
        ):
            return jsonify({
                "status": "error",
                "message": (
                    "Assign a delivery person before using "
                    "this delivery status."
                )
            }), 400

        old_status = order.delivery_status
        order.delivery_status = new_status

        delivery_messages = {
            "pending": "Your delivery is awaiting assignment.",
            "assigned": (
                "A delivery person has been assigned to your order."
            ),
            "dispatched": (
                "Your order has been dispatched for delivery."
            ),
            "in_transit": (
                "Your order is on its way to the delivery location."
            ),
            "delivered": (
                "Your order has been delivered. Thank you!"
            ),
            "failed": (
                "We could not complete your delivery. "
                "Please contact us for assistance."
            )
        }

        if old_status != new_status:
            db.session.add(Notification(
                customer_id=order.customer_id,
                type="delivery",
                title="Delivery Status Updated",
                message=(
                    f"Order {order.order_number}: "
                    f"{delivery_messages[new_status]}"
                ),
                related_id=order.id
            ))

        # Delivery status does not automatically mark payment as paid.
        db.session.commit()

        return jsonify({
            "status": "success",
            "message": "Delivery status updated successfully.",
            "order": order.to_dict()
        }), 200

    except Exception:
        db.session.rollback()

        logger.exception(
            "Failed to update delivery status for order ID %s.",
            order_id
        )

        return jsonify({
            "status": "error",
            "message": "Unable to update delivery status."
        }), 500


# ============================================================
# UPDATE DELIVERY NOTES — ADMIN ONLY
# PUT /api/admin/orders/<order_id>/delivery/notes
# ============================================================

@admin_bp.route(
    "/api/admin/orders/<int:order_id>/delivery/notes",
    methods=["PUT"]
)
@admin_required
def update_delivery_notes(order_id):
    try:
        order = db.session.get(Order, order_id)

        if not order:
            return jsonify({
                "status": "error",
                "message": "Order not found."
            }), 404

        if order.order_type != "delivery":
            return jsonify({
                "status": "error",
                "message": "This order is not a delivery order."
            }), 400

        if order.status == "cancelled":
            return jsonify({
                "status": "error",
                "message": (
                    "Delivery notes cannot be changed for a "
                    "cancelled order."
                )
            }), 400

        data = request.get_json(silent=True) or {}
        delivery_notes = data.get("delivery_notes")

        if (
            delivery_notes is not None
            and not isinstance(delivery_notes, str)
        ):
            return jsonify({
                "status": "error",
                "message": "Delivery notes must be text."
            }), 400

        order.delivery_notes = (
            delivery_notes.strip()
            if delivery_notes is not None
            else None
        )

        db.session.commit()

        return jsonify({
            "status": "success",
            "message": "Delivery notes updated successfully.",
            "order": order.to_dict()
        }), 200

    except Exception:
        db.session.rollback()

        logger.exception(
            "Failed to update delivery notes for order ID %s.",
            order_id
        )

        return jsonify({
            "status": "error",
            "message": "Unable to update delivery notes."
        }), 500


# ============================================================
# GET ALL CUSTOMERS — ADMIN ONLY
# GET /api/admin/customers
# ============================================================

@admin_bp.route("/api/admin/customers", methods=["GET"])
@admin_required
def get_customers():
    try:
        customers = Customer.query.order_by(
            Customer.created_at.desc()
        ).all()

        return jsonify([
            customer.to_dict()
            for customer in customers
        ]), 200

    except Exception:
        db.session.rollback()
        logger.exception("Failed to retrieve customers.")

        return jsonify({
            "status": "error",
            "message": "Unable to retrieve customers."
        }), 500


# ============================================================
# REPORT 1: OVERVIEW — ADMIN ONLY
# GET /api/admin/reports/overview
# ============================================================

@admin_bp.route(
    "/api/admin/reports/overview",
    methods=["GET"]
)
@admin_required
def get_reports_overview():
    try:
        start_date, end_date = get_date_range()

        orders = get_filtered_orders(
            start_date, end_date
        ).all()

        status_counts = {
            "pending": 0,
            "confirmed": 0,
            "ready": 0,
            "completed": 0,
            "cancelled": 0
        }

        order_value = Decimal("0.00")
        completed_order_value = Decimal("0.00")

        for order in orders:
            status_counts[order.status] = (
                status_counts.get(order.status, 0) + 1
            )

            amount = get_order_amount(order)
            order_value += amount

            if order.status == "completed":
                completed_order_value += amount

        return jsonify({
            "status": "success",
            "filters": report_date_filters(
                start_date, end_date
            ),
            "overview": {
                "total_orders": len(orders),
                "total_order_value": money(order_value),
                "completed_orders": status_counts["completed"],
                "completed_order_value": money(
                    completed_order_value
                ),
                "status_counts": status_counts
            },
            "note": (
                "Order values are not verified payment revenue. "
                "Completed orders are not necessarily confirmed "
                "as paid."
            )
        }), 200

    except ValueError as error:
        return jsonify({
            "status": "error",
            "message": str(error)
        }), 400

    except Exception:
        db.session.rollback()
        logger.exception("Failed to generate overview report.")

        return jsonify({
            "status": "error",
            "message": "Unable to generate overview report."
        }), 500


# ============================================================
# REPORT 2: SALES BY DAY — ADMIN ONLY
# GET /api/admin/reports/sales
# ============================================================

@admin_bp.route(
    "/api/admin/reports/sales",
    methods=["GET"]
)
@admin_required
def get_sales_report():
    try:
        start_date, end_date = get_date_range()

        orders = get_filtered_orders(
            start_date, end_date
        ).order_by(Order.created_at.asc()).all()

        daily_sales = {}

        for order in orders:
            if not order.created_at:
                continue

            day = order.created_at.date().isoformat()

            if day not in daily_sales:
                daily_sales[day] = {
                    "date": day,
                    "orders": 0,
                    "order_value": Decimal("0.00"),
                    "completed_orders": 0,
                    "completed_order_value": Decimal("0.00")
                }

            amount = get_order_amount(order)

            daily_sales[day]["orders"] += 1
            daily_sales[day]["order_value"] += amount

            if order.status == "completed":
                daily_sales[day]["completed_orders"] += 1
                daily_sales[day]["completed_order_value"] += amount

        results = []

        for day_data in daily_sales.values():
            results.append({
                "date": day_data["date"],
                "orders": day_data["orders"],
                "order_value": money(
                    day_data["order_value"]
                ),
                "completed_orders": day_data["completed_orders"],
                "completed_order_value": money(
                    day_data["completed_order_value"]
                )
            })

        return jsonify({
            "status": "success",
            "sales": results,
            "note": (
                "These figures represent order values, not "
                "verified payment revenue."
            )
        }), 200

    except ValueError as error:
        return jsonify({
            "status": "error",
            "message": str(error)
        }), 400

    except Exception:
        db.session.rollback()
        logger.exception("Failed to generate sales report.")

        return jsonify({
            "status": "error",
            "message": "Unable to generate sales report."
        }), 500


# ============================================================
# REPORT 3: BEST-SELLING PRODUCTS — ADMIN ONLY
# GET /api/admin/reports/products
# ============================================================

@admin_bp.route(
    "/api/admin/reports/products",
    methods=["GET"]
)
@admin_required
def get_product_report():
    try:
        start_date, end_date = get_date_range()

        query = db.session.query(
            OrderItem.product_id,
            db.func.sum(
                OrderItem.quantity
            ).label("quantity_sold"),
            db.func.sum(
                OrderItem.price * OrderItem.quantity
            ).label("item_value")
        ).join(
            Order,
            OrderItem.order_id == Order.id
        ).filter(
            Order.status != "cancelled"
        )

        if start_date:
            query = query.filter(
                Order.created_at >= start_date
            )

        if end_date:
            query = query.filter(
                Order.created_at < end_date
            )

        rows = query.group_by(
            OrderItem.product_id
        ).order_by(
            db.func.sum(OrderItem.quantity).desc()
        ).all()

        products = []

        for row in rows:
            product = db.session.get(
                Product, row.product_id
            )

            products.append({
                "product_id": row.product_id,
                "product_name": (
                    product.name
                    if product
                    else "Deleted product"
                ),
                "quantity_sold": int(
                    row.quantity_sold or 0
                ),
                "item_value": money(row.item_value)
            })

        return jsonify({
            "status": "success",
            "products": products
        }), 200

    except ValueError as error:
        return jsonify({
            "status": "error",
            "message": str(error)
        }), 400

    except Exception:
        db.session.rollback()
        logger.exception("Failed to generate product report.")

        return jsonify({
            "status": "error",
            "message": "Unable to generate product report."
        }), 500


# ============================================================
# REPORT 4: DELIVERY STATISTICS — ADMIN ONLY
# GET /api/admin/reports/deliveries
# ============================================================

@admin_bp.route(
    "/api/admin/reports/deliveries",
    methods=["GET"]
)
@admin_required
def get_delivery_report():
    try:
        start_date, end_date = get_date_range()

        orders = get_filtered_orders(
            start_date, end_date
        ).filter(
            Order.order_type == "delivery"
        ).all()

        delivery_status_counts = {
            "pending": 0,
            "assigned": 0,
            "dispatched": 0,
            "in_transit": 0,
            "delivered": 0,
            "failed": 0
        }

        for order in orders:
            delivery_status_counts[order.delivery_status] = (
                delivery_status_counts.get(
                    order.delivery_status, 0
                ) + 1
            )

        return jsonify({
            "status": "success",
            "filters": report_date_filters(
                start_date, end_date
            ),
            "total_delivery_orders": len(orders),
            "delivery_status_counts": delivery_status_counts
        }), 200

    except ValueError as error:
        return jsonify({
            "status": "error",
            "message": str(error)
        }), 400

    except Exception:
        db.session.rollback()
        logger.exception("Failed to generate delivery report.")

        return jsonify({
            "status": "error",
            "message": "Unable to generate delivery report."
        }), 500
