export type UserRole = 'admin' | 'client';

export interface StoredUser {
  id: string;
  login: string;
  passwordHash: string;
  role: UserRole;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export interface JwtPayload {
  sub: string;
  login: string;
  role: UserRole;
  name: string;
}

export interface SafeUser {
  id: string;
  login: string;
  role: UserRole;
  name: string;
  isActive: boolean;
  createdAt: string;
}
