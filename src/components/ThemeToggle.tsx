"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Theme } from "@/lib/theme";

const OPTIONS: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "Light", icon: <Sun className="w-4 h-4" /> },
  { value: "dark", label: "Dark", icon: <Moon className="w-4 h-4" /> },
  { value: "system", label: "System", icon: <Monitor className="w-4 h-4" /> },
];

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme();

  const Icon =
    theme === "system" ? Monitor : resolvedTheme === "light" ? Sun : Moon;

  const label =
    theme === "system"
      ? "Theme: System"
      : `Theme: ${resolvedTheme === "light" ? "Light" : "Dark"}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        title={`${label} (Shift + L)`}
        className={`flex items-center justify-center rounded-md border transition-opacity hover:opacity-80 focus:outline-none ${className}`}
        style={{
          width: "2rem",
          height: "2rem",
          borderColor: "var(--border-default)",
          background: "transparent",
          color: "var(--text-secondary)",
        }}
      >
        <Icon className="w-4 h-4" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-44 p-1 bg-[var(--bg-elevated)] border-[var(--border-default)] text-[var(--text-primary)] rounded-xl"
      >
        <DropdownMenuLabel className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
          Appearance
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-[var(--border-subtle)]" />
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => setTheme(value as Theme)}
        >
          {OPTIONS.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer text-[var(--text-primary)] focus:bg-[var(--bg-surface)] data-[state=checked]:text-[var(--accent-secondary)]"
            >
              {option.icon}
              <span className="text-[13px]">{option.label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}