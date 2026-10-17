import logging
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify, request, g
from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from extensions import db
from admin_auth import admin_required

from models.cashier_sale import CashierSale, CashierSaleItem
from models.cashier_sale_payment import CashierSalePayment
from models.cashier_sale_audit import CashierSaleAudit
from models.branch import Branch
from models.branch_product_stock import BranchProductStock
from models.product import Product


# ============================================================
# BLUEPRINT AND CONFIGURATION
# ============================================================

admin_pos_sales_bp = Blueprint(
    "admin_pos_sales_bp",
    __name__,
)

logger = logging.getLogger(__name__)

CENT = Decimal("0.01")
ZERO = Decimal("0.00")
MAX_REASON_LENGTH = 2000


# ============================================================
# HELPERS
# ============================================================

def money(value):
    """Convert a value to a two-decimal-place Decimal."""
    try:
        result = Decimal(
            str(value if value is not None else "0.00")
        )

        if not result.is_finite():
            raise InvalidOperation

        return result.quantize(CENT)

    except (InvalidOperation, ValueError, TypeError):
        raise ValueError("Invalid monetary value.")


def json_money(value):
    """Convert monetary values into JSON-compatible numbers."""
    return float(money(value))


def normalize(value):
    """Normalize strings for case-insensitive comparisons."""
    return value.strip().lower() if isinstance(value, str) else ""


def error_response(message, status_code):
    """Return a consistent JSON error response."""
    return jsonify({
        "status": "error",
        "message": message,
    }), status_code


def get_admin_username():
    """Return the authenticated administrator's username."""
    admin = getattr(g, "admin", None)

    if not isinstance(admin, dict):
        return None

    username = admin.get("username")

    if not isinstance(username, str) or not username.strip():
        return None

    return username.strip()


def validate_reason(data):
    """Validate the reason supplied for an administrative action."""
    reason = data.get("reason")

    if not isinstance(reason, str) or not reason.strip():
        return None, "A reason is required."

    reason = reason.strip()

    if len(reason) > MAX_REASON_LENGTH:
        return None, (
            f"The reason must not exceed "
            f"{MAX_REASON_LENGTH} characters."
        )

    return reason, None


def sale_snapshot(sale):
    """
    Create a detailed snapshot of a POS sale.

    This deliberately serializes CashierSale records rather than
    website Order records.
    """
    return {
        "id": sale.id,
        "sale_number": sale.sale_number,
        "branch_id": sale.branch_id,
        "branch_name": (
            sale.branch.name
            if sale.branch is not None
            else None
        ),
        "cashier_id": sale.cashier_id,
        "cashier_name": (
            sale.cashier.full_name
            if sale.cashier is not None
            else None
        ),
        "total": json_money(sale.total),
        "payment_method": sale.payment_method,
        "payment_status": sale.payment_status,
        "status": sale.status,
        "items": [
            {
                "id": item.id,
                "product_id": item.product_id,
                "product_name": (
                    item.product.name
                    if item.product is not None
                    else None
                ),
                "quantity": item.quantity,
                "price": json_money(item.price),
                "buying_price": (
                    json_money(item.buying_price)
                    if item.buying_price is not None
                    else None
                ),
                "subtotal": json_money(
                    money(item.price) * item.quantity
                ),
            }
            for item in sale.items
        ],
        "payments": [
            {
                "id": payment.id,
                "payment_method": payment.payment_method,
                "amount": json_money(payment.amount),
                "status": payment.status,
                "mpesa_receipt_number": (
                    payment.mpesa_receipt_number
                ),
                "created_at": (
                    payment.created_at.isoformat()
                    if payment.created_at is not None
                    else None
                ),
            }
            for payment in sale.payments
        ],
    }


def lock_sale(sale_id):
    """Lock a sale row while an administrative change is performed."""
    statement = (
        select(CashierSale)
        .where(CashierSale.id == sale_id)
        .options(
            selectinload(CashierSale.items)
            .selectinload(CashierSaleItem.product),
            selectinload(CashierSale.payments),
            selectinload(CashierSale.branch),
            selectinload(CashierSale.cashier),
        )
        .with_for_update()
    )

    return db.session.execute(
        statement
    ).scalar_one_or_none()


