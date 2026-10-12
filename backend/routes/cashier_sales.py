import logging
import uuid

from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify, request, g
from sqlalchemy import select

from extensions import db
from models.cashier import Cashier
from models.customer import Customer
from models.product import Product
from models.order import Order, OrderItem
from models.payment import Payment
from models.payment import Payment

from cashier_auth import cashier_required


# ============================================================
# CONFIGURATION
# ============================================================

cashier_sales_bp = Blueprint(
    "cashier_sales_bp",
    __name__,
    url_prefix="/api/cashier"
)

logger = logging.getLogger(__name__)


# ============================================================
# HELPERS
# ============================================================

def error_response(message, status_code):
    return jsonify({
        "status": "error",
        "message": message
    }), status_code


def validate_quantity(value):
    if isinstance(value, bool):
        return None

    try:
        quantity = int(value)

        if quantity <= 0:
            return None

        if isinstance(value, float) and not value.is_integer():
            return None

        if isinstance(value, str) and value.strip() != str(quantity):
            return None

        return quantity

    except (TypeError, ValueError, OverflowError):
        return None


def validate_price(value):
    try:
        price = Decimal(str(value))

        if not price.is_finite() or price < 0:
            return None

        return price

    except (InvalidOperation, ValueError, TypeError):
        return None


def get_active_cashier():
    """
    Return the authenticated, active cashier.
    """
    cashier = getattr(g, "cashier", None)

    if not cashier or not cashier.is_active:
        return None

    return cashier


def is_cashier_order(order, cashier_id=None):
    """
    Identify POS orders using the cashier marker already
    stored in Order.notes.

    This avoids requiring a database migration for now.
    """
    if not order or not order.notes:
        return False

    if cashier_id is not None:
        marker = f"(ID: {cashier_id})."

        return (
            marker in order.notes
            and "Cashier sale processed by " in order.notes
        )

    return "Cashier sale processed by " in order.notes


# ============================================================
# CREATE CASHIER SALE
# POST /api/cashier/sales
# ============================================================

