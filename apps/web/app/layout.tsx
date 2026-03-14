import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Автозаказ Про',
  description: 'Прототип автозаказа для iiko',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
