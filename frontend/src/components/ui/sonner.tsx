import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { useTheme } from '@/theme/ThemeProvider';

export function Toaster(props: ToasterProps) {
  const { resolved } = useTheme();
  return (
    <Sonner
      theme={resolved}
      position="bottom-right"
      closeButton
      toastOptions={{ classNames: { toast: '!bg-popover !text-popover-foreground !border-border !shadow-lg !text-[13px]', description: '!text-muted-foreground' } }}
      {...props}
    />
  );
}
