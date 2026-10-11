export interface User {
  id: string;
  username: string;
  role: 'CUSTOMER' | 'BARISTA';
  loyaltyBalance: number;
  isActive: boolean;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  expiresIn: number;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface RegisterPayload {
  username: string;
  password: string;
}
