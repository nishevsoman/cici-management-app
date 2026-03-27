export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html>
      <body>
        <nav className="p-4 border-b">
          <a href="/dashboard" className="mr-4">Dashboard</a>
          <a href="/batches">Batches</a>
          <a href="/students" className="mr-4">Students</a>
        </nav>

        {children}
      </body>
    </html>
  );
}