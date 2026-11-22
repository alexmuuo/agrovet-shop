import logging

from decimal import Decimal, InvalidOperation
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
    url_prefix="/api/cashier"
)

ZERO = Decimal("0.000")
MONEY = Decimal("0.01")
QUANTITY = Decimal("0.001")


def decimal_value(value):
    try:
        if isinstance(value, bool) or value is None:
            return None

        result = Decimal(str(value).strip())

        if not result.is_finite():
            return None

        return result

    except (
        InvalidOperation,
        ValueError,
        TypeError
    ):
        return None


def validate_quantity(value):
    result = decimal_value(value)

    if result is None or result <= ZERO:
        return None

    if result != result.quantize(QUANTITY):
        return None

    if result > Decimal("1000000"):
        return None

    return result.quantize(QUANTITY)


def validate_price(value):
    result = decimal_value(value)

    if result is None or result < 0:
        return None

    if result != result.quantize(MONEY):
        return None

    return result.quantize(MONEY)


@cashier_stock_receiving_bp.route(
    "/stock/receive-batch",
    methods=["POST"]
)
@cashier_required
def receive_stock_batch():

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "status": "error",
            "message": "Invalid request."
        }), 400

    items = data.get("items")

    if not isinstance(items, list) or not items:
        return jsonify({
            "status": "error",
            "message": "Add at least one product."
        }), 400

    if len(items) > 100:
        return jsonify({
            "status": "error",
            "message": "Maximum 100 product rows per receipt."
        }), 400

    supplier_reference = data.get(
        "supplier_reference", ""
    )

    notes = data.get("notes", "")

    if not isinstance(supplier_reference, str):
        return jsonify({
            "status": "error",
            "message": "Invalid supplier reference."
        }), 400

    if not isinstance(notes, str):
        return jsonify({
            "status": "error",
            "message": "Invalid notes."
        }), 400

    supplier_reference = supplier_reference.strip()
    notes = notes.strip()

    if len(supplier_reference) > 150 or len(notes) > 5000:
        return jsonify({
            "status": "error",
            "message": "Reference or notes are too long."
        }), 400

    try:

        cashier_id = getattr(g, "cashier", None)

        if not cashier_id:
            return jsonify({
                "status": "error",
                "message": "Cashier authentication required."
            }), 401

        cashier = db.session.execute(
            select(Cashier)
            .where(Cashier.id == cashier_id.id)
            .with_for_update()
        ).scalar_one_or_none()

        if not cashier or not cashier.is_active:
            db.session.rollback()

            return jsonify({
                "status": "error",
                "message": "Inactive cashier account."
            }), 403

        if not cashier.branch_id:
            db.session.rollback()

            return jsonify({
                "status": "error",
                "message": "No branch assigned."
            }), 403

        branch = db.session.execute(
            select(Branch).where(
                Branch.id == cashier.branch_id,
                Branch.is_active.is_(True)
            )
        ).scalar_one_or_none()

        if not branch:
            db.session.rollback()

            return jsonify({
                "status": "error",
                "message": "Assigned branch is unavailable."
            }), 403

        validated = []
        product_ids = set()

        for index, item in enumerate(items):

            if not isinstance(item, dict):
                raise ValueError(
                    f"Invalid product row {index + 1}."
                )

            try:
                product_id = int(item.get("product_id"))

                if product_id <= 0:
                    raise ValueError

            except (TypeError, ValueError):
                raise ValueError(
                    f"Select a valid product on row {index + 1}."
                )

            quantity = validate_quantity(
                item.get("quantity")
            )

            buying_price = validate_price(
                item.get("buying_price")
            )

            selling_price = validate_price(
                item.get("selling_price")
            )

            if quantity is None:
                raise ValueError(
                    f"Invalid quantity on row {index + 1}."
                )

            if buying_price is None:
                raise ValueError(
                    f"Invalid buying price on row {index + 1}."
                )

            if selling_price is None:
                raise ValueError(
                    f"Invalid selling price on row {index + 1}."
                )

            validated.append({
                "product_id": product_id,
                "quantity": quantity,
                "buying_price": buying_price,
                "selling_price": selling_price
            })

            product_ids.add(product_id)

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
            raise ValueError(
                "One or more selected products do not exist."
            )

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

        stock_by_product = {
            stock.product_id: stock
            for stock in stock_rows
        }

        for product_id in sorted(product_ids):

            if not products_by_id[product_id].is_active:
                raise ValueError(
                    f"{products_by_id[product_id].name} is inactive."
                )

            if product_id not in stock_by_product:

                stock = BranchProductStock(
                    branch_id=branch.id,
                    product_id=product_id,
                    quantity=ZERO
                )

                db.session.add(stock)
                stock_by_product[product_id] = stock

        db.session.flush()

        receipt_reference = (
            f"RECEIPT-{__import__('uuid').uuid4().hex[:12].upper()}"
        )

        created_batches = []
        total_cost = Decimal("0.00")
        total_quantity = ZERO

        for item in validated:

            product = products_by_id[item["product_id"]]
            branch_stock = stock_by_product[item["product_id"]]

            quantity = item["quantity"]

            previous_stock = Decimal(
                str(branch_stock.quantity or ZERO)
            )

            new_stock = (
                previous_stock + quantity
            ).quantize(QUANTITY)

            if new_stock > Decimal("999999999.999"):
                raise ValueError(
                    f"Stock limit exceeded for {product.name}."
                )

            branch_stock.quantity = new_stock

            batch = StockBatch(
                reference=receipt_reference,
                product_id=product.id,
                branch_id=branch.id,
                cashier_id=cashier.id,
                quantity_received=quantity,
                remaining_quantity=quantity,
                buying_price=item["buying_price"],
                selling_price=item["selling_price"],
                supplier_reference=supplier_reference or None,
                notes=notes or None
            )

            db.session.add(batch)

            movement = StockMovement(
                cashier_id=cashier.id,
                product_id=product.id,
                branch_id=branch.id,
                product_name=product.name,
                previous_stock=previous_stock,
                quantity_added=quantity,
                new_stock=new_stock,
                reference=receipt_reference,
                notes=notes or None
            )

            db.session.add(movement)

            created_batches.append({
                "product_id": product.id,
                "product_name": product.name,
                "quantity": float(quantity),
                "buying_price": float(item["buying_price"]),
                "selling_price": float(item["selling_price"])
            })

            total_cost += (
                quantity * item["buying_price"]
            )

            total_quantity += quantity

        db.session.commit()

        return jsonify({
            "status": "success",
            "message": "Stock received successfully.",
            "receipt_reference": receipt_reference,
            "branch": {
                "id": branch.id,
                "name": branch.name
            },
            "products_received": len(created_batches),
            "total_quantity": float(total_quantity),
            "total_purchase_cost": float(total_cost),
            "items": created_batches
        }), 201

    except ValueError as error:

        db.session.rollback()

        return jsonify({
            "status": "error",
            "message": str(error)
        }), 400

    except Exception:

        db.session.rollback()

        logger.exception(
            "Multi-product stock receiving failed."
        )

        return jsonify({
            "status": "error",
            "message": (
                "Stock receiving failed. "
                "No stock changes were committed."
            )
        }), 500
