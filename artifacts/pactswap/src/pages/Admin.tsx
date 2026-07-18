export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // Real implementation would verify admin status
  return (
    <div className="p-8 text-center text-white">Admin Dashboard (Available via CLI/Backend scripts or separate admin panel)</div>
  );
}