import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/layouts/AppShell';
import { KeepAliveOutlet } from '@/layouts/KeepAliveOutlet';
import { LegacyBridgePage } from '@/pages/LegacyBridgePage';
import { LoginPage } from '@/pages/LoginPage';
import { SearchPage } from '@/pages/SearchPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { CentersPage } from '@/pages/CentersPage';
import { SpaNavBridge } from '@/nav/SpaNavBridge';
import { SpaHardwareBack } from '@/nav/SpaHardwareBack';

/**
 * Client-side routes. Primary tabs stay mounted via KeepAliveOutlet.
 * Deep / unfinished screens use /legacy/* → iframe bridge (temporary).
 */
export function AppRouter() {
  return (
    <>
      <SpaNavBridge />
      <SpaHardwareBack />
      <Routes>
        <Route path="login" element={<LoginPage />} />
        <Route element={<AppShell />}>
          <Route element={<KeepAliveOutlet />}>
            <Route index element={<Navigate to="/explore" replace />} />
            <Route path="explore/*" element={null} />
            <Route path="video/*" element={null} />
            <Route path="chat/*" element={null} />
            <Route path="profile/*" element={null} />
            <Route path="rankings/*" element={null} />
          </Route>
          <Route path="search" element={<SearchPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="centers" element={<CentersPage />} />
          <Route path="legacy/*" element={<LegacyBridgePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/explore" replace />} />
      </Routes>
    </>
  );
}