@cashier_sales_bp.route("/sales", methods=["POST"])
@cashier_required
def create_cashier_sale():

    cashier = get_active_cashier()

    if not cashier:
        return error_response(
            "Active cashier authentication is required.",
            401
        )

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return error_response(
            "A valid JSON request is required.",
            400
        )

    items = data.get("items")

    if not isinstance(items, list) or not items:
        return error_response(
            "Add at least one product to the sale.",
            400
        )

    if len(items) > 100:
        return error_response(
            "A sale cannot contain more than 100 line items.",
            400
        )

    payment_method = data.get("payment_method", "cash")

    if payment_method not in ("cash", "mpesa"):
        return error_response(
            "Payment method must be cash or mpesa.",
            400
        )

    # --------------------------------------------------------
    # VALIDATE AND COMBINE PRODUCT QUANTITIES
    # --------------------------------------------------------

    requested_quantities = {}

    for item in items:

        if not isinstance(item, dict):
            return error_response(
                "Each item must be a valid object.",
                400
            )

        product_id = item.get("product_id")

        if isinstance(product_id, bool):
            return error_response(
                "Invalid product ID.",
                400
            )

        try:
            product_id = int(product_id)

            if product_id <= 0:
                raise ValueError

        except (TypeError, ValueError, OverflowError):
            return error_response(
                "Invalid product ID.",
                400
            )

        quantity = validate_quantity(
            item.get("quantity")
        )

        if quantity is None:
            return error_response(
                "Every product must have a positive whole-number quantity.",
                400
            )

        requested_quantities[product_id] = (
            requested_quantities.get(product_id, 0)
            + quantity
        )

    try:

        # ----------------------------------------------------
        # FIND OR CREATE WALK-IN CUSTOMER
        # ----------------------------------------------------

        walk_in_phone = "POS-WALK-IN"

        customer = Customer.query.filter_by(
            phone=walk_in_phone
        ).first()

        if not customer:
            customer = Customer(
                name="Walk-in Customer",
                phone=walk_in_phone
            )

            db.session.add(customer)
            db.session.flush()

        # ----------------------------------------------------
        # LOCK PRODUCTS AND VALIDATE STOCK
        # ----------------------------------------------------

        product_ids = sorted(
            requested_quantities.keys()
        )

        statement = (
            select(Product)
            .where(Product.id.in_(product_ids))
            .order_by(Product.id)
            .with_for_update()
        )

        products = db.session.execute(
            statement
        ).scalars().all()

        products_by_id = {
            product.id: product
            for product in products
        }

        if len(products_by_id) != len(product_ids):
            db.session.rollback()

            return error_response(
                "One or more products could not be found.",
                404
            )

        total = Decimal("0.00")
        validated_items = []

        for product_id in product_ids:

            product = products_by_id[product_id]
            quantity = requested_quantities[product_id]

            if not product.is_active:
                db.session.rollback()

                return error_response(
                    f"{product.name} is unavailable.",
                    400
                )

            if product.stock < quantity:
                available = product.stock

                db.session.rollback()

                return error_response(
                    f"Insufficient stock for {product.name}. "
                    f"Available: {available}.",
                    400
                )

            price = validate_price(product.price)

            if price is None:
                db.session.rollback()

                logger.error(
                    "Invalid stored price for product ID %s.",
                    product.id
                )

                return error_response(
                    "A product has an invalid stored price.",
                    500
                )

            subtotal = price * quantity
            total += subtotal

            validated_items.append({
                "product": product,
                "quantity": quantity,
                "price": price
            })

        # ----------------------------------------------------
        # CREATE ORDER
        # ----------------------------------------------------

        if payment_method == "cash":
            initial_order_status = "completed"
            initial_payment_status = "paid"
        else:
            # M-Pesa orders must remain pending until
            # Safaricom confirms payment.
            initial_order_status = "pending"
            initial_payment_status = "unpaid"

        order_number = (
            f"POS-{uuid.uuid4().hex[:10].upper()}"
        )

        order = Order(
            order_number=order_number,
            customer_id=customer.id,
            order_type="pickup",
            delivery_location=None,
            payment_method=payment_method,
            payment_status=initial_payment_status,
            notes=(
                f"Cashier sale processed by "
                f"{cashier.username} (ID: {cashier.id})."
            ),
            total=total,
            status=initial_order_status
        )

        db.session.add(order)
        db.session.flush()

        # ----------------------------------------------------
        # SAVE ITEMS AND RESERVE STOCK
        # ----------------------------------------------------
        #
        # Stock is deducted exactly once here.
        #
        # For cash:
        #   The sale is completed immediately.
        #
        # For M-Pesa:
        #   Stock is reserved while payment is pending.
        #   A failed/cancelled payment must restore it.
        #
        # The payment callback must NOT deduct stock again.
        # ----------------------------------------------------

        for item in validated_items:

            product = item["product"]
            quantity = item["quantity"]

            order_item = OrderItem(
                order_id=order.id,
                product_id=product.id,
                quantity=quantity,
                price=item["price"]
            )

            db.session.add(order_item)

            product.stock -= quantity

        # ----------------------------------------------------
        # COMMIT
        # ----------------------------------------------------

        db.session.commit()

        logger.info(
            "Cashier sale created. Order ID=%s, cashier ID=%s, "
            "payment method=%s, status=%s",
            order.id,
            cashier.id,
            payment_method,
            order.payment_status
        )

        return jsonify({
            "status": "success",
            "message": (
                "Cash sale completed successfully."
                if payment_method == "cash"
                else (
                    "Order created. M-Pesa payment is pending. "
                    "Initiate the STK Push to continue."
                )
            ),
            "order": order.to_dict(),
            "payment_required": payment_method == "mpesa"
        }), 201

    except Exception:

        db.session.rollback()

        logger.exception(
            "Cashier sale creation failed."
        )

        return error_response(
            "Unable to create the sale. Please try again.",
            500
        )


# ============================================================
# CANCEL PENDING CASHIER SALE
# POST /api/cashier/sales/<order_id>/cancel
# ============================================================

