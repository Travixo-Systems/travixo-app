// lib/ThemeContext.tsx
'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useOrganization, type BrandingColors } from '@/hooks/useOrganization';

const DEFAULT_COLORS: BrandingColors = {
  primary: '#1e3a5f',
  secondary: '#2d5a7b',
  accent: '#d97706',
  success: '#047857',
  warning: '#eab308',
  danger: '#b91c1c',
};

interface ThemeContextType {
  colors: BrandingColors;
  logo: string | null;
  orgName: string;
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  colors: DEFAULT_COLORS,
  logo: null,
  orgName: 'TraviXO',
  isLoading: true,
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { data: organization, isLoading } = useOrganization();
  const [colors, setColors] = useState<BrandingColors>(DEFAULT_COLORS);
  const [logo, setLogo] = useState<string | null>(null);
  const [orgName, setOrgName] = useState('TraviXO');

  useEffect(() => {
    if (organization) {
      // Set colors
      if (organization.branding_colors) {
        setColors(organization.branding_colors);
      }
      // Set logo
      if (organization.logo_url) {
        setLogo(organization.logo_url);
      }
      // Set org name
      if (organization.name) {
        setOrgName(organization.name);
      }
    }
  }, [organization]);

  // Apply CSS variables whenever colors change
  useEffect(() => {
    const root = document.documentElement;
    
    root.style.setProperty('--color-primary', colors.primary);
    root.style.setProperty('--color-secondary', colors.secondary);
    root.style.setProperty('--color-accent', colors.accent);
    root.style.setProperty('--color-success', colors.success);
    root.style.setProperty('--color-warning', colors.warning);
    root.style.setProperty('--color-danger', colors.danger);

    // Also set RGB versions for opacity support
    root.style.setProperty('--color-primary-rgb', hexToRgb(colors.primary));
    root.style.setProperty('--color-secondary-rgb', hexToRgb(colors.secondary));
    root.style.setProperty('--color-accent-rgb', hexToRgb(colors.accent));
    root.style.setProperty('--color-success-rgb', hexToRgb(colors.success));
    root.style.setProperty('--color-warning-rgb', hexToRgb(colors.warning));
    root.style.setProperty('--color-danger-rgb', hexToRgb(colors.danger));
  }, [colors]);

  return (
    <ThemeContext.Provider value={{ colors, logo, orgName, isLoading }}>
      {children}
    </ThemeContext.Provider>
  );
}

// Helper to convert hex to RGB
function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '0, 0, 0';
  return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
}