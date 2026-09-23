import React, { ButtonHTMLAttributes, forwardRef } from 'react';
import { Button } from '@/components/ui/button';

export interface LoadingButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
  children: React.ReactNode;
}

export const LoadingButton = forwardRef<HTMLButtonElement, LoadingButtonProps>(
  ({ loading = false, loadingText, disabled, children, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (loadingText || children) : children}
      </Button>
    );
  }
);

LoadingButton.displayName = 'LoadingButton';