@cashier_sales_bp.route(
    "/sales/<int:order_id>/cancel",
    methods=["POST"]
)
@cashier_required
def cancel_cashier_sale(order_id):

    cashier = get_active_cashier()

    if not cashier:
        return error_response(
            "Active cashier authentication is required.",
            401
        )

    try:

        # ----------------------------------------------------
        # LOCK THE ORDER
        # ----------------------------------------------------

        order = db.session.execute(
            select(Order)
            .where(Order.id == order_id)
            .with_for_update()
        ).scalar_one_or_none()

        if not order:
            db.session.rollback()

            return error_response(
                "Order not found.",
                404
            )

        # A cashier can cancel only their own POS orders.
        if not is_cashier_order(order, cashier.id):
            db.session.rollback()

            return error_response(
                "You are not authorized to cancel this sale.",
                403
            )

        if order.payment_method != "mpesa":
            db.session.rollback()

            return error_response(
                "Only pending M-Pesa sales can be cancelled here.",
                400
            )

        if order.status in ("completed", "cancelled", "canceled"):
            db.session.rollback()

            return error_response(
                "This order has already been finalized.",
                409
            )

        if order.payment_status == "paid":
            db.session.rollback()

            return error_response(
                "A paid order cannot be cancelled through this endpoint.",
                409
            )

        # ----------------------------------------------------
        # CHECK EXISTING PAYMENTS
        # ----------------------------------------------------

        payments = db.session.execute(
            select(Payment)
            .where(Payment.order_id == order.id)
            .with_for_update()
        ).scalars().all()

        if any(payment.status == "paid" for payment in payments):
            db.session.rollback()

            return error_response(
                "A payment has already been confirmed for this order.",
                409
            )

        if any(payment.status == "pending" for payment in payments):
            db.session.rollback()

            return error_response(
                "A payment is still pending. Check its status before cancelling.",
                409
            )

        # ----------------------------------------------------
        # RESTORE RESERVED STOCK
        # ----------------------------------------------------

        order_items = list(order.items)

        product_ids = sorted({
            item.product_id
            for item in order_items
        })

        if product_ids:

            products = db.session.execute(
                select(Product)
                .where(Product.id.in_(product_ids))
                .order_by(Product.id)
                .with_for_update()
            ).scalars().all()

            products_by_id = {
                product.id: product
                for product in products
            }

            for item in order_items:

                product = products_by_id.get(
                    item.product_id
                )

                if not product:
                    db.session.rollback()

                    logger.error(
                        "Cannot restore stock: product ID %s "
                        "is missing for order ID %s.",
                        item.product_id,
                        order.id
                    )

                    return error_response(
                        "A product is missing. Stock restoration requires review.",
                        500
                    )

                product.stock += item.quantity

        # ----------------------------------------------------
        # FINALIZE CANCELLATION
        # ----------------------------------------------------

        order.status = "cancelled"

        if order.payment_status != "paid":
            order.payment_status = "failed"

        order.notes = (
            f"{order.notes or ''}\n"
            f"Cancelled by cashier {cashier.username} "
            f"(ID: {cashier.id}); reserved stock restored."
        )

        db.session.commit()

        logger.info(
            "Pending cashier order %s cancelled by cashier %s; "
            "reserved stock restored.",
            order.id,
            cashier.id
        )

        return jsonify({
            "status": "success",
            "message": "Pending sale cancelled and reserved stock restored.",
            "order": order.to_dict()
        }), 200

    except Exception:

        db.session.rollback()

        logger.exception(
            "Failed to cancel cashier order %s.",
            order_id
        )

        return error_response(
            "Unable to cancel the sale. Check payment status before retrying.",
            500
        )




# ============================================================
# CHECK M-PESA PAYMENT STATUS — AUTHENTICATED CASHIER
# GET /api/cashier/sales/<order_id>/payment-status
# ============================================================

