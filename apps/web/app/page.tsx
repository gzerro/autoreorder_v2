'use client';

import { useMemo, useState } from 'react';

type Settings = {
  coverageDays: number;
  salesMultiplier: number;
  reserveUnits: number;
  packSize: number;
  minOrderQty: number;
  buyerName: string;
  deliveryDate: string;
};

type SupplierResult = {
  code: string;
  name: string;
  itemsCount: number;
  totalSoldQty: number;
  totalOrderQty: number;
  downloadFileName: string;
  downloadUrl: string;
  orderItems: Array<{
    barcode: string;
    name: string;
    soldQty: number;
    orderQty: number;
    price: number;
  }>;
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
  summary: {
    totalRows: number;
    uniqueBarcodes: number;
    matchedBarcodes: number;
    unknownBarcodes: number;
    suppliersWithOrders: number;
  };
  suppliers: SupplierResult[];
  unknownItems: Array<{
    barcode: string;
    name: string;
    soldQty: number;
  }>;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>({
    coverageDays: 7,
    salesMultiplier: 1,
    reserveUnits: 0,
    packSize: 1,
    minOrderQty: 1,
    buyerName: 'Магазин Ромашка',
    deliveryDate: '',
  });
  const [error, setError] = useState<string>('');

  const sourceDownloadHref = useMemo(() => {
    if (!result) return '';
    return `${API_URL}${result.sourceDownloadUrl}`;
  }, [result]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) {
      setError('Сначала выберите iiko-файл.');
      return;
    }

    setError('');
    setIsLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('settings', JSON.stringify(settings));

      const response = await fetch(`${API_URL}/autozakaz/iiko/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'Ошибка загрузки');
      }

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Неизвестная ошибка');
    } finally {
      setIsLoading(false);
    }
  }

  function change<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <main className="page">
      <aside className="sidebar">
        <div>
          <div className="logo">Автозаказ Про</div>
          <nav className="nav">
            <div className="navItem navItemActive">Главная</div>
            <div className="navItem">История</div>
            <div className="navItem">Поставщики</div>
          </nav>
        </div>

        <div className="profileStub">
          <div className="avatar" />
          <div>
            <div className="storeName">Магазин Ромашка</div>
            <div className="storeEmail">тестовый режим</div>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <div className="topBar">
          <div>
            <h1>Загрузка продаж iiko</h1>
            <p className="muted">
              Загрузите XLSX-файл, программа сверит штрихкоды с известными поставщиками
              и соберёт документы заказа.
            </p>
          </div>

          <button
            type="button"
            className="settingsSecret"
            onDoubleClick={() => setSettingsOpen((prev) => !prev)}
            title="Дважды нажмите, чтобы открыть настройки"
          >
            □
          </button>
        </div>

        {settingsOpen && (
          <div className="panel">
            <div className="panelHeader">
              <h2>Настройки автозаказа</h2>
              <button type="button" className="ghostButton" onClick={() => setSettingsOpen(false)}>
                Закрыть
              </button>
            </div>

            <div className="settingsGrid">
              <label>
                Заказ на дней
                <input
                  type="number"
                  min={1}
                  value={settings.coverageDays}
                  onChange={(e) => change('coverageDays', Number(e.target.value))}
                />
              </label>

              <label>
                Множитель продаж
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={settings.salesMultiplier}
                  onChange={(e) => change('salesMultiplier', Number(e.target.value))}
                />
              </label>

              <label>
                Резерв штук
                <input
                  type="number"
                  min={0}
                  value={settings.reserveUnits}
                  onChange={(e) => change('reserveUnits', Number(e.target.value))}
                />
              </label>

              <label>
                Кратность упаковки
                <input
                  type="number"
                  min={1}
                  value={settings.packSize}
                  onChange={(e) => change('packSize', Number(e.target.value))}
                />
              </label>

              <label>
                Минимальный заказ
                <input
                  type="number"
                  min={1}
                  value={settings.minOrderQty}
                  onChange={(e) => change('minOrderQty', Number(e.target.value))}
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
          </div>
        )}

        <form className="panel uploadPanel" onSubmit={handleSubmit}>
          <div className="uploadBox">
            <div className="uploadTitle">Формат: iiko (.xlsx)</div>
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <div className="muted">
              {file ? `Выбран файл: ${file.name}` : 'Файл пока не выбран'}
            </div>
          </div>

          <div className="buttonRow">
            <button className="primaryButton" type="submit" disabled={isLoading}>
              {isLoading ? 'Считаю автозаказ…' : 'Рассчитать автозаказ'}
            </button>
          </div>

          {error && <div className="errorBox">{error}</div>}
        </form>

        {result && (
          <>
            <div className="panel">
              <div className="panelHeader">
                <h2>Сводка</h2>
                <a className="ghostButton linkLike" href={sourceDownloadHref}>
                  Скачать исходный файл
                </a>
              </div>

              <div className="stats">
                <div className="statCard">
                  <span className="statLabel">Период</span>
                  <strong>
                    {result.period.start || '—'} → {result.period.end || '—'}
                  </strong>
                  <span className="muted">{result.period.days} дней</span>
                </div>
                <div className="statCard">
                  <span className="statLabel">Уникальных штрихкодов</span>
                  <strong>{result.summary.uniqueBarcodes}</strong>
                </div>
                <div className="statCard">
                  <span className="statLabel">Найдено</span>
                  <strong>{result.summary.matchedBarcodes}</strong>
                </div>
                <div className="statCard">
                  <span className="statLabel">Не найдено</span>
                  <strong>{result.summary.unknownBarcodes}</strong>
                </div>
              </div>
            </div>

            <div className="panel">
              <h2>Документы заказа по поставщикам</h2>

              {result.suppliers.length === 0 && (
                <div className="emptyState">Ни один поставщик не получил заказ. Возможно, все штрихкоды неизвестны.</div>
              )}

              {result.suppliers.map((supplier) => (
                <div className="supplierBlock" key={supplier.code}>
                  <div className="supplierHeader">
                    <div>
                      <h3>{supplier.name}</h3>
                      <div className="muted">
                        {supplier.itemsCount} позиций · заказ {supplier.totalOrderQty} шт.
                      </div>
                    </div>

                    <a
                      className="primaryButton linkLike"
                      href={`${API_URL}${supplier.downloadUrl}`}
                    >
                      Скачать Excel
                    </a>
                  </div>

                  <div className="tableWrap">
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
                </div>
              ))}
            </div>

            <div className="panel">
              <h2>Товары без найденного поставщика</h2>

              {result.unknownItems.length === 0 ? (
                <div className="emptyState">Все штрихкоды нашлись у известных поставщиков. Красота.</div>
              ) : (
                <div className="tableWrap">
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
                        <tr key={`unknown-${item.barcode}`}>
                          <td>{item.barcode}</td>
                          <td>{item.name}</td>
                          <td>{item.soldQty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
