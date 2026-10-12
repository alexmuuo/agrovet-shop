import os
import logging
import base64

from datetime import datetime
from decimal import Decimal, InvalidOperation

import requests

from flask import Blueprint, request, jsonify
from sqlalchemy import select

from extensions import db
from models.order import Order
from models.payment import Payment
from models.product import Product


# ============================================================
# CONFIGURATION
# ============================================================

payment_bp = Blueprint(
    "payments",
    __name__,
    url_prefix="/api/payments"
)

logger = logging.getLogger(__name__)

DARAJA_BASE_URL = "https://sandbox.safaricom.co.ke"


# ============================================================
# HELPERS
# ============================================================

def normalize_phone(phone):
    if not phone:
        raise ValueError("A phone number is required.")

    phone = (
        str(phone)
        .strip()
        .replace(" ", "")
        .replace("-", "")
    )

    if phone.startswith("+254"):
        phone = phone[1:]

    elif phone.startswith("254"):
        pass

    elif phone.startswith("0"):
        phone = "254" + phone[1:]

    elif len(phone) == 9 and phone[0] in ("7", "1"):
        phone = "254" + phone

    else:
        raise ValueError("Use a valid Kenyan phone number.")

    if len(phone) != 12 or not phone.isdigit():
        raise ValueError("Use a valid Kenyan phone number.")

    return phone


def get_mpesa_access_token():
    consumer_key = os.getenv("MPESA_CONSUMER_KEY")
    consumer_secret = os.getenv("MPESA_CONSUMER_SECRET")

    if not consumer_key or not consumer_secret:
        raise RuntimeError(
            "M-Pesa credentials are not configured."
        )

    response = requests.get(
        f"{DARAJA_BASE_URL}/oauth/v1/generate",
        params={"grant_type": "client_credentials"},
        auth=(consumer_key, consumer_secret),
        timeout=30
    )

    response.raise_for_status()

    token = response.json().get("access_token")

    if not token:
        raise RuntimeError(
            "Safaricom did not return an access token."
        )

    return token


def is_cashier_order(order):
    """
    Identify POS orders using the marker already stored
    in Order.notes. No schema migration is required.
    """
    return bool(
        order
        and order.notes
        and "Cashier sale processed by " in order.notes
    )


def restore_cashier_stock_once(order):
    """
    Restore stock for a failed cashier M-Pesa order.

    The caller must hold a database lock on the order.
    The order is marked cancelled in the same transaction,
    so duplicate callbacks cannot restore stock twice.
    """
    if not is_cashier_order(order):
        return

    # Already finalized: never restore stock again.
    if order.status in ("cancelled", "canceled"):
        return

    if order.payment_status == "paid":
        return

    items = list(order.items)

    product_ids = sorted({
        item.product_id
        for item in items
    })

    products = []

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

    # Validate everything before modifying any stock.
    for item in items:
        if item.product_id not in products_by_id:
            raise RuntimeError(
                f"Cannot restore stock for missing product "
                f"{item.product_id}, order {order.id}."
            )

    # Restore each item once.
    for item in items:
        products_by_id[item.product_id].stock += item.quantity

    order.status = "cancelled"
    order.payment_status = "failed"

    order.notes = (
        f"{order.notes or ''}\n"
        "M-Pesa payment failed; reserved stock restored."
    )


# ============================================================
# INITIATE M-PESA STK PUSH
# POST /api/payments/stk-push
# ============================================================