@cashier_sales_bp.route(
    "/sales/<int:order_id>/payment-status",
    methods=["GET"]
)
@cashier_required
def cashier_payment_status(order_id):
    try:
        cashier = g.cashier

        # Find the order.
        order = db.session.execute(
            select(Order).where(Order.id == order_id)
        ).scalar_one_or_none()

        if not order:
            return jsonify({
                "error": "Order not found."
            }), 404

        # Cashiers may only inspect their own sales.
        cashier_marker = f"(ID: {cashier.id})."

        if cashier_marker not in (order.notes or ""):
            return jsonify({
                "error": "You are not authorized to view this sale."
            }), 403

        # Find the latest payment record for this order.
        payment = db.session.execute(
            select(Payment)
            .where(Payment.order_id == order.id)
            .order_by(Payment.created_at.desc(), Payment.id.desc())
            .limit(1)
        ).scalar_one_or_none()

        if not payment:
            return jsonify({
                "order_id": order.id,
                "order_number": order.order_number,
                "order_status": order.status,
                "payment_status": order.payment_status,
                "transaction_status": "not_initiated",
                "message": "No M-Pesa payment record was found."
            }), 200

        return jsonify({
            "order_id": order.id,
            "order_number": order.order_number,
            "order_status": order.status,
            "payment_status": order.payment_status,
            "transaction_status": payment.status,
            "checkout_request_id": payment.checkout_request_id,
            "mpesa_receipt_number": payment.mpesa_receipt_number,
            "phone_number": payment.phone_number,
            "amount": float(payment.amount),
            "message": payment.result_description
        }), 200

    except Exception:
        logger.exception(
            "Failed to retrieve cashier payment status."
        )

        return jsonify({
            "error": "Unable to retrieve payment status."
        }), 500
# ============================================================
# CASHIER SALES HISTORY
# GET /api/cashier/sales
# ============================================================

@cashier_sales_bp.route("/sales", methods=["GET"])
@cashier_required
def get_cashier_sales():

    cashier = get_active_cashier()

    if not cashier:
        return error_response(
            "Active cashier authentication is required.",
            401
        )

    try:

        # ----------------------------------------------------
        # PAGINATION
        # ----------------------------------------------------

        try:
            page = int(request.args.get("page", 1))
            per_page = int(request.args.get("per_page", 20))

        except (TypeError, ValueError):
            return error_response(
                "Page and per_page must be valid integers.",
                400
            )

        if page < 1:
            return error_response(
                "Page must be at least 1.",
                400
            )

        if per_page < 1 or per_page > 100:
            return error_response(
                "per_page must be between 1 and 100.",
                400
            )

        # ----------------------------------------------------
        # DATE FILTERS
        # ----------------------------------------------------

        start_date = request.args.get("start_date")
        end_date = request.args.get("end_date")

        cashier_marker = f"(ID: {cashier.id})."

        query = Order.query.filter(
            Order.notes.like(f"%{cashier_marker}%"),
            Order.notes.like("%Cashier sale processed by %")
        )

        if start_date:

            try:
                start_datetime = datetime.strptime(
                    start_date,
                    "%Y-%m-%d"
                )

            except ValueError:
                return error_response(
                    "start_date must use YYYY-MM-DD format.",
                    400
                )

            query = query.filter(
                Order.created_at >= start_datetime
            )

        if end_date:

            try:
                end_datetime = datetime.strptime(
                    end_date,
                    "%Y-%m-%d"
                ) + timedelta(days=1)

            except ValueError:
                return error_response(
                    "end_date must use YYYY-MM-DD format.",
                    400
                )

            query = query.filter(
                Order.created_at < end_datetime
            )

        # ----------------------------------------------------
        # FETCH SALES
        # ----------------------------------------------------

        query = query.order_by(
            Order.created_at.desc()
        )

        total_sales = query.count()

        sales = (
            query
            .offset((page - 1) * per_page)
            .limit(per_page)
            .all()
        )

        return jsonify({
            "status": "success",
            "sales": [
                sale.to_dict()
                for sale in sales
            ],
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total_sales": total_sales,
                "total_pages": (
                    (total_sales + per_page - 1) // per_page
                )
            }
        }), 200

    except Exception:

        logger.exception(
            "Failed to retrieve cashier sales history."
        )

        return error_response(
            "Unable to retrieve sales history.",
            500
        )