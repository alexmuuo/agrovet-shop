import { NavLink, Link, useNavigate } from "react-router-dom";
import { STORE_NAME } from "../config/store";

const links = [
{
label: "POS",
path: "/cashier/pos",
icon: "bi-cart3",
},
{
label: "Sales History",
path: "/cashier/sales-history",
icon: "bi-receipt",
},
{
label: "Orders",
path: "/cashier/orders",
icon: "bi-box-seam",
},
{
label: "Deliveries",
path: "/cashier/deliveries",
icon: "bi-truck",
},
{
label: "Stock Management",
path: "/cashier/stock",
icon: "bi-boxes",
},
{
label: "My Stock History",
path: "/cashier/stock-history",
icon: "bi-clock-history",
},
];

function CashierNavbar() {
const navigate = useNavigate();

const handleLogout = () => {
const confirmed = window.confirm("Are you sure you want to log out?");


if (!confirmed) return;

localStorage.removeItem("cashierToken");
localStorage.removeItem("cashier");

navigate("/cashier-login", { replace: true });


};

return ( <nav className="navbar navbar-expand-lg bg-white border-bottom sticky-top"> <div className="container">
{/* BRAND */}
<Link
className="navbar-brand fw-bold text-success"
to="/cashier/pos"
aria-label={`${STORE_NAME} Cashier Home`}
> <i className="bi bi-flower1 me-2"></i>
{STORE_NAME}


      <span className="badge bg-success-subtle text-success ms-2">
        Cashier
      </span>
    </Link>

    {/* MOBILE TOGGLE */}
    <button
      className="navbar-toggler"
      type="button"
      data-bs-toggle="collapse"
      data-bs-target="#cashierNavbar"
      aria-controls="cashierNavbar"
      aria-expanded="false"
      aria-label="Toggle cashier navigation"
    >
      <span className="navbar-toggler-icon"></span>
    </button>

    {/* NAVIGATION */}
    <div className="collapse navbar-collapse" id="cashierNavbar">
      <ul className="navbar-nav mx-auto mb-2 mb-lg-0">
        {links.map((link) => (
          <li className="nav-item" key={link.path}>
            <NavLink
              to={link.path}
              className={({ isActive }) =>
                `nav-link ${isActive ? "active fw-bold text-success" : ""}`
              }
              end
            >
              <i className={`bi ${link.icon} me-1`}></i>
              {link.label}
            </NavLink>
          </li>
        ))}
      </ul>

      {/* RIGHT SIDE */}
      <div className="d-flex align-items-center gap-2 navbar-actions">
        <span className="text-secondary small d-none d-xl-inline">
          <i className="bi bi-person-badge me-1"></i>
          Cashier Workspace
        </span>

        <button
          type="button"
          className="btn btn-outline-danger"
          onClick={handleLogout}
        >
          <i className="bi bi-box-arrow-right me-1"></i>
          Logout
        </button>
      </div>
    </div>
  </div>
</nav>


);
}

export default CashierNavbar;
