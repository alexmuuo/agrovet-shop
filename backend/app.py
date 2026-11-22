import os
import logging

from flask import Flask, jsonify
from flask_cors import CORS
from flask_mail import Mail
from dotenv import load_dotenv
from flask_migrate import Migrate

from extensions import db


# --------------------------------------------------
# LOAD ENVIRONMENT VARIABLES
# --------------------------------------------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_FILE = os.path.join(BASE_DIR, ".env")

load_dotenv(ENV_FILE)


# --------------------------------------------------
# INITIALIZE FLASK APPLICATION
# --------------------------------------------------

app = Flask(__name__)


# --------------------------------------------------
# APPLICATION CONFIGURATION
# --------------------------------------------------

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not configured. "
        "Check the backend .env file or server environment variables."
    )

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace(
        "postgres://",
        "postgresql://",
        1
    )

app.config["SQLALCHEMY_DATABASE_URI"] = DATABASE_URL
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False


# --------------------------------------------------
# EMAIL CONFIGURATION — GMAIL SMTP
# --------------------------------------------------

app.config["MAIL_SERVER"] = os.getenv(
    "MAIL_SERVER",
    "smtp.gmail.com"
)

app.config["MAIL_PORT"] = int(
    os.getenv("MAIL_PORT", "587")
)

app.config["MAIL_USE_TLS"] = (
    os.getenv("MAIL_USE_TLS", "true").lower() == "true"
)

app.config["MAIL_USE_SSL"] = False
app.config["MAIL_USERNAME"] = os.getenv("MAIL_USERNAME")
app.config["MAIL_PASSWORD"] = os.getenv("MAIL_PASSWORD")

app.config["MAIL_DEFAULT_SENDER"] = os.getenv(
    "MAIL_DEFAULT_SENDER"
)

mail = Mail(app)


# --------------------------------------------------
# CORS CONFIGURATION
# --------------------------------------------------

allowed_origins = [
    "http://localhost:5173",
    "https://agrovet-shop.vercel.app",
    "https://headmasterliquors.vercel.app"
]

CORS(
    app,
    resources={
        r"/*": {
            "origins": allowed_origins,
            "methods": [
                "GET",
                "POST",
                "PUT",
                "PATCH",
                "DELETE",
                "OPTIONS",
            ],
            "allow_headers": [
                "Content-Type",
                "Authorization",
            ],
            "supports_credentials": False,
        }
    },
)


# --------------------------------------------------
# INITIALIZE DATABASE AND MIGRATIONS
# --------------------------------------------------

db.init_app(app)

migrate = Migrate(app, db)


# --------------------------------------------------
# LOGGING CONFIGURATION
# --------------------------------------------------

logging.basicConfig(level=logging.INFO)

logger = logging.getLogger(__name__)


# --------------------------------------------------
# IMPORT MODELS
# --------------------------------------------------

from models.product import Product
from models.customer import Customer
from models.order import Order, OrderItem
from models.message import Message
from models.notification import Notification
from models.payment import Payment
from models.cashier import Cashier
from models.cash_collection import CashCollection
from models.stock_movement import StockMovement
from models.branch import Branch
from models.branch_product_stock import BranchProductStock

from models.cashier_sale import (
    CashierSale,
    CashierSaleItem
)

from models.cashier_sale_payment import CashierSalePayment
from models.cashier_sale_audit import CashierSaleAudit

# Stock batch models
from models.stock_batch import StockBatch
from models.stock_batch_allocation import StockBatchAllocation


# --------------------------------------------------
# IMPORT ROUTES
# --------------------------------------------------

from routes.product_routes import product_bp
from routes.order_routes import order_bp
from routes.admin_routes import admin_bp
from routes.message_routes import message_bp
from routes.customer_routes import customer_bp
from routes.notification import notification_bp
from routes.admin_auth_routes import admin_auth_bp
from routes.payment_routes import payment_bp
from routes.cashier_routes import cashier_bp
from routes.cashier_sales import cashier_sales_bp
from routes.admin_pos_sales import admin_pos_sales_bp

# New multi-product stock receiving route
from routes.cashier_stock_receiving import (
    cashier_stock_receiving_bp
)


# --------------------------------------------------
# REGISTER ROUTES
# --------------------------------------------------

app.register_blueprint(product_bp)
app.register_blueprint(order_bp)
app.register_blueprint(admin_bp)
app.register_blueprint(message_bp)
app.register_blueprint(customer_bp)
app.register_blueprint(notification_bp)
app.register_blueprint(admin_auth_bp)
app.register_blueprint(payment_bp)
app.register_blueprint(cashier_bp)
app.register_blueprint(cashier_sales_bp)
app.register_blueprint(admin_pos_sales_bp)

# Stock receiving
app.register_blueprint(cashier_stock_receiving_bp)


# --------------------------------------------------
# PUBLIC HEALTH CHECK
# --------------------------------------------------

@app.route("/")
def home():
    return jsonify({
        "message": "Agrovet API is running."
    })


@app.route("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "message": "Agrovet backend is healthy."
    })


# --------------------------------------------------
# DATABASE DIAGNOSTIC
# --------------------------------------------------

from admin_auth import admin_required


@app.route("/api/database-test")
@admin_required
def database_test():
    try:
        db.session.execute(db.text("SELECT 1"))

        return jsonify({
            "status": "ok",
            "message": "Database connection is working."
        })

    except Exception:
        db.session.rollback()

        logger.exception("Database diagnostic failed.")

        return jsonify({
            "status": "error",
            "message": "Database connection test failed."
        }), 500


# --------------------------------------------------
# APPLICATION STARTUP
# --------------------------------------------------

if __name__ == "__main__":
    app.run(
        debug=os.getenv("FLASK_DEBUG", "false").lower() == "true",
        host="127.0.0.1",
        port=int(os.getenv("PORT", "5000")),
    )