@payment_bp.route("/stk-push", methods=["POST"])
def initiate_stk_push():

    data = request.get_json(silent=True) or {}

    order_id = data.get("order_id")
    phone = data.get("phone")

    if order_id is None or not phone:
        return jsonify({
            "error": "order_id and phone are required."
        }), 400

    try:
        order_id = int(order_id)

        if order_id <= 0:
            raise ValueError

    except (TypeError, ValueError, OverflowError):
        return jsonify({
            "error": "Invalid order ID."
        }), 400

    try:
        phone = normalize_phone(phone)

    except ValueError as error:
        return jsonify({
            "error": str(error)
        }), 400

    try:
        # ----------------------------------------------------
        # LOCK ORDER
        # ----------------------------------------------------

        order = db.session.execute(
            select(Order)
            .where(Order.id == order_id)
            .with_for_update()
        ).scalar_one_or_none()

        if not order:
            db.session.rollback()

            return jsonify({
                "error": "Order not found."
            }), 404

        if (order.payment_method or "").lower() != "mpesa":
            db.session.rollback()

            return jsonify({
                "error": "This order is not configured for M-Pesa."
            }), 400

        if (order.payment_status or "").lower() == "paid":
            db.session.rollback()

            return jsonify({
                "error": "This order has already been paid."
            }), 409

        if (order.status or "").lower() in (
            "cancelled",
            "canceled",
            "completed"
        ):
            db.session.rollback()

            return jsonify({
                "error": "This order cannot be paid in its current state."
            }), 409

        # ----------------------------------------------------
        # PREVENT DUPLICATE PENDING PROMPTS
        # ----------------------------------------------------

        existing_payment = db.session.execute(
            select(Payment)
            .where(
                Payment.order_id == order.id,
                Payment.status == "pending"
            )
            .with_for_update()
        ).scalar_one_or_none()

        if existing_payment:
            db.session.rollback()

            return jsonify({
                "error": (
                    "A payment is already pending for this order. "
                    "Check its status before retrying."
                ),
                "payment_status": "pending"
            }), 409

        # ----------------------------------------------------
        # VALIDATE CONFIGURATION AND AMOUNT
        # ----------------------------------------------------

        shortcode = os.getenv("MPESA_SHORTCODE")
        passkey = os.getenv("MPESA_PASSKEY")
        callback_url = os.getenv("MPESA_CALLBACK_URL")

        if not shortcode or not passkey or not callback_url:
            db.session.rollback()

            return jsonify({
                "error": "M-Pesa configuration is incomplete."
            }), 500

        try:
            order_amount = Decimal(str(order.total))

        except (InvalidOperation, TypeError, ValueError):
            db.session.rollback()

            return jsonify({
                "error": "The order total is invalid."
            }), 400

        if not order_amount.is_finite():
            db.session.rollback()

            return jsonify({
                "error": "The order total is invalid."
            }), 400

        if order_amount != order_amount.quantize(Decimal("1")):
            db.session.rollback()

            return jsonify({
                "error": (
                    "Order total must be a whole number "
                    "of Kenyan shillings for STK Push."
                )
            }), 400

        amount = int(order_amount)

        if amount < 1:
            db.session.rollback()

            return jsonify({
                "error": "Order amount must be at least KSh 1."
            }), 400

        # ----------------------------------------------------
        # REQUEST ACCESS TOKEN
        # ----------------------------------------------------

        access_token = get_mpesa_access_token()

        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")

        password = base64.b64encode(
            f"{shortcode}{passkey}{timestamp}".encode("utf-8")
        ).decode("utf-8")

        payload = {
            "BusinessShortCode": shortcode,
            "Password": password,
            "Timestamp": timestamp,
            "TransactionType": "CustomerPayBillOnline",
            "Amount": amount,
            "PartyA": phone,
            "PartyB": shortcode,
            "PhoneNumber": phone,
            "CallBackURL": callback_url,
            "AccountReference": str(order.order_number),
            "TransactionDesc": "Agrovet order payment"
        }

        response = requests.post(
            (
                f"{DARAJA_BASE_URL}"
                "/mpesa/stkpush/v1/processrequest"
            ),
            json=payload,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            },
            timeout=30
        )

        try:
            result = response.json()

        except ValueError:
            db.session.rollback()

            logger.error(
                "Safaricom returned a non-JSON STK response."
            )

            return jsonify({
                "error": "Safaricom returned an invalid response."
            }), 502

        if (
            not response.ok
            or str(result.get("ResponseCode")) != "0"
        ):
            db.session.rollback()

            logger.warning(
                "Safaricom rejected an STK Push request."
            )

            return jsonify({
                "error": "Could not initiate M-Pesa payment.",
                "details": (
                    result.get("errorMessage")
                    or result.get("ResponseDescription")
                    or "Safaricom rejected the request."
                )
            }), 502

        checkout_request_id = result.get("CheckoutRequestID")

        if not checkout_request_id:
            db.session.rollback()

            return jsonify({
                "error": "Safaricom returned an incomplete response."
            }), 502

        payment = Payment(
            order_id=order.id,
            checkout_request_id=checkout_request_id,
            merchant_request_id=result.get("MerchantRequestID"),
            phone_number=phone,
            amount=Decimal(amount),
            status="pending"
        )

        db.session.add(payment)
        db.session.commit()

        logger.info(
            "STK Push initiated for order ID %s.",
            order.id
        )

        return jsonify({
            "message": (
                "Payment prompt initiated. Check your phone "
                "and enter your M-Pesa PIN."
            ),
            "order_id": order.id,
            "checkout_request_id": checkout_request_id,
            "payment_status": "pending"
        }), 200

    except requests.RequestException:
        db.session.rollback()

        logger.exception(
            "Unable to communicate with Safaricom."
        )

        return jsonify({
            "error": (
                "Unable to confirm whether Safaricom accepted "
                "the request. Check payment status before retrying."
            )
        }), 502

    except Exception:
        db.session.rollback()

        logger.exception(
            "Failed to initiate M-Pesa STK Push."
        )

        return jsonify({
            "error": "Payment could not be initiated."
        }), 500


