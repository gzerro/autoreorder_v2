'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';

/* ========== Types ========== */

type PageKey = 'main' | 'history' | 'suppliers' | 'profile';
type AdminPageKey = 'clients' | 'client-detail' | 'profile';

type AuthUser = {
  id: string;
  login: string;
  role: 'admin' | 'client';
  name: string;
  isActive: boolean;
  createdAt: string;
};

type AdminClient = AuthUser & {
  suppliersCount: number;
  runsCount: number;
};

type Settings = {
  coverageDays: number;
  salesMultiplier: number;
  reserveUnits: number;
  packSize: number;
  minOrderQty: number;
  buyerName: string;
  deliveryDate: string;
};

type OrderItem = {
  barcode: string;
  name: string;
  soldQty: number;
  orderQty: number;
  price: number;
};

type SupplierResult = {
  code: string;
  name: string;
  itemsCount: number;
  totalSoldQty: number;
  totalOrderQty: number;
  downloadFileName: string;
  downloadUrl: string;
  orderItems: OrderItem[];
};

type RunSummary = {
  totalRows: number;
  uniqueBarcodes: number;
  matchedBarcodes: number;
  unknownBarcodes: number;
  suppliersWithOrders: number;
};

type RunResult = {
  runId: string;
  sourceFileName: string;
  generatedAt: string;
  sourceDownloadUrl: string;
  period: { start: string | null; end: string | null; days: number };
  settings: Settings;
  summary: RunSummary;
  suppliers: SupplierResult[];
  unknownItems: Array<{ barcode: string; name: string; soldQty: number }>;
};

type HistoryItem = {
  runId: string;
  sourceFileName: string;
  status: 'processing' | 'completed' | 'failed';
  createdAt: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  generatedAt: string | null;
  summary: RunSummary | null;
  suppliersCount: number;
  unknownItemsCount: number;
  sourceDownloadUrl: string;
  errorMessage: string | null;
};

type HistoryRunDetail = {
  historyMeta: HistoryItem;
  result: RunResult | null;
};

type SupplierSeed = {
  code: string;
  name: string;
  items: Array<{
    barcode: string;
    name: string;
    price: number;
    isActive?: boolean;
    source?: string;
  }>;
};

