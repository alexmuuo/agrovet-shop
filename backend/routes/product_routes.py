import logging
import os
import uuid

from decimal import Decimal, InvalidOperation
from pathlib import Path
from urllib.parse import urlparse

from flask import (
    Blueprint,
    jsonify,
    request,
    send_from_directory,
    current_app,
)

from werkzeug.utils import secure_filename

from extensions import db
from models.product import Product
from admin_auth import admin_required


product_bp = Blueprint("product_bp", __name__)

logger = logging.getLogger(__name__)


# ============================================================
# IMAGE CONFIGURATION
# ============================================================

# This file is expected to be in backend/routes/product_routes.py.
# Store uploaded images in backend/uploads/products/.
BACKEND_DIR = Path(__file__).resolve().parent.parent

PRODUCT_IMAGE_DIR = BACKEND_DIR / "uploads" / "products"

MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5 MB

ALLOWED_IMAGE_EXTENSIONS = {
    "jpg",
    "jpeg",
    "png",
    "webp",
    "gif",
}

ALLOWED_IMAGE_MIMETYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
}


def ensure_image_directory():
    """Create the product image directory when necessary."""
    PRODUCT_IMAGE_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )


def validate_image_file(file):
    """
    Validate an uploaded image using its extension, MIME type,
    size, and file signature.

    Returns:
        (True, None) when valid.
        (False, error_message) when invalid.
    """
    if not file or not file.filename:
        return False, "Please select an image."

    original_name = secure_filename(file.filename)

    if not original_name or "." not in original_name:
        return False, "The image filename is invalid."

    extension = original_name.rsplit(".", 1)[1].lower()

    if extension not in ALLOWED_IMAGE_EXTENSIONS:
        return False, (
            "Unsupported image format. "
            "Use JPG, JPEG, PNG, WEBP, or GIF."
        )

    if file.mimetype not in ALLOWED_IMAGE_MIMETYPES:
        return False, "The uploaded file must be an image."

    # Read at most 1 byte beyond the permitted limit.
    file.stream.seek(0)
    image_bytes = file.stream.read(MAX_IMAGE_SIZE + 1)
    file.stream.seek(0)

    if len(image_bytes) > MAX_IMAGE_SIZE:
        return False, "Image size must not exceed 5 MB."

    if not image_bytes:
        return False, "The uploaded image is empty."

    # Check common image file signatures.
    is_jpeg = image_bytes.startswith(b"\xff\xd8\xff")

    is_png = image_bytes.startswith(
        b"\x89PNG\r\n\x1a\n"
    )

    is_gif = (
        image_bytes.startswith(b"GIF87a")
        or image_bytes.startswith(b"GIF89a")
    )

    is_webp = (
        len(image_bytes) >= 12
        and image_bytes.startswith(b"RIFF")
        and image_bytes[8:12] == b"WEBP"
    )

    signature_matches = {
        "jpg": is_jpeg,
        "jpeg": is_jpeg,
        "png": is_png,
        "gif": is_gif,
        "webp": is_webp,
    }

    if not signature_matches.get(extension, False):
        return False, (
            "The file contents do not match the image format."
        )

    return True, None


def save_product_image(file):
    """
    Save a validated image with a unique, safe filename.

    Returns:
        The relative API path to the saved image.
    """
    ensure_image_directory()

    original_name = secure_filename(file.filename)
    extension = original_name.rsplit(".", 1)[1].lower()

    unique_filename = (
        f"{uuid.uuid4().hex}.{extension}"
    )

    destination = PRODUCT_IMAGE_DIR / unique_filename

    file.save(str(destination))

    return f"/api/product-images/{unique_filename}"


def delete_local_product_image(image_path):
    """
    Delete an image managed by this application.

    External image URLs and unrelated paths are left untouched.
    """
    if not image_path:
        return

    prefix = "/api/product-images/"

    if not image_path.startswith(prefix):
        return

    filename = image_path[len(prefix):]

    # Only accept a plain filename, not a path.
    if not filename or Path(filename).name != filename:
        return

    target = PRODUCT_IMAGE_DIR / filename

    try:
        if target.is_file():
            target.unlink()

    except OSError:
        logger.exception(
            "Could not delete product image: %s",
            filename,
        )


