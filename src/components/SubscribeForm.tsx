"use client";

import { useState } from "react";

export function SubscribeForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setMessage(
          data.error?.includes("not configured")
            ? "Subscription is not available yet. Check back soon!"
            : data.error || "Something went wrong. Please try again."
        );
        return;
      }

      setStatus("success");
      setMessage("Thanks for subscribing! You'll be notified when new posts are published.");
      setEmail("");
    } catch {
      setStatus("error");
      setMessage("Something went wrong. Please try again.");
    }
  };

  return (
    <div className="bg-[#f6f6f6] rounded-lg p-6">
      <h3 className="text-lg font-semibold text-[#242424] mb-2">
        Subscribe to the blog
      </h3>
      <p className="text-sm text-[#757575] mb-4">
        Get new posts delivered to your inbox. No spam, unsubscribe anytime.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email"
          disabled={status === "loading"}
          className="flex-1 px-4 py-3 rounded-md border border-[#e5e5e5] bg-white text-[#242424] placeholder:text-[#757575] focus:outline-none focus:ring-2 focus:ring-[#242424] focus:border-transparent min-h-[44px]"
          required
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="px-6 py-3 bg-[#242424] text-white font-medium rounded-md hover:bg-[#3d3d3d] transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
        >
          {status === "loading" ? "Subscribing..." : "Subscribe"}
        </button>
      </form>
      {message && (
        <p
          className={`mt-3 text-sm ${
            status === "success" ? "text-green-600" : "text-red-600"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
