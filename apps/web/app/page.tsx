'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';

type PageKey = 'main' | 'history' | 'suppliers';

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
  period: {
    start: string | null;
    end: string | null;
    days: number;
  };
  settings: Settings;
  summary: RunSummary;
  suppliers: SupplierResult[];
  unknownItems: Array<{
    barcode: string;
    name: string;
    soldQty: number;
  }>;
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

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

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
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('ru-RU');
}

function formatDuration(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return '—';
  }

  if (value < 1000) {
    return `${value} мс`;
  }

  return `${(value / 1000).toFixed(2)} сек`;
}

async function readApiError(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const payload = (await response.json()) as {
      message?: string | string[];
      error?: string;
    };

    if (Array.isArray(payload.message)) {
      return payload.message.join(', ');
    }

    return payload.message || payload.error || 'Ошибка запроса';
  }

  const text = await response.text();
  return text || 'Ошибка запроса';
}

function normalizeRunDetail(payload: unknown): HistoryRunDetail {
  const data = payload as Partial<HistoryRunDetail> & Partial<RunResult>;

  if (data.historyMeta) {
    return data as HistoryRunDetail;
  }

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

function StatusBadge({
  status,
}: {
  status: HistoryItem['status'];
}) {
  const label =
    status === 'completed'
      ? 'Готово'
      : status === 'failed'
      ? 'Ошибка'
      : 'В обработке';

  return <span className={`status-badge status-${status}`}>{label}</span>;
}

function ResultView({
  detail,
}: {
  detail: HistoryRunDetail;
}) {
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(
    new Set(),
  );
  const [unknownExpanded, setUnknownExpanded] = useState(false);

  const toggleSupplier = (code: string) => {
    setExpandedSuppliers((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const historyMeta = detail?.historyMeta;
  const result = detail?.result ?? null;

  if (!historyMeta) {
    return (
      <div className="result-card">
        <div className="error-box">
          Результат расчёта пришёл в неожиданном формате. Проверьте перезапуск
          API.
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
          Для этого прогона нет готового результата. Обычно так выглядит
          неуспешный или ещё не завершённый расчёт.
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
                Ни один поставщик не получил заказ. Тут табличная пустыня.
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
                    Все штрихкоды нашлись у известных поставщиков. Красота.
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

export default function HomePage() {
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

  const change = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const loadHistoryRun = useCallback(async (runId: string) => {
    setSelectedHistoryRunId(runId);
    setHistoryError('');

    try {
      const response = await fetch(`${API_URL}/autozakaz/history/${runId}`);
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const raw = await response.json();
      const data = normalizeRunDetail(raw);
      setSelectedHistoryRun(data);
    } catch (loadError) {
      setHistoryError(
        loadError instanceof Error
          ? loadError.message
          : 'Не удалось загрузить детали истории',
      );
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError('');

    try {
      const response = await fetch(`${API_URL}/autozakaz/history`);
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

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
      const response = await fetch(`${API_URL}/autozakaz/suppliers`);
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const data = (await response.json()) as SupplierSeed[];
      setSuppliers(data);
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

  useEffect(() => {
    if (activePage === 'history') {
      void loadHistory();
    }

    if (activePage === 'suppliers' && suppliers.length === 0) {
      void loadSuppliers();
    }
  }, [activePage, loadHistory, loadSuppliers, suppliers.length]);

  async function handleClearHistory() {
    const confirmed = window.confirm(
      'Очистить всю историю автозаказа? Будут удалены все прогоны и все связанные файлы.',
    );

    if (!confirmed) {
      return;
    }

    setIsClearingHistory(true);
    setError('');
    setHistoryError('');

    try {
      const response = await fetch(`${API_URL}/autozakaz/history`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      setHistoryItems([]);
      setSelectedHistoryRun(null);
      setSelectedHistoryRunId(null);

      if (activePage === 'history') {
        await loadHistory();
      }
    } catch (clearError) {
      const message =
        clearError instanceof Error
          ? clearError.message
          : 'Не удалось очистить историю';

      setError(message);
      setHistoryError(message);
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

      const response = await fetch(`${API_URL}/autozakaz/iiko/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="logo">Автозаказ Про</div>

          <nav className="nav">
            <button
              type="button"
              className={activePage === 'main' ? 'nav-item active' : 'nav-item'}
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
                activePage === 'suppliers' ? 'nav-item active' : 'nav-item'
              }
              onClick={() => setActivePage('suppliers')}
            >
              Поставщики
            </button>
          </nav>
        </div>

        <div className="profile-box">
          <div className="avatar" />
          <div>
            <div>Магазин Ромашка</div>
            <div className="muted">тестовый режим</div>
          </div>
        </div>
      </aside>

      <main className="workspace">
        {activePage === 'main' && (
          <>
            <div className="workspace-header">
              <div>
                <h1>Загрузите продажи и получите автозаказ по вашим поставщикам</h1>
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
                      onChange={(e) => change('packSize', Number(e.target.value))}
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
                      onChange={(e) => change('deliveryDate', e.target.value)}
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
              <form className="format-card format-active" onSubmit={handleSubmit}>
                <div className="format-icon">📊</div>
                <div className="format-card-body">
                  <h3>Формат iiko</h3>
                  <p className="muted">
                    Загрузите XLSX-файл продаж из iiko. Система сверит штрихкоды
                    с каталогами поставщиков и сформирует документы заказа.
                  </p>

                  <div className="upload-area">
                    <input
                      type="file"
                      accept=".xlsx"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />
                    <div className="muted file-hint">
                      {file ? `Выбран: ${file.name}` : 'Выберите .xlsx файл'}
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="primary-button"
                    disabled={isLoading}
                  >
                    {isLoading ? 'Считаю автозаказ…' : 'Рассчитать автозаказ'}
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
                    Поддержка выгрузки продаж из 1С:Предприятие. Формат будет
                    доступен в ближайшем обновлении.
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
                    данных о продажах. Формат будет доступен в ближайшем
                    обновлении.
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
                    их с помощью ИИ и сформирует автозаказ.
                  </p>
                  <div className="ai-hint">Обработка с помощью ИИ</div>
                </div>
              </div>
            </div>
          </>
        )}

        {activePage === 'history' && (
          <>
            <div className="workspace-header">
              <div>
                <h1>История</h1>
                <p className="muted">
                  Здесь лежат все прогоны автозаказа: исходные файлы, документы и
                  детали расчёта.
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

            {historyLoading && <div className="card">Загружаю историю…</div>}

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

        {activePage === 'suppliers' && (
          <>
            <div className="workspace-header">
              <div>
                <h1>Поставщики</h1>
                <p className="muted">
                  Пока это встроенные тестовые поставщики, чтобы гонять прототип
                  без стека авторизации.
                </p>
              </div>

              <button
                type="button"
                className="secondary-button"
                onClick={() => void loadSuppliers()}
              >
                Обновить
              </button>
            </div>

            {suppliersError && <div className="error-box">{suppliersError}</div>}
            {suppliersLoading && (
              <div className="card">Загружаю поставщиков…</div>
            )}

            {!suppliersLoading && (
              <div className="suppliers-grid">
                {suppliers.map((supplier) => (
                  <div key={supplier.code} className="card">
                    <h3>{supplier.name}</h3>
                    <div className="muted">{supplier.code}</div>
                    <div className="supplier-stats">
                      Позиций в каталоге: {supplier.items.length}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

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
          margin-bottom: 24px;
          color: #f8fafc;
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
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
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

        /* --- Format cards grid --- */

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
          box-shadow: 0 0 0 1px rgba(139, 92, 246, 0.2);
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

        /* --- Supplier toggle & excel button --- */

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
          transition: background 0.15s;
        }

        .excel-button:hover {
          background: #16a34a;
        }

        /* --- Toast --- */

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
          transition: background 0.15s;
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