def get_request_data():
    """
    Support both existing JSON requests and multipart form uploads.

    JSON clients continue working as before.
    FormData clients can upload image_file.
    """
    if request.is_json:
        data = request.get_json(silent=True)

        if isinstance(data, dict):
            return data

        return None

    return request.form.to_dict()


def validate_image_url(value):
    """Accept an empty image value or an HTTP(S) image URL/path."""
    if value is None or value == "":
        return True

    if not isinstance(value, str):
        return False

    value = value.strip()

    if not value:
        return True

    # Allow relative application paths.
    if value.startswith("/"):
        return not value.startswith("//")

    parsed = urlparse(value)

    return (
        parsed.scheme in {"http", "https"}
        and bool(parsed.netloc)
    )


def validate_product_text(data, field):
    """Validate required product text fields."""
    value = data.get(field)

    if not isinstance(value, str) or not value.strip():
        return None

    return value.strip()


def validate_price(value):
    """Validate a product price without accepting negative values."""
    try:
        price = Decimal(str(value))

        if not price.is_finite() or price < 0:
            return None

        return price

    except (
        InvalidOperation,
        ValueError,
        TypeError,
    ):
        return None


def validate_stock(value):
    """Stock must be a non-negative integer."""
    if isinstance(value, bool):
        return None

    try:
        stock = int(value)

        if stock < 0 or str(value).strip() != str(stock):
            return None

        return stock

    except (
        ValueError,
        TypeError,
        AttributeError,
    ):
        return None


# ============================================================
# SERVE UPLOADED PRODUCT IMAGES
# ============================================================

@product_bp.route(
    "/api/product-images/<path:filename>",
    methods=["GET"],
)
def get_product_image(filename):
    """
    Serve product images uploaded through the admin interface.
    """
    # Do not allow subdirectories or traversal paths.
    if Path(filename).name != filename:
        return jsonify({
            "status": "error",
            "message": "Image not found.",
        }), 404

    if Path(filename).suffix.lower().lstrip(".") not in (
        ALLOWED_IMAGE_EXTENSIONS
    ):
        return jsonify({
            "status": "error",
            "message": "Image not found.",
        }), 404

    ensure_image_directory()

    response = send_from_directory(
        str(PRODUCT_IMAGE_DIR),
        filename,
        conditional=True,
    )

    # Product images are public catalogue assets.
    response.headers["X-Content-Type-Options"] = "nosniff"

    return response


# ============================================================
# GET ALL ACTIVE PRODUCTS — PUBLIC
# ============================================================

@product_bp.route("/api/products", methods=["GET"])
def get_products():
    products = Product.query.filter_by(
        is_active=True
    ).all()

    return jsonify([
        product.to_dict()
        for product in products
    ])


# ============================================================
# GET ONE ACTIVE PRODUCT — PUBLIC
# ============================================================

@product_bp.route(
    "/api/products/<int:product_id>",
    methods=["GET"],
)
def get_product(product_id):
    product = db.session.get(Product, product_id)

    if not product or not product.is_active:
        return jsonify({
            "status": "error",
            "message": "Product not found.",
        }), 404

    return jsonify(product.to_dict())


# ============================================================
# CREATE PRODUCT — ADMIN ONLY
# ============================================================

