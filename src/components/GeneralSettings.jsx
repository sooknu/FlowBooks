import BrandingManager from '@/components/BrandingManager';
import LogoBrandingManager from '@/components/LogoBrandingManager';

const GeneralSettings = () => (
  <div className="space-y-5">
    <BrandingManager />
    <hr className="border-surface-200" />
    <LogoBrandingManager />
  </div>
);

export default GeneralSettings;
