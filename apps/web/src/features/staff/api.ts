import { authSession } from "../auth/session";
import type { StaffOrder, StaffQueueStatus, StaffTargetStatus } from "./types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";

export class StaffApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "StaffApiError";
  }
}

async function request<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  const json = (await response.json().catch(() => null)) as {
    data?: T;
    error?: { message?: string; code?: string };
    message?: string;
  } | null;

  // Chỉ 401 mới kết thúc phiên; 403/409 giữ phiên và hiển thị lỗi cho người dùng.
  if (response.status === 401) authSession.invalidate(token);

  if (!response.ok) {
    throw new StaffApiError(
      json?.error?.message ??
        json?.message ??
        "Không thể xử lý yêu cầu của nhân viên.",
      response.status,
      json?.error?.code,
    );
  }
  if (!json || json.data === undefined) {
    throw new StaffApiError("Phản hồi máy chủ không hợp lệ.", response.status);
  }
  return json.data;
}

export function getStaffQueueApi(token: string, status?: StaffQueueStatus) {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return request<StaffOrder[]>(`/staff/orders${query}`, token);
}

export function updateStaffOrderStatusApi(
  token: string,
  orderId: string,
  status: StaffTargetStatus,
) {
  return request<StaffOrder>(
    `/staff/orders/${encodeURIComponent(orderId)}/status`,
    token,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    },
  );
}

