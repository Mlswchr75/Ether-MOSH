import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="top-center"
      expand={false}
      visibleToasts={2}
      duration={2200}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast !mx-auto !min-h-0 !w-auto !max-w-[min(90vw,22rem)] !rounded-full !px-3 !py-1.5 group-[.toaster]:bg-black/88 group-[.toaster]:text-foreground group-[.toaster]:border-white/12 group-[.toaster]:shadow-md group-[.toaster]:backdrop-blur-md [&_[data-title]]:font-mono [&_[data-title]]:text-[9px] [&_[data-title]]:uppercase [&_[data-title]]:tracking-[0.1em]",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
