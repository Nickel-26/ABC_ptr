import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

export const Button = React.forwardRef(({ className, variant = 'primary', size = 'default', children, isLoading, asChild, ...props }, ref) => {
  const baseStyles = "inline-flex items-center justify-center rounded-xl font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background";
  
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-[0_0_15px_rgba(37,99,235,0.4)]",
    secondary: "bg-zinc-800 text-zinc-100 hover:bg-zinc-700",
    outline: "border border-zinc-700 hover:bg-zinc-800 text-zinc-100",
    ghost: "hover:bg-zinc-800 hover:text-zinc-100 text-zinc-400",
  };

  const sizes = {
    default: "h-10 py-2 px-4",
    sm: "h-9 px-3 rounded-lg text-sm",
    lg: "h-12 px-8 rounded-xl text-lg",
    icon: "h-10 w-10",
  };

  const combinedClassName = cn(baseStyles, variants[variant], sizes[size], className);

  // If asChild, clone the single child element and pass button styles to it
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      className: cn(combinedClassName, children.props.className),
      ref,
    });
  }

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={combinedClassName}
      ref={ref}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading ? (
        <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : null}
      {children}
    </motion.button>
  );
});

Button.displayName = "Button";
