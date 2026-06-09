import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

export function Card({ className, children, ...props }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={cn("glass-card rounded-2xl p-6", className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function CardHeader({ className, children, ...props }) {
    return (
      <div className={cn("flex flex-col space-y-1.5 pb-4", className)} {...props}>
        {children}
      </div>
    )
}

export function CardTitle({ className, children, ...props }) {
    return (
      <h3 className={cn("text-xl font-semibold leading-none tracking-tight text-white", className)} {...props}>
        {children}
      </h3>
    )
}
