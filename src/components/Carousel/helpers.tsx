import { useSyncExternalStore } from 'react'

// Hidden visually, still read by screen readers
export const visuallyHidden: React.CSSProperties = {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
}

// Reads the system "reduce motion" setting. Assumes "no preference" on the server.
export function useSystemReducedMotion() {
    return useSyncExternalStore(
        (callback) => {
            const query = window.matchMedia('(prefers-reduced-motion: reduce)')
            query.addEventListener('change', callback)
            return () => query.removeEventListener('change', callback)
        },
        () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        () => false
    )
}

export const mod = (n: number, m: number) => ((n % m) + m) % m
export const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max)