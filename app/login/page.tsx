"use client";

import { FormEvent, useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "No se pudo iniciar sesión.");
        setLoading(false);
        return;
      }
      window.location.href = "/";
    } catch {
      setError("No se pudo conectar con el servidor.");
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <div className="container login">
        <div className="header">
          <h1>Transcriptor</h1>
          <p>Introduce la contraseña para continuar.</p>
        </div>
        <form className="card stack" onSubmit={onSubmit}>
          <label className="field">
            Contraseña
            <input
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <div className="error">{error}</div>}
          <button className="primary" type="submit" disabled={loading || !password}>
            {loading ? "Comprobando…" : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}
