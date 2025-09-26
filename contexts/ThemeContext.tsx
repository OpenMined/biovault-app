import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useColorScheme } from 'react-native'
import { Storage } from 'expo-sqlite/kv-store'
import { ColorTheme, lightTheme, darkTheme } from '@/styles/colors'

type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeContextType {
	theme: ColorTheme
	themeMode: ThemeMode
	setThemeMode: (mode: ThemeMode) => void
	isDark: boolean
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: ReactNode }) {
	const systemColorScheme = useColorScheme()
	const [themeMode, setThemeModeState] = useState<ThemeMode>('system')
	const [theme, setTheme] = useState<ColorTheme>(lightTheme)

	useEffect(() => {
		// Load saved theme preference
		const savedTheme = Storage.getItemSync('themeMode') as ThemeMode | null
		if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
			setThemeModeState(savedTheme)
		}
	}, [])

	useEffect(() => {
		// Update theme based on mode
		let selectedTheme: ColorTheme
		if (themeMode === 'system') {
			console.log('📱 System color scheme detected:', systemColorScheme)
			console.log('📱 System color scheme type:', typeof systemColorScheme)
			// Handle case where systemColorScheme might be null
			const isDarkSystem = systemColorScheme === 'dark'
			selectedTheme = isDarkSystem ? darkTheme : lightTheme
			console.log('📱 Using system theme:', isDarkSystem ? 'dark' : 'light')
		} else {
			selectedTheme = themeMode === 'dark' ? darkTheme : lightTheme
		}
		console.log('🎨 Theme mode:', themeMode, '| Selected theme:', selectedTheme === darkTheme ? 'dark' : 'light')
		setTheme(selectedTheme)
	}, [themeMode, systemColorScheme])

	const setThemeMode = (mode: ThemeMode) => {
		setThemeModeState(mode)
		Storage.setItemSync('themeMode', mode)
	}

	const isDark = theme === darkTheme

	return (
		<ThemeContext.Provider value={{ theme, themeMode, setThemeMode, isDark }}>
			{children}
		</ThemeContext.Provider>
	)
}

export function useTheme() {
	const context = useContext(ThemeContext)
	if (!context) {
		throw new Error('useTheme must be used within a ThemeProvider')
	}
	return context
}