def lock_branch_stock(branch_id, product_ids):
    """
    Lock branch-specific stock records in product-ID order.

    Inventory is taken from BranchProductStock, not Product.stock.
    """
    if not product_ids:
        return {}

    statement = (
        select(BranchProductStock)
        .where(
            BranchProductStock.branch_id == branch_id,
            BranchProductStock.product_id.in_(
                sorted(set(product_ids))
            ),
        )
        .order_by(BranchProductStock.product_id)
        .with_for_update()
    )

    records = db.session.execute(
        statement
    ).scalars().all()

    return {
        record.product_id: record
        for record in records
    }


def payment_is_successful(payment):
    """Identify payment records indicating successful payment."""
    return normalize(payment.status) in {
        "paid",
        "success",
        "successful",
        "completed",
    }


def sale_has_successful_payment(sale):
    """Check whether the sale has a successful payment record."""
    return any(
        payment_is_successful(payment)
        for payment in sale.payments
    )


def audit_sale(
    sale,
    username,
    action,
    reason,
    before_data,
    after_data,
):
    """Record an administrator action in the sale audit history."""
    db.session.add(
        CashierSaleAudit(
            sale_id=sale.id,
            admin_username=username,
            action=action,
            reason=reason,
            before_data=before_data,
            after_data=after_data,
        )
    )


def validate_sale_id(sale_id):
    """Reject invalid sale identifiers."""
    if isinstance(sale_id, bool) or sale_id <= 0:
        return error_response("Invalid POS sale ID.", 400)

    return None


# ============================================================
# LIST POS SALES
#
# GET /api/admin/pos-sales
# ============================================================

@admin_pos_sales_bp.route(
    "/api/admin/pos-sales",
    methods=["GET"],
)
@admin_required
def list_pos_sales():
    try:
        query = CashierSale.query

        search = request.args.get("search", "").strip()
        status = request.args.get("status", "").strip().lower()

        branch_id = request.args.get("branch_id", type=int)
        cashier_id = request.args.get("cashier_id", type=int)

        start_date = request.args.get("start_date")
        end_date = request.args.get("end_date")

        # ----------------------------------------------------
        # SEARCH
        # ----------------------------------------------------

        if search:
            pattern = f"%{search}%"

            query = (
                query
                .join(
                    CashierSale.branch
                )
                .join(
                    CashierSale.cashier
                )
                .filter(
                    or_(
                        CashierSale.sale_number.ilike(pattern),
                        Branch.name.ilike(pattern),
                        CashierSale.cashier.has(
                            or_(
                                # Include cashier full names.
                                # Adjust the username field if your
                                # Cashier model uses another name.
                                CashierSale.cashier.property.mapper
                                .class_.full_name.ilike(pattern),
                            )
                        ),
                    )
                )
            )

        # ----------------------------------------------------
        # FILTERS
        # ----------------------------------------------------

        if status:
            query = query.filter(
                func.lower(CashierSale.status) == status
            )

        if branch_id is not None:
            if branch_id <= 0:
                return error_response(
                    "branch_id must be a positive integer.",
                    400,
                )

            query = query.filter(
                CashierSale.branch_id == branch_id
            )

        if cashier_id is not None:
            if cashier_id <= 0:
                return error_response(
                    "cashier_id must be a positive integer.",
                    400,
                )

            query = query.filter(
                CashierSale.cashier_id == cashier_id
            )

        # ----------------------------------------------------
        # DATE FILTERS
        # ----------------------------------------------------

        if start_date:
            try:
                start = datetime.strptime(
                    start_date,
                    "%Y-%m-%d",
                )
            except ValueError:
                return error_response(
                    "Invalid start_date. Use YYYY-MM-DD.",
                    400,
                )

            query = query.filter(
                CashierSale.created_at >= start
            )

        if end_date:
            try:
                end = datetime.strptime(
                    end_date,
                    "%Y-%m-%d",
                )
            except ValueError:
                return error_response(
                    "Invalid end_date. Use YYYY-MM-DD.",
                    400,
                )

            query = query.filter(
                CashierSale.created_at
                < end + timedelta(days=1)
            )

        if start_date and end_date and start_date > end_date:
            return error_response(
                "start_date cannot be later than end_date.",
                400,
            )

        # ----------------------------------------------------
        # PAGINATION
        # ----------------------------------------------------

        page = request.args.get(
            "page",
            default=1,
            type=int,
        )

        per_page = request.args.get(
            "per_page",
            default=50,
            type=int,
        )

        if page < 1 or per_page < 1:
            return error_response(
                "page and per_page must be positive integers.",
                400,
            )

        per_page = min(per_page, 200)

        pagination = (
            query
            .order_by(
                CashierSale.created_at.desc(),
                CashierSale.id.desc(),
            )
            .paginate(
                page=page,
                per_page=per_page,
                error_out=False,
            )
        )

        return jsonify({
            "status": "success",
            "sales": [
                sale.to_dict()
                for sale in pagination.items
            ],
            "pagination": {
                "page": pagination.page,
                "per_page": pagination.per_page,
                "total": pagination.total,
                "pages": pagination.pages,
            },
        }), 200

    except Exception:
        db.session.rollback()

        logger.exception(
            "Failed to list POS sales."
        )

        return error_response(
            "Unable to retrieve POS sales.",
            500,
        )


