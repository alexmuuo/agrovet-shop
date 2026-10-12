import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api/api";

function Register() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });

    setError("");
  };

  const passwordsMatch =
    form.password &&
    form.confirmPassword &&
    form.password === form.confirmPassword;

  const passwordsDoNotMatch =
    form.password &&
    form.confirmPassword &&
    form.password !== form.confirmPassword;

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError("");

    if (
      !form.name ||
      !form.phone ||
      !form.password
    ) {
      setError(
        "Please fill in all required fields."
      );
      return;
    }

    if (form.password.length < 6) {
      setError(
        "Password must be at least 6 characters."
      );
      return;
    }

    if (
      form.password !==
      form.confirmPassword
    ) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);

      const response = await api.post(
        "/customers/register",
        {
          name: form.name,
          phone: form.phone,
          email: form.email || null,
          password: form.password,
        }
      );

      const customer =
        response.data.customer;

      localStorage.setItem(
        "customer",
        JSON.stringify(customer)
      );

      // Tell the Navbar that the customer has logged in
      window.dispatchEvent(
        new Event("customerLogin")
      );

      navigate("/");
    } catch (error) {
      console.error(error);

      setError(
        error.response?.data?.message ||
          "Could not create your account. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container py-5">

      <div className="row justify-content-center">

        <div className="col-md-7 col-lg-5">

          <div className="card border-0 shadow-sm">

            <div className="card-body p-4 p-md-5">

              <div className="text-center mb-4">

                <i className="bi bi-person-plus fs-1 text-success"></i>

                <h2 className="fw-bold mt-2">
                  Create Account
                </h2>

                <p className="text-secondary mb-0">
                  Create your agrovet customer account.
                </p>

              </div>

              {error && (
                <div className="alert alert-danger">
                  <i className="bi bi-exclamation-triangle me-2"></i>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit}>

                {/* NAME */}
                <div className="mb-3">

                  <label className="form-label fw-semibold">
                    Full Name
                  </label>

                  <input
                    type="text"
                    name="name"
                    className="form-control"
                    value={form.name}
                    onChange={handleChange}
                    placeholder="Enter your name"
                    required
                  />

                </div>

                {/* PHONE */}
                <div className="mb-3">

                  <label className="form-label fw-semibold">
                    Phone Number
                  </label>

                  <input
                    type="tel"
                    name="phone"
                    className="form-control"
                    value={form.phone}
                    onChange={handleChange}
                    placeholder="07XXXXXXXX"
                    required
                  />

                </div>

                {/* EMAIL */}
                <div className="mb-3">

                  <label className="form-label fw-semibold">
                    Email
                    <span className="text-secondary fw-normal">
                      {" "} (optional)
                    </span>
                  </label>

                  <input
                    type="email"
                    name="email"
                    className="form-control"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="you@example.com"
                  />

                </div>

                {/* PASSWORD */}
                <div className="mb-3">

                  <label className="form-label fw-semibold">
                    Password
                  </label>

                  <div className="input-group">

                    <input
                      type={
                        showPassword
                          ? "text"
                          : "password"
                      }
                      name="password"
                      className="form-control"
                      value={form.password}
                      onChange={handleChange}
                      placeholder="At least 6 characters"
                      required
                    />

                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() =>
                        setShowPassword(
                          !showPassword
                        )
                      }
                    >
                      <i
                        className={`bi ${
                          showPassword
                            ? "bi-eye-slash"
                            : "bi-eye"
                        }`}
                      ></i>
                    </button>

                  </div>

                  {form.password &&
                    form.password.length < 6 && (
                      <small className="text-danger">
                        Password must be at least 6 characters.
                      </small>
                    )}

                </div>

                {/* CONFIRM PASSWORD */}
                <div className="mb-4">

                  <label className="form-label fw-semibold">
                    Confirm Password
                  </label>

                  <div className="input-group">

                    <input
                      type={
                        showConfirmPassword
                          ? "text"
                          : "password"
                      }
                      name="confirmPassword"
                      className={`form-control ${
                        passwordsMatch
                          ? "is-valid"
                          : passwordsDoNotMatch
                          ? "is-invalid"
                          : ""
                      }`}
                      value={form.confirmPassword}
                      onChange={handleChange}
                      placeholder="Enter password again"
                      required
                    />

                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() =>
                        setShowConfirmPassword(
                          !showConfirmPassword
                        )
                      }
                    >
                      <i
                        className={`bi ${
                          showConfirmPassword
                            ? "bi-eye-slash"
                            : "bi-eye"
                        }`}
                      ></i>
                    </button>

                  </div>

                  {/* LIVE PASSWORD MESSAGE */}

                  {passwordsMatch && (
                    <div className="text-success small mt-1">
                      <i className="bi bi-check-circle me-1"></i>
                      Passwords match
                    </div>
                  )}

                  {passwordsDoNotMatch && (
                    <div className="text-danger small mt-1">
                      <i className="bi bi-x-circle me-1"></i>
                      Passwords do not match
                    </div>
                  )}

                </div>

                {/* REGISTER BUTTON */}
                <button
                  type="submit"
                  className="btn btn-success w-100"
                  disabled={
                    loading ||
                    !passwordsMatch
                  }
                >

                  {loading ? (
                    <>
                      <span
                        className="spinner-border spinner-border-sm me-2"
                        role="status"
                      ></span>

                      Creating account...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-person-plus me-2"></i>
                      Create Account
                    </>
                  )}

                </button>

              </form>

              <div className="text-center mt-4">

                <span className="text-secondary">
                  Already have an account?
                </span>

                <Link
                  to="/login"
                  className="text-success fw-semibold text-decoration-none ms-1"
                >
                  Login
                </Link>

              </div>

            </div>

          </div>

        </div>

      </div>

    </div>
  );
}

export default Register;