# ============================================================
# M-PESA CALLBACK
# POST /api/payments/callback
# ============================================================

@payment_bp.route("/callback", methods=["POST"])
def mpesa_callback():

    data = request.get_json(silent=True) or {}

    try:
        callback = data["Body"]["stkCallback"]

        checkout_request_id = callback.get(
            "CheckoutRequestID"
        )

        result_code = callback.get("ResultCode")

        result_description = callback.get(
            "ResultDesc",
            ""
        )

        if (
            not checkout_request_id
            or result_code is None
        ):
            return jsonify({
                "Result": "Invalid callback"
            }), 400

        try:
            result_code = int(result_code)

        except (TypeError, ValueError):
            return jsonify({
                "Result": "Invalid callback"
            }), 400

        # ----------------------------------------------------
        # LOCK PAYMENT
        # ----------------------------------------------------

        payment = db.session.execute(
            select(Payment)
            .where(
                Payment.checkout_request_id == checkout_request_id
            )
            .with_for_update()
        ).scalar_one_or_none()

        if not payment:
            db.session.rollback()

            logger.warning(
                "Callback received for an unknown checkout request."
            )

            return jsonify({
                "Result": "Accepted"
            }), 200

        # Duplicate callback protection.
        if payment.status in ("paid", "failed"):
            db.session.rollback()

            return jsonify({
                "Result": "Accepted"
            }), 200

        # ----------------------------------------------------
        # LOCK ASSOCIATED ORDER
        # ----------------------------------------------------

        order = db.session.execute(
            select(Order)
            .where(Order.id == payment.order_id)
            .with_for_update()
        ).scalar_one_or_none()

        if not order:
            db.session.rollback()

            logger.error(
                "Payment callback references a missing order."
            )

            return jsonify({
                "Result": "Accepted"
            }), 200

        payment.result_description = result_description

        # ----------------------------------------------------
        # FAILED OR CANCELLED PAYMENT
        # ----------------------------------------------------

        if result_code != 0:

            payment.status = "failed"

            if order.payment_status != "paid":
                if is_cashier_order(order):
                    # Restore reserved stock in the same
                    # transaction as finalizing cancellation.
                    restore_cashier_stock_once(order)

                else:
                    # Preserve existing customer-order behaviour.
                    order.payment_status = "failed"

            db.session.commit()

            logger.info(
                "M-Pesa payment failed for order ID %s.",
                order.id
            )

            return jsonify({
                "Result": "Accepted"
            }), 200

        # ----------------------------------------------------
        # READ SUCCESSFUL PAYMENT METADATA
        # ----------------------------------------------------

        items = (
            callback
            .get("CallbackMetadata", {})
            .get("Item", [])
        )

        details = {
            item["Name"]: item.get("Value")
            for item in items
            if isinstance(item, dict) and "Name" in item
        }

        receipt = details.get("MpesaReceiptNumber")
        callback_amount = details.get("Amount")
        callback_phone = details.get("PhoneNumber")

        if (
            not receipt
            or callback_amount is None
            or callback_phone is None
        ):
            payment.result_description = (
                "Payment confirmation is incomplete; "
                "manual verification is required."
            )

            db.session.commit()

            logger.error(
                "Incomplete successful-payment callback "
                "for payment ID %s.",
                payment.id
            )

            return jsonify({
                "Result": "Accepted"
            }), 200

        try:
            received_amount = Decimal(str(callback_amount))

        except (InvalidOperation, TypeError, ValueError):
            payment.result_description = (
                "Invalid callback amount; "
                "manual verification is required."
            )

            db.session.commit()

            return jsonify({
                "Result": "Accepted"
            }), 200

        # ----------------------------------------------------
        # VALIDATE AMOUNT AND PHONE
        # ----------------------------------------------------

        if (
            not received_amount.is_finite()
            or received_amount != Decimal(str(payment.amount))
            or str(callback_phone) != payment.phone_number
        ):
            payment.result_description = (
                "Payment details mismatch; "
                "manual verification is required."
            )

            db.session.commit()

            logger.error(
                "M-Pesa callback mismatch for payment ID %s.",
                payment.id
            )

            return jsonify({
                "Result": "Accepted"
            }), 200

        # ----------------------------------------------------
        # PREVENT DUPLICATE RECEIPTS
        # ----------------------------------------------------

        duplicate_receipt = db.session.execute(
            select(Payment.id)
            .where(
                Payment.mpesa_receipt_number == str(receipt),
                Payment.id != payment.id
            )
        ).scalar_one_or_none()

        if duplicate_receipt:
            payment.result_description = (
                "Duplicate receipt detected; "
                "manual verification is required."
            )

            db.session.commit()

            logger.error(
                "Duplicate M-Pesa receipt detected."
            )

            return jsonify({
                "Result": "Accepted"
            }), 200

        # ----------------------------------------------------
        # PREVENT PAYING AN ALREADY-PAID ORDER TWICE
        # ----------------------------------------------------

        if order.payment_status == "paid":
            payment.result_description = (
                "Order is already marked paid; "
                "additional payment requires reconciliation."
            )

            db.session.commit()

            logger.error(
                "Additional payment detected for order ID %s.",
                order.id
            )

            return jsonify({
                "Result": "Accepted"
            }), 200

        # Never resurrect a cancelled order.
        if order.status in ("cancelled", "canceled"):
            payment.result_description = (
                "Payment succeeded after order cancellation; "
                "manual reconciliation is required."
            )

            db.session.commit()

            logger.error(
                "Payment succeeded for cancelled order ID %s.",
                order.id
            )

            return jsonify({
                "Result": "Accepted"
            }), 200

        # ----------------------------------------------------
        # CONFIRM PAYMENT
        # ----------------------------------------------------

        payment.status = "paid"
        payment.mpesa_receipt_number = str(receipt)

        order.payment_status = "paid"

        if is_cashier_order(order):
            # POS already deducted/reserved stock when it
            # created the order. Do not deduct stock again.
            order.status = "completed"

            order.notes = (
                f"{order.notes or ''}\n"
                f"M-Pesa payment confirmed. "
                f"Receipt: {receipt}."
            )

        # Customer orders retain their existing order status.
        db.session.commit()

        logger.info(
            "M-Pesa payment confirmed for order ID %s.",
            order.id
        )

        return jsonify({
            "Result": "Accepted"
        }), 200

    except Exception:
        db.session.rollback()

        logger.exception(
            "Failed to process M-Pesa callback."
        )

        # Acknowledge the callback to avoid repeated deliveries.
        # Any database failure must be reconciled from logs.
        return jsonify({
            "Result": "Accepted"
        }), 200

    # ============================================================
