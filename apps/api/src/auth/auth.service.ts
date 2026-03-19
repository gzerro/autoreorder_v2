import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, promises as fs } from 'fs';
import { dirname, join, resolve } from 'path';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import type { JwtPayload, SafeUser, StoredUser, UserRole } from './auth.types';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly projectRoot = this.findProjectRoot(process.cwd());
  private readonly usersFile = resolve(
    this.projectRoot,
    'shared-data',
    'users.json',
  );
  private readonly jwtSecret =
    process.env.JWT_SECRET || 'az-default-secret-change-me';

  private findProjectRoot(startDir: string): string {
    let currentDir = resolve(startDir);
    while (true) {
      if (
        existsSync(join(currentDir, 'shared-data')) &&
        existsSync(join(currentDir, 'apps'))
      ) {
        return currentDir;
      }
      const parent = dirname(currentDir);
      if (parent === currentDir) return resolve(startDir);
      currentDir = parent;
    }
  }

  async onModuleInit() {
    await this.seedAdmin();
  }

  private async seedAdmin() {
    const users = await this.readUsers();
    const adminExists = users.some((u) => u.role === 'admin');
    if (adminExists) return;

    const login = process.env.ADMIN_LOGIN || 'AZ12';
    const password = process.env.ADMIN_PASSWORD || 'As3211HH';
    const passwordHash = await bcrypt.hash(password, 10);

    const admin: StoredUser = {
      id: randomUUID(),
      login,
      passwordHash,
      role: 'admin',
      name: 'Администратор',
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    users.push(admin);
    await this.writeUsers(users);
    console.log(`Admin user seeded: login=${login}`);
  }

  private async readUsers(): Promise<StoredUser[]> {
    try {
      const raw = await fs.readFile(this.usersFile, 'utf-8');
      return JSON.parse(raw) as StoredUser[];
    } catch {
      return [];
    }
  }

  private async writeUsers(users: StoredUser[]): Promise<void> {
    const dir = dirname(this.usersFile);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      this.usersFile,
      JSON.stringify(users, null, 2),
      'utf-8',
    );
  }

  private toSafeUser(user: StoredUser): SafeUser {
    return {
      id: user.id,
      login: user.login,
      role: user.role,
      name: user.name,
      isActive: user.isActive,
      createdAt: user.createdAt,
    };
  }

  signToken(user: StoredUser): string {
    const payload: JwtPayload = {
      sub: user.id,
      login: user.login,
      role: user.role,
      name: user.name,
    };
    return jwt.sign(payload, this.jwtSecret, { expiresIn: '24h' });
  }

  async validateLogin(
    login: string,
    password: string,
  ): Promise<{ user: SafeUser; token: string }> {
    const users = await this.readUsers();
    const user = users.find((u) => u.login === login);

    if (!user) {
      throw new UnauthorizedException('Неверный логин или пароль');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Аккаунт деактивирован');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Неверный логин или пароль');
    }

    return { user: this.toSafeUser(user), token: this.signToken(user) };
  }

  async getMe(userId: string): Promise<SafeUser> {
    const users = await this.readUsers();
    const user = users.find((u) => u.id === userId);
    if (!user) throw new UnauthorizedException('Пользователь не найден');
    return this.toSafeUser(user);
  }

  async updateProfile(
    userId: string,
    data: { name: string },
  ): Promise<SafeUser> {
    const users = await this.readUsers();
    const user = users.find((u) => u.id === userId);
    if (!user) throw new NotFoundException('Пользователь не найден');
    user.name = data.name.trim();
    await this.writeUsers(users);
    return this.toSafeUser(user);
  }

  private generateLogin(): string {
    const num = Math.floor(1000 + Math.random() * 9000);
    return `client-${num}`;
  }

  private generatePassword(): string {
    const chars =
      'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let result = '';
    for (let i = 0; i < 10; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  async listClients(): Promise<
    Array<SafeUser & { suppliersCount: number; runsCount: number }>
  > {
    const users = await this.readUsers();
    const clients = users.filter((u) => u.role === 'client');

    const result = [];
    for (const client of clients) {
      const suppliersCount = await this.countClientSuppliers(client.id);
      const runsCount = await this.countClientRuns(client.id);
      result.push({
        ...this.toSafeUser(client),
        suppliersCount,
        runsCount,
      });
    }

    return result;
  }

  async createClient(data: {
    name: string;
  }): Promise<{ user: SafeUser; login: string; password: string }> {
    const users = await this.readUsers();

    let login = this.generateLogin();
    while (users.some((u) => u.login === login)) {
      login = this.generateLogin();
    }

    const password = this.generatePassword();
    const passwordHash = await bcrypt.hash(password, 10);

    const client: StoredUser = {
      id: randomUUID(),
      login,
      passwordHash,
      role: 'client',
      name: data.name.trim(),
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    users.push(client);
    await this.writeUsers(users);

    await this.initClientData(client.id);

    return { user: this.toSafeUser(client), login, password };
  }

  async updateClient(
    clientId: string,
    data: { name?: string; login?: string },
  ): Promise<SafeUser> {
    const users = await this.readUsers();
    const user = users.find((u) => u.id === clientId && u.role === 'client');
    if (!user) throw new NotFoundException('Клиент не найден');

    if (data.name !== undefined) user.name = data.name.trim();

    if (data.login !== undefined) {
      const newLogin = data.login.trim();
      if (users.some((u) => u.login === newLogin && u.id !== clientId)) {
        throw new BadRequestException('Такой логин уже занят');
      }
      user.login = newLogin;
    }

    await this.writeUsers(users);
    return this.toSafeUser(user);
  }

  async changeClientPassword(
    clientId: string,
    newPassword: string,
  ): Promise<{ ok: true }> {
    const users = await this.readUsers();
    const user = users.find((u) => u.id === clientId && u.role === 'client');
    if (!user) throw new NotFoundException('Клиент не найден');

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await this.writeUsers(users);
    return { ok: true };
  }

  async toggleClientActive(
    clientId: string,
  ): Promise<SafeUser> {
    const users = await this.readUsers();
    const user = users.find((u) => u.id === clientId && u.role === 'client');
    if (!user) throw new NotFoundException('Клиент не найден');

    user.isActive = !user.isActive;
    await this.writeUsers(users);
    return this.toSafeUser(user);
  }

  async getClientDetail(clientId: string): Promise<{
    user: SafeUser;
    suppliersCount: number;
    runsCount: number;
  }> {
    const users = await this.readUsers();
    const user = users.find((u) => u.id === clientId && u.role === 'client');
    if (!user) throw new NotFoundException('Клиент не найден');

    return {
      user: this.toSafeUser(user),
      suppliersCount: await this.countClientSuppliers(clientId),
      runsCount: await this.countClientRuns(clientId),
    };
  }

  async getClientSuppliers(clientId: string): Promise<unknown[]> {
    const filePath = this.getClientSuppliersFile(clientId);
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  async getClientHistory(clientId: string): Promise<unknown[]> {
    const runsDir = this.getClientRunsDir(clientId);
    try {
      await fs.access(runsDir);
    } catch {
      return [];
    }

    const entries = await fs.readdir(runsDir, { withFileTypes: true });
    const items = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const metaPath = join(runsDir, entry.name, 'run-meta.json');
      try {
        const raw = await fs.readFile(metaPath, 'utf-8');
        items.push(JSON.parse(raw));
      } catch {
        // skip
      }
    }

    return items.sort((a: any, b: any) =>
      (b.createdAt || '').localeCompare(a.createdAt || ''),
    );
  }

  getClientSuppliersFile(clientId: string): string {
    return resolve(
      this.projectRoot,
      'shared-data',
      'clients',
      clientId,
      'suppliers.json',
    );
  }

  getClientRunsDir(clientId: string): string {
    return join(
      resolve(this.projectRoot, process.env.STORAGE_DIR || 'storage'),
      'clients',
      clientId,
      'runs',
    );
  }

  getClientStorageDir(clientId: string): string {
    return join(
      resolve(this.projectRoot, process.env.STORAGE_DIR || 'storage'),
      'clients',
      clientId,
    );
  }

  private async initClientData(clientId: string): Promise<void> {
    const suppliersFile = this.getClientSuppliersFile(clientId);
    const dir = dirname(suppliersFile);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(suppliersFile, '[]', 'utf-8');

    const runsDir = this.getClientRunsDir(clientId);
    await fs.mkdir(runsDir, { recursive: true });
  }

  private async countClientSuppliers(clientId: string): Promise<number> {
    try {
      const raw = await fs.readFile(
        this.getClientSuppliersFile(clientId),
        'utf-8',
      );
      return JSON.parse(raw).length;
    } catch {
      return 0;
    }
  }

  private async countClientRuns(clientId: string): Promise<number> {
    try {
      const entries = await fs.readdir(this.getClientRunsDir(clientId), {
        withFileTypes: true,
      });
      return entries.filter((e) => e.isDirectory()).length;
    } catch {
      return 0;
    }
  }
}
