"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
      <div className="text-center max-w-md">
        <h2 className="text-xl font-semibold text-red-400 mb-2">
          Something went wrong
        </h2>
        <p className="text-slate-400 mb-4">
          {error.message === "Invalid session: missing user ID"
            ? "Your session has expired. Please log in again."
            : "An unexpected error occurred. Please try again."}
        </p>
        <button
          onClick={reset}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-6 py-2.5 rounded-lg transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
