import logging
import uuid

from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from flask import Blueprint, jsonify, request, g
from sqlalchemy import select

from extensions import db

from models.cashier import Cashier
from models.product import Product
from models.branch import Branch
from models.branch_product_stock import BranchProductStock
from models.cashier_sale import CashierSale, CashierSaleItem
from models.cashier_sale_payment import CashierSalePayment

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

ZERO = Decimal("0")
MONEY_PLACES = Decimal("0.01")
QUANTITY_PLACES = Decimal("0.001")


# ============================================================
# HELPERS
# ============================================================

def error_response(message, status_code):
    return jsonify({
        "status": "error",
        "message": message
    }), status_code


def decimal_value(value):
    """
    Convert a value to Decimal without using float arithmetic.
    Reject booleans, non-finite values, and invalid numbers.
    """
    if isinstance(value, bool) or value is None:
        return None

    try:
        result = Decimal(str(value).strip())

        if not result.is_finite():
            return None

        return result

    except (InvalidOperation, ValueError, TypeError, AttributeError):
        return None


def validate_quantity(value):
    """
    Accept positive quantities with at most three decimal places.
    """
    quantity = decimal_value(value)

    if quantity is None or quantity <= ZERO:
        return None

    if quantity != quantity.quantize(QUANTITY_PLACES):
        return None

    return quantity.quantize(QUANTITY_PLACES)


def validate_price(value):
    """
    Accept non-negative monetary values with at most two decimal places.
    """
    price = decimal_value(value)

    if price is None or price < ZERO:
        return None

    if price != price.quantize(MONEY_PLACES):
        return None

    return price.quantize(MONEY_PLACES)


def money(value):
    return Decimal(value).quantize(
        MONEY_PLACES,
        rounding=ROUND_HALF_UP
    )


def get_active_cashier():
    cashier = getattr(g, "cashier", None)

    if not cashier or not cashier.is_active:
        return None

    return cashier


def get_cashier_branch(cashier):
    """
    Retrieve the active branch assigned to the authenticated cashier.
    """

    if not cashier.branch_id:
        return None

    return db.session.execute(
        select(Branch).where(
            Branch.id == cashier.branch_id,
            Branch.is_active.is_(True)
        )
    ).scalar_one_or_none()


def get_branch_stock(branch_id, product_id, lock=False):
    statement = select(BranchProductStock).where(
        BranchProductStock.branch_id == branch_id,
        BranchProductStock.product_id == product_id
    )

    if lock:
        statement = statement.with_for_update()

    return db.session.execute(
        statement
    ).scalar_one_or_none()


def get_sale_for_cashier(sale_id, cashier):
    """
    A cashier can access only their own sales.
    """

    return db.session.execute(
        select(CashierSale).where(
            CashierSale.id == sale_id,
            CashierSale.cashier_id == cashier.id
        )
    ).scalar_one_or_none()


def normalize_selling_unit(value):
    """
    Normalize the requested selling unit.
    """

    if not isinstance(value, str):
        return None

    value = value.strip().lower()

    if value in ("unit", "whole", "whole_unit"):
        return "unit"

    if value in ("portion", "portions"):
        return "portion"

    return None


