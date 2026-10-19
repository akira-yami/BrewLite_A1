"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { registerApi } from "../../features/auth/api";
import { authSession } from "../../features/auth/session";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (password !== confirmPassword) {
      setErrorMessage("Mật khẩu xác nhận không khớp.");
      return;
    }

    if (password.length < 6) {
      setErrorMessage("Mật khẩu phải có tối thiểu 6 ký tự.");
      return;
    }

    setLoading(true);

    try {
      const data = await registerApi({ username, password });
      authSession.establish(data);
      router.replace("/menu");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("Đã có lỗi xảy ra khi đăng ký.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-amber-50/40 px-6 py-12 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-800 text-2xl font-bold text-white shadow-md">
          ☕
        </div>
        <h2 className="mt-4 text-center text-3xl font-extrabold tracking-tight text-stone-900">
          Tạo tài khoản mới
        </h2>
        <p className="mt-2 text-center text-sm text-stone-600">
          Đăng ký để tận hưởng ưu đãi và dịch vụ tại BrewLite
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="rounded-2xl border border-stone-200 bg-white px-8 py-10 shadow-sm sm:px-10">
          {errorMessage && (
            <div role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <span className="font-semibold">Lỗi: </span>
              {errorMessage}
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium text-stone-700"
              >
                Tên đăng nhập
              </label>
              <div className="mt-1">
                <input
                  id="username"
                  name="username"
                  autoComplete="username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Từ 3-50 ký tự (chữ, số, _, .)"
                  className="block w-full rounded-lg border border-stone-300 px-3.5 py-2.5 text-stone-900 shadow-sm placeholder:text-stone-400 focus:border-amber-700 focus:outline-none focus:ring-1 focus:ring-amber-700 sm:text-sm"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-stone-700"
              >
                Mật khẩu
              </label>
              <div className="mt-1">
                <input
                  id="password"
                  name="password"
                  autoComplete="new-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Tối thiểu 6 ký tự"
                  className="block w-full rounded-lg border border-stone-300 px-3.5 py-2.5 text-stone-900 shadow-sm placeholder:text-stone-400 focus:border-amber-700 focus:outline-none focus:ring-1 focus:ring-amber-700 sm:text-sm"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-stone-700"
              >
                Xác nhận mật khẩu
              </label>
              <div className="mt-1">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  autoComplete="new-password"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Nhập lại mật khẩu"
                  className="block w-full rounded-lg border border-stone-300 px-3.5 py-2.5 text-stone-900 shadow-sm placeholder:text-stone-400 focus:border-amber-700 focus:outline-none focus:ring-1 focus:ring-amber-700 sm:text-sm"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="flex w-full justify-center rounded-lg bg-amber-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800 disabled:opacity-60"
              >
                {loading ? "Đang xử lý..." : "Đăng ký tài khoản"}
              </button>
            </div>
          </form>

          <div className="mt-6 text-center text-sm text-stone-600">
            Đã có tài khoản?{" "}
            <Link
              href="/login"
              className="font-semibold text-amber-800 hover:text-amber-900 hover:underline"
            >
              Đăng nhập tại đây
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
