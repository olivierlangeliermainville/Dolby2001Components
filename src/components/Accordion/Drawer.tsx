"use client"
import {useAccordion} from './Accordion'
import { useState, useId, useContext, createContext } from 'react'

type DrawerContextValue = {
    isOpen: boolean
    toggle: () => void
    triggerId: string
    panelId: string
}

const DrawerContext = createContext<DrawerContextValue | null>(null)


function useDrawer() {
    const context = useContext(DrawerContext)
    if (!context) {
        throw new Error('Accordion parts must be used inside <Accordion.Item>')
    }
    return context
}

type DrawerProps = React.ComponentPropsWithoutRef<'div'> & {
    defaultOpen?: boolean
    value?: string
}

// 1. The parent: state + ids + provider
export default function Drawer({ children, defaultOpen = false, value, ...props }: DrawerProps) {
    const accordion = useAccordion()
    const [ownOpen, setOwnOpen] = useState(defaultOpen)
    const generatedId = useId()
    const panelId = useId()
    const triggerId = useId()

    const itemId = value ?? generatedId

    const isOpen = accordion?.type === 'single' ? accordion.openId === itemId : ownOpen


    const toggle = () => {
        if (accordion?.type === 'single') {
            accordion.setOpenId(isOpen ? null : itemId)
        } else {
            setOwnOpen((prev) => !prev)
        }
    }

    return (
        <DrawerContext.Provider value={{ isOpen, toggle, triggerId, panelId }}>
            <div {...props}>{children}</div>
        </DrawerContext.Provider>
    )
}

type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'

type TriggerProps = React.ComponentPropsWithoutRef<'button'> & {
    headingTag?: HeadingTag
}

// 2. The trigger: heading + button
export function DrawerTrigger({ children, headingTag = 'h3', onClick, ...props }: TriggerProps) {
    const { isOpen, toggle, triggerId, panelId } = useDrawer()

    const Heading = headingTag

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(event)
        toggle()
    }

    return (
        <Heading>
            <button
                {...props}
                type="button"
                id={triggerId}
                data-accordion-trigger=""
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={handleClick}
            >
                {children}
            </button>
        </Heading>
    )
}

type PanelProps = React.ComponentPropsWithoutRef<'div'>

// 3. The panel: the content area
export function DrawerPanel({ children, ...props }: PanelProps) {
    const { isOpen, triggerId, panelId } = useDrawer()

    return (
        <div
            {...props}
            id={panelId}
            role="region"
            aria-labelledby={triggerId}
            hidden={!isOpen}
        >
            {children}
        </div>
    )
}
