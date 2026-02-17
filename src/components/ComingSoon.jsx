import { motion } from 'framer-motion';

const ComingSoon = ({ title, icon: Icon, description }) => (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
  >
    <div className="flex flex-col items-center justify-center py-32">
      {Icon && <Icon className="w-8 h-8 text-surface-300 mb-4" />}
      <h2 className="text-2xl font-bold text-surface-800 mb-2">{title}</h2>
      <p className="text-surface-400 text-sm">
        {description || 'This feature is coming soon.'}
      </p>
    </div>
  </motion.div>
);

export default ComingSoon;
