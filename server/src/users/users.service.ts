import { Injectable, HttpException, HttpStatus } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { OAuth2Client } from "google-auth-library";
import { createHmac, pbkdf2Sync, randomBytes } from "crypto";
import type {
  User,
  UserPublicInfo,
  RegisterDto,
  LoginDto,
  UpdateProfileDto,
  AuthResponse,
} from "./user.entity";

const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  "377817957215-m56vckjbc681ha19p1dn1vmrt50kdii7.apps.googleusercontent.com";
const googleOAuthClient = new OAuth2Client(GOOGLE_CLIENT_ID);

const JWT_SECRET = process.env.JWT_SECRET || "omnicanvas_super_secret_jwt_key_2026";
const TOKEN_EXPIRES_IN_SEC = 7 * 24 * 3600; // 7 days

@Injectable()
export class UsersService {
  constructor(private readonly dbService: DatabaseService) {}

  private get db() {
    return this.dbService.db;
  }

  // --- Password & Token Utils ---
  private hashPassword(password: string): string {
    const salt = randomBytes(16).toString("hex");
    const hash = pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
    return `${salt}:${hash}`;
  }

  private verifyPassword(password: string, storedHash: string): boolean {
    if (storedHash === "OAUTH_GOOGLE") return false;
    const [salt, originalHash] = storedHash.split(":");
    if (!salt || !originalHash) return false;
    const hash = pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
    return hash === originalHash;
  }

  private createToken(user: User): string {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url"
    );
    const nowSec = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(
      JSON.stringify({
        sub: user.id,
        username: user.username,
        role: user.role,
        iat: nowSec,
        exp: nowSec + TOKEN_EXPIRES_IN_SEC,
      })
    ).toString("base64url");

    const signature = createHmac("sha256", JWT_SECRET)
      .update(`${header}.${payload}`)
      .digest("base64url");

