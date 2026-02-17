import ProjectTypesManager from '@/components/ProjectTypesManager';
import ProjectRolesManager from '@/components/ProjectRolesManager';
import ExpenseCategoriesManager from '@/components/ExpenseCategoriesManager';
import VendorsManager from '@/components/VendorsManager';

const CategoriesSettings = () => (
  <div className="space-y-5">
    <ProjectTypesManager />
    <hr className="border-surface-200" />
    <ProjectRolesManager />
    <hr className="border-surface-200" />
    <ExpenseCategoriesManager />
    <hr className="border-surface-200" />
    <VendorsManager />
  </div>
);

export default CategoriesSettings;
