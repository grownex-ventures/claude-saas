import { createContext, useContext, useEffect, useState } from "react";
import { Toaster } from "sonner";

const ThemeContext = createContext(null);
const KEY = "ysmm_theme";

/** Light/dark theme for the logged-in app. The landing & auth pages stay light. */
export function ThemeProvider({ children }) {
    const [theme, setTheme] = useState(() => localStorage.getItem(KEY) || "light");
    const [applied, setApplied] = useState(false);
    useEffect(() => {
        localStorage.setItem(KEY, theme);
    }, [theme]);
    const value = { theme, setTheme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")), applied, setApplied };
    return (
        <ThemeContext.Provider value={value}>
            {children}
            <Toaster position="top-right" richColors closeButton theme={applied ? theme : "light"} />
        </ThemeContext.Provider>
    );
}

export const useTheme = () => useContext(ThemeContext);

/** Call inside the app shell: adds the `dark` class to <html> while mounted. */
export function useApplyTheme() {
    const { theme, setApplied } = useTheme();
    useEffect(() => {
        document.documentElement.classList.toggle("dark", theme === "dark");
        document.documentElement.style.colorScheme = theme;
        setApplied(true);
        return () => {
            document.documentElement.classList.remove("dark");
            document.documentElement.style.colorScheme = "";
            setApplied(false);
        };
    }, [theme, setApplied]);
}