# ============================================================
# GET POS SALE DETAILS AND AUDIT HISTORY
#
# GET /api/admin/pos-sales/<int:sale_id>
# ============================================================

@admin_pos_sales_bp.route(
    "/api/admin/pos-sales/<int:sale_id>",
    methods=["GET"],
)
@admin_required
def get_pos_sale(sale_id):
    try:
        validation_error = validate_sale_id(sale_id)

        if validation_error:
            return validation_error

        sale = db.session.execute(
            select(CashierSale)
            .where(CashierSale.id == sale_id)
            .options(
                selectinload(CashierSale.items)
                .selectinload(CashierSaleItem.product),
                selectinload(CashierSale.payments),
                selectinload(CashierSale.branch),
                selectinload(CashierSale.cashier),
            )
        ).scalar_one_or_none()

        if sale is None:
            return error_response(
                "POS sale not found.",
                404,
            )

        audits = (
            CashierSaleAudit.query
            .filter_by(sale_id=sale.id)
            .order_by(
                CashierSaleAudit.created_at.desc(),
                CashierSaleAudit.id.desc(),
            )
            .all()
        )

        return jsonify({
            "status": "success",
            "sale": sale_snapshot(sale),
            "audit_history": [
                audit.to_dict()
                for audit in audits
            ],
        }), 200

    except Exception:
        db.session.rollback()

        logger.exception(
            "Failed to retrieve POS sale %s.",
            sale_id,
        )

        return error_response(
            "Unable to retrieve POS sale details.",
            500,
        )


# ============================================================
# EDIT POS SALE
#
# PUT /api/admin/pos-sales/<int:sale_id>
#
# Request:
#
# {
#     "reason": "Corrected quantities",
#     "items": [
#         {"product_id": 1, "quantity": 2},
#         {"product_id": 4, "quantity": 3}
#     ]
# }
#
# Editing replaces the sale's item lines.
# It does not modify website orders.
# ============================================================