@product_bp.route("/api/products", methods=["POST"])
@admin_required
def create_product():
    data = get_request_data()

    if not isinstance(data, dict):
        return jsonify({
            "status": "error",
            "message": "A valid product payload is required.",
        }), 400

    # Required text fields.
    name = validate_product_text(data, "name")
    category = validate_product_text(data, "category")
    unit = validate_product_text(data, "unit")

    required_values = {
        "name": name,
        "category": category,
        "unit": unit,
    }

    for field, value in required_values.items():
        if value is None:
            return jsonify({
                "status": "error",
                "message": f"{field} must be a non-empty string.",
            }), 400

    # Validate the buying cost and selling price.
    # Buying price is required for newly created products so the
    # profit report can calculate cost of goods sold accurately.
    buying_price = validate_price(data.get("buying_price"))

    if buying_price is None:
        return jsonify({
            "status": "error",
            "message": (
                "Buying price must be a valid non-negative number."
            ),
        }), 400

    price = validate_price(data.get("price"))

    if price is None:
        return jsonify({
            "status": "error",
            "message": (
                "Selling price must be a valid non-negative number."
            ),
        }), 400

    # Validate stock.
    stock = validate_stock(data.get("stock", 0))

    if stock is None:
        return jsonify({
            "status": "error",
            "message": "Stock must be a non-negative integer.",
        }), 400

    # Validate active status.
    is_active = data.get("is_active", True)

    if isinstance(is_active, str):
        normalized = is_active.strip().lower()

        if normalized in {"true", "1"}:
            is_active = True
        elif normalized in {"false", "0"}:
            is_active = False
        else:
            return jsonify({
                "status": "error",
                "message": "is_active must be true or false.",
            }), 400

    if not isinstance(is_active, bool):
        return jsonify({
            "status": "error",
            "message": "is_active must be true or false.",
        }), 400

    # Validate description.
    description = data.get("description", "")

    if description is not None and not isinstance(
        description, str
    ):
        return jsonify({
            "status": "error",
            "message": "Description must be a string.",
        }), 400

    # Validate the existing image URL option.
    image_url = data.get("image", "")

    if not validate_image_url(image_url):
        return jsonify({
            "status": "error",
            "message": "Provide a valid HTTP(S) image URL or path.",
        }), 400

    uploaded_file = request.files.get("image_file")

    saved_image_path = None

    try:
        # An uploaded image takes priority over an image URL.
        if uploaded_file and uploaded_file.filename:
            valid, error_message = validate_image_file(
                uploaded_file
            )

            if not valid:
                return jsonify({
                    "status": "error",
                    "message": error_message,
                }), 400

            saved_image_path = save_product_image(
                uploaded_file
            )

            image_value = saved_image_path

        else:
            image_value = image_url.strip() or None

        product = Product(
            name=name,
            category=category,
            description=description,
            buying_price=buying_price,
            price=price,
            unit=unit,
            stock=stock,
            image=image_value,
            is_active=is_active,
        )

        db.session.add(product)
        db.session.commit()

        return jsonify({
            "status": "success",
            "message": "Product created successfully.",
            "product": product.to_dict(),
        }), 201

    except Exception:
        db.session.rollback()

        # Avoid leaving an uploaded file behind if saving the
        # product record fails.
        if saved_image_path:
            delete_local_product_image(saved_image_path)

        logger.exception("Failed to create product.")

        return jsonify({
            "status": "error",
            "message": "Unable to create product.",
        }), 500


# ============================================================
# UPDATE PRODUCT — ADMIN ONLY
# ============================================================