# CUSTOMER PAYMENT STATUS
# GET /api/payments/status/<order_id>
# ============================================================

@payment_bp.route(
    "/status/<int:order_id>",
    methods=["GET"]
)
def customer_payment_status(order_id):
    try:
        # Find the order.
        order = Order.query.filter_by(id=order_id).first()

        if not order:
            return jsonify({
                "error": "Order not found."
            }), 404

        # Do not expose cashier POS payment details through
        # the customer checkout endpoint.
        if is_cashier_order(order):
            return jsonify({
                "error": "Use the cashier payment-status endpoint."
            }), 403

        # Get the latest payment attempt for this order.
        payment = (
            Payment.query
            .filter_by(order_id=order.id)
            .order_by(Payment.id.desc())
            .first()
        )

        # The order itself must also be marked paid.
        if order.payment_status == "paid":
            if payment and payment.status == "paid":
                return jsonify({
                    "order_id": order.id,
                    "payment_status": "paid",
                    "transaction_status": "paid",
                    "message": "Payment confirmed successfully.",
                    "receipt": payment.mpesa_receipt_number
                }), 200

            # Never report success when the order is marked paid
            # but the payment record does not confirm it.
            return jsonify({
                "order_id": order.id,
                "payment_status": "pending",
                "transaction_status": "pending",
                "message": "Payment is awaiting verification."
            }), 200

        if not payment:
            return jsonify({
                "order_id": order.id,
                "payment_status": order.payment_status,
                "transaction_status": "not_initiated",
                "message": "No M-Pesa payment attempt was found."
            }), 200

        if payment.status == "paid":
            return jsonify({
                "order_id": order.id,
                "payment_status": "pending",
                "transaction_status": "pending",
                "message": "Payment is awaiting order verification."
            }), 200

        if payment.status == "failed":
            return jsonify({
                "order_id": order.id,
                "payment_status": "failed",
                "transaction_status": "failed",
                "message": (
                    payment.result_description
                    or "M-Pesa payment failed. Please try again."
                )
            }), 200

        return jsonify({
            "order_id": order.id,
            "payment_status": "pending",
            "transaction_status": "pending",
            "message": (
                payment.result_description
                or "Waiting for M-Pesa payment confirmation."
            )
        }), 200

    except Exception:
        logger.exception(
            "Failed to retrieve customer payment status "
            "for order %s",
            order_id
        )

        return jsonify({
            "error": "Could not retrieve payment status."
        }), 500