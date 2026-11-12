import { createContext, useContext } from 'react'
import type { CarouselContextValue } from './types'

export const CarouselContext = createContext<CarouselContextValue | null>(null)

export function useCarousel() {
    const context = useContext(CarouselContext)
    if (!context) throw new Error('Carousel parts must be used inside <Carousel>')
    return context
}

export const SlideContext = createContext({
    index: 0,       // position in the ring (real slides + copies)
    total: 0,       // ring size
    realIndex: 0,   // index among your real slides
    realCount: 0,
    isClone: false,
})
