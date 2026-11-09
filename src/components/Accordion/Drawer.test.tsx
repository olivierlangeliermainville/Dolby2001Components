import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { describe, it, expect } from 'vitest'
import {Accordion} from './index'

function setup(props: React.ComponentProps<typeof Accordion.Item> = {}) {
    return render(
        <Accordion.Item {...props}>
            <Accordion.Trigger headingTag="h2">Label</Accordion.Trigger>
            <Accordion.Panel>
                <p>Content</p>
            </Accordion.Panel>
        </Accordion.Item>
    )
}

describe('Accordion.Item', () => {
    it('has no axe violations with defaultOpen', async () => {
        const { container } = setup({ defaultOpen: true })
        expect((await axe(container)).violations).toHaveLength(0)
    })

    it('respects the defaultOpen prop', () => {
        setup({ defaultOpen: true })
        const button = screen.getByRole('button', { name: 'Label' })

        expect(button).toHaveAttribute('aria-expanded', 'true')
        expect(screen.getByText('Content')).toBeVisible()
    })

    it('renders the chosen heading level', () => {
        setup()
        expect(screen.getByRole('heading', { level: 2, name: 'Label' })).toBeInTheDocument()
    })

    it('starts closed', () => {
        setup()
        const button = screen.getByRole('button', { name: 'Label' })

        expect(button).toHaveAttribute('aria-expanded', 'false')
        expect(screen.getByText('Content')).not.toBeVisible()
    })

    it('opens and closes on click', async () => {
        const user = userEvent.setup()
        setup()
        const button = screen.getByRole('button', { name: 'Label' })

        await user.click(button)
        expect(button).toHaveAttribute('aria-expanded', 'true')
        expect(screen.getByText('Content')).toBeVisible()

        await user.click(button)
        expect(button).toHaveAttribute('aria-expanded', 'false')
    })

    it('works with Enter and Space', async () => {
        const user = userEvent.setup()
        setup()
        const button = screen.getByRole('button', { name: 'Label' })

        await user.tab()
        expect(button).toHaveFocus()

        await user.keyboard('{Enter}')
        expect(button).toHaveAttribute('aria-expanded', 'true')

        await user.keyboard(' ')
        expect(button).toHaveAttribute('aria-expanded', 'false')
    })

    it('labels the panel with the trigger', async () => {
        const user = userEvent.setup()
        setup()

        await user.click(screen.getByRole('button', { name: 'Label' }))
        expect(screen.getByRole('region', { name: 'Label' })).toBeInTheDocument()
    })

    it('has no axe violations when closed or open', async () => {
        const user = userEvent.setup()
        const { container } = setup()

        expect((await axe(container)).violations).toHaveLength(0)

        await user.click(screen.getByRole('button', { name: 'Label' }))
        expect((await axe(container)).violations).toHaveLength(0)
    })
})