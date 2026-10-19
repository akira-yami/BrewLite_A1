'use client';

import Link from 'next/link';
import { authSession } from './session';
import { getMeApi } from './api';
import { useAuthSession } from './use-auth-session';

export function AuthControls() {
  const session = useAuthSession();
  if (session.status === 'loading') {
    return (
      <span role="status" className="text-xs text-[#4A3E35]">
        Đang kiểm tra phiên…
      </span>
    );
  }
  if (session.status === 'error') {
    return (
      <div className="flex items-center gap-2 text-xs">
        <button
          type="button"
          className="font-semibold underline"
          onClick={() => {
            void authSession.restore(getMeApi);
          }}
        >
          Thử lại phiên đăng nhập
        </button>
        <button type="button" onClick={() => authSession.logout()}>
          Đăng xuất
        </button>
      </div>
    );
  }
  if (session.status === 'authenticated' && session.user) {
    return (
      <div className="flex items-center gap-2 text-xs sm:text-sm">
        <span
          className="hidden max-w-28 truncate font-semibold sm:inline"
          title={session.user.username}
        >
          {session.user.username}
        </span>
        <button
          type="button"
          onClick={() => authSession.logout()}
          className="rounded-full border border-[#D8CCBA] px-3 py-2 font-semibold transition hover:bg-white focus-visible:outline-2 focus-visible:outline-[#153D2C]"
        >
          Đăng xuất
        </button>
      </div>
    );
  }
  return (
    <Link
      href="/login"
      className="whitespace-nowrap text-xs font-semibold hover:underline sm:text-sm"
    >
      Đăng nhập
    </Link>
  );
}

export function SessionNotice() {
  const { reason } = useAuthSession();
  if (!reason) return null;
  return (
    <div
      role="status"
      className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
    >
      {reason === 'logout'
        ? 'Bạn đã đăng xuất.'
        : 'Phiên đăng nhập đã hết hạn hoặc không còn hợp lệ. Vui lòng đăng nhập lại.'}
    </div>
  );
}
