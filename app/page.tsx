import { isCurrentUserAdmin } from '@/src/lib/adminAccess';
import OverviewPage from './overview/page';
import AdminPage from './admin/page';

export default async function Home() {
  const isAdmin = await isCurrentUserAdmin();

  if (!isAdmin) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center font-sans">
        <div className="w-full">
          <OverviewPage />
        </div>
      </div>
    );
  }

  return <AdminPage />;
}