/* ========== Constants & helpers ========== */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_URL}${path}`, { ...init, credentials: 'include' });
}

const INITIAL_SETTINGS: Settings = {
  coverageDays: 7,
  salesMultiplier: 1,
  reserveUnits: 0,
  packSize: 1,
  minOrderQty: 1,
  buyerName: 'Магазин Ромашка',
  deliveryDate: '',
};

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ru-RU');
}

function formatDuration(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—';
  if (value < 1000) return `${value} мс`;
  return `${(value / 1000).toFixed(2)} сек`;
}

async function readApiError(response: Response): Promise<string> {
  const ct = response.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const p = (await response.json()) as {
      message?: string | string[];
      error?: string;
    };
    if (Array.isArray(p.message)) return p.message.join(', ');
    return p.message || p.error || 'Ошибка запроса';
  }
  return (await response.text()) || 'Ошибка запроса';
}

function normalizeRunDetail(payload: unknown): HistoryRunDetail {
  const data = payload as Partial<HistoryRunDetail> & Partial<RunResult>;
  if (data.historyMeta) return data as HistoryRunDetail;
  const legacy = data as RunResult;
  return {
    historyMeta: {
      runId: legacy.runId,
      sourceFileName: legacy.sourceFileName,
      status: 'completed',
      createdAt: legacy.generatedAt,
      startedAt: legacy.generatedAt,
      finishedAt: legacy.generatedAt,
      durationMs: null,
      generatedAt: legacy.generatedAt,
      summary: legacy.summary,
      suppliersCount: legacy.suppliers?.length ?? 0,
      unknownItemsCount: legacy.unknownItems?.length ?? 0,
      sourceDownloadUrl: legacy.sourceDownloadUrl,
      errorMessage: null,
    },
    result: legacy,
  };
}

/* ========== Small components ========== */

function StatusBadge({ status }: { status: HistoryItem['status'] }) {
  const label =
    status === 'completed'
      ? 'Готово'
      : status === 'failed'
        ? 'Ошибка'
        : 'В обработке';
  return <span className={`status-badge status-${status}`}>{label}</span>;
}

function ResultView({ detail }: { detail: HistoryRunDetail }) {
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(
    new Set(),
  );
  const [unknownExpanded, setUnknownExpanded] = useState(false);

  const toggleSupplier = (code: string) => {
    setExpandedSuppliers((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const historyMeta = detail?.historyMeta;
  const result = detail?.result ?? null;

  if (!historyMeta) {
    return (
      <div className="result-card">
        <div className="error-box">
          Результат расчёта пришёл в неожиданном формате.
        </div>
      </div>
    );
  }

  return (
    <div className="result-card">
      <div className="result-header">
        <div>
          <h2>Прогон {historyMeta.runId.slice(0, 8)}</h2>
          <p className="muted">{historyMeta.sourceFileName}</p>
        </div>
        <StatusBadge status={historyMeta.status} />
      </div>

      <div className="meta-grid">
        <div>
          <div className="meta-label">Создан</div>
          <div>{formatDateTime(historyMeta.createdAt)}</div>
        </div>
        <div>
          <div className="meta-label">Длительность</div>
          <div>{formatDuration(historyMeta.durationMs)}</div>
        </div>
        <div>
          <div className="meta-label">Не найдено</div>
          <div>{historyMeta.unknownItemsCount}</div>
        </div>
        <div>
          <div className="meta-label">Поставщиков с заказом</div>
          <div>{historyMeta.suppliersCount}</div>
        </div>
      </div>

      <div className="toolbar">
        <a
          className="link-button"
          href={`${API_URL}${historyMeta.sourceDownloadUrl}`}
          target="_blank"
          rel="noreferrer"
        >
          Скачать исходный файл
        </a>
      </div>

      {historyMeta.errorMessage && (
        <div className="error-box">{historyMeta.errorMessage}</div>
      )}

      {!result && (
        <div className="empty-box">
          Для этого прогона нет готового результата.
        </div>
      )}

      {result && (
        <>
          <section className="section-block">
            <h3>Сводка</h3>
            <div className="meta-grid">
              <div>
                <div className="meta-label">Период</div>
                <div>
                  {result.period.start || '—'} → {result.period.end || '—'}
                </div>
              </div>
              <div>
                <div className="meta-label">Дней</div>
                <div>{result.period.days}</div>
              </div>
              <div>
                <div className="meta-label">Уникальных штрихкодов</div>
                <div>{result.summary.uniqueBarcodes}</div>
              </div>
              <div>
                <div className="meta-label">Найдено</div>
                <div>{result.summary.matchedBarcodes}</div>
              </div>
            </div>
          </section>

          <section className="section-block">
            <h3>Документы заказа по поставщикам</h3>
            {result.suppliers.length === 0 ? (
              <div className="empty-box">
                Ни один поставщик не получил заказ.
              </div>
            ) : (
              result.suppliers.map((supplier) => (
                <div key={supplier.code} className="supplier-card">
                  <div className="supplier-header">
                    <button
                      type="button"
                      className="supplier-toggle"
                      onClick={() => toggleSupplier(supplier.code)}
                    >
                      <span className="toggle-icon">
                        {expandedSuppliers.has(supplier.code) ? '▼' : '▶'}
                      </span>
                      <div>
                        <h4>{supplier.name}</h4>
                        <p className="muted">
                          {supplier.itemsCount} позиций · заказ{' '}
                          {supplier.totalOrderQty} шт.
                        </p>
                      </div>
                    </button>
                    <a
                      className="excel-button"
                      href={`${API_URL}${supplier.downloadUrl}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      ⬇ Скачать Excel
                    </a>
                  </div>
                  {expandedSuppliers.has(supplier.code) && (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Штрихкод</th>
                            <th>Товар</th>
                            <th>Продано</th>
                            <th>К заказу</th>
                            <th>Цена</th>
                          </tr>
                        </thead>
                        <tbody>
                          {supplier.orderItems.map((item) => (
                            <tr key={`${supplier.code}-${item.barcode}`}>
                              <td>{item.barcode}</td>
                              <td>{item.name}</td>
                              <td>{item.soldQty}</td>
                              <td>{item.orderQty}</td>
                              <td>{item.price.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))
            )}
          </section>

          <section className="section-block">
            <button
              type="button"
              className="supplier-toggle section-toggle"
              onClick={() => setUnknownExpanded((prev) => !prev)}
            >
              <span className="toggle-icon">
                {unknownExpanded ? '▼' : '▶'}
              </span>
              <h3>
                Товары без найденного поставщика ({result.unknownItems.length})
              </h3>
            </button>
            {unknownExpanded && (
              <>
                {result.unknownItems.length === 0 ? (
                  <div className="empty-box">
                    Все штрихкоды нашлись у известных поставщиков.
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Штрихкод</th>
                          <th>Товар</th>
                          <th>Продано</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.unknownItems.map((item) => (
                          <tr key={`${item.barcode}-${item.name}`}>
                            <td>{item.barcode}</td>
                            <td>{item.name}</td>
                            <td>{item.soldQty}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Toast({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);
  if (!message) return null;
  return (
    <div className="toast-overlay" onClick={onClose}>
      <div className="toast-box" onClick={(e) => e.stopPropagation()}>
        <div className="toast-emoji">🚧</div>
        <div className="toast-text">{message}</div>
        <button type="button" className="toast-close" onClick={onClose}>
          Понятно
        </button>
      </div>
    </div>
  );
}

/* ========== Main component ========== */

export default function HomePage() {
  /* --- Auth state --- */
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loginInput, setLoginInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  /* --- Admin state --- */
  const [adminPage, setAdminPage] = useState<AdminPageKey>('clients');
  const [adminClients, setAdminClients] = useState<AdminClient[]>([]);
  const [adminClientsLoading, setAdminClientsLoading] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedClientDetail, setSelectedClientDetail] = useState<any>(null);
  const [clientSuppliers, setClientSuppliers] = useState<SupplierSeed[]>([]);
  const [clientHistory, setClientHistory] = useState<HistoryItem[]>([]);
  const [createClientOpen, setCreateClientOpen] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientCreds, setNewClientCreds] = useState<{
    login: string;
    password: string;
  } | null>(null);
  const [editClientOpen, setEditClientOpen] = useState(false);
  const [editClientName, setEditClientName] = useState('');
  const [editClientLogin, setEditClientLogin] = useState('');
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [profileName, setProfileName] = useState('');

  /* --- Client app state --- */
  const [activePage, setActivePage] = useState<PageKey>('main');
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>(INITIAL_SETTINGS);
  const [error, setError] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [selectedHistoryRunId, setSelectedHistoryRunId] = useState<
    string | null
  >(null);
  const [selectedHistoryRun, setSelectedHistoryRun] =
    useState<HistoryRunDetail | null>(null);

  const [suppliers, setSuppliers] = useState<SupplierSeed[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [suppliersError, setSuppliersError] = useState('');
  const [selectedSupplierCode, setSelectedSupplierCode] = useState<
    string | null
  >(null);
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [supplierModalMode, setSupplierModalMode] = useState<
    'create' | 'edit'
  >('create');
  const [supplierFormName, setSupplierFormName] = useState('');
  const [supplierFormCode, setSupplierFormCode] = useState('');
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [itemModalMode, setItemModalMode] = useState<'create' | 'edit'>(
    'create',
  );
  const [itemFormBarcode, setItemFormBarcode] = useState('');
  const [itemFormName, setItemFormName] = useState('');
  const [itemFormPrice, setItemFormPrice] = useState('');
  const [itemEditOriginalBarcode, setItemEditOriginalBarcode] = useState('');
  const [deleteConfirmType, setDeleteConfirmType] = useState<
    'supplier' | 'item' | null
  >(null);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState('');
  const [deleteConfirmName, setDeleteConfirmName] = useState('');

  const selectedSupplier =
    suppliers.find((s) => s.code === selectedSupplierCode) || null;

  /* --- Auth handlers --- */

  useEffect(() => {
    apiFetch('/auth/me')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((u) => setAuthUser(u))
      .catch(() => setAuthUser(null))
      .finally(() => setAuthChecked(true));
  }, []);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');
    try {
      const resp = await apiFetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: loginInput, password: passwordInput }),
      });
      if (!resp.ok) throw new Error(await readApiError(resp));
      const user = await resp.json();
      setAuthUser(user);
    } catch (err) {
      setLoginError(
        err instanceof Error ? err.message : 'Ошибка входа',
      );
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleLogout() {
    await apiFetch('/auth/logout', { method: 'POST' });
    setAuthUser(null);
    setLoginInput('');
    setPasswordInput('');
    setAdminPage('clients');
    setActivePage('main');
  }

  async function handleUpdateProfile() {
    if (!profileName.trim()) return;
    try {
      const resp = await apiFetch('/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: profileName.trim() }),
      });
      if (!resp.ok) throw new Error(await readApiError(resp));
      const updated = await resp.json();
      setAuthUser((prev) => (prev ? { ...prev, name: updated.name } : prev));
      setProfileEditOpen(false);
    } catch {
      /* ignore */
    }
  }

  /* --- Admin handlers --- */

  const loadAdminClients = useCallback(async () => {
    setAdminClientsLoading(true);
    setAdminError('');
    try {
      const resp = await apiFetch('/auth/admin/clients');
      if (!resp.ok) throw new Error(await readApiError(resp));
      setAdminClients(await resp.json());
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : 'Ошибка загрузки');
    } finally {
      setAdminClientsLoading(false);
    }
  }, []);

  async function handleCreateClient() {
    if (!newClientName.trim()) return;
    setAdminError('');
    try {
      const resp = await apiFetch('/auth/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newClientName.trim() }),
      });
      if (!resp.ok) throw new Error(await readApiError(resp));
      const data = await resp.json();
      setNewClientCreds({ login: data.login, password: data.password });
      await loadAdminClients();
    } catch (err) {
      setAdminError(
        err instanceof Error ? err.message : 'Ошибка создания клиента',
      );
    }
  }

  async function openClientDetail(clientId: string) {
    setSelectedClientId(clientId);
    setAdminPage('client-detail');
    setAdminError('');
    try {
      const [detailResp, suppResp, histResp] = await Promise.all([
        apiFetch(`/auth/admin/clients/${clientId}`),
        apiFetch(`/auth/admin/clients/${clientId}/suppliers`),
        apiFetch(`/auth/admin/clients/${clientId}/history`),
      ]);
      if (detailResp.ok) setSelectedClientDetail(await detailResp.json());
      if (suppResp.ok) setClientSuppliers(await suppResp.json());
      if (histResp.ok) setClientHistory(await histResp.json());
    } catch {
      /* ignore */
    }
  }

  async function handleEditClient() {
    if (!selectedClientId) return;
    try {
      const resp = await apiFetch(
        `/auth/admin/clients/${selectedClientId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: editClientName.trim() || undefined,
            login: editClientLogin.trim() || undefined,
          }),
        },
      );
      if (!resp.ok) throw new Error(await readApiError(resp));
      setEditClientOpen(false);
      await openClientDetail(selectedClientId);
      await loadAdminClients();
    } catch (err) {
      setAdminError(
        err instanceof Error ? err.message : 'Ошибка сохранения',
      );
    }
  }

  async function handleChangePassword() {
    if (!selectedClientId || !newPassword) return;
    try {
      const resp = await apiFetch(
        `/auth/admin/clients/${selectedClientId}/password`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: newPassword }),
        },
      );
      if (!resp.ok) throw new Error(await readApiError(resp));
      setShowNewPassword(true);
    } catch (err) {
      setAdminError(
        err instanceof Error ? err.message : 'Ошибка смены пароля',
      );
    }
  }

  async function handleToggleClient(clientId: string) {
    const client = adminClients.find((c) => c.id === clientId);
    const action = client?.isActive ? 'деактивировать' : 'активировать';
    if (!confirm(`${action} клиента «${client?.name}»?`)) return;
    try {
      const resp = await apiFetch(`/auth/admin/clients/${clientId}`, {
        method: 'DELETE',
      });
      if (!resp.ok) throw new Error(await readApiError(resp));
      await loadAdminClients();
      if (selectedClientId === clientId) {
        await openClientDetail(clientId);
      }
    } catch (err) {
      setAdminError(
        err instanceof Error ? err.message : 'Ошибка операции',
      );
    }
  }

  function generateRandomPassword() {
    const chars =
      'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let result = '';
    for (let i = 0; i < 10; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewPassword(result);
  }

  /* --- Client app handlers --- */

  const change = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const loadHistoryRun = useCallback(async (runId: string) => {
    setSelectedHistoryRunId(runId);
    setHistoryError('');
    try {
      const response = await apiFetch(`/autozakaz/history/${runId}`);
      if (!response.ok) throw new Error(await readApiError(response));
      setSelectedHistoryRun(normalizeRunDetail(await response.json()));
    } catch (loadError) {
      setHistoryError(
        loadError instanceof Error
          ? loadError.message
          : 'Не удалось загрузить детали',
      );
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const response = await apiFetch('/autozakaz/history');
      if (!response.ok) throw new Error(await readApiError(response));
      const data = (await response.json()) as HistoryItem[];
      setHistoryItems(data);

      const runIdToOpen =
        selectedHistoryRunId &&
        data.some((item) => item.runId === selectedHistoryRunId)
          ? selectedHistoryRunId
          : data[0]?.runId;

      if (runIdToOpen) {
        await loadHistoryRun(runIdToOpen);
      } else {
        setSelectedHistoryRun(null);
        setSelectedHistoryRunId(null);
      }
    } catch (loadError) {
      setHistoryError(
        loadError instanceof Error
          ? loadError.message
          : 'Не удалось загрузить историю',
      );
    } finally {
      setHistoryLoading(false);
    }
  }, [loadHistoryRun, selectedHistoryRunId]);

  const loadSuppliers = useCallback(async () => {
    setSuppliersLoading(true);
    setSuppliersError('');
    try {
      const response = await apiFetch('/autozakaz/suppliers');
      if (!response.ok) throw new Error(await readApiError(response));
      setSuppliers((await response.json()) as SupplierSeed[]);
    } catch (loadError) {
      setSuppliersError(
        loadError instanceof Error
          ? loadError.message
          : 'Не удалось загрузить поставщиков',
      );
    } finally {
      setSuppliersLoading(false);
    }
  }, []);

  /* supplier CRUD helpers */
  function openCreateSupplier() {
    setSupplierFormName('');
    setSupplierModalMode('create');
    setSupplierModalOpen(true);
  }
  function openEditSupplier(supplier: SupplierSeed) {
    setSupplierFormName(supplier.name);
    setSupplierFormCode(supplier.code);
    setSupplierModalMode('edit');
    setSupplierModalOpen(true);
  }
  async function handleSaveSupplier() {
    const name = supplierFormName.trim();
    if (!name) return;
    setSuppliersError('');
    try {
      if (supplierModalMode === 'create') {
        const r = await apiFetch('/autozakaz/suppliers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        if (!r.ok) throw new Error(await readApiError(r));
      } else {
        const r = await apiFetch(`/autozakaz/suppliers/${supplierFormCode}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        if (!r.ok) throw new Error(await readApiError(r));
      }
      setSupplierModalOpen(false);
      await loadSuppliers();
    } catch (e) {
      setSuppliersError(e instanceof Error ? e.message : 'Ошибка');
    }
  }
  function requestDeleteSupplier(supplier: SupplierSeed) {
    setDeleteConfirmType('supplier');
    setDeleteConfirmTarget(supplier.code);
    setDeleteConfirmName(supplier.name);
  }
  async function confirmDelete() {
    if (deleteConfirmType === 'supplier') {
      try {
        const r = await apiFetch(
          `/autozakaz/suppliers/${deleteConfirmTarget}`,
          { method: 'DELETE' },
        );
        if (!r.ok) throw new Error(await readApiError(r));
        if (selectedSupplierCode === deleteConfirmTarget)
          setSelectedSupplierCode(null);
        setDeleteConfirmType(null);
        await loadSuppliers();
      } catch (e) {
        setSuppliersError(e instanceof Error ? e.message : 'Ошибка');
        setDeleteConfirmType(null);
      }
    } else if (deleteConfirmType === 'item' && selectedSupplierCode) {
      try {
        const r = await apiFetch(
          `/autozakaz/suppliers/${selectedSupplierCode}/items/${encodeURIComponent(deleteConfirmTarget)}`,
          { method: 'DELETE' },
        );
        if (!r.ok) throw new Error(await readApiError(r));
        setDeleteConfirmType(null);
        await loadSuppliers();
      } catch (e) {
        setSuppliersError(e instanceof Error ? e.message : 'Ошибка');
        setDeleteConfirmType(null);
      }
    }
  }
  function openCreateItem() {
    setItemFormBarcode('');
    setItemFormName('');
    setItemFormPrice('');
    setItemModalMode('create');
    setItemModalOpen(true);
  }
  function openEditItem(item: {
    barcode: string;
    name: string;
    price: number;
  }) {
    setItemFormBarcode(item.barcode);
    setItemFormName(item.name);
    setItemFormPrice(String(item.price));
    setItemEditOriginalBarcode(item.barcode);
    setItemModalMode('edit');
    setItemModalOpen(true);
  }
  async function handleSaveItem() {
    if (!selectedSupplierCode) return;
    const barcode = itemFormBarcode.trim();
    const name = itemFormName.trim();
    const price = parseFloat(itemFormPrice) || 0;
    if (!barcode || !name) return;
    setSuppliersError('');
    try {
      if (itemModalMode === 'create') {
        const r = await apiFetch(
          `/autozakaz/suppliers/${selectedSupplierCode}/items`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ barcode, name, price }),
          },
        );
        if (!r.ok) throw new Error(await readApiError(r));
      } else {
        const r = await apiFetch(
          `/autozakaz/suppliers/${selectedSupplierCode}/items/${encodeURIComponent(itemEditOriginalBarcode)}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ barcode, name, price }),
          },
        );
        if (!r.ok) throw new Error(await readApiError(r));
      }
      setItemModalOpen(false);
      await loadSuppliers();
    } catch (e) {
      setSuppliersError(e instanceof Error ? e.message : 'Ошибка');
    }
  }
  function requestDeleteItem(item: { barcode: string; name: string }) {
    setDeleteConfirmType('item');
    setDeleteConfirmTarget(item.barcode);
    setDeleteConfirmName(item.name);
  }

  useEffect(() => {
    if (!authUser || authUser.role !== 'client') return;
    if (activePage === 'history') void loadHistory();
    if (activePage === 'suppliers') void loadSuppliers();
  }, [activePage, loadHistory, loadSuppliers, authUser]);

  useEffect(() => {
    if (authUser?.role === 'admin' && adminPage === 'clients') {
      void loadAdminClients();
    }
  }, [authUser, adminPage, loadAdminClients]);

  async function handleClearHistory() {
    if (
      !confirm(
        'Очистить всю историю автозаказа? Все прогоны и файлы будут удалены.',
      )
    )
      return;
    setIsClearingHistory(true);
    setError('');
    try {
      const r = await apiFetch('/autozakaz/history', { method: 'DELETE' });
      if (!r.ok) throw new Error(await readApiError(r));
      setHistoryItems([]);
      setSelectedHistoryRun(null);
      setSelectedHistoryRunId(null);
      if (activePage === 'history') await loadHistory();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ошибка';
      setError(msg);
      setHistoryError(msg);
    } finally {
      setIsClearingHistory(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError('Сначала выберите iiko-файл.');
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('settings', JSON.stringify(settings));
      const response = await apiFetch('/autozakaz/iiko/upload', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const raw = await response.json();
      const data = normalizeRunDetail(raw);
      setSelectedHistoryRunId(data.historyMeta.runId);
      setSelectedHistoryRun(data);
      setFile(null);
      setActivePage('history');
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Неизвестная ошибка',
      );
    } finally {
      setIsLoading(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  /* ========== RENDER ========== */

  if (!authChecked) {
    return (
      <div className="loading-screen">
        <div className="loading-content">Загрузка…</div>
        <style jsx>{`
          .loading-screen {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #0f172a;
            color: #94a3b8;
            font-size: 18px;
          }
        `}</style>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="login-logo">Автозаказ Про</div>
          <p className="login-subtitle">Вход в систему</p>
          <form onSubmit={handleLogin} className="login-form">
            <label>
              Логин
              <input
                type="text"
                value={loginInput}
                onChange={(e) => setLoginInput(e.target.value)}
                placeholder="Введите логин"
                autoFocus
              />
            </label>
            <label>
              Пароль
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Введите пароль"
              />
            </label>
            {loginError && <div className="login-error">{loginError}</div>}
            <button
              type="submit"
              className="login-btn"
              disabled={loginLoading || !loginInput || !passwordInput}
            >
              {loginLoading ? 'Вход…' : 'Войти'}
            </button>
          </form>
          <div className="login-beta">
            Это beta-версия. Регистрация пока не осуществляется.
            <br />
            Получите логин и пароль у администратора.
          </div>
        </div>
        <style jsx>{`
          .login-screen {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #0f172a;
          }
          .login-card {
            background: #111827;
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 24px;
            padding: 40px;
            max-width: 400px;
            width: 90%;
          }
          .login-logo {
            font-size: 28px;
            font-weight: 700;
            color: #f8fafc;
            margin-bottom: 4px;
          }
          .login-subtitle {
            color: #94a3b8;
            margin: 0 0 28px;
          }
          .login-form {
            display: flex;
            flex-direction: column;
            gap: 16px;
          }
          .login-form label {
            display: flex;
            flex-direction: column;
            gap: 6px;
            color: #cbd5e1;
            font-size: 14px;
          }
          .login-form input {
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.12);
            background: #0f172a;
            color: #e5e7eb;
            padding: 12px 14px;
            font-size: 15px;
          }
          .login-error {
            background: rgba(239, 68, 68, 0.14);
            color: #fca5a5;
            padding: 10px 14px;
            border-radius: 12px;
            font-size: 14px;
          }
          .login-btn {
            background: #22c55e;
            color: #052e16;
            border: none;
            border-radius: 12px;
            padding: 14px;
            font-size: 16px;
            font-weight: 700;
            cursor: pointer;
            margin-top: 4px;
          }
          .login-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }
          .login-beta {
            margin-top: 24px;
            padding: 14px;
            border-radius: 12px;
            background: rgba(250, 204, 21, 0.08);
            color: #fde68a;
            font-size: 13px;
            line-height: 1.6;
            text-align: center;
          }
        `}</style>
      </div>
    );
  }

  /* ========== Authenticated: admin or client ========== */

  const isAdmin = authUser.role === 'admin';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="logo">Автозаказ Про</div>
          {isAdmin && (
            <div className="role-tag">Администратор</div>
          )}
          <nav className="nav">
            {isAdmin ? (
              <>
                <button
                  type="button"
                  className={
                    adminPage === 'clients' && !selectedClientId
                      ? 'nav-item active'
                      : 'nav-item'
                  }
                  onClick={() => {
                    setAdminPage('clients');
                    setSelectedClientId(null);
                  }}
                >
                  Клиенты
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={
                    activePage === 'main' ? 'nav-item active' : 'nav-item'
                  }
                  onClick={() => setActivePage('main')}
                >
                  Главная
                </button>
                <button
                  type="button"
                  className={
                    activePage === 'history' ? 'nav-item active' : 'nav-item'
                  }
                  onClick={() => setActivePage('history')}
                >
                  История
                </button>
                <button
                  type="button"
                  className={
                    activePage === 'suppliers'
                      ? 'nav-item active'
                      : 'nav-item'
                  }
                  onClick={() => setActivePage('suppliers')}
                >
                  Поставщики
                </button>
              </>
            )}
          </nav>
        </div>

        <div
          className="profile-box"
          onClick={() => {
            if (isAdmin) setAdminPage('profile');
            else setActivePage('profile');
          }}
          style={{ cursor: 'pointer' }}
        >
          <div className="avatar" />
          <div>
            <div>{authUser.name}</div>
            <div className="muted">
              {isAdmin ? 'администратор' : 'клиент'}
            </div>
          </div>
        </div>
      </aside>

      <main className="workspace">
        {/* ========== ADMIN: Clients list ========== */}
        {isAdmin && adminPage === 'clients' && !selectedClientId && (
          <>
            <div className="workspace-header">
              <div>
                <h1>Клиенты</h1>
                <p className="muted">
                  Всего клиентов: {adminClients.length}
                </p>
              </div>
              <div className="header-actions">
                <button
                  type="button"
                  className="primary-button compact-btn"
                  onClick={() => {
                    setNewClientName('');
                    setNewClientCreds(null);
                    setCreateClientOpen(true);
                  }}
                >
                  + Создать клиента
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void loadAdminClients()}
                >
                  Обновить
                </button>
              </div>
            </div>

            {adminError && <div className="error-box">{adminError}</div>}
            {adminClientsLoading && (
              <div className="card">Загружаю клиентов…</div>
            )}

            {!adminClientsLoading && adminClients.length === 0 && (
              <div className="card">
                Клиентов пока нет. Создайте первого клиента.
              </div>
            )}

            {!adminClientsLoading && adminClients.length > 0 && (
              <div className="suppliers-grid">
                {adminClients.map((client) => (
                  <div
                    key={client.id}
                    className={`card sup-card ${!client.isActive ? 'card-inactive' : ''}`}
                  >
                    <div className="sup-card-top">
                      <h3>{client.name}</h3>
                      <div className="muted">
                        Логин: <strong>{client.login}</strong>
                      </div>
                    </div>
                    <div className="sup-card-stat">
                      Поставщиков: {client.suppliersCount} · Прогонов:{' '}
                      {client.runsCount}
                    </div>
                    <div className="sup-card-stat">
                      <span
                        className={
                          client.isActive
                            ? 'item-badge item-active'
                            : 'item-badge item-inactive'
                        }
                      >
                        {client.isActive ? 'Активен' : 'Деактивирован'}
                      </span>
                    </div>
                    <div className="sup-card-actions">
                      <button
                        type="button"
                        className="action-btn action-open"
                        onClick={() => void openClientDetail(client.id)}
                      >
                        Открыть
                      </button>
                      <button
                        type="button"
                        className="action-btn action-delete"
                        onClick={() => void handleToggleClient(client.id)}
                      >
                        {client.isActive ? 'Деактивировать' : 'Активировать'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ========== ADMIN: Client detail ========== */}
        {isAdmin && adminPage === 'client-detail' && selectedClientId && (
          <>
            <div className="workspace-header">
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 12 }}
              >
                <button
                  type="button"
                  className="back-btn"
                  onClick={() => {
                    setSelectedClientId(null);
                    setAdminPage('clients');
                  }}
                >
                  ←
                </button>
                <div>
                  <h1>{selectedClientDetail?.user?.name || 'Клиент'}</h1>
                  <p className="muted">
                    Логин: {selectedClientDetail?.user?.login} · Создан:{' '}
                    {formatDateTime(
                      selectedClientDetail?.user?.createdAt || null,
                    )}
                  </p>
                </div>
              </div>
              <div className="header-actions">
                <button
                  type="button"
                  className="action-btn action-edit"
                  onClick={() => {
                    setEditClientName(
                      selectedClientDetail?.user?.name || '',
                    );
                    setEditClientLogin(
                      selectedClientDetail?.user?.login || '',
                    );
                    setEditClientOpen(true);
                  }}
                >
                  Изменить
                </button>
                <button
                  type="button"
                  className="action-btn action-open"
                  onClick={() => {
                    setNewPassword('');
                    setShowNewPassword(false);
                    setChangePasswordOpen(true);
                  }}
                >
                  Сменить пароль
                </button>
              </div>
            </div>

            {adminError && <div className="error-box">{adminError}</div>}

            <div className="meta-grid" style={{ marginBottom: 20 }}>
              <div className="card" style={{ marginBottom: 0 }}>
                <div className="meta-label">Поставщиков</div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>
                  {selectedClientDetail?.suppliersCount ?? 0}
                </div>
              </div>
              <div className="card" style={{ marginBottom: 0 }}>
                <div className="meta-label">Автозаказов</div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>
                  {selectedClientDetail?.runsCount ?? 0}
                </div>
              </div>
              <div className="card" style={{ marginBottom: 0 }}>
                <div className="meta-label">Статус</div>
                <div>
                  <span
                    className={
                      selectedClientDetail?.user?.isActive
                        ? 'item-badge item-active'
                        : 'item-badge item-inactive'
                    }
                  >
                    {selectedClientDetail?.user?.isActive
                      ? 'Активен'
                      : 'Деактивирован'}
                  </span>
                </div>
              </div>
            </div>

            <div className="card">
              <h3>Поставщики клиента</h3>
              {clientSuppliers.length === 0 ? (
                <div className="empty-box" style={{ marginTop: 8 }}>
                  У клиента пока нет поставщиков.
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Код</th>
                        <th>Название</th>
                        <th>Товаров</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientSuppliers.map((s) => (
                        <tr key={s.code}>
                          <td>{s.code}</td>
                          <td>{s.name}</td>
                          <td>{s.items.length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card" style={{ marginTop: 16 }}>
              <h3>История автозаказов</h3>
              {clientHistory.length === 0 ? (
                <div className="empty-box" style={{ marginTop: 8 }}>
                  У клиента пока нет автозаказов.
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Дата</th>
                        <th>Файл</th>
                        <th>Статус</th>
                        <th>Поставщиков</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientHistory.map((h: any) => (
                        <tr key={h.runId}>
                          <td>{formatDateTime(h.createdAt)}</td>
                          <td>{h.sourceFileName}</td>
                          <td>
                            <StatusBadge status={h.status} />
                          </td>
                          <td>{h.suppliersCount ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ========== ADMIN: Profile ========== */}
        {isAdmin && adminPage === 'profile' && (
          <>
            <div className="workspace-header">
              <h1>Профиль администратора</h1>
            </div>
            <div className="card">
              <div className="meta-grid">
                <div>
                  <div className="meta-label">Имя</div>
                  <div>{authUser.name}</div>
                </div>
                <div>
                  <div className="meta-label">Логин</div>
                  <div>{authUser.login}</div>
                </div>
                <div>
                  <div className="meta-label">Роль</div>
                  <div>Администратор</div>
                </div>
              </div>
              <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setProfileName(authUser.name);
                    setProfileEditOpen(true);
                  }}
                >
                  Изменить имя
                </button>
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => void handleLogout()}
                >
                  Выйти из аккаунта
                </button>
              </div>
            </div>
          </>
        )}

        {/* ========== CLIENT: Main ========== */}
        {!isAdmin && activePage === 'main' && (
          <>
            <div className="workspace-header">
              <div>
                <h1>
                  Загрузите продажи и получите автозаказ по вашим поставщикам
                </h1>
                <p className="muted">
                  Выберите формат данных из вашей учётной системы
                </p>
              </div>
              <button
                type="button"
                className="settings-toggle"
                onDoubleClick={() => setSettingsOpen((prev) => !prev)}
                title="Дважды нажмите, чтобы открыть настройки"
              >
                □
              </button>
            </div>

            {settingsOpen && (
              <div className="card">
                <div className="card-header">
                  <h2>Настройки автозаказа</h2>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setSettingsOpen(false)}
                  >
                    Закрыть
                  </button>
                </div>
                <div className="settings-grid">
                  <label>
                    Заказ на дней
                    <input
                      type="number"
                      value={settings.coverageDays}
                      onChange={(e) =>
                        change('coverageDays', Number(e.target.value))
                      }
                    />
                  </label>
                  <label>
                    Множитель продаж
                    <input
                      type="number"
                      step="0.1"
                      value={settings.salesMultiplier}
                      onChange={(e) =>
                        change('salesMultiplier', Number(e.target.value))
                      }
                    />
                  </label>
                  <label>
                    Резерв штук
                    <input
                      type="number"
                      value={settings.reserveUnits}
                      onChange={(e) =>
                        change('reserveUnits', Number(e.target.value))
                      }
                    />
                  </label>
                  <label>
                    Кратность упаковки
                    <input
                      type="number"
                      value={settings.packSize}
                      onChange={(e) =>
                        change('packSize', Number(e.target.value))
                      }
                    />
                  </label>
                  <label>
                    Минимальный заказ
                    <input
                      type="number"
                      value={settings.minOrderQty}
                      onChange={(e) =>
                        change('minOrderQty', Number(e.target.value))
                      }
                    />
                  </label>
                  <label>
                    Покупатель
                    <input
                      type="text"
                      value={settings.buyerName}
                      onChange={(e) => change('buyerName', e.target.value)}
                    />
                  </label>
                  <label>
                    Дата поставки
                    <input
                      type="date"
                      value={settings.deliveryDate}
                      onChange={(e) =>
                        change('deliveryDate', e.target.value)
                      }
                    />
                  </label>
                </div>
                <div className="settings-actions">
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => void handleClearHistory()}
                    disabled={isClearingHistory}
                  >
                    {isClearingHistory
                      ? 'Очищаю историю…'
                      : 'Очистить историю'}
                  </button>
                </div>
              </div>
            )}

            <div className="formats-grid">
              <form
                className="format-card format-active"
                onSubmit={handleSubmit}
              >
                <div className="format-icon">📊</div>
                <div className="format-card-body">
                  <h3>Формат iiko</h3>
                  <p className="muted">
                    Загрузите XLSX-файл продаж из iiko. Система сверит
                    штрихкоды с каталогами поставщиков и сформирует документы
                    заказа.
                  </p>
                  <div className="upload-area">
                    <input
                      type="file"
                      accept=".xlsx"
                      onChange={(e) =>
                        setFile(e.target.files?.[0] ?? null)
                      }
                    />
                    <div className="muted file-hint">
                      {file
                        ? `Выбран: ${file.name}`
                        : 'Выберите .xlsx файл'}
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={isLoading}
                  >
                    {isLoading
                      ? 'Считаю автозаказ…'
                      : 'Рассчитать автозаказ'}
                  </button>
                  {error && <div className="error-box">{error}</div>}
                </div>
              </form>

              <div className="format-card format-soon">
                <div className="badge-soon">Скоро</div>
                <div className="format-icon">🏢</div>
                <div className="format-card-body">
                  <h3>Формат 1С</h3>
                  <p className="muted">
                    Поддержка выгрузки продаж из 1С:Предприятие.
                  </p>
                </div>
              </div>

              <div className="format-card format-soon">
                <div className="badge-soon">Скоро</div>
                <div className="format-icon">📦</div>
                <div className="format-card-body">
                  <h3>Формат МойСклад</h3>
                  <p className="muted">
                    Интеграция с сервисом МойСклад для автоматической загрузки
                    данных о продажах.
                  </p>
                </div>
              </div>

              <div
                className="format-card format-ai"
                onClick={() =>
                  setToastMessage(
                    'Упс — блок ещё в разработке. Функционал скоро появится.',
                  )
                }
              >
                <div className="format-icon">🤖</div>
                <div className="format-card-body">
                  <h3>Загрузите свои продажи</h3>
                  <p className="muted">
                    Загрузите данные в произвольном формате — система обработает
                    их с помощью ИИ.
                  </p>
                  <div className="ai-hint">Обработка с помощью ИИ</div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ========== CLIENT: History ========== */}
        {!isAdmin && activePage === 'history' && (
          <>
            <div className="workspace-header">
              <div>
                <h1>История</h1>
                <p className="muted">
                  Все прогоны автозаказа: исходные файлы, документы и детали
                  расчёта.
                </p>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void loadHistory()}
              >
                Обновить
              </button>
            </div>

            {historyError && <div className="error-box">{historyError}</div>}
            {historyLoading && (
              <div className="card">Загружаю историю…</div>
            )}

            {!historyLoading && historyItems.length === 0 && (
              <div className="card">Здесь пока пусто.</div>
            )}

            {!historyLoading && historyItems.length > 0 && (
              <div className="history-layout">
                <div className="history-list">
                  {historyItems.map((item) => (
                    <button
                      type="button"
                      key={item.runId}
                      className={
                        selectedHistoryRunId === item.runId
                          ? 'history-item active'
                          : 'history-item'
                      }
                      onClick={() => void loadHistoryRun(item.runId)}
                    >
                      <div className="history-item-top">
                        <strong>{item.sourceFileName}</strong>
                        <StatusBadge status={item.status} />
                      </div>
                      <div className="muted">
                        {formatDateTime(item.createdAt)}
                      </div>
                      <div className="history-item-meta">
                        <span>
                          Длительность: {formatDuration(item.durationMs)}
                        </span>
                        <span>Не найдено: {item.unknownItemsCount}</span>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="history-detail">
                  {selectedHistoryRun ? (
                    <ResultView detail={selectedHistoryRun} />
                  ) : (
                    <div className="card">
                      Выберите прогон из списка слева.
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ========== CLIENT: Suppliers list ========== */}
        {!isAdmin && activePage === 'suppliers' && !selectedSupplierCode && (
          <>
            <div className="workspace-header">
              <div>
                <h1>Поставщики</h1>
                <p className="muted">
                  Управление поставщиками и их каталогами товаров
                </p>
              </div>
              <div className="header-actions">
                <button
                  type="button"
                  className="primary-button compact-btn"
                  onClick={openCreateSupplier}
                >
                  + Добавить поставщика
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void loadSuppliers()}
                >
                  Обновить
                </button>
              </div>
            </div>

            {suppliersError && (
              <div className="error-box">{suppliersError}</div>
            )}
            {suppliersLoading && (
              <div className="card">Загружаю поставщиков…</div>
            )}
            {!suppliersLoading && suppliers.length === 0 && (
              <div className="card">
                Поставщиков пока нет. Нажмите «Добавить поставщика».
              </div>
            )}
            {!suppliersLoading && suppliers.length > 0 && (
              <div className="suppliers-grid">
                {suppliers.map((supplier) => (
                  <div key={supplier.code} className="card sup-card">
                    <div className="sup-card-top">
                      <h3>{supplier.name}</h3>
                      <div className="muted">{supplier.code}</div>
                    </div>
                    <div className="sup-card-stat">
                      {supplier.items.length} товаров
                    </div>
                    <div className="sup-card-actions">
                      <button
                        type="button"
                        className="action-btn action-open"
                        onClick={() =>
                          setSelectedSupplierCode(supplier.code)
                        }
                      >
                        Открыть
                      </button>
                      <button
                        type="button"
                        className="action-btn action-edit"
                        onClick={() => openEditSupplier(supplier)}
                      >
                        Изменить
                      </button>
                      <button
                        type="button"
                        className="action-btn action-delete"
                        onClick={() => requestDeleteSupplier(supplier)}
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ========== CLIENT: Supplier detail ========== */}
        {!isAdmin && activePage === 'suppliers' && selectedSupplierCode && (
          <>
            <div className="workspace-header">
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 12 }}
              >
                <button
                  type="button"
                  className="back-btn"
                  onClick={() => setSelectedSupplierCode(null)}
                >
                  ←
                </button>
                <div>
                  <h1>{selectedSupplier?.name || 'Поставщик'}</h1>
                  <p className="muted">
                    {selectedSupplierCode} ·{' '}
                    {selectedSupplier?.items.length ?? 0} товаров
                  </p>
                </div>
              </div>
              <div className="header-actions">
                <button
                  type="button"
                  className="primary-button compact-btn"
                  onClick={openCreateItem}
                >
                  + Добавить товар
                </button>
                {selectedSupplier && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => openEditSupplier(selectedSupplier)}
                  >
                    Изменить название
                  </button>
                )}
              </div>
            </div>

            {suppliersError && (
              <div className="error-box">{suppliersError}</div>
            )}

            {selectedSupplier && selectedSupplier.items.length === 0 && (
              <div className="card">
                Каталог пуст. Нажмите «Добавить товар».
              </div>
            )}

            {selectedSupplier && selectedSupplier.items.length > 0 && (
              <div className="card">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Штрихкод</th>
                        <th>Название</th>
                        <th>Цена</th>
                        <th>Статус</th>
                        <th style={{ textAlign: 'right' }}>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSupplier.items.map((item) => (
                        <tr key={item.barcode}>
                          <td className="mono-cell">{item.barcode}</td>
                          <td>{item.name}</td>
                          <td>{item.price.toFixed(2)} ₽</td>
                          <td>
                            <span
                              className={
                                item.isActive !== false
                                  ? 'item-badge item-active'
                                  : 'item-badge item-inactive'
                              }
                            >
                              {item.isActive !== false
                                ? 'Активен'
                                : 'Неактивен'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div className="row-actions">
                              <button
                                type="button"
                                className="action-btn action-edit"
                                onClick={() => openEditItem(item)}
                              >
                                Изменить
                              </button>
                              <button
                                type="button"
                                className="action-btn action-delete"
                                onClick={() => requestDeleteItem(item)}
                              >
                                Удалить
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* ========== CLIENT: Profile ========== */}
        {!isAdmin && activePage === 'profile' && (
          <>
            <div className="workspace-header">
              <h1>Профиль</h1>
            </div>
            <div className="card">
              <div className="meta-grid">
                <div>
                  <div className="meta-label">Название</div>
                  <div>{authUser.name}</div>
                </div>
                <div>
                  <div className="meta-label">Логин</div>
                  <div>{authUser.login}</div>
                </div>
              </div>
              <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setProfileName(authUser.name);
                    setProfileEditOpen(true);
                  }}
                >
                  Изменить название
                </button>
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => void handleLogout()}
                >
                  Выйти из аккаунта
                </button>
              </div>
            </div>
          </>
        )}
      </main>

      {/* ========== MODALS ========== */}

      {createClientOpen && (
        <div
          className="modal-overlay"
          onClick={() => {
            setCreateClientOpen(false);
            setNewClientCreds(null);
          }}
        >
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            {!newClientCreds ? (
              <>
                <h2>Новый клиент</h2>
                <label>
                  Название
                  <input
                    type="text"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    placeholder="Например: Магазин Ромашка"
                    autoFocus
                  />
                </label>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setCreateClientOpen(false)}
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    className="primary-button compact-btn"
                    onClick={() => void handleCreateClient()}
                    disabled={!newClientName.trim()}
                  >
                    Создать
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2>Клиент создан</h2>
                <p className="muted">
                  Сохраните эти данные. Пароль показывается только один раз.
                </p>
                <div className="creds-row">
                  <div className="creds-label">Логин</div>
                  <div className="creds-value">
                    <code>{newClientCreds.login}</code>
                    <button
                      type="button"
                      className="copy-btn"
                      onClick={() =>
                        copyToClipboard(newClientCreds.login)
                      }
                    >
                      Копировать
                    </button>
                  </div>
                </div>
                <div className="creds-row">
                  <div className="creds-label">Пароль</div>
                  <div className="creds-value">
                    <code>{newClientCreds.password}</code>
                    <button
                      type="button"
                      className="copy-btn"
                      onClick={() =>
                        copyToClipboard(newClientCreds.password)
                      }
                    >
                      Копировать
                    </button>
                  </div>
                </div>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="primary-button compact-btn"
                    onClick={() => {
                      setCreateClientOpen(false);
                      setNewClientCreds(null);
                    }}
                  >
                    Готово
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {editClientOpen && (
        <div
          className="modal-overlay"
          onClick={() => setEditClientOpen(false)}
        >
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2>Редактирование клиента</h2>
            <label>
              Название
              <input
                type="text"
                value={editClientName}
                onChange={(e) => setEditClientName(e.target.value)}
              />
            </label>
            <label>
              Логин
              <input
                type="text"
                value={editClientLogin}
                onChange={(e) => setEditClientLogin(e.target.value)}
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setEditClientOpen(false)}
              >
                Отмена
              </button>
              <button
                type="button"
                className="primary-button compact-btn"
                onClick={() => void handleEditClient()}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {changePasswordOpen && (
        <div
          className="modal-overlay"
          onClick={() => setChangePasswordOpen(false)}
        >
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2>Смена пароля</h2>
            {!showNewPassword ? (
              <>
                <label>
                  Новый пароль
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Минимум 6 символов"
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={generateRandomPassword}
                    >
                      Сгенерировать
                    </button>
                  </div>
                </label>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setChangePasswordOpen(false)}
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    className="primary-button compact-btn"
                    onClick={() => void handleChangePassword()}
                    disabled={newPassword.length < 6}
                  >
                    Сменить пароль
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="muted">Пароль успешно изменён.</p>
                <div className="creds-row">
                  <div className="creds-label">Новый пароль</div>
                  <div className="creds-value">
                    <code>{newPassword}</code>
                    <button
                      type="button"
                      className="copy-btn"
                      onClick={() => copyToClipboard(newPassword)}
                    >
                      Копировать
                    </button>
                  </div>
                </div>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="primary-button compact-btn"
                    onClick={() => setChangePasswordOpen(false)}
                  >
                    Готово
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {profileEditOpen && (
        <div
          className="modal-overlay"
          onClick={() => setProfileEditOpen(false)}
        >
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2>Изменить название</h2>
            <label>
              Название
              <input
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                autoFocus
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setProfileEditOpen(false)}
              >
                Отмена
              </button>
              <button
                type="button"
                className="primary-button compact-btn"
                onClick={() => void handleUpdateProfile()}
                disabled={!profileName.trim()}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {supplierModalOpen && (
        <div
          className="modal-overlay"
          onClick={() => setSupplierModalOpen(false)}
        >
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2>
              {supplierModalMode === 'create'
                ? 'Новый поставщик'
                : 'Редактирование поставщика'}
            </h2>
            <label>
              Название
              <input
                type="text"
                value={supplierFormName}
                onChange={(e) => setSupplierFormName(e.target.value)}
                placeholder="Введите название поставщика"
                autoFocus
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setSupplierModalOpen(false)}
              >
                Отмена
              </button>
              <button
                type="button"
                className="primary-button compact-btn"
                onClick={() => void handleSaveSupplier()}
                disabled={!supplierFormName.trim()}
              >
                {supplierModalMode === 'create' ? 'Создать' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {itemModalOpen && (
        <div
          className="modal-overlay"
          onClick={() => setItemModalOpen(false)}
        >
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2>
              {itemModalMode === 'create'
                ? 'Новый товар'
                : 'Редактирование товара'}
            </h2>
            <label>
              Штрихкод
              <input
                type="text"
                value={itemFormBarcode}
                onChange={(e) => setItemFormBarcode(e.target.value)}
                placeholder="Введите штрихкод"
                autoFocus
              />
            </label>
            <label>
              Название
              <input
                type="text"
                value={itemFormName}
                onChange={(e) => setItemFormName(e.target.value)}
                placeholder="Введите название товара"
              />
            </label>
            <label>
              Цена
              <input
                type="number"
                step="0.01"
                value={itemFormPrice}
                onChange={(e) => setItemFormPrice(e.target.value)}
                placeholder="0.00"
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setItemModalOpen(false)}
              >
                Отмена
              </button>
              <button
                type="button"
                className="primary-button compact-btn"
                onClick={() => void handleSaveItem()}
                disabled={!itemFormBarcode.trim() || !itemFormName.trim()}
              >
                {itemModalMode === 'create' ? 'Добавить' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmType && (
        <div
          className="modal-overlay"
          onClick={() => setDeleteConfirmType(null)}
        >
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2>Подтверждение удаления</h2>
            <p>
              Вы уверены, что хотите удалить{' '}
              {deleteConfirmType === 'supplier' ? 'поставщика' : 'товар'}{' '}
              <strong>«{deleteConfirmName}»</strong>?
            </p>
            {deleteConfirmType === 'supplier' && (
              <p className="muted">
                Все товары этого поставщика также будут удалены.
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setDeleteConfirmType(null)}
              >
                Отмена
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={() => void confirmDelete()}
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <Toast message={toastMessage} onClose={() => setToastMessage('')} />
      )}

      <style jsx>{`
        .app-shell {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 260px 1fr;
          background: #0f172a;
          color: #e5e7eb;
        }
        .sidebar {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 24px 16px;
          border-right: 1px solid rgba(255, 255, 255, 0.08);
          background: #111827;
        }
        .logo {
          font-size: 24px;
          font-weight: 700;
          margin-bottom: 8px;
          color: #f8fafc;
        }
        .role-tag {
          display: inline-block;
          background: rgba(139, 92, 246, 0.18);
          color: #c4b5fd;
          font-size: 11px;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 999px;
          margin-bottom: 20px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .nav {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .nav-item {
          padding: 12px 14px;
          border-radius: 12px;
          border: none;
          background: transparent;
          color: #e5e7eb;
          text-align: left;
          cursor: pointer;
          font-size: 15px;
        }
        .nav-item:hover,
        .nav-item.active {
          background: rgba(255, 255, 255, 0.08);
        }
        .profile-box {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.05);
        }
        .avatar {
          width: 36px;
          height: 36px;
          border-radius: 999px;
          background: linear-gradient(135deg, #34d399, #60a5fa);
          flex-shrink: 0;
        }
        .workspace {
          padding: 24px;
          overflow-y: auto;
        }
        .workspace-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 20px;
        }
        .workspace h1,
        .workspace h2,
        .workspace h3,
        .workspace h4,
        .workspace strong {
          color: #f8fafc;
        }
        .header-actions {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-shrink: 0;
        }
        .settings-toggle,
        .primary-button,
        .secondary-button,
        .link-button,
        .danger-button {
          border-radius: 12px;
          border: none;
          cursor: pointer;
          font-size: 14px;
          text-decoration: none;
        }
        .settings-toggle {
          width: 44px;
          height: 44px;
          background: #1f2937;
          color: #e5e7eb;
          flex-shrink: 0;
        }
        .primary-button {
          background: #22c55e;
          color: #0b1220;
          padding: 12px 16px;
          font-weight: 700;
          width: 100%;
        }
        .primary-button:disabled {
          opacity: 0.7;
          cursor: wait;
        }
        .compact-btn {
          width: auto;
          padding: 10px 16px;
          white-space: nowrap;
        }
        .secondary-button,
        .link-button {
          background: #1f2937;
          color: #e5e7eb;
          padding: 10px 14px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .danger-button {
          background: rgba(239, 68, 68, 0.18);
          color: #fecaca;
          padding: 10px 14px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          border: none;
          cursor: pointer;
          font-size: 14px;
        }
        .danger-button:disabled {
          opacity: 0.7;
          cursor: wait;
        }
        .card,
        .result-card,
        .history-item,
        .supplier-card {
          background: #111827;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          padding: 18px;
          color: #e5e7eb;
        }
        .card,
        .result-card {
          margin-bottom: 16px;
        }
        .card-inactive {
          opacity: 0.55;
        }
        .card-header,
        .supplier-header,
        .result-header,
        .history-item-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .settings-grid,
        .meta-grid,
        .suppliers-grid {
          display: grid;
          gap: 12px;
        }
        .settings-grid {
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          margin-top: 12px;
        }
        .settings-actions {
          margin-top: 16px;
          display: flex;
          justify-content: flex-end;
        }
        .suppliers-grid {
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        }
        label {
          display: flex;
          flex-direction: column;
          gap: 8px;
          font-size: 14px;
          color: #e5e7eb;
        }
        input {
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: #0f172a;
          color: #e5e7eb;
          padding: 10px 12px;
        }
        .muted {
          color: #94a3b8;
          font-size: 14px;
        }
        .error-box,
        .empty-box {
          margin-top: 12px;
          padding: 12px 14px;
          border-radius: 12px;
        }
        .error-box {
          background: rgba(239, 68, 68, 0.14);
          color: #fecaca;
        }
        .empty-box {
          background: rgba(255, 255, 255, 0.04);
          color: #cbd5e1;
        }
        .status-badge {
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
          white-space: nowrap;
        }
        .status-completed {
          background: rgba(34, 197, 94, 0.18);
          color: #86efac;
        }
        .status-failed {
          background: rgba(239, 68, 68, 0.18);
          color: #fca5a5;
        }
        .status-processing {
          background: rgba(59, 130, 246, 0.18);
          color: #93c5fd;
        }
        .meta-grid {
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          margin-top: 12px;
        }
        .meta-label {
          color: #94a3b8;
          font-size: 12px;
          margin-bottom: 4px;
        }
        .toolbar {
          margin-top: 14px;
          margin-bottom: 8px;
        }
        .section-block {
          margin-top: 18px;
        }
        .table-wrap {
          overflow-x: auto;
          margin-top: 12px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        th,
        td {
          text-align: left;
          padding: 10px 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          white-space: nowrap;
          font-size: 14px;
          color: #e5e7eb;
        }
        th {
          color: #94a3b8;
          font-weight: 600;
        }
        .history-layout {
          display: grid;
          grid-template-columns: 360px 1fr;
          gap: 16px;
        }
        .history-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .history-item {
          width: 100%;
          text-align: left;
          cursor: pointer;
          color: #e5e7eb;
        }
        .history-item strong {
          color: #f8fafc;
        }
        .history-item.active {
          border-color: rgba(96, 165, 250, 0.65);
          box-shadow: 0 0 0 1px rgba(96, 165, 250, 0.35);
        }
        .history-item-meta {
          margin-top: 10px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          color: #cbd5e1;
          font-size: 13px;
        }
        .supplier-card {
          margin-top: 14px;
        }
        .supplier-stats {
          margin-top: 10px;
          color: #cbd5e1;
        }
        .sup-card {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .sup-card-top h3 {
          margin: 0 0 4px 0;
        }
        .sup-card-stat {
          color: #94a3b8;
          font-size: 14px;
          margin-top: 4px;
        }
        .sup-card-actions {
          display: flex;
          gap: 8px;
          margin-top: 8px;
          flex-wrap: wrap;
        }
        .action-btn {
          padding: 7px 14px;
          border-radius: 10px;
          border: none;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          transition: background 0.15s;
        }
        .action-open {
          background: rgba(96, 165, 250, 0.15);
          color: #93c5fd;
        }
        .action-open:hover {
          background: rgba(96, 165, 250, 0.25);
        }
        .action-edit {
          background: rgba(250, 204, 21, 0.12);
          color: #fde68a;
        }
        .action-edit:hover {
          background: rgba(250, 204, 21, 0.22);
        }
        .action-delete {
          background: rgba(239, 68, 68, 0.12);
          color: #fca5a5;
        }
        .action-delete:hover {
          background: rgba(239, 68, 68, 0.22);
        }
        .row-actions {
          display: flex;
          gap: 6px;
          justify-content: flex-end;
        }
        .back-btn {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: #1f2937;
          color: #e5e7eb;
          font-size: 20px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .back-btn:hover {
          background: #334155;
        }
        .mono-cell {
          font-family: 'SF Mono', 'Fira Code', monospace;
          font-size: 13px;
        }
        .item-badge {
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          white-space: nowrap;
        }
        .item-active {
          background: rgba(34, 197, 94, 0.15);
          color: #86efac;
        }
        .item-inactive {
          background: rgba(148, 163, 184, 0.15);
          color: #94a3b8;
        }
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: fadeIn 0.15s ease;
        }
        .modal-box {
          background: #1e293b;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 20px;
          padding: 28px;
          max-width: 440px;
          width: 90%;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .modal-box h2 {
          margin: 0;
          font-size: 18px;
        }
        .modal-box p {
          margin: 0;
          line-height: 1.5;
        }
        .modal-actions {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          margin-top: 8px;
        }
        .creds-row {
          background: #0f172a;
          border-radius: 12px;
          padding: 14px;
        }
        .creds-label {
          color: #94a3b8;
          font-size: 12px;
          margin-bottom: 6px;
        }
        .creds-value {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .creds-value code {
          font-size: 16px;
          font-weight: 600;
          color: #f8fafc;
          flex: 1;
        }
        .copy-btn {
          background: rgba(96, 165, 250, 0.15);
          color: #93c5fd;
          border: none;
          border-radius: 8px;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
        }
        .copy-btn:hover {
          background: rgba(96, 165, 250, 0.25);
        }
        .formats-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }
        .format-card {
          position: relative;
          background: #111827;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .format-card h3 {
          margin: 0;
        }
        .format-icon {
          font-size: 36px;
          margin-bottom: 8px;
        }
        .format-card-body {
          display: flex;
          flex-direction: column;
          gap: 12px;
          flex: 1;
        }
        .format-active {
          border-color: rgba(34, 197, 94, 0.4);
        }
        .format-active:hover {
          border-color: rgba(34, 197, 94, 0.6);
          box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.2);
        }
        .upload-area {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .upload-area input[type='file'] {
          padding: 10px;
          border: 1px dashed rgba(34, 197, 94, 0.4);
          border-radius: 12px;
          background: rgba(34, 197, 94, 0.04);
          color: #e5e7eb;
          cursor: pointer;
        }
        .file-hint {
          font-size: 13px;
        }
        .format-soon {
          opacity: 0.55;
          cursor: default;
        }
        .badge-soon {
          position: absolute;
          top: 14px;
          right: 14px;
          background: rgba(250, 204, 21, 0.2);
          color: #fde68a;
          font-size: 11px;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 999px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .format-ai {
          cursor: pointer;
          border-color: rgba(139, 92, 246, 0.3);
        }
        .format-ai:hover {
          border-color: rgba(139, 92, 246, 0.55);
        }
        .ai-hint {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 600;
          color: #c4b5fd;
          background: rgba(139, 92, 246, 0.12);
          padding: 5px 12px;
          border-radius: 999px;
          width: fit-content;
        }
        .supplier-toggle {
          display: flex;
          align-items: center;
          gap: 10px;
          background: none;
          border: none;
          color: #e5e7eb;
          cursor: pointer;
          padding: 0;
          text-align: left;
        }
        .supplier-toggle h4 {
          margin: 0;
        }
        .section-toggle {
          margin-bottom: 8px;
        }
        .section-toggle h3 {
          margin: 0;
        }
        .toggle-icon {
          font-size: 12px;
          color: #94a3b8;
          width: 16px;
          flex-shrink: 0;
        }
        .excel-button {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #22c55e;
          color: #052e16;
          font-weight: 700;
          font-size: 13px;
          padding: 10px 16px;
          border-radius: 12px;
          text-decoration: none;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .excel-button:hover {
          background: #16a34a;
        }
        .toast-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: fadeIn 0.2s ease;
        }
        .toast-box {
          background: #1e293b;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 20px;
          padding: 32px;
          max-width: 400px;
          width: 90%;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          text-align: center;
        }
        .toast-emoji {
          font-size: 48px;
        }
        .toast-text {
          font-size: 16px;
          color: #e5e7eb;
          line-height: 1.5;
        }
        .toast-close {
          background: #334155;
          color: #f8fafc;
          border: none;
          border-radius: 12px;
          padding: 10px 24px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
        }
        .toast-close:hover {
          background: #475569;
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @media (max-width: 1100px) {
          .app-shell {
            grid-template-columns: 1fr;
          }
          .sidebar {
            border-right: none;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          }
          .history-layout {
            grid-template-columns: 1fr;
          }
          .formats-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
