import React, { useState } from 'react';
import { CareScriptProvider, useCareScript } from './context/CareScriptContext';
import { AuthScreen } from './components/AuthScreen';
import { Layout } from './components/Layout';
import { Dashboard } from './components/dashboard/Dashboard';
import { PatientProfileModal } from './components/dashboard/PatientProfileModal';
import { ScanPrescription } from './components/scan/ScanPrescription';
import { AIBuddy } from './components/aibuddy/AIBuddy';
import { Reminders } from './components/reminders/Reminders';
import { Settings } from './components/settings/Settings';

const CareScriptAppContent: React.FC = () => {
  const { session, authReady, activeTab } = useCareScript();
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  if (!authReady) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{ backgroundColor: 'var(--color-background)' }}
      >
        <div className="cs-card px-6 py-5 text-sm font-semibold">
          Restoring your CareScript session...
        </div>
      </div>
    );
  }

  if (!session.isAuthenticated) {
    return <AuthScreen />;
  }

  return (
    <Layout onOpenProfileModal={() => setProfileModalOpen(true)}>
      {activeTab === 'dashboard' && (
        <Dashboard onEditProfile={() => setProfileModalOpen(true)} />
      )}
      {activeTab === 'scan' && <ScanPrescription />}
      {activeTab === 'ai-buddy' && <AIBuddy />}
      {activeTab === 'reminders' && <Reminders />}
      {activeTab === 'settings' && <Settings />}

      <PatientProfileModal
        open={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
      />
    </Layout>
  );
};

export function App() {
  return (
    <CareScriptProvider>
      <CareScriptAppContent />
    </CareScriptProvider>
  );
}

export default App;
