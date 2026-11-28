import axios from "axios";

const api = axios.create({
  baseURL: "https://agrovet-api-a00w.onrender.com/api",
  timeout: 30000,
});
// ============================================================
// REQUEST INTERCEPTOR
// ATTACH THE CORRECT TOKEN TO PROTECTED ENDPOINTS
// ============================================================

api.interceptors.request.use(
(config) => {
const url = config.url || "";
const method = (config.method || "get").toLowerCase();


config.headers = config.headers || {};

// Remove query parameters when checking endpoint paths.
const cleanUrl = url.split("?")[0];

// ========================================================
// ADMIN AUTHENTICATION
// ========================================================

// The login endpoint is public. Do not attach an expired token to it.
const isAdminLogin = cleanUrl === "/admin/login" && method === "post";
const isAdminRoute =
  cleanUrl.startsWith("/admin/") && !isAdminLogin;

// Product creation, editing, and deletion require admin auth.
const isProductMutation =
  /^\/products(?:\/|$)/.test(cleanUrl) &&
  ["post", "put", "patch", "delete"].includes(method);

// Creating a cashier requires admin authentication.
const isCashierCreation =
  cleanUrl === "/cashier/create" && method === "post";

if (isAdminRoute || isProductMutation || isCashierCreation) {
  const adminToken = localStorage.getItem("adminToken");

  if (adminToken) {
    config.headers.Authorization = `Bearer ${adminToken}`;
  }
}

// ========================================================
// CASHIER AUTHENTICATION
// ========================================================

// Cashier login is public.
// Cashier stock, sales, deliveries, and payment endpoints
// require cashier authentication.

const isCashierLogin =
  cleanUrl === "/cashier/login";

const isCashierProtectedEndpoint =
  (
    cleanUrl.startsWith("/cashier/") ||
    cleanUrl === "/payments/cashier-stk-push"
  ) &&
  !isCashierLogin &&
  !isCashierCreation;

if (isCashierProtectedEndpoint) {
  const cashierToken = localStorage.getItem("cashierToken");

  if (cashierToken) {
    config.headers.Authorization = `Bearer ${cashierToken}`;
  }
}

// ========================================================
// CUSTOMER AUTHENTICATION
// ========================================================

const customerProtectedEndpoints = [
  "/notifications/customer/",
  "/notifications/",
  "/messages/customer/",
  "/messages/unread-count",
  "/messages",
];

const isCustomerProtectedEndpoint =
  customerProtectedEndpoints.some((endpoint) =>
    cleanUrl.startsWith(endpoint)
  );

// Never attach a customer token to admin or cashier requests.
if (
  isCustomerProtectedEndpoint &&
  !isAdminRoute &&
  !isProductMutation &&
  !isCashierProtectedEndpoint &&
  !isCashierCreation
) {
  const customerToken = localStorage.getItem("customerToken");

  if (customerToken) {
    config.headers.Authorization = `Bearer ${customerToken}`;
  }
}

// ========================================================
// FORM DATA / IMAGE UPLOAD SUPPORT
// ========================================================

// Allow the browser to set the multipart boundary automatically.
if (
  typeof FormData !== "undefined" &&
  config.data instanceof FormData
) {
  delete config.headers["Content-Type"];
  delete config.headers["content-type"];
}

return config;


},
(error) => Promise.reject(error)
);

export default api;


// ============================================================
// RESPONSE INTERCEPTOR
// EXPIRE INVALID ADMIN SESSIONS CLEANLY
// ============================================================

// Admin tokens are time-limited by the Flask backend. A token can remain
// in localStorage after it expires, so the route guard alone cannot tell
// whether the session is still valid. Redirect on the first protected
// admin 401 instead of leaving the dashboard full of empty report cards.
let redirectingExpiredAdminSession = false;

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const requestUrl = String(error?.config?.url || "").split("?")[0];
    const isAdminApiRequest =
      requestUrl.startsWith("/admin/") &&
      requestUrl !== "/admin/login";

    if (
      status === 401 &&
      isAdminApiRequest &&
      typeof window !== "undefined"
    ) {
      localStorage.removeItem("adminToken");
      localStorage.removeItem("admin");

      if (
        window.location.pathname !== "/admin-login" &&
        !redirectingExpiredAdminSession
      ) {
        redirectingExpiredAdminSession = true;
        window.location.replace("/admin-login?reason=session-expired");
      }
    }

    return Promise.reject(error);
  }
);