    return `${header}.${payload}.${signature}`;
  }

  verifyJwt(token: string): { sub: string; username: string; role: string } | null {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      const [header, payload, signature] = parts;

      const expectedSig = createHmac("sha256", JWT_SECRET)
        .update(`${header}.${payload}`)
        .digest("base64url");

      if (signature !== expectedSig) return null;

      const decodedPayload = JSON.parse(
        Buffer.from(payload || "", "base64url").toString("utf-8")
      );

      const nowSec = Math.floor(Date.now() / 1000);
      if (decodedPayload.exp && decodedPayload.exp < nowSec) {
        return null; // Expired
      }

      return decodedPayload;
    } catch {
      return null;
    }
  }

  verifyToken(token: string) {
    return this.verifyJwt(token);
  }

  toPublicInfo(user: User): UserPublicInfo {
    return {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      role: user.role,
      createdAt: user.createdAt,
    };
  }

  // --- Dynamic Schema Safe User Insertion ---
  private insertUserRecord(userData: {
    id: string;
    username: string;
    nickname: string;
    passwordHash: string;
    avatarUrl: string;
    role: string;
    createdAt: string;
    updatedAt: string;
    email?: string;
  }) {
    const columnsInfo = this.db.query("PRAGMA table_info(users)").all() as any[];
    const rowObj: Record<string, any> = {};
    const colNames: string[] = [];
    const paramNames: string[] = [];

    for (const col of columnsInfo) {
      const name = col.name;
      colNames.push(name);
      paramNames.push(`$${name}`);

      if (name === "id") rowObj[`$id`] = userData.id;
      else if (name === "username") rowObj[`$username`] = userData.username;
      else if (name === "nickname") rowObj[`$nickname`] = userData.nickname;
      else if (name === "passwordHash") rowObj[`$passwordHash`] = userData.passwordHash;
      else if (name === "avatarUrl") rowObj[`$avatarUrl`] = userData.avatarUrl || "";
      else if (name === "role") rowObj[`$role`] = userData.role || "user";
      else if (name === "createdAt") rowObj[`$createdAt`] = userData.createdAt;
      else if (name === "updatedAt") rowObj[`$updatedAt`] = userData.updatedAt;
      else if (name === "email") rowObj[`$email`] = userData.email || userData.username;
      else if (name === "status") rowObj[`$status`] = 1; // Default active status for legacy schema
      else {
        rowObj[`$${name}`] = col.dflt_value !== null ? col.dflt_value : "";
      }
    }

    const sql = `INSERT INTO users (${colNames.join(", ")}) VALUES (${paramNames.join(", ")})`;
    const stmt = this.db.prepare(sql);
    stmt.run(rowObj);
  }

  // --- Auth Services ---
  async register(dto: RegisterDto): Promise<AuthResponse> {
    const username = dto.username.trim().toLowerCase();
    if (username.length < 3) {
      throw new HttpException("用户名至少 3 个字符", HttpStatus.BAD_REQUEST);
    }
    if (!dto.password || dto.password.length < 6) {
      throw new HttpException("密码至少 6 个字符", HttpStatus.BAD_REQUEST);
    }

    const existing = this.db
      .query("SELECT id FROM users WHERE LOWER(username) = $username")
      .get({ $username: username });

    if (existing) {
      throw new HttpException("用户名已被注册", HttpStatus.CONFLICT);
    }

    const id = crypto.randomUUID().replace(/-/g, "");
    const now = new Date().toISOString();
    const passwordHash = this.hashPassword(dto.password);
    const nickname = (dto.nickname || dto.username).trim();

    this.insertUserRecord({
      id,
      username,
      nickname,
      passwordHash,
      avatarUrl: dto.avatarUrl || "",
      role: "user",
      createdAt: now,
      updatedAt: now,
      email: username,
    });

    const user: User = {
      id,
      username,
      nickname,
      passwordHash,
      avatarUrl: dto.avatarUrl || "",
      role: "user",
      createdAt: now,
      updatedAt: now,
    };

    const token = this.createToken(user);
    return {
      user: this.toPublicInfo(user),
      token,
    };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const username = dto.username.trim().toLowerCase();
    const row = this.db
      .query("SELECT * FROM users WHERE LOWER(username) = $username")
      .get({ $username: username }) as User | null;

    if (!row || !this.verifyPassword(dto.password, row.passwordHash)) {
      throw new HttpException("用户名或密码不正确", HttpStatus.UNAUTHORIZED);
    }

    const token = this.createToken(row);
    return {
      user: this.toPublicInfo(row),
      token,
    };
  }

  async findById(id: string): Promise<UserPublicInfo | null> {
    const row = this.db
      .query("SELECT * FROM users WHERE id = $id")
      .get({ $id: id }) as User | null;

    if (!row) return null;
    return this.toPublicInfo(row);
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<UserPublicInfo> {
    const row = this.db
      .query("SELECT * FROM users WHERE id = $id")
      .get({ $id: id }) as User | null;

    if (!row) {
      throw new HttpException("用户不存在", HttpStatus.NOT_FOUND);
    }

    let newPasswordHash = row.passwordHash;
    if (dto.newPassword) {
      if (!dto.oldPassword || !this.verifyPassword(dto.oldPassword, row.passwordHash)) {
        throw new HttpException("原密码不正确", HttpStatus.BAD_REQUEST);
      }
      if (dto.newPassword.length < 6) {
        throw new HttpException("新密码必须至少6个字符", HttpStatus.BAD_REQUEST);
      }
      newPasswordHash = this.hashPassword(dto.newPassword);
    }

    const nickname = dto.nickname !== undefined ? dto.nickname.trim() : row.nickname;
    const avatarUrl = dto.avatarUrl !== undefined ? dto.avatarUrl : row.avatarUrl;
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      UPDATE users
      SET nickname = $nickname, avatarUrl = $avatarUrl, passwordHash = $passwordHash, updatedAt = $updatedAt
      WHERE id = $id
    `);

    stmt.run({
      $id: id,
      $nickname: nickname,
      $avatarUrl: avatarUrl || "",
      $passwordHash: newPasswordHash,
      $updatedAt: now,
    });

    const updatedUser: User = {
      ...row,
      nickname,
      avatarUrl,
      passwordHash: newPasswordHash,
      updatedAt: now,
    };

    return this.toPublicInfo(updatedUser);
  }

  async loginWithGoogle(idToken: string): Promise<AuthResponse> {
    try {
      const ticket = await googleOAuthClient.verifyIdToken({
        idToken,
        audience: GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        throw new HttpException("Google 身份验证效验失败", HttpStatus.UNAUTHORIZED);
      }

      const email = payload.email.toLowerCase();
      const nickname = payload.name || email.split("@")[0] || "Google User";
      const avatarUrl = payload.picture || "";

      let user = this.db
        .query("SELECT * FROM users WHERE LOWER(username) = $email")
        .get({ $email: email }) as User | null;

      if (!user) {
        const id = crypto.randomUUID().replace(/-/g, "");
        const now = new Date().toISOString();

        this.insertUserRecord({
          id,
          username: email,
          nickname,
          passwordHash: "OAUTH_GOOGLE",
          avatarUrl,
          role: "user",
          createdAt: now,
          updatedAt: now,
          email,
        });

        user = {
          id,
          username: email,
          nickname,
          passwordHash: "OAUTH_GOOGLE",
          avatarUrl,
          role: "user",
          createdAt: now,
          updatedAt: now,
        };
      }

      const token = this.createToken(user);
      return {
        user: this.toPublicInfo(user),
        token,
      };
    } catch (err: any) {
      console.error("Google ID token verification failed:", err);
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        err?.message || "Google 身份验证效验失败",
        HttpStatus.UNAUTHORIZED
      );
    }
  }

  // --- Admin User Management Services ---
  async getAllUsers(): Promise<UserPublicInfo[]> {
    const rows = this.db
      .query("SELECT * FROM users ORDER BY createdAt DESC")
      .all() as User[];
    return rows.map((u) => this.toPublicInfo(u));
  }

  async adminCreateUser(dto: {
    username: string;
    nickname?: string;
    password: string;
    role?: string;
  }): Promise<UserPublicInfo> {
    const username = dto.username.trim().toLowerCase();
    if (!username || username.length < 3) {
      throw new HttpException("用户名至少 3 个字符", HttpStatus.BAD_REQUEST);
    }
    if (!dto.password || dto.password.length < 6) {
      throw new HttpException("密码至少 6 个字符", HttpStatus.BAD_REQUEST);
    }

    const existing = this.db
      .query("SELECT id FROM users WHERE LOWER(username) = $username")
      .get({ $username: username });

    if (existing) {
      throw new HttpException("该用户名已存在", HttpStatus.CONFLICT);
    }

    const id = crypto.randomUUID().replace(/-/g, "");
    const now = new Date().toISOString();
    const passwordHash = this.hashPassword(dto.password);
    const nickname = (dto.nickname || dto.username).trim();
    const role = ((dto.role || "user") as "user" | "admin");

    this.insertUserRecord({
      id,
      username,
      nickname,
      passwordHash,
      avatarUrl: "",
      role,
      createdAt: now,
      updatedAt: now,
      email: username,
    });

    const user: User = {
      id,
      username,
      nickname,
      passwordHash,
      avatarUrl: "",
      role,
      createdAt: now,
      updatedAt: now,
    };

    return this.toPublicInfo(user);
  }

  async adminUpdateUser(
    id: string,
    dto: { nickname?: string; role?: string; password?: string }
  ): Promise<UserPublicInfo> {
    const row = this.db
      .query("SELECT * FROM users WHERE id = $id")
      .get({ $id: id }) as User | null;

    if (!row) {
      throw new HttpException("用户不存在", HttpStatus.NOT_FOUND);
    }

    let passwordHash = row.passwordHash;
    if (dto.password) {
      if (dto.password.length < 6) {
        throw new HttpException("新密码至少 6 个字符", HttpStatus.BAD_REQUEST);
      }
      passwordHash = this.hashPassword(dto.password);
    }

    const nickname = dto.nickname !== undefined ? dto.nickname.trim() : row.nickname;
    const role = ((dto.role !== undefined ? dto.role : row.role) as "user" | "admin");
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      UPDATE users
      SET nickname = $nickname, role = $role, passwordHash = $passwordHash, updatedAt = $updatedAt
      WHERE id = $id
    `);

    stmt.run({
      $id: id,
      $nickname: nickname,
      $role: role,
      $passwordHash: passwordHash,
      $updatedAt: now,
    });

    return this.toPublicInfo({
      ...row,
      nickname,
      role,
      passwordHash,
      updatedAt: now,
    });
  }

  async adminDeleteUser(id: string): Promise<{ success: boolean }> {
    const row = this.db
      .query("SELECT id FROM users WHERE id = $id")
      .get({ $id: id });

    if (!row) {
      throw new HttpException("用户不存在", HttpStatus.NOT_FOUND);
    }

    this.db.prepare("DELETE FROM users WHERE id = $id").run({ $id: id });
    return { success: true };
  }
}
