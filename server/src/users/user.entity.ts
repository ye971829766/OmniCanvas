export interface User {
  id: string;
  username: string;
  nickname: string;
  passwordHash: string;
  avatarUrl?: string;
  role: "user" | "admin";
  createdAt: string;
  updatedAt: string;
}

export interface UserPublicInfo {
  id: string;
  username: string;
  nickname: string;
  avatarUrl?: string;
  role: "user" | "admin";
  createdAt: string;
}

export interface RegisterDto {
  username: string;
  nickname: string;
  password: string;
  avatarUrl?: string;
}

export interface LoginDto {
  username: string;
  password: string;
}

export interface UpdateProfileDto {
  nickname?: string;
  avatarUrl?: string;
  oldPassword?: string;
  newPassword?: string;
}

export interface AuthResponse {
  user: UserPublicInfo;
  token: string;
}
