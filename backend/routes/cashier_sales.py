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
from models.stock_batch import StockBatch
from models.stock_batch_allocation import StockBatchAllocation

from cashier_auth import cashier_required


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
# GENERAL HELPERS
# ============================================================

def error_response(message, status_code):
    return jsonify({
        "status": "error",
        "message": message
    }), status_code


def decimal_value(value):
    if isinstance(value, bool) or value is None:
        return None

    try:
        result = Decimal(str(value).strip())

        if not result.is_finite():
            return None

        return result

    except (
        InvalidOperation,
        ValueError,
        TypeError,
        AttributeError
    ):
        return None


def validate_quantity(value):
    quantity = decimal_value(value)

    if quantity is None or quantity <= ZERO:
        return None

    if quantity != quantity.quantize(QUANTITY_PLACES):
        return None

    return quantity.quantize(QUANTITY_PLACES)


def validate_price(value):
    price = decimal_value(value)

    if price is None or price < ZERO:
        return None

    if price != price.quantize(MONEY_PLACES):
        return None

    return price.quantize(MONEY_PLACES)


def money(value):
    return Decimal(str(value)).quantize(
        MONEY_PLACES,
        rounding=ROUND_HALF_UP
    )


def get_active_cashier():
    cashier = getattr(g, "cashier", None)

    if not cashier or not cashier.is_active:
        return None

    return cashier


def get_cashier_branch(cashier):
    if not cashier.branch_id:
        return None

    return db.session.execute(
        select(Branch).where(
            Branch.id == cashier.branch_id,
            Branch.is_active.is_(True)
        )
    ).scalar_one_or_none()


def get_sale_for_cashier(sale_id, cashier):
    return db.session.execute(
        select(CashierSale).where(
            CashierSale.id == sale_id,
            CashierSale.cashier_id == cashier.id
        )
    ).scalar_one_or_none()


def normalize_selling_unit(value):
    if not isinstance(value, str):
        return None

    value = value.strip().lower()

    if value in ("unit", "whole", "whole_unit"):
        return "unit"

    if value in ("portion", "portions"):
        return "portion"

    return None


# ============================================================
# FIFO STOCK BATCH ALLOCATION
# ============================================================