# ============================================================
# CREATE CASHIER SALE
#
# POST /api/cashier/sales
#
# This endpoint writes to cashier_sales and cashier_sale_items.
# It does not create a website Order.
#
# Whole-unit item example:
# {
#     "product_id": 1,
#     "quantity": 1,
#     "selling_unit": "unit"
# }
#
# Portion item example:
# {
#     "product_id": 1,
#     "quantity": 2,
#     "selling_unit": "portion"
# }
#
# Portion configuration is read from Product:
# allow_portion_sales
# portions_per_unit
# portion_price
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

    if (
        not isinstance(payment_method, str)
        or payment_method.strip().lower() not in ("cash", "mpesa")
    ):
        return error_response(
            "Payment method must be cash or mpesa.",
            400
        )

    payment_method = payment_method.strip().lower()

    try:
        # ----------------------------------------------------
        # VALIDATE BRANCH ASSIGNMENT
        # ----------------------------------------------------

        branch = get_cashier_branch(cashier)

        if not branch:
            db.session.rollback()

            return error_response(
                "Your account has no active assigned branch. "
                "Contact the administrator.",
                403
            )

        # ----------------------------------------------------
        # VALIDATE CART LINES
        # ----------------------------------------------------

        requested_lines = []
        product_ids = set()

        for item in items:

            if not isinstance(item, dict):
                db.session.rollback()

                return error_response(
                    "Each item must be a valid object.",
                    400
                )

            raw_product_id = item.get("product_id")

            if isinstance(raw_product_id, bool):
                db.session.rollback()

                return error_response(
                    "Invalid product ID.",
                    400
                )

            try:
                product_id = int(raw_product_id)

                if product_id <= 0:
                    raise ValueError

            except (TypeError, ValueError, OverflowError):
                db.session.rollback()

                return error_response(
                    "Invalid product ID.",
                    400
                )

            quantity = validate_quantity(
                item.get("quantity")
            )

            if quantity is None:
                db.session.rollback()

                return error_response(
                    "Each quantity must be positive and contain "
                    "no more than three decimal places.",
                    400
                )

            # Default to whole-unit sales for compatibility
            # with existing cashier clients.
            raw_selling_unit = item.get("selling_unit", "unit")

            selling_unit = normalize_selling_unit(
                raw_selling_unit
            )

            if selling_unit is None:
                db.session.rollback()

                return error_response(
                    "Selling unit must be 'unit' or 'portion'.",
                    400
                )

            requested_lines.append({
                "product_id": product_id,
                "sale_quantity": quantity,
                "selling_unit": selling_unit
            })

            product_ids.add(product_id)

        # ----------------------------------------------------
        # LOCK PRODUCTS
        # ----------------------------------------------------

        sorted_product_ids = sorted(product_ids)

        products = db.session.execute(
            select(Product)
            .where(Product.id.in_(sorted_product_ids))
            .order_by(Product.id)
            .with_for_update()
        ).scalars().all()

        products_by_id = {
            product.id: product
            for product in products
        }

        if len(products_by_id) != len(sorted_product_ids):
            db.session.rollback()

            return error_response(
                "One or more products could not be found.",
                404
            )

        # ----------------------------------------------------
        # LOCK BRANCH STOCK
        # ----------------------------------------------------

        stock_rows = db.session.execute(
            select(BranchProductStock)
            .where(
                BranchProductStock.branch_id == branch.id,
                BranchProductStock.product_id.in_(
                    sorted_product_ids
                )
            )
            .order_by(BranchProductStock.product_id)
            .with_for_update()
        ).scalars().all()

        stock_by_product_id = {
            stock.product_id: stock
            for stock in stock_rows
        }

        # ----------------------------------------------------
        # VALIDATE LINES AND CALCULATE STOCK CONSUMPTION
        # ----------------------------------------------------

        total = ZERO
        validated_items = []
        stock_required_by_product = {}

        for line in requested_lines:

            product_id = line["product_id"]
            sale_quantity = line["sale_quantity"]
            selling_unit = line["selling_unit"]

            product = products_by_id[product_id]

            if not product.is_active:
                db.session.rollback()

                return error_response(
                    f"{product.name} is unavailable.",
                    400
                )

            branch_stock = stock_by_product_id.get(product_id)

            if not branch_stock:
                db.session.rollback()

                return error_response(
                    f"{product.name} has not been configured "
                    f"in the stock records for {branch.name}.",
                    409
                )

            if selling_unit == "portion":

                if not getattr(
                    product,
                    "allow_portion_sales",
                    False
                ):
                    db.session.rollback()

                    return error_response(
                        f"Portion sales are not enabled for "
                        f"{product.name}.",
                        400
                    )

                portions_per_unit = getattr(
                    product,
                    "portions_per_unit",
                    None
                )

                if (
                    isinstance(portions_per_unit, bool)
                    or not isinstance(portions_per_unit, int)
                    or portions_per_unit <= 0
                ):
                    db.session.rollback()

                    return error_response(
                        f"Portion configuration is invalid for "
                        f"{product.name}.",
                        409
                    )

                portion_price = validate_price(
                    getattr(product, "portion_price", None)
                )

                if portion_price is None or portion_price <= ZERO:
                    db.session.rollback()

                    return error_response(
                        f"A valid portion price has not been "
                        f"configured for {product.name}.",
                        409
                    )

                # Portion counts may be decimal to support the
                # application's three-decimal quantity requirement.
                price = portion_price

                stock_quantity = (
                    sale_quantity
                    / Decimal(portions_per_unit)
                )

            else:

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

                stock_quantity = sale_quantity

            # Branch stock supports three decimal places.
            stock_quantity = stock_quantity.quantize(
                QUANTITY_PLACES,
                rounding=ROUND_HALF_UP
            )

            if stock_quantity <= ZERO:
                db.session.rollback()

                return error_response(
                    f"Quantity is too small to deduct stock for "
                    f"{product.name}.",
                    400
                )

            buying_price = (
                validate_price(product.buying_price)
                if product.buying_price is not None
                else None
            )

            if (
                product.buying_price is not None
                and buying_price is None
            ):
                db.session.rollback()

                logger.error(
                    "Invalid buying price for product ID %s.",
                    product.id
                )

                return error_response(
                    "A product has an invalid stored buying price.",
                    500
                )

            # Calculate revenue using the quantity sold,
            # not the stock-equivalent quantity.
            line_total = money(price * sale_quantity)

            total += line_total

            stock_required_by_product[product_id] = (
                stock_required_by_product.get(
                    product_id,
                    ZERO
                )
                + stock_quantity
            )

            validated_items.append({
                "product": product,
                "stock": branch_stock,
                "stock_quantity": stock_quantity,
                "sale_quantity": sale_quantity,
                "selling_unit": selling_unit,
                "price": price,
                "buying_price": buying_price
            })

        total = money(total)

        # ----------------------------------------------------
        # CHECK COMBINED STOCK REQUIREMENTS
        #
        # Important: the same product can appear more than
        # once, for example as both a bottle and portions.
        # Check the combined consumption before deducting stock.
        # ----------------------------------------------------

        for product_id, required_quantity in (
            stock_required_by_product.items()
        ):

            product = products_by_id[product_id]
            branch_stock = stock_by_product_id[product_id]

            available = Decimal(
                str(branch_stock.quantity)
            )

            if available < required_quantity:
                db.session.rollback()

                return error_response(
                    f"Insufficient stock for {product.name} "
                    f"at {branch.name}. "
                    f"Available: {available:.3f}; "
                    f"required: {required_quantity:.3f}.",
                    400
                )

        # ----------------------------------------------------
        # CREATE INDEPENDENT CASHIER SALE
        # ----------------------------------------------------

        if payment_method == "cash":
            payment_status = "paid"
            sale_status = "completed"
        else:
            payment_status = "unpaid"
            sale_status = "pending"

        sale = CashierSale(
            sale_number=f"POS-{uuid.uuid4().hex[:12].upper()}",
            branch_id=branch.id,
            cashier_id=cashier.id,
            total=total,
            payment_method=payment_method,
            payment_status=payment_status,
            status=sale_status
        )

        db.session.add(sale)
        db.session.flush()

        # ----------------------------------------------------
        # SAVE SALE ITEMS
        # ----------------------------------------------------

        for item in validated_items:

            sale_item = CashierSaleItem(
                sale_id=sale.id,
                product_id=item["product"].id,

                # Stock-equivalent quantity consumed.
                quantity=item["stock_quantity"],

                # Actual quantity sold to the customer.
                sale_quantity=item["sale_quantity"],

                selling_unit=item["selling_unit"],

                # Price per selling unit.
                price=item["price"],

                # Cost per whole stock unit.
                buying_price=item["buying_price"]
            )

            db.session.add(sale_item)

        # ----------------------------------------------------
        # DEDUCT BRANCH STOCK ONCE PER PRODUCT
        # ----------------------------------------------------

        for product_id, required_quantity in (
            stock_required_by_product.items()
        ):

            branch_stock = stock_by_product_id[product_id]

            branch_stock.quantity = (
                Decimal(str(branch_stock.quantity))
                - required_quantity
            ).quantize(QUANTITY_PLACES)

        # ----------------------------------------------------
        # RECORD CASH PAYMENT
        # ----------------------------------------------------

        if payment_method == "cash":

            cash_payment = CashierSalePayment(
                sale_id=sale.id,
                payment_method="cash",
                amount=total,
                status="paid"
            )

            db.session.add(cash_payment)

        # M-Pesa initiation and callback remain separate.
        # Do not mark an M-Pesa sale paid here.

        db.session.commit()

        logger.info(
            "Cashier sale created: sale_id=%s, branch_id=%s, "
            "cashier_id=%s, payment_method=%s",
            sale.id,
            branch.id,
            cashier.id,
            payment_method
        )

        return jsonify({
            "status": "success",
            "message": (
                "Cash sale completed successfully."
                if payment_method == "cash"
                else (
                    "Sale created. Initiate M-Pesa payment "
                    "to complete the transaction."
                )
            ),
            "sale": sale.to_dict(),
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
# CANCEL A PENDING CASHIER SALE
#
# POST /api/cashier/sales/<sale_id>/cancel
# ============================================================

@cashier_sales_bp.route(
    "/sales/<int:sale_id>/cancel",
    methods=["POST"]
)
@cashier_required
def cancel_cashier_sale(sale_id):

    cashier = get_active_cashier()

    if not cashier:
        return error_response(
            "Active cashier authentication is required.",
            401
        )

    try:

        sale = db.session.execute(
            select(CashierSale)
            .where(
                CashierSale.id == sale_id,
                CashierSale.cashier_id == cashier.id
            )
            .with_for_update()
        ).scalar_one_or_none()

        if not sale:
            db.session.rollback()

            return error_response(
                "Sale not found or access denied.",
                404
            )

        if sale.payment_method != "mpesa":
            db.session.rollback()

            return error_response(
                "Only pending M-Pesa sales can be cancelled here.",
                400
            )

        if sale.status in ("completed", "cancelled", "canceled"):
            db.session.rollback()

            return error_response(
                "This sale has already been finalized.",
                409
            )

        if sale.payment_status == "paid":
            db.session.rollback()

            return error_response(
                "A paid sale cannot be cancelled.",
                409
            )

        payments = db.session.execute(
            select(CashierSalePayment)
            .where(CashierSalePayment.sale_id == sale.id)
            .with_for_update()
        ).scalars().all()

        if any(payment.status == "paid" for payment in payments):
            db.session.rollback()

            return error_response(
                "A payment has already been confirmed.",
                409
            )

        if any(payment.status == "pending" for payment in payments):
            db.session.rollback()

            return error_response(
                "An M-Pesa request is still pending. "
                "Verify its final status before cancelling.",
                409
            )

        product_ids = sorted({
            item.product_id
            for item in sale.items
        })

        stock_rows = db.session.execute(
            select(BranchProductStock)
            .where(
                BranchProductStock.branch_id == sale.branch_id,
                BranchProductStock.product_id.in_(product_ids)
            )
            .order_by(BranchProductStock.product_id)
            .with_for_update()
        ).scalars().all()

        stock_by_product_id = {
            stock.product_id: stock
            for stock in stock_rows
        }

        for item in sale.items:

            stock = stock_by_product_id.get(item.product_id)

            if not stock:
                db.session.rollback()

                logger.error(
                    "Missing branch stock for sale %s, product %s.",
                    sale.id,
                    item.product_id
                )

                return error_response(
                    "A branch stock record is missing. "
                    "Stock restoration requires review.",
                    409
                )

        # Restore the actual stock-equivalent quantity consumed.
        for item in sale.items:

            stock = stock_by_product_id[item.product_id]

            stock.quantity = (
                Decimal(str(stock.quantity))
                + Decimal(str(item.quantity))
            ).quantize(QUANTITY_PLACES)

        sale.status = "cancelled"
        sale.payment_status = "failed"

        db.session.commit()

        return jsonify({
            "status": "success",
            "message": (
                "Pending sale cancelled and branch stock restored."
            ),
            "sale": sale.to_dict()
        }), 200

    except Exception:

        db.session.rollback()

        logger.exception(
            "Failed to cancel cashier sale %s.",
            sale_id
        )

        return error_response(
            "Unable to cancel the sale. "
            "Check payment status before retrying.",
            500
        )


# ============================================================
# CHECK CASHIER SALE PAYMENT STATUS
#
# GET /api/cashier/sales/<sale_id>/payment-status
# ============================================================

@cashier_sales_bp.route(
    "/sales/<int:sale_id>/payment-status",
    methods=["GET"]
)
@cashier_required
def cashier_payment_status(sale_id):

    cashier = get_active_cashier()

    if not cashier:
        return error_response(
            "Active cashier authentication is required.",
            401
        )

    try:

        sale = db.session.execute(
            select(CashierSale).where(
                CashierSale.id == sale_id,
                CashierSale.cashier_id == cashier.id
            )
        ).scalar_one_or_none()

        if not sale:
            return error_response(
                "Sale not found or access denied.",
                404
            )

        payment = db.session.execute(
            select(CashierSalePayment)
            .where(CashierSalePayment.sale_id == sale.id)
            .order_by(
                CashierSalePayment.created_at.desc(),
                CashierSalePayment.id.desc()
            )
            .limit(1)
        ).scalar_one_or_none()

        return jsonify({
            "status": "success",
            "sale_id": sale.id,
            "sale_number": sale.sale_number,
            "branch_id": sale.branch_id,
            "sale_status": sale.status,
            "payment_status": sale.payment_status,

            "transaction_status": (
                payment.status
                if payment
                else "not_initiated"
            ),

            "checkout_request_id": (
                payment.checkout_request_id
                if payment
                else None
            ),

            "mpesa_receipt_number": (
                payment.mpesa_receipt_number
                if payment
                else None
            ),

            "phone_number": (
                payment.phone_number
                if payment
                else None
            ),

            "amount": (
                float(payment.amount)
                if payment
                else float(sale.total)
            ),

            "message": (
                payment.result_description
                if payment
                else "No payment record was found."
            )
        }), 200

    except Exception:

        logger.exception(
            "Failed to retrieve payment status for sale %s.",
            sale_id
        )

        return error_response(
            "Unable to retrieve payment status.",
            500
        )


# ============================================================
# CASHIER SALES HISTORY
#
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

        query = CashierSale.query.filter(
            CashierSale.cashier_id == cashier.id
        )

        start_date = request.args.get("start_date")
        end_date = request.args.get("end_date")

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
                CashierSale.created_at >= start_datetime
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
                CashierSale.created_at < end_datetime
            )

        query = query.order_by(
            CashierSale.created_at.desc(),
            CashierSale.id.desc()
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