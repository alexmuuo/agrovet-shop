import logging
import uuid

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from flask import Blueprint, jsonify, request, g
from sqlalchemy import select

from extensions import db

from models.cashier import Cashier
from models.product import Product
from models.branch import Branch
from models.branch_product_stock import BranchProductStock
from models.stock_movement import StockMovement
from models.stock_batch import StockBatch

from cashier_auth import cashier_required


logger = logging.getLogger(__name__)

cashier_stock_receiving_bp = Blueprint(
    "cashier_stock_receiving_bp",
    __name__,
    url_prefix="/api/cashier/stock"
)

ZERO = Decimal("0.000")
QUANTITY_PLACES = Decimal("0.001")
MONEY_PLACES = Decimal("0.01")


# ============================================================
# HELPERS
# ============================================================

def error_response(message, status_code=400):
    return jsonify({
        "status": "error",
        "message": message
    }), status_code


def parse_decimal(value):
    if value is None or isinstance(value, bool):
        return None

    try:
        number = Decimal(str(value).strip())

        if not number.is_finite():
            return None

        return number

    except (
        InvalidOperation,
        ValueError,
        TypeError,
        AttributeError
    ):
        return None


def parse_quantity(value):
    number = parse_decimal(value)

    if number is None or number <= ZERO:
        return None

    if number != number.quantize(QUANTITY_PLACES):
        return None

    return number.quantize(QUANTITY_PLACES)


def parse_price(value):
    number = parse_decimal(value)

    if number is None or number < 0:
        return None

    if number != number.quantize(MONEY_PLACES):
        return None

    return number.quantize(MONEY_PLACES)


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


# ============================================================
# RECEIVE MULTIPLE STOCK BATCHES
# POST /api/cashier/stock/receive-batch
# ============================================================

