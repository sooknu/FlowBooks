import ProjectTypesManager from '@/components/ProjectTypesManager';
import ProjectRolesManager from '@/components/ProjectRolesManager';
import ExpenseCategoriesManager from '@/components/ExpenseCategoriesManager';

const CategoriesSettings = () => (
  <div className="space-y-5">
    <ProjectTypesManager />
    <hr className="border-surface-200" />
    <ProjectRolesManager />
    <hr className="border-surface-200" />
    <ExpenseCategoriesManager />
  </div>
);

export default CategoriesSettings;