@product_bp.route(
    "/api/products/<int:product_id>",
    methods=["PUT"],
)
@admin_required
def update_product(product_id):
    product = db.session.get(Product, product_id)

    if not product:
        return jsonify({
            "status": "error",
            "message": "Product not found.",
        }), 404

    data = get_request_data()

    if not isinstance(data, dict):
        return jsonify({
            "status": "error",
            "message": "A valid product payload is required.",
        }), 400

    # Validate text fields before changing the product.
    for field in ["name", "category", "unit"]:
        if field in data:
            if (
                not isinstance(data[field], str)
                or not data[field].strip()
            ):
                return jsonify({
                    "status": "error",
                    "message": (
                        f"{field} must be a non-empty string."
                    ),
                }), 400

    # Validate buying price. If omitted, preserve the existing value.
    if "buying_price" in data:
        buying_price = validate_price(data["buying_price"])

        if buying_price is None:
            return jsonify({
                "status": "error",
                "message": (
                    "Buying price must be a valid non-negative number."
                ),
            }), 400

        product.buying_price = buying_price

    # Validate selling price. The existing API field remains "price"
    # to avoid breaking customer catalogue, cart, and checkout code.
    if "price" in data:
        price = validate_price(data["price"])

        if price is None:
            return jsonify({
                "status": "error",
                "message": (
                    "Selling price must be a valid non-negative number."
                ),
            }), 400

        product.price = price

    # Validate stock.
    if "stock" in data:
        stock = validate_stock(data["stock"])

        if stock is None:
            return jsonify({
                "status": "error",
                "message": "Stock must be a non-negative integer.",
            }), 400

        product.stock = stock

    # Validate active status.
    if "is_active" in data:
        is_active = data["is_active"]

        if isinstance(is_active, str):
            normalized = is_active.strip().lower()

            if normalized in {"true", "1"}:
                is_active = True
            elif normalized in {"false", "0"}:
                is_active = False
            else:
                return jsonify({
                    "status": "error",
                    "message": "is_active must be true or false.",
                }), 400

        if not isinstance(is_active, bool):
            return jsonify({
                "status": "error",
                "message": "is_active must be true or false.",
            }), 400

        product.is_active = is_active

    # Update text fields.
    for field in ["name", "category", "unit"]:
        if field in data:
            setattr(
                product,
                field,
                data[field].strip(),
            )

    if "description" in data:
        description = data["description"]

        if description is not None and not isinstance(
            description, str
        ):
            return jsonify({
                "status": "error",
                "message": "Description must be a string.",
            }), 400

        product.description = description

    # Track old and new images so failed updates do not break
    # existing product image references.
    old_image_path = product.image
    saved_image_path = None

    uploaded_file = request.files.get("image_file")

    try:
        if uploaded_file and uploaded_file.filename:
            valid, error_message = validate_image_file(
                uploaded_file
            )

            if not valid:
                return jsonify({
                    "status": "error",
                    "message": error_message,
                }), 400

            saved_image_path = save_product_image(
                uploaded_file
            )

            # Uploaded image takes priority over the URL.
            product.image = saved_image_path

        elif "image" in data:
            image_url = data["image"]

            if not validate_image_url(image_url):
                return jsonify({
                    "status": "error",
                    "message": (
                        "Provide a valid HTTP(S) image URL or path."
                    ),
                }), 400

            product.image = image_url.strip() or None

        # If neither image_file nor image was supplied,
        # preserve the existing image.

        db.session.commit()

        # Only delete the old image after the database commit
        # succeeds, and only if the image reference changed.
        if (
            old_image_path
            and old_image_path != product.image
        ):
            delete_local_product_image(old_image_path)

        return jsonify({
            "status": "success",
            "message": "Product updated successfully.",
            "product": product.to_dict(),
        })

    except Exception:
        db.session.rollback()

        if saved_image_path:
            delete_local_product_image(saved_image_path)

        logger.exception("Failed to update product.")

        return jsonify({
            "status": "error",
            "message": "Unable to update product.",
        }), 500


# ============================================================
# DEACTIVATE PRODUCT — ADMIN ONLY
# ============================================================

@product_bp.route(
    "/api/products/<int:product_id>",
    methods=["DELETE"],
)
@admin_required
def delete_product(product_id):
    product = db.session.get(Product, product_id)

    if not product:
        return jsonify({
            "status": "error",
            "message": "Product not found.",
        }), 404

    try:
        # Preserve existing soft-deactivation behavior.
        product.is_active = False

        db.session.commit()

        return jsonify({
            "status": "success",
            "message": "Product deactivated successfully.",
        })

    except Exception:
        db.session.rollback()

        logger.exception("Failed to deactivate product.")

        return jsonify({
            "status": "error",
            "message": "Unable to deactivate product.",
        }), 500