@admin_pos_sales_bp.route(
    "/api/admin/pos-sales/<int:sale_id>",
    methods=["PUT"],
)
@admin_required
def edit_pos_sale(sale_id):
    validation_error = validate_sale_id(sale_id)

    if validation_error:
        return validation_error

    username = get_admin_username()

    if not username:
        return error_response(
            "Unable to verify the authenticated administrator.",
            401,
        )

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return error_response(
            "A valid JSON request body is required.",
            400,
        )

    reason, reason_error = validate_reason(data)

    if reason_error:
        return error_response(
            reason_error,
            400,
        )

    requested_items = data.get("items")

    if not isinstance(requested_items, list) or not requested_items:
        return error_response(
            "The sale must contain at least one item.",
            400,
        )

    # --------------------------------------------------------
    # VALIDATE AND COMBINE REQUESTED QUANTITIES
    # --------------------------------------------------------

    combined_quantities = {}

    for entry in requested_items:
        if not isinstance(entry, dict):
            return error_response(
                "Every item must be an object.",
                400,
            )

        product_id = entry.get("product_id")
        quantity = entry.get("quantity")

        if (
            isinstance(product_id, bool)
            or not isinstance(product_id, int)
            or product_id <= 0
        ):
            return error_response(
                "Each product_id must be a positive integer.",
                400,
            )

        if (
            isinstance(quantity, bool)
            or not isinstance(quantity, int)
            or quantity <= 0
        ):
            return error_response(
                "Each quantity must be a positive integer.",
                400,
            )

        combined_quantities[product_id] = (
            combined_quantities.get(product_id, 0)
            + quantity
        )

    try:
        # ----------------------------------------------------
        # LOCK AND VALIDATE SALE
        # ----------------------------------------------------

        sale = lock_sale(sale_id)

        if sale is None:
            return error_response(
                "POS sale not found.",
                404,
            )

        if normalize(sale.status) in {
            "voided",
            "cancelled",
            "canceled",
        }:
            return error_response(
                "A voided or cancelled sale cannot be edited.",
                409,
            )

        if normalize(sale.status) != "completed":
            return error_response(
                "Only completed POS sales can be edited.",
                409,
            )

        if sale_has_successful_payment(sale):
            return error_response(
                "This sale has a successful payment record. "
                "Its payment cannot be silently changed. "
                "Use an appropriate payment-adjustment workflow.",
                409,
            )

        if normalize(sale.payment_status) == "paid":
            return error_response(
                "Paid sales cannot be edited without a "
                "payment-adjustment workflow.",
                409,
            )

        branch = db.session.get(
            Branch,
            sale.branch_id,
        )

        if branch is None:
            return error_response(
                "The sale's branch could not be found.",
                409,
            )

        # ----------------------------------------------------
        # CALCULATE ORIGINAL QUANTITIES
        # ----------------------------------------------------

        original_items = list(sale.items)

        old_quantities = {}

        for item in original_items:
            old_quantities[item.product_id] = (
                old_quantities.get(item.product_id, 0)
                + item.quantity
            )

        affected_product_ids = sorted(
            set(old_quantities)
            | set(combined_quantities)
        )

        # ----------------------------------------------------
        # LOCK PRODUCTS
        # ----------------------------------------------------

        products = db.session.execute(
            select(Product)
            .where(
                Product.id.in_(affected_product_ids)
            )
            .order_by(Product.id)
            .with_for_update()
        ).scalars().all()

        products_by_id = {
            product.id: product
            for product in products
        }

        missing_products = [
            product_id
            for product_id in combined_quantities
            if product_id not in products_by_id
        ]

        if missing_products:
            return error_response(
                "One or more selected products no longer exist.",
                409,
            )

        # ----------------------------------------------------
        # LOCK BRANCH-SPECIFIC STOCK
        # ----------------------------------------------------

        stock_by_product = lock_branch_stock(
            sale.branch_id,
            affected_product_ids,
        )

        for product_id in old_quantities:
            if product_id not in stock_by_product:
                return error_response(
                    "Branch stock is missing for an existing "
                    "sale item. Resolve the inventory "
                    "discrepancy before editing.",
                    409,
                )

        # ----------------------------------------------------
        # CALCULATE STOCK CHANGES
        #
        # Positive delta restores stock.
        # Negative delta consumes additional stock.
        # ----------------------------------------------------

        stock_changes = {}

        for product_id in affected_product_ids:
            old_quantity = old_quantities.get(
                product_id,
                0,
            )

            new_quantity = combined_quantities.get(
                product_id,
                0,
            )

            delta = old_quantity - new_quantity

            stock = stock_by_product.get(product_id)

            if delta < 0:
                if stock is None:
                    return error_response(
                        "Branch stock is missing for a "
                        "newly added product.",
                        409,
                    )

                if stock.quantity < abs(delta):
                    product = products_by_id[product_id]

                    return error_response(
                        f"Insufficient branch stock for "
                        f"{product.name}.",
                        409,
                    )

            if delta != 0:
                stock_changes[product_id] = delta

        # ----------------------------------------------------
        # CAPTURE BEFORE SNAPSHOT
        # ----------------------------------------------------

        before_data = sale_snapshot(sale)

        # ----------------------------------------------------
        # BUILD REPLACEMENT ITEMS
        # ----------------------------------------------------

        new_total = ZERO
        new_items = []

        for product_id, quantity in sorted(
            combined_quantities.items()
        ):
            product = products_by_id[product_id]

            if getattr(product, "is_active", True) is False:
                return error_response(
                    f"{product.name} is inactive and cannot "
                    "be added to an edited sale.",
                    409,
                )

            try:
                selling_price = money(product.price)

                if selling_price < ZERO:
                    return error_response(
                        f"The selling price for {product.name} "
                        "cannot be negative.",
                        409,
                    )

                buying_price = (
                    money(product.buying_price)
                    if product.buying_price is not None
                    else None
                )

                if (
                    buying_price is not None
                    and buying_price < ZERO
                ):
                    return error_response(
                        f"The buying price for {product.name} "
                        "cannot be negative.",
                        409,
                    )

            except ValueError:
                return error_response(
                    f"The price configuration for "
                    f"{product.name} is invalid.",
                    409,
                )

            new_total += selling_price * quantity

            new_items.append(
                CashierSaleItem(
                    product_id=product_id,
                    quantity=quantity,
                    price=selling_price,
                    buying_price=buying_price,
                )
            )

        new_total = new_total.quantize(CENT)

        # ----------------------------------------------------
        # APPLY STOCK CHANGES
        # ----------------------------------------------------

        for product_id, delta in stock_changes.items():
            stock = stock_by_product.get(product_id)

            if stock is None:
                stock = BranchProductStock(
                    branch_id=sale.branch_id,
                    product_id=product_id,
                    quantity=0,
                )

                db.session.add(stock)

                stock_by_product[product_id] = stock

            stock.quantity += delta

            if stock.quantity < 0:
                db.session.rollback()

                return error_response(
                    "The edit would make branch stock negative.",
                    409,
                )

        # ----------------------------------------------------
        # REPLACE SALE ITEMS
        # ----------------------------------------------------

        sale.items.clear()

        db.session.flush()

        for item in new_items:
            sale.items.append(item)

        sale.total = new_total

        db.session.flush()

        # ----------------------------------------------------
        # AUDIT AND COMMIT
        # ----------------------------------------------------

        after_data = sale_snapshot(sale)

        audit_sale(
            sale=sale,
            username=username,
            action="edited",
            reason=reason,
            before_data=before_data,
            after_data=after_data,
        )

        db.session.commit()

        return jsonify({
            "status": "success",
            "message": "POS sale updated successfully.",
            "sale": sale_snapshot(sale),
        }), 200

    except IntegrityError:
        db.session.rollback()

        logger.exception(
            "Database constraint failure editing POS sale %s.",
            sale_id,
        )

        return error_response(
            "The sale could not be updated because of a "
            "database constraint. No changes were saved.",
            409,
        )

    except Exception:
        db.session.rollback()

        logger.exception(
            "Failed to edit POS sale %s.",
            sale_id,
        )

        return error_response(
            "Unable to update the POS sale. "
            "No changes were saved.",
            500,
        )


