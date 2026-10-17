import logging
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify, request, g
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError

from extensions import db
from models.order import Order, OrderItem
from models.product import Product
from models.customer import Customer
from models.notification import Notification
from models.cash_collection import CashCollection
from models.stock_movement import StockMovement
from models.branch import Branch
from models.branch_product_stock import BranchProductStock
from models.cashier import Cashier
from models.cashier_sale import CashierSale

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


def normalize_status(value):
    """Normalize statuses for consistent comparisons."""

    if not isinstance(value, str):
        return ""

    return value.strip().lower().replace("-", "_").replace(" ", "_")


def calculate_margin(profit, revenue):
    """Calculate percentage margin safely."""

    if revenue <= Decimal("0.00"):
        return Decimal("0.00")

    return (profit / revenue) * Decimal("100")


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

        if normalize_payment_value(order.status) in {
            "cancelled",
            "canceled",
        }:
            return jsonify({
                "status": "error",
                "message": (
                    "Payment cannot be confirmed for a cancelled order."
                )
            }), 400

        eligible, eligibility_message = (
            get_manual_payment_eligibility(order)
        )

        if not eligible:
            return jsonify({
                "status": "error",
                "message": eligibility_message
            }), 400

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
        order.payment_status = "paid"

        db.session.flush()

        collection_data = collection.to_dict()
        updated_order = order.to_dict()

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

        if new_status == "cancelled":
            if normalize_payment_value(order.payment_status) == "paid":
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
            "pending": (
                "Order Status Updated",
                f"Your order {order.order_number} is now pending."
            ),
            "confirmed": (
                "Order Confirmed",
                f"Good news! Your order {order.order_number} has been confirmed."
            ),
            "ready": (
                "Order Ready",
                f"Your order {order.order_number} is ready. "
                "Please check your order details for next steps."
            ),
            "completed": (
                "Order Completed",
                f"Your order {order.order_number} has been marked as completed. "
                "Thank you for shopping with us!"
            ),
            "cancelled": (
                "Order Cancelled",
                f"Your order {order.order_number} has been cancelled "
                "and the ordered stock returned to inventory."
            )
        }

        title, message = status_messages[new_status]

        db.session.add(Notification(
            customer_id=order.customer_id,
            type="order_status",
            title=title,
            message=message,
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

        if normalize_status(order.status) in {"cancelled", "canceled"}:
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

        if normalize_status(order.status) in {"cancelled", "canceled"}:
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
            "assigned": "A delivery person has been assigned to your order.",
            "dispatched": "Your order has been dispatched for delivery.",
            "in_transit": "Your order is on its way to the delivery location.",
            "delivered": "Your order has been delivered. Thank you!",
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

        if normalize_status(order.status) in {"cancelled", "canceled"}:
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
            status = normalize_status(order.status)

            status_counts[status] = (
                status_counts.get(status, 0) + 1
            )

            amount = get_order_amount(order)
            order_value += amount

            if status == "completed":
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
                "total_customers": Customer.query.count(),
                "total_products": Product.query.count(),
                "status_counts": status_counts
            },
            "note": (
                "Order values are not verified payment revenue. "
                "Use the profit report for confirmed paid sales."
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

            if normalize_status(order.status) == "completed":
                daily_sales[day]["completed_orders"] += 1
                daily_sales[day]["completed_order_value"] += amount

        results = []

        for day_data in daily_sales.values():
            results.append({
                "date": day_data["date"],
                "orders": day_data["orders"],
                "order_value": money(day_data["order_value"]),
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
            func.sum(
                OrderItem.quantity
            ).label("quantity_sold"),
            func.sum(
                OrderItem.price * OrderItem.quantity
            ).label("item_value")
        ).join(
            Order,
            OrderItem.order_id == Order.id
        ).filter(
            func.lower(Order.status) != "cancelled"
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
            func.sum(OrderItem.quantity).desc()
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
                "quantity_sold": int(row.quantity_sold or 0),
                "item_value": money(row.item_value)
            })

        return jsonify({
            "status": "success",
            "products": products,
            "total_products_sold": len(products),
            "total_quantity_sold": sum(
                item["quantity_sold"] for item in products
            ),
            "total_item_value": money(
                sum(
                    (
                        Decimal(str(item["item_value"]))
                        for item in products
                    ),
                    Decimal("0.00")
                )
            )
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
            status = normalize_status(order.delivery_status)

            delivery_status_counts[status] = (
                delivery_status_counts.get(status, 0) + 1
            )

        return jsonify({
            "status": "success",
            "filters": report_date_filters(
                start_date, end_date
            ),
            "total_delivery_orders": len(orders),
            "delivery_status_counts": delivery_status_counts,
            "completed_deliveries": (
                delivery_status_counts["delivered"]
            ),
            "pending_deliveries": (
                delivery_status_counts["pending"]
            )
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


# ============================================================
# REPORT 5: PROFIT & ANALYTICS — ADMIN ONLY
#
# GET /api/admin/reports/profit
#
# Only confirmed paid orders are included.
# Cancelled orders are excluded.
#
# Historical item costs are read from OrderItem.buying_price.
# Missing costs are reported as unknown, not assumed to be zero.
# ============================================================

@admin_bp.route(
    "/api/admin/reports/profit",
    methods=["GET"]
)
@admin_required
def get_profit_report():
    try:
        start_date, end_date = get_date_range()

        # ----------------------------------------------------
        # SELECT CONFIRMED PAID ORDERS
        # ----------------------------------------------------

        orders_query = get_filtered_orders(
            start_date,
            end_date
        ).filter(
            func.lower(Order.payment_status) == "paid",
            func.lower(Order.status).notin_(
                ["cancelled", "canceled"]
            )
        ).order_by(
            Order.created_at.asc()
        )

        orders = orders_query.all()

        paid_order_ids = [
            order.id for order in orders
        ]

        # Totals use Decimal to avoid floating-point arithmetic
        # during financial calculations.
        sales_revenue = Decimal("0.00")
        cost_of_goods_sold = Decimal("0.00")
        known_cost_revenue = Decimal("0.00")
        unknown_cost_sales_value = Decimal("0.00")

        known_cost_item_count = 0
        unknown_cost_item_count = 0
        quantity_sold = 0

        product_totals = {}

        # ----------------------------------------------------
        # FETCH ORDER ITEMS
        # ----------------------------------------------------

        order_items = []

        if paid_order_ids:
            order_items = OrderItem.query.filter(
                OrderItem.order_id.in_(paid_order_ids)
            ).order_by(
                OrderItem.id.asc()
            ).all()

        for item in order_items:
            quantity = int(item.quantity or 0)

            if quantity <= 0:
                logger.warning(
                    "Skipping invalid quantity for OrderItem ID %s.",
                    item.id
                )
                continue

            try:
                selling_price = Decimal(
                    str(item.price)
                )

                if (
                    not selling_price.is_finite()
                    or selling_price < Decimal("0.00")
                ):
                    raise InvalidOperation

            except (InvalidOperation, ValueError, TypeError):
                logger.warning(
                    "Skipping invalid selling price for OrderItem ID %s.",
                    item.id
                )
                continue

            item_revenue = selling_price * quantity

            sales_revenue += item_revenue
            quantity_sold += quantity

            # Product identity is retained even if the product
            # has subsequently been deleted.
            product = db.session.get(
                Product,
                item.product_id
            )

            product_name = (
                product.name
                if product
                else "Deleted product"
            )

            if item.product_id not in product_totals:
                product_totals[item.product_id] = {
                    "product_id": item.product_id,
                    "product_name": product_name,
                    "quantity_sold": 0,
                    "sales_revenue": Decimal("0.00"),
                    "cost_of_goods_sold": Decimal("0.00"),
                    "gross_profit": Decimal("0.00"),
                    "known_cost_quantity": 0,
                    "unknown_cost_quantity": 0,
                    "unknown_cost_sales_value": Decimal("0.00")
                }

            product_data = product_totals[item.product_id]

            product_data["quantity_sold"] += quantity
            product_data["sales_revenue"] += item_revenue

            # IMPORTANT:
            # Use only the historical buying-price snapshot.
            # Never substitute today's product buying price.
            buying_price = getattr(
                item,
                "buying_price",
                None
            )

            if buying_price is None:
                unknown_cost_item_count += 1
                unknown_cost_sales_value += item_revenue

                product_data["unknown_cost_quantity"] += quantity
                product_data["unknown_cost_sales_value"] += item_revenue

                continue

            try:
                buying_price = Decimal(
                    str(buying_price)
                )

                if (
                    not buying_price.is_finite()
                    or buying_price < Decimal("0.00")
                ):
                    raise InvalidOperation

            except (InvalidOperation, ValueError, TypeError):
                unknown_cost_item_count += 1
                unknown_cost_sales_value += item_revenue

                product_data["unknown_cost_quantity"] += quantity
                product_data["unknown_cost_sales_value"] += item_revenue

                logger.warning(
                    "Invalid historical buying price for OrderItem ID %s.",
                    item.id
                )

                continue

            item_cost = buying_price * quantity
            item_profit = item_revenue - item_cost

            cost_of_goods_sold += item_cost
            known_cost_revenue += item_revenue
            known_cost_item_count += 1

            product_data["cost_of_goods_sold"] += item_cost
            product_data["gross_profit"] += item_profit
            product_data["known_cost_quantity"] += quantity

        # ----------------------------------------------------
        # OVERALL PROFIT
        # ----------------------------------------------------

        # This figure represents profit on items whose historical
        # costs are known. It is not a complete business-wide profit
        # figure when any included sales have unknown costs.
        gross_profit = (
            known_cost_revenue - cost_of_goods_sold
        )

        profit_margin = calculate_margin(
            gross_profit,
            known_cost_revenue
        )

        # ----------------------------------------------------
        # PRODUCT-LEVEL PROFITABILITY
        # ----------------------------------------------------

        product_results = []

        for product_data in product_totals.values():
            known_revenue = (
                product_data["sales_revenue"]
                - product_data["unknown_cost_sales_value"]
            )

            known_cost_quantity = product_data[
                "known_cost_quantity"
            ]

            unknown_cost_quantity = product_data[
                "unknown_cost_quantity"
            ]

            product_profit = product_data["gross_profit"]

            # If any units have unknown cost, explicitly flag the
            # product's profit as incomplete.
            cost_complete = unknown_cost_quantity == 0

            product_margin = calculate_margin(
                product_profit,
                known_revenue
            )

            product_results.append({
                "product_id": product_data["product_id"],
                "product_name": product_data["product_name"],
                "quantity_sold": product_data["quantity_sold"],
                "sales_revenue": money(
                    product_data["sales_revenue"]
                ),
                "item_value": money(
                    product_data["sales_revenue"]
                ),
                "cost_of_goods_sold": money(
                    product_data["cost_of_goods_sold"]
                ),
                "gross_profit": (
                    money(product_profit)
                    if known_cost_quantity > 0
                    else None
                ),
                "profit_margin": (
                    money(product_margin)
                    if known_revenue > Decimal("0.00")
                    and known_cost_quantity > 0
                    else None
                ),
                "cost_known": cost_complete,
                "unknown_cost": not cost_complete,
                "known_cost_quantity": known_cost_quantity,
                "unknown_cost_quantity": unknown_cost_quantity,
                "unknown_cost_sales_value": money(
                    product_data["unknown_cost_sales_value"]
                )
            })

        product_results.sort(
            key=lambda item: item["sales_revenue"],
            reverse=True
        )

        # ----------------------------------------------------
        # RESPONSE
        # ----------------------------------------------------

        return jsonify({
            "status": "success",

            "filters": report_date_filters(
                start_date,
                end_date
            ),

            "profit": {
                "total_orders": len(orders),

                "sales_revenue": money(sales_revenue),
                "total_sales": money(sales_revenue),
                "revenue": money(sales_revenue),

                "cost_of_goods_sold": money(cost_of_goods_sold),
                "total_cost": money(cost_of_goods_sold),
                "cost": money(cost_of_goods_sold),

                "gross_profit": money(gross_profit),
                "total_profit": money(gross_profit),
                "profit": money(gross_profit),

                "profit_margin": money(profit_margin),
                "gross_profit_margin": money(profit_margin),
                "margin": money(profit_margin),

                "known_cost_revenue": money(known_cost_revenue),

                "unknown_cost_sales_value": money(
                    unknown_cost_sales_value
                ),

                "unknown_cost_revenue": money(
                    unknown_cost_sales_value
                ),

                "known_cost_item_count": known_cost_item_count,
                "unknown_cost_item_count": unknown_cost_item_count,

                "quantity_sold": quantity_sold,

                "products": product_results,
                "product_profit": product_results,
                "items": product_results,

                "profit_is_complete": (
                    unknown_cost_item_count == 0
                )
            },

            "note": (
                "This report includes confirmed paid orders and "
                "excludes cancelled orders. Gross profit and margin "
                "are calculated only for items with a valid recorded "
                "historical buying-price snapshot. Sales with unknown "
                "costs are reported separately. These figures do not "
                "include operating expenses, taxes, or other business "
                "costs and therefore are not net profit."
            )
        }), 200

    except ValueError as error:
        return jsonify({
            "status": "error",
            "message": str(error)
        }), 400

    except Exception:
        db.session.rollback()

        logger.exception(
            "Failed to generate profit report."
        )

        return jsonify({
            "status": "error",
            "message": "Unable to generate profit report."
        }), 500

    # ============================================================
# STOCK HISTORY — ADMIN ONLY
#
# GET /api/admin/stock-history
#
# Returns stock additions made by all cashiers.
# Supports optional cashier and date filters.
# ============================================================

@admin_bp.route(
    "/api/admin/stock-history",
    methods=["GET"]
)
@admin_required
def get_admin_stock_history():
    try:
        # ----------------------------------------------------
        # OPTIONAL FILTERS
        # ----------------------------------------------------

        cashier_id = request.args.get("cashier_id", type=int)

        try:
            start_date, end_date = parse_report_dates()
        except ValueError as error:
            return jsonify({
                "status": "error",
                "message": str(error)
            }), 400

        # ----------------------------------------------------
        # BUILD QUERY
        # ----------------------------------------------------

        query = StockMovement.query

        if cashier_id is not None:
            if cashier_id <= 0:
                return jsonify({
                    "status": "error",
                    "message": "Invalid cashier ID."
                }), 400

            query = query.filter(
                StockMovement.cashier_id == cashier_id
            )

        if start_date:
            query = query.filter(
                StockMovement.created_at >= start_date
            )

        if end_date:
            query = query.filter(
                StockMovement.created_at < end_date
            )

        # ----------------------------------------------------
        # RETRIEVE NEWEST RECORDS FIRST
        # ----------------------------------------------------

        movements = query.order_by(
            StockMovement.created_at.desc(),
            StockMovement.id.desc()
        ).all()

        # ----------------------------------------------------
        # SERIALIZE RECORDS
        # ----------------------------------------------------

        records = [
            movement.to_dict()
            for movement in movements
        ]

        return jsonify(records), 200

    except Exception:
        db.session.rollback()

        logger.exception(
            "Failed to retrieve admin stock history."
        )

        return jsonify({
            "status": "error",
            "message": "Unable to retrieve stock history."
        }), 500
   # ============================================================
# BRANCH MANAGEMENT
# ============================================================


# ------------------------------------------------------------
# GET ALL BRANCHES
# GET /api/admin/branches
# ------------------------------------------------------------

@admin_bp.route(
    "/api/admin/branches",
    methods=["GET"]
)
@admin_required
def get_branches():
    try:
        branches = Branch.query.order_by(
            Branch.id.asc()
        ).all()

        cashier_counts = dict(
            db.session.query(
                Cashier.branch_id,
                func.count(Cashier.id)
            )
            .filter(
                Cashier.branch_id.isnot(None)
            )
            .group_by(
                Cashier.branch_id
            )
            .all()
        )

        return jsonify({
            "status": "success",
            "branches": [
                {
                    "id": branch.id,
                    "name": branch.name,
                    "code": branch.code,
                    "is_active": branch.is_active,
                    "cashier_count": cashier_counts.get(
                        branch.id,
                        0
                    ),
                }
                for branch in branches
            ],
        }), 200

    except Exception:
        db.session.rollback()

        logger.exception(
            "Failed to retrieve branches."
        )

        return jsonify({
            "status": "error",
            "message": "Unable to retrieve branches.",
        }), 500


# ------------------------------------------------------------
# GET BRANCH STOCK
# GET /api/admin/branches/<branch_id>/stock
# ------------------------------------------------------------

@admin_bp.route(
    "/api/admin/branches/<int:branch_id>/stock",
    methods=["GET"]
)
@admin_required
def get_branch_stock_admin(branch_id):
    try:
        branch = db.session.get(
            Branch,
            branch_id
        )

        if branch is None:
            return jsonify({
                "status": "error",
                "message": "Branch not found.",
            }), 404

        records = (
            db.session.query(
                BranchProductStock,
                Product
            )
            .join(
                Product,
                Product.id == BranchProductStock.product_id
            )
            .filter(
                BranchProductStock.branch_id == branch_id
            )
            .order_by(
                Product.name.asc()
            )
            .all()
        )

        products = [
            {
                "id": product.id,
                "product_id": product.id,
                "name": product.name,
                "category": product.category,
                "price": float(product.price or 0),
                "quantity": stock.quantity,
            }
            for stock, product in records
        ]

        return jsonify({
            "status": "success",
            "branch": {
                "id": branch.id,
                "name": branch.name,
                "code": branch.code,
            },

            # Support both response formats used by the frontend.
            "products": products,
            "stock": products,
        }), 200

    except Exception:
        db.session.rollback()

        logger.exception(
            "Failed to retrieve stock for branch ID %s.",
            branch_id
        )

        return jsonify({
            "status": "error",
            "message": "Unable to retrieve branch stock.",
        }), 500


# ------------------------------------------------------------
# UPDATE BRANCH STOCK
# PUT /api/admin/branches/<branch_id>/stock/<product_id>
#
# Changes stock for the selected branch only.
# Does not change Product.stock.
# ------------------------------------------------------------

@admin_bp.route(
    "/api/admin/branches/<int:branch_id>/stock/<int:product_id>",
    methods=["PUT"]
)
@admin_required
def update_branch_stock_admin(
    branch_id,
    product_id
):
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "status": "error",
            "message": "A valid JSON request body is required.",
        }), 400

    quantity = data.get("quantity")

    if (
        isinstance(quantity, bool)
        or not isinstance(quantity, int)
        or quantity < 0
    ):
        return jsonify({
            "status": "error",
            "message": (
                "Quantity must be a non-negative integer."
            ),
        }), 400

    try:
        branch = db.session.get(
            Branch,
            branch_id
        )

        if branch is None:
            return jsonify({
                "status": "error",
                "message": "Branch not found.",
            }), 404

        product = db.session.get(
            Product,
            product_id
        )

        if product is None:
            return jsonify({
                "status": "error",
                "message": "Product not found.",
            }), 404

        if not branch.is_active:
            return jsonify({
                "status": "error",
                "message": "This branch is inactive.",
            }), 400

        stock = (
            BranchProductStock.query
            .filter_by(
                branch_id=branch_id,
                product_id=product_id
            )
            .with_for_update()
            .first()
        )

        if stock is None:
            stock = BranchProductStock(
                branch_id=branch_id,
                product_id=product_id,
                quantity=quantity,
            )

            db.session.add(stock)

        else:
            stock.quantity = quantity

        db.session.commit()

        return jsonify({
            "status": "success",
            "message": "Branch stock updated successfully.",
            "branch_id": branch_id,
            "product_id": product_id,
            "quantity": quantity,
        }), 200

    except IntegrityError:
        db.session.rollback()

        logger.exception(
            "Stock update constraint failure: branch=%s product=%s",
            branch_id,
            product_id
        )

        return jsonify({
            "status": "error",
            "message": "The stock update conflicted with a database constraint.",
        }), 409

    except Exception:
        db.session.rollback()

        logger.exception(
            "Failed to update branch stock: branch=%s product=%s",
            branch_id,
            product_id
        )

        return jsonify({
            "status": "error",
            "message": "Unable to update branch stock.",
        }), 500


# ------------------------------------------------------------
# GET CASHIERS FOR BRANCH MANAGEMENT
# GET /api/admin/branches/<branch_id>/cashiers
#
# Returns ALL cashiers, including those assigned to other
# branches or not assigned to any branch.
# ------------------------------------------------------------

@admin_bp.route(
    "/api/admin/branches/<int:branch_id>/cashiers",
    methods=["GET"]
)
@admin_required
def get_branch_cashiers(branch_id):
    try:
        branch = db.session.get(
            Branch,
            branch_id
        )

        if branch is None:
            return jsonify({
                "status": "error",
                "message": "Branch not found.",
            }), 404

        cashiers = Cashier.query.order_by(
            Cashier.username.asc()
        ).all()

        branch_ids = {
            cashier.branch_id
            for cashier in cashiers
            if cashier.branch_id is not None
        }

        branches = Branch.query.filter(
            Branch.id.in_(branch_ids)
        ).all() if branch_ids else []

        branch_names = {
            item.id: item.name
            for item in branches
        }

        return jsonify({
            "status": "success",
            "branch": {
                "id": branch.id,
                "name": branch.name,
                "code": branch.code,
            },
            "cashiers": [
                {
                    "id": cashier.id,
                    "username": cashier.username,
                    "full_name": cashier.full_name,
                    "is_active": cashier.is_active,
                    "branch_id": cashier.branch_id,
                    "branch_name": branch_names.get(
                        cashier.branch_id
                    ),
                }
                for cashier in cashiers
            ],
        }), 200

    except Exception:
        db.session.rollback()

        logger.exception(
            "Failed to retrieve cashiers for branch ID %s.",
            branch_id
        )

        return jsonify({
            "status": "error",
            "message": "Unable to retrieve branch cashiers.",
        }), 500


# ------------------------------------------------------------
# ASSIGN OR UNASSIGN CASHIER
# PUT /api/admin/cashiers/<cashier_id>/branch
#
# Assign:
# {"branch_id": 1}
#
# Unassign:
# {"branch_id": null}
# ------------------------------------------------------------

@admin_bp.route(
    "/api/admin/cashiers/<int:cashier_id>/branch",
    methods=["PUT"]
)
@admin_required
def assign_cashier_branch(cashier_id):
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "status": "error",
            "message": "A valid JSON request body is required.",
        }), 400

    if "branch_id" not in data:
        return jsonify({
            "status": "error",
            "message": "The branch_id field is required.",
        }), 400

    branch_id = data["branch_id"]

    if branch_id is not None and (
        isinstance(branch_id, bool)
        or not isinstance(branch_id, int)
        or branch_id <= 0
    ):
        return jsonify({
            "status": "error",
            "message": (
                "branch_id must be a positive integer or null."
            ),
        }), 400

    try:
        cashier = db.session.execute(
            select(Cashier)
            .where(Cashier.id == cashier_id)
            .with_for_update()
        ).scalar_one_or_none()

        if cashier is None:
            return jsonify({
                "status": "error",
                "message": "Cashier not found.",
            }), 404

        if branch_id is None:
            cashier.branch_id = None

        else:
            branch = db.session.get(
                Branch,
                branch_id
            )

            if branch is None:
                return jsonify({
                    "status": "error",
                    "message": "Branch not found.",
                }), 404

            if not branch.is_active:
                return jsonify({
                    "status": "error",
                    "message": (
                        "Cannot assign a cashier to an inactive branch."
                    ),
                }), 400

            cashier.branch_id = branch.id

        db.session.commit()

        return jsonify({
            "status": "success",
            "message": (
                "Cashier unassigned successfully."
                if cashier.branch_id is None
                else "Cashier assigned successfully."
            ),
            "cashier": {
                "id": cashier.id,
                "username": cashier.username,
                "branch_id": cashier.branch_id,
            },
        }), 200

    except IntegrityError:
        db.session.rollback()

        logger.exception(
            "Branch assignment constraint failure for cashier %s.",
            cashier_id
        )

        return jsonify({
            "status": "error",
            "message": "The cashier assignment could not be saved.",
        }), 409

    except Exception:
        db.session.rollback()

        logger.exception(
            "Failed to assign cashier ID %s to a branch.",
            cashier_id
        )

        return jsonify({
            "status": "error",
            "message": "Unable to update cashier assignment.",
        }), 500


# ------------------------------------------------------------
# GET POS SALES FOR A BRANCH
# GET /api/admin/branches/<branch_id>/sales
#
# Returns cashier POS sales only.
# Website customer orders remain separate.
# ------------------------------------------------------------

@admin_bp.route(
    "/api/admin/branches/<int:branch_id>/sales",
    methods=["GET"]
)
@admin_required
def get_branch_pos_sales(branch_id):
    try:
        branch = db.session.get(
            Branch,
            branch_id
        )

        if branch is None:
            return jsonify({
                "status": "error",
                "message": "Branch not found.",
            }), 404

        sales = (
            CashierSale.query
            .filter_by(
                branch_id=branch_id
            )
            .order_by(
                CashierSale.created_at.desc(),
                CashierSale.id.desc()
            )
            .limit(200)
            .all()
        )

        return jsonify({
            "status": "success",
            "branch_id": branch.id,
            "branch_name": branch.name,
            "sales": [
                sale.to_dict()
                for sale in sales
            ],
        }), 200

    except Exception:
        db.session.rollback()

        logger.exception(
            "Failed to retrieve POS sales for branch ID %s.",
            branch_id
        )

        return jsonify({
            "status": "error",
            "message": "Unable to retrieve branch POS sales.",
        }), 500