@cashier_stock_receiving_bp.route(
    "/receive-batch",
    methods=["POST"]
)
@cashier_required
def receive_stock_batch():

    cashier = get_active_cashier()

    if not cashier:
        return error_response(
            "Active cashier authentication is required.",
            401
        )

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return error_response(
            "A valid JSON request is required."
        )

    items = data.get("items")

    if not isinstance(items, list) or not items:
        return error_response(
            "Add at least one product to receive."
        )

    if len(items) > 100:
        return error_response(
            "A single stock receipt cannot contain more than "
            "100 product rows."
        )

    supplier_reference = data.get(
        "supplier_reference",
        ""
    )

    notes = data.get("notes", "")

    if not isinstance(supplier_reference, str):
        return error_response(
            "Supplier reference must be text."
        )

    if not isinstance(notes, str):
        return error_response(
            "Notes must be text."
        )

    supplier_reference = supplier_reference.strip()
    notes = notes.strip()

    if len(supplier_reference) > 100:
        return error_response(
            "Supplier reference cannot exceed 100 characters."
        )

    branch = get_cashier_branch(cashier)

    if not branch:
        return error_response(
            "Your account has no active assigned branch. "
            "Contact the administrator.",
            403
        )

    try:

        # ----------------------------------------------------
        # VALIDATE ALL ROWS BEFORE WRITING ANYTHING
        # ----------------------------------------------------

        validated_items = []
        product_ids = set()

        for index, item in enumerate(items, start=1):

            if not isinstance(item, dict):
                return error_response(
                    f"Row {index} is invalid."
                )

            raw_product_id = item.get("product_id")

            if isinstance(raw_product_id, bool):
                return error_response(
                    f"Row {index}: invalid product."
                )

            try:
                product_id = int(raw_product_id)

                if product_id <= 0:
                    raise ValueError

            except (TypeError, ValueError, OverflowError):
                return error_response(
                    f"Row {index}: invalid product."
                )

            quantity = parse_quantity(
                item.get("quantity")
            )

            buying_price = parse_price(
                item.get("buying_price")
            )

            selling_price = parse_price(
                item.get("selling_price")
            )

            if quantity is None:
                return error_response(
                    f"Row {index}: quantity must be greater "
                    "than zero and contain at most three "
                    "decimal places."
                )

            if buying_price is None:
                return error_response(
                    f"Row {index}: enter a valid buying price."
                )

            if selling_price is None:
                return error_response(
                    f"Row {index}: enter a valid selling price."
                )

            row_supplier_reference = item.get(
                "supplier_reference",
                supplier_reference
            )

            row_notes = item.get(
                "notes",
                notes
            )

            if not isinstance(row_supplier_reference, str):
                return error_response(
                    f"Row {index}: supplier reference must be text."
                )

            if not isinstance(row_notes, str):
                return error_response(
                    f"Row {index}: notes must be text."
                )

            row_supplier_reference = (
                row_supplier_reference.strip()
            )

            row_notes = row_notes.strip()

            if len(row_supplier_reference) > 100:
                return error_response(
                    f"Row {index}: supplier reference is too long."
                )

            validated_items.append({
                "product_id": product_id,
                "quantity": quantity,
                "buying_price": buying_price,
                "selling_price": selling_price,
                "supplier_reference": row_supplier_reference,
                "notes": row_notes
            })

            product_ids.add(product_id)

        # ----------------------------------------------------
        # LOCK PRODUCTS
        # ----------------------------------------------------

        products = db.session.execute(
            select(Product)
            .where(Product.id.in_(sorted(product_ids)))
            .order_by(Product.id)
            .with_for_update()
        ).scalars().all()

        products_by_id = {
            product.id: product
            for product in products
        }

        if len(products_by_id) != len(product_ids):
            return error_response(
                "One or more selected products could not be found.",
                404
            )

        for product in products:
            if not product.is_active:
                return error_response(
                    f"{product.name} is inactive and cannot "
                    "receive new stock."
                )

        # ----------------------------------------------------
        # LOCK EXISTING BRANCH STOCK
        # ----------------------------------------------------

        stock_rows = db.session.execute(
            select(BranchProductStock)
            .where(
                BranchProductStock.branch_id == branch.id,
                BranchProductStock.product_id.in_(
                    sorted(product_ids)
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
        # CREATE ONE BATCH PER ROW
        # ----------------------------------------------------

        receipt_reference = (
            f"RCV-{uuid.uuid4().hex[:12].upper()}"
        )

        created_batches = []
        received_total = ZERO

        for item in validated_items:

            product = products_by_id[item["product_id"]]

            stock = stock_by_product_id.get(product.id)

            # Create a branch stock record when the product
            # has never previously been stocked at this branch.

            if stock is None:

                stock = BranchProductStock(
                    branch_id=branch.id,
                    product_id=product.id,
                    quantity=ZERO
                )

                db.session.add(stock)
                db.session.flush()

                stock_by_product_id[product.id] = stock

            previous_stock = Decimal(
                str(stock.quantity)
            )

            quantity = item["quantity"]

            new_stock = (
                previous_stock + quantity
            ).quantize(QUANTITY_PLACES)

            # -----------------------------------------------
            # CREATE STOCK BATCH
            # -----------------------------------------------

            batch = StockBatch(
                reference=receipt_reference,
                product_id=product.id,
                branch_id=branch.id,
                cashier_id=cashier.id,
                quantity_received=quantity,
                remaining_quantity=quantity,
                buying_price=item["buying_price"],
                selling_price=item["selling_price"],
                supplier_reference=(
                    item["supplier_reference"] or None
                ),
                notes=item["notes"] or None
            )

            db.session.add(batch)

            # -----------------------------------------------
            # UPDATE BRANCH STOCK
            # -----------------------------------------------

            stock.quantity = new_stock

            # -----------------------------------------------
            # RECORD STOCK MOVEMENT
            # -----------------------------------------------

            movement = StockMovement(
                product_id=product.id,
                product_name=product.name,
                branch_id=branch.id,
                cashier_id=cashier.id,
                previous_stock=previous_stock,
                quantity_added=quantity,
                new_stock=new_stock,
                reference=receipt_reference,
                notes=(
                    item["notes"]
                    or item["supplier_reference"]
                    or "Stock received"
                )
            )

            db.session.add(movement)

            created_batches.append({
                "product_id": product.id,
                "product_name": product.name,
                "quantity_received": quantity,
                "buying_price": item["buying_price"],
                "selling_price": item["selling_price"],
                "previous_stock": previous_stock,
                "new_stock": new_stock
            })

            received_total += quantity

        # ----------------------------------------------------
        # COMMIT EVERYTHING TOGETHER
        # ----------------------------------------------------

        db.session.commit()

        logger.info(
            "Stock receipt completed: reference=%s, branch=%s, "
            "cashier=%s, rows=%s",
            receipt_reference,
            branch.id,
            cashier.id,
            len(created_batches)
        )

        return jsonify({
            "status": "success",
            "message": (
                f"Successfully received {len(created_batches)} "
                "stock batch entries."
            ),
            "receipt": {
                "reference": receipt_reference,
                "branch_id": branch.id,
                "branch_name": branch.name,
                "cashier_id": cashier.id,
                "supplier_reference": supplier_reference or None,
                "total_quantity_received": float(
                    received_total.quantize(QUANTITY_PLACES)
                ),
                "number_of_rows": len(created_batches),
                "items": [
                    {
                        **entry,
                        "quantity_received": float(
                            entry["quantity_received"]
                        ),
                        "buying_price": float(
                            entry["buying_price"]
                        ),
                        "selling_price": float(
                            entry["selling_price"]
                        ),
                        "previous_stock": float(
                            entry["previous_stock"]
                        ),
                        "new_stock": float(
                            entry["new_stock"]
                        )
                    }
                    for entry in created_batches
                ]
            }
        }), 201

    except Exception:

        db.session.rollback()

        logger.exception(
            "Stock receiving failed for cashier %s.",
            cashier.id
        )

        return error_response(
            "Stock receiving failed. No receipt was committed. "
            "Please try again.",
            500
        )
