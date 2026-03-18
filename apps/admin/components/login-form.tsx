"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { apiFetch, ApiError, setStoredCsrfToken } from "../lib/api";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("operator@example.local");
  const [password, setPassword] = useState("ChangeMe123!");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const payload = await apiFetch<{
        csrfToken: string;
      }>("/v1/admin/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email,
          password
        })
      });

      setStoredCsrfToken(payload.csrfToken);
      router.push("/chat");
      router.refresh();
    } catch (unknownError) {
      const message =
        unknownError instanceof ApiError ? unknownError.message : "Login failed";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-200">Email</label>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none transition focus:border-aurora/60 focus:bg-white/10"
          autoComplete="email"
          required
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-200">Password</label>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none transition focus:border-aurora/60 focus:bg-white/10"
          autoComplete="current-password"
          required
        />
      </div>
      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-2xl bg-gradient-to-r from-aurora via-cyan-400 to-emerald-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {submitting ? "Входим..." : "Войти в операторскую админку"}
      </button>
    </form>
  );
}