# ============================================================
# VOID POS SALE
#
# POST /api/admin/pos-sales/<int:sale_id>/void
#
# Request:
# {
#     "reason": "Duplicate transaction"
# }
#
# Voiding is not a refund.
# Payment records are preserved.
# ============================================================

@admin_pos_sales_bp.route(
    "/api/admin/pos-sales/<int:sale_id>/void",
    methods=["POST"],
)
@admin_required
def void_pos_sale(sale_id):
    validation_error = validate_sale_id(sale_id)

    if validation_error:
        return validation_error

    username = get_admin_username()

    if not username:
        return error_response(
            "Unable to verify the authenticated administrator.",
            401,
        )

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return error_response(
            "A valid JSON request body is required.",
            400,
        )

    reason, reason_error = validate_reason(data)

    if reason_error:
        return error_response(
            reason_error,
            400,
        )

    try:
        # ----------------------------------------------------
        # LOCK AND VALIDATE SALE
        # ----------------------------------------------------

        sale = lock_sale(sale_id)

        if sale is None:
            return error_response(
                "POS sale not found.",
                404,
            )

        if normalize(sale.status) in {
            "voided",
            "cancelled",
            "canceled",
        }:
            return error_response(
                "This sale has already been voided or cancelled.",
                409,
            )

        if normalize(sale.status) != "completed":
            return error_response(
                "Only completed POS sales can be voided.",
                409,
            )

        before_data = sale_snapshot(sale)

        # ----------------------------------------------------
        # CALCULATE QUANTITIES TO RESTORE
        # ----------------------------------------------------

        old_quantities = {}

        for item in sale.items:
            old_quantities[item.product_id] = (
                old_quantities.get(item.product_id, 0)
                + item.quantity
            )

        product_ids = sorted(old_quantities)

        stock_by_product = lock_branch_stock(
            sale.branch_id,
            product_ids,
        )

        missing_stock = [
            product_id
            for product_id in product_ids
            if product_id not in stock_by_product
        ]

        if missing_stock:
            return error_response(
                "Stock could not be restored because one or "
                "more branch stock records are missing. "
                "Resolve the inventory discrepancy before "
                "voiding this sale.",
                409,
            )

        # ----------------------------------------------------
        # RESTORE BRANCH STOCK
        # ----------------------------------------------------

        for product_id in product_ids:
            stock = stock_by_product[product_id]

            stock.quantity += old_quantities[product_id]

        # ----------------------------------------------------
        # MARK SALE AS VOIDED
        # ----------------------------------------------------

        sale.status = "voided"

        # Do not mark payments as refunded.
        # Preserve all payment records for reconciliation.

        db.session.flush()

        after_data = sale_snapshot(sale)

        audit_sale(
            sale=sale,
            username=username,
            action="voided",
            reason=reason,
            before_data=before_data,
            after_data=after_data,
        )

        # Calculate before commit so the response reflects
        # the payment records associated with this sale.
        has_successful_payment = sale_has_successful_payment(
            sale
        )

        db.session.commit()

        return jsonify({
            "status": "success",
            "message": (
                "POS sale voided and branch stock restored. "
                "Payment records were preserved."
            ),
            "sale": sale_snapshot(sale),
            "refund_required_review": has_successful_payment,
            "payment_notice": (
                "This sale has a successful payment record. "
                "Voiding did not issue or confirm a refund. "
                "Reconcile the payment separately."
                if has_successful_payment
                else (
                    "No successful payment record was "
                    "identified. Verify the payment status "
                    "before closing reconciliation."
                )
            ),
        }), 200

    except IntegrityError:
        db.session.rollback()

        logger.exception(
            "Database constraint failure voiding POS sale %s.",
            sale_id,
        )

        return error_response(
            "The sale could not be voided because of a "
            "database constraint. No changes were saved.",
            409,
        )

    except Exception:
        db.session.rollback()

        logger.exception(
            "Failed to void POS sale %s.",
            sale_id,
        )

        return error_response(
            "Unable to void the POS sale. "
            "No changes were saved.",
            500,
        )
