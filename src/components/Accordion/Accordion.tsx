"use client"
import { createContext, useContext, useState, useRef } from 'react'

type AccordionContextValue = {
    type: 'single' | 'multiple'
    openId: string | null
    setOpenId: (id: string | null) => void
}

export const AccordionContext = createContext<AccordionContextValue | null>(null)

// Drawers use this to check if they're inside an Accordion (null if not)
export function useAccordion() {
    return useContext(AccordionContext)
}

type AccordionProps = React.ComponentPropsWithoutRef<'div'> & {
    type?: 'single' | 'multiple',
    defaultValue?: string
}

export default function Accordion({ children, type = 'single', defaultValue, ...props }: AccordionProps) {
    const [openId, setOpenId] = useState<string | null>(defaultValue ?? null)
    const containerRef = useRef<HTMLDivElement>(null)


    const keyDownHandler = (event: React.KeyboardEvent<HTMLDivElement>) => {
        const container = containerRef.current
        if (!container) return

        // Only react to keys pressed while a trigger has focus
        const current = (event.target as HTMLElement).closest('[data-accordion-trigger]')
        if (!current) return

        const triggers = Array.from(
            container.querySelectorAll<HTMLButtonElement>('[data-accordion-trigger]:not(:disabled)')
        )
        const index = triggers.indexOf(current as HTMLButtonElement)
        if (index === -1) return

        let next: HTMLButtonElement | undefined

        switch (event.key) {
            case 'ArrowDown':
                next = triggers[(index + 1) % triggers.length]
                break
            case 'ArrowUp':
                next = triggers[(index - 1 + triggers.length) % triggers.length]
                break
            case 'Home':
                next = triggers[0]
                break
            case 'End':
                next = triggers[triggers.length - 1]
                break
            default:
                return
        }

        event.preventDefault()
        next?.focus()
    }

    return (
        <AccordionContext.Provider value={{ type, openId, setOpenId }}>
            <div {...props} ref={containerRef} onKeyDown={keyDownHandler}>
                {children}
            </div>
        </AccordionContext.Provider>
    )
}
