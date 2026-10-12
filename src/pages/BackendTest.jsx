import { useEffect, useState } from "react";
import api from "../api/api";

function BackendTest() {
  const [message, setMessage] = useState("Connecting...");
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/health")
      .then((response) => {
        setMessage(response.data.message);
      })
      .catch((error) => {
        console.error(error);
        setError("Could not connect to the backend.");
      });
  }, []);

  return (
    <div className="container py-5 text-center">
      <h1 className="fw-bold">
        Backend Connection Test
      </h1>

      {error ? (
        <div className="alert alert-danger mt-4">
          {error}
        </div>
      ) : (
        <div className="alert alert-success mt-4">
          <i className="bi bi-check-circle me-2"></i>
          {message}
        </div>
      )}
    </div>
  );
}

export default BackendTest;