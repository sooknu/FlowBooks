import BrandingManager from '@/components/BrandingManager';
import LogoBrandingManager from '@/components/LogoBrandingManager';
import { useAppData } from '@/hooks/useAppData';

const GeneralSettings = () => {
  const { isAdmin } = useAppData();
  return (
    <div className="space-y-5">
      <BrandingManager />
      {isAdmin && <>
        <hr className="border-surface-200" />
        <LogoBrandingManager />
      </>}
    </div>
  );
};

export default GeneralSettings;
