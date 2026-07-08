import OverviewPage from './overview/page'

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center font-sans">
      <div className="w-full">
        <OverviewPage />
      </div>
    </div>
  );
}
