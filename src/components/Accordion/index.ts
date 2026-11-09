// index.ts
import AccordionRoot from './Accordion'
import Drawer, { DrawerTrigger, DrawerPanel } from './Drawer'

// Dot notation: works in client components
export const Accordion = Object.assign(AccordionRoot, {
    Item: Drawer,
    Trigger: DrawerTrigger,
    Panel: DrawerPanel,
})

// Named exports: work everywhere, including server components
export {
    Drawer as AccordionItem,
    DrawerTrigger as AccordionTrigger,
    DrawerPanel as AccordionPanel,
}