def allocate_stock_from_batches(
    sale_item,
    branch_id,
    product,
    required_quantity,
    selling_unit,
    sale_quantity,
    selling_price,
    branch_stock_quantity,
    cashier_id
):
    """
    Consume stock from the oldest available batches first.

    Every allocation records:
      - Original batch
      - Quantity consumed
      - Original batch buying price
      - Original batch selling price
      - Revenue attributable to the allocation
      - Cost attributable to the allocation

    All operations run inside the parent sale transaction.
    """

    required_quantity = Decimal(str(required_quantity))

    batches = db.session.execute(
        select(StockBatch)
        .where(
            StockBatch.branch_id == branch_id,
            StockBatch.product_id == product.id,
            StockBatch.remaining_quantity > ZERO
        )
        .order_by(
            StockBatch.created_at.asc(),
            StockBatch.id.asc()
        )
        .with_for_update()
    ).scalars().all()

    available = sum(
        (
            Decimal(str(batch.remaining_quantity))
            for batch in batches
        ),
        ZERO
    )

    # Backward-compatible migration for live installations:
    # branch stock may pre-date batch tracking. Convert only the
    # untracked balance into a clearly labelled batch, without
    # changing BranchProductStock or creating a second stock-in.
    #
    # Existing batches and their historical prices remain untouched.
    branch_available = Decimal(str(branch_stock_quantity or ZERO)).quantize(
        QUANTITY_PLACES
    )

    if available > branch_available:
        raise ValueError(
            f"Batch records for {product.name} exceed its branch stock. "
            "Stock reconciliation is required before this sale."
        )

    if available < required_quantity:
        if branch_available < required_quantity:
            raise ValueError(
                f"Insufficient branch stock for {product.name}. "
                f"Available: {branch_available:.3f}; "
                f"required: {required_quantity:.3f}."
            )

        if available > branch_available:
            raise ValueError(
                f"Batch records for {product.name} exceed its branch stock. "
                "Stock reconciliation is required before this sale."
            )

        untracked_quantity = (
            branch_available - available
        ).quantize(QUANTITY_PLACES)

        if untracked_quantity < (required_quantity - available):
            raise ValueError(
                f"Legacy stock reconciliation failed for {product.name}. "
                "No sale changes were saved."
            )

        legacy_buying_price = validate_price(
            getattr(product, "buying_price", None)
        )
        legacy_selling_price = validate_price(
            getattr(product, "price", None)
        )

        # Legacy stock has no verified receipt-level cost. Never treat
        # the current catalogue BP as historical. A zero placeholder is
        # stored only to satisfy the non-null batch schema; cost_is_known
        # explicitly excludes it from COGS and profit calculations.
        if legacy_selling_price is None:
            raise ValueError(
                f"{product.name} has legacy stock without batch records, "
                "but its catalogue selling price is invalid."
            )

        legacy_reference = (
            f"LEGACY-SALE-{uuid.uuid4().hex[:12].upper()}"
        )

        legacy_batch = StockBatch(
            reference=legacy_reference,
            product_id=product.id,
            branch_id=branch_id,
            cashier_id=cashier_id,
            quantity_received=untracked_quantity,
            remaining_quantity=untracked_quantity,
            buying_price=legacy_buying_price or ZERO,
            selling_price=legacy_selling_price,
            cost_is_known=False,
            supplier_reference=(
                "LEGACY_CONVERSION;SOURCE:PRE_BATCH_BRANCH_STOCK;"
                "COST:UNKNOWN"
            ),
            notes=(
                "Legacy branch stock converted to batch tracking "
                "during a cashier sale. Existing branch stock was "
                "not increased. Historical buying cost is unknown; "
                "the zero BP is a schema placeholder, not a cost. "
                f"Conversion initiated by cashier #{cashier_id}."
            ),
        )

        db.session.add(legacy_batch)
        db.session.flush()

        batches.append(legacy_batch)
        available += untracked_quantity

        logger.info(
            "Converted legacy stock to batch: product_id=%s, "
            "branch_id=%s, batch_id=%s, quantity=%s, cashier_id=%s",
            product.id,
            branch_id,
            legacy_batch.id,
            untracked_quantity,
            cashier_id,
        )

    remaining = required_quantity
    allocations = []

    for batch in batches:
        if remaining <= ZERO:
            break

        batch_available = Decimal(
            str(batch.remaining_quantity)
        )

        if batch_available <= ZERO:
            continue

        allocated_quantity = min(
            batch_available,
            remaining
        ).quantize(QUANTITY_PLACES)

        batch_buying_price = validate_price(
            batch.buying_price
        )

        batch_selling_price = validate_price(
            batch.selling_price
        )

        if batch_buying_price is None:
            raise ValueError(
                f"Batch {batch.id} has an invalid buying price."
            )

        if batch_selling_price is None:
            raise ValueError(
                f"Batch {batch.id} has an invalid selling price."
            )

        cost = money(
            batch_buying_price * allocated_quantity
        )

        # Whole-unit sales use the selling price stored
        # on the actual stock batch.
        #
        # Portion sales use the configured portion price.
        # Revenue is calculated using customer-facing
        # quantity, not stock-equivalent quantity.
        if selling_unit == "portion":
            allocation_revenue = money(
                selling_price
                * (
                    sale_quantity
                    * allocated_quantity
                    / required_quantity
                )
            )
        else:
            allocation_revenue = money(
                batch_selling_price * allocated_quantity
            )

        allocation = StockBatchAllocation(
            batch_id=batch.id,
            sale_item_id=sale_item.id,
            quantity=allocated_quantity,
            buying_price=batch_buying_price,
            selling_price=batch_selling_price,
            revenue=allocation_revenue,
            cost=(cost if getattr(batch, "cost_is_known", True) else ZERO),
            gross_profit=(
                money(allocation_revenue - cost)
                if getattr(batch, "cost_is_known", True)
                else allocation_revenue
            ),
            cost_is_known=bool(getattr(batch, "cost_is_known", True))
        )

        db.session.add(allocation)

        batch.remaining_quantity = (
            batch_available - allocated_quantity
        ).quantize(QUANTITY_PLACES)

        allocations.append(allocation)

        remaining = (
            remaining - allocated_quantity
        ).quantize(QUANTITY_PLACES)

    if remaining > ZERO:
        raise ValueError(
            f"Unable to allocate the complete quantity "
            f"for {product.name}."
        )

    return allocations


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
        # BRANCH
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
        # VALIDATE CART
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

            selling_unit = normalize_selling_unit(
                item.get("selling_unit", "unit")
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

        sorted_product_ids = sorted(product_ids)

        # ----------------------------------------------------
        # LOCK PRODUCTS
        # ----------------------------------------------------

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
        # VALIDATE QUANTITIES AND PRICES
        # ----------------------------------------------------

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

            # -----------------------------------------------
            # PORTION SALES
            # -----------------------------------------------

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

                price = validate_price(
                    getattr(product, "portion_price", None)
                )

                if price is None or price <= ZERO:
                    db.session.rollback()

                    return error_response(
                        f"A valid portion price has not been "
                        f"configured for {product.name}.",
                        409
                    )

                stock_quantity = (
                    sale_quantity / Decimal(portions_per_unit)
                )

            # -----------------------------------------------
            # WHOLE-UNIT SALES
            # -----------------------------------------------

            else:

                # The final selling price is taken from the
                # FIFO batches, not the current catalogue price.
                price = None
                stock_quantity = sale_quantity

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

            stock_required_by_product[product_id] = (
                stock_required_by_product.get(product_id, ZERO)
                + stock_quantity
            )

            validated_items.append({
                "product": product,
                "stock": branch_stock,
                "stock_quantity": stock_quantity,
                "sale_quantity": sale_quantity,
                "selling_unit": selling_unit,
                "price": price
            })

        # ----------------------------------------------------
        # CHECK COMBINED BRANCH STOCK
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
        # CREATE SALE
        # ----------------------------------------------------

        payment_status = (
            "paid" if payment_method == "cash" else "unpaid"
        )

        sale_status = (
            "completed" if payment_method == "cash" else "pending"
        )

        sale = CashierSale(
            sale_number=f"POS-{uuid.uuid4().hex[:12].upper()}",
            branch_id=branch.id,
            cashier_id=cashier.id,
            total=ZERO,
            payment_method=payment_method,
            payment_status=payment_status,
            status=sale_status
        )

        db.session.add(sale)
        db.session.flush()

        # ----------------------------------------------------
        # CREATE ITEMS AND CONSUME FIFO BATCHES
        # ----------------------------------------------------

        total = ZERO

        for item in validated_items:

            product = item["product"]

            sale_item = CashierSaleItem(
                sale_id=sale.id,
                product_id=product.id,
                quantity=item["stock_quantity"],
                sale_quantity=item["sale_quantity"],
                selling_unit=item["selling_unit"],
                price=(
                    item["price"]
                    if item["price"] is not None
                    else ZERO
                ),
                buying_price=None
            )

            db.session.add(sale_item)
            db.session.flush()

            allocations = allocate_stock_from_batches(
                sale_item=sale_item,
                branch_id=branch.id,
                product=product,
                required_quantity=item["stock_quantity"],
                selling_unit=item["selling_unit"],
                sale_quantity=item["sale_quantity"],
                selling_price=(
                    item["price"]
                    if item["price"] is not None
                    else ZERO
                ),
                branch_stock_quantity=item["stock"].quantity,
                cashier_id=cashier.id
            )

            # -----------------------------------------------
            # CALCULATE ITEM REVENUE AND COST FROM ALLOCATIONS
            # -----------------------------------------------

            item_revenue = sum(
                (
                    Decimal(str(allocation.revenue))
                    for allocation in allocations
                ),
                ZERO
            )

            item_cost = sum(
                (
                    Decimal(str(allocation.cost))
                    for allocation in allocations
                ),
                ZERO
            )

            item_revenue = money(item_revenue)
            item_cost = money(item_cost)

            # Store weighted average batch prices on the
            # sale item for backward-compatible sale records.
            allocated_quantity = sum(
                (
                    Decimal(str(allocation.quantity))
                    for allocation in allocations
                ),
                ZERO
            )

            if allocated_quantity > ZERO and all(
                bool(getattr(allocation, "cost_is_known", True))
                for allocation in allocations
            ):
                sale_item.buying_price = money(
                    item_cost / allocated_quantity
                )
            else:
                sale_item.buying_price = None

            if item["selling_unit"] == "unit":
                sale_item.price = money(
                    item_revenue / item["sale_quantity"]
                )
            else:
                sale_item.price = item["price"]

            total += item_revenue

        total = money(total)
        sale.total = total

        # ----------------------------------------------------
        # DEDUCT BRANCH STOCK
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
        # CASH PAYMENT
        # ----------------------------------------------------

        if payment_method == "cash":

            db.session.add(
                CashierSalePayment(
                    sale_id=sale.id,
                    payment_method="cash",
                    amount=total,
                    status="paid"
                )
            )

        # M-Pesa payment initiation and callback remain separate.

        db.session.commit()

        logger.info(
            "Cashier sale created: sale_id=%s, branch_id=%s, "
            "cashier_id=%s, payment_method=%s, total=%s",
            sale.id,
            branch.id,
            cashier.id,
            payment_method,
            total
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

    except ValueError as exc:

        db.session.rollback()

        logger.warning(
            "Cashier sale validation failed: %s",
            str(exc)
        )

        return error_response(str(exc), 409)

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

            if item.product_id not in stock_by_product_id:
                db.session.rollback()

                return error_response(
                    "A branch stock record is missing. "
                    "Stock restoration requires review.",
                    409
                )

        # ----------------------------------------------------
        # RESTORE THE ORIGINAL BATCHES
        # ----------------------------------------------------

        for item in sale.items:

            allocations = db.session.execute(
                select(StockBatchAllocation)
                .where(
                    StockBatchAllocation.sale_item_id == item.id
                )
                .with_for_update()
            ).scalars().all()

            if not allocations:
                db.session.rollback()

                return error_response(
                    "Batch allocation records are missing for "
                    "this sale. Automatic restoration was stopped.",
                    409
                )

            for allocation in allocations:

                batch = db.session.execute(
                    select(StockBatch)
                    .where(
                        StockBatch.id == allocation.batch_id
                    )
                    .with_for_update()
                ).scalar_one_or_none()

                if not batch:
                    db.session.rollback()

                    return error_response(
                        "An original stock batch could not be found. "
                        "Automatic restoration was stopped.",
                        409
                    )

                batch.remaining_quantity = (
                    Decimal(str(batch.remaining_quantity))
                    + Decimal(str(allocation.quantity))
                ).quantize(QUANTITY_PLACES)

        # ----------------------------------------------------
        # RESTORE BRANCH STOCK
        # ----------------------------------------------------

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
                "Pending sale cancelled. Original stock batches "
                "and branch stock have been restored."
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
                payment.status if payment else "not_initiated"
            ),
            "checkout_request_id": (
                payment.checkout_request_id if payment else None
            ),
            "mpesa_receipt_number": (
                payment.mpesa_receipt_number if payment else None
            ),
            "phone_number": (
                payment.phone_number if payment else None
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
