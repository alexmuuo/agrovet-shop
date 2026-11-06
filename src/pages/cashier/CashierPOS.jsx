
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useNavigate } from "react-router-dom";
import api from "../../api/api";

const DECIMAL_PLACES = 3;

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roundStock(value) {
  return Number(Number(value).toFixed(DECIMAL_PLACES));
}

function CashierPOS() {
  const navigate = useNavigate();

  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);

  const pollingRef = useRef(false);
  const pollingSaleRef = useRef(null);
  const mountedRef = useRef(false);

  const cashier = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("cashier") || "null");
    } catch {
      return null;
    }
  }, []);

  // ============================================================
  // LIFECYCLE
  // ============================================================

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      pollingRef.current = false;
    };
  }, []);

  // ============================================================
  // LOAD PRODUCTS FOR THE AUTHENTICATED CASHIER'S BRANCH
  // ============================================================

  const fetchProducts = useCallback(async () => {
    const response = await api.get("/cashier/stock/products");
    const data = response.data;

    const productList = Array.isArray(data)
      ? data
      : Array.isArray(data?.products)
        ? data.products
        : Array.isArray(data?.items)
          ? data.items
          : null;

    if (!productList) {
      throw new Error(
        "The branch stock API returned an unexpected response."
      );
    }

    const normalizedProducts = productList.map((product) => {
      const branchQuantity =
        product.branch_stock ??
        product.quantity ??
        product.stock_quantity ??
        product.quantity_in_stock ??
        product.stock ??
        null;
