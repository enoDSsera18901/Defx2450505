import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'LastBarrel — Oil Market Intelligence',
  description: 'Oil price, supply, logistics and confidence intelligence dashboard',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
