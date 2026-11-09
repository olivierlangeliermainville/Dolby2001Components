import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { describe, it, expect } from 'vitest'
import {Accordion} from './index'

function setup(props: React.ComponentProps<typeof Accordion> = {}) {
    return render(
        <Accordion {...props}>
            <Accordion.Item>
                <Accordion.Trigger headingTag="h2">Label</Accordion.Trigger>
                <Accordion.Panel>
                    <p>Content</p>
                </Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item>
                <Accordion.Trigger headingTag="h2">Label</Accordion.Trigger>
                <Accordion.Panel>
                    <p>Content</p>
                </Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item>
                <Accordion.Trigger headingTag="h2">Label</Accordion.Trigger>
                <Accordion.Panel>
                    <p>Content</p>
                </Accordion.Panel>
            </Accordion.Item>
        </Accordion>
    )
}

describe('Accordion', () => {
    it('Arrow keys navigate between triggers', async () => {
        setup()
        const user = userEvent.setup()
        const triggers = screen.getAllByRole('button', { name: 'Label' })
        await user.tab()
        await user.keyboard('{ArrowDown}')
        expect(triggers[1]).toHaveFocus()
        await user.keyboard('{ArrowUp}')
        expect(triggers[0]).toHaveFocus()
        await user.keyboard('{End}')
        expect(triggers[2]).toHaveFocus()
        await user.keyboard('{Home}')
        expect(triggers[0]).toHaveFocus()
    })

    it('has no axe violations', async () => {
        const { container } = setup()
        expect((await axe(container)).violations).toHaveLength(0)
    })

    it('only allows one drawer to be open at a time', async () => {
        setup()
        const user = userEvent.setup()
        const triggers = screen.getAllByRole('button', { name: 'Label' })

        await user.click(triggers[0])
        expect(triggers[0]).toHaveAttribute('aria-expanded', 'true')

        await user.click(triggers[1])
        expect(triggers[1]).toHaveAttribute('aria-expanded', 'true')
        expect(triggers[0]).toHaveAttribute('aria-expanded', 'false')
    })

    it('allows multiple drawers to be open at a time', async () => {
        setup({ type: 'multiple' })
        const user = userEvent.setup()
        const triggers = screen.getAllByRole('button', { name: 'Label' })
        await user.click(triggers[0])
        await user.click(triggers[1])
        expect(triggers[0]).toHaveAttribute('aria-expanded', 'true')
        expect(triggers[1]).toHaveAttribute('aria-expanded', 'true')
        expect(screen.getAllByText('Content')[0]).toBeVisible()
        expect(screen.getAllByText('Content')[1]).toBeVisible()
    })

    it('closes an open item when clicked in single mode', async () => {
        setup()
        const user = userEvent.setup()
        const triggers = screen.getAllByRole('button', { name: 'Label' })
        await user.click(triggers[0])
        expect(triggers[0]).toHaveAttribute('aria-expanded', 'true')
        await user.click(triggers[0])
        expect(triggers[0]).toHaveAttribute('aria-expanded', 'false')
    })


    it('opens the item matching defaultValue', () => {
        render(
            <Accordion defaultValue="b">
                <Accordion.Item value="a">
                    <Accordion.Trigger>A</Accordion.Trigger>
                    <Accordion.Panel>a</Accordion.Panel>
                </Accordion.Item>
                <Accordion.Item value="b">
                    <Accordion.Trigger>B</Accordion.Trigger>
                    <Accordion.Panel>b</Accordion.Panel>
                </Accordion.Item>
            </Accordion>
        )

        expect(screen.getByRole('button', { name: 'A' })).toHaveAttribute('aria-expanded', 'false')
        expect(screen.getByRole('button', { name: 'B' })).toHaveAttribute('aria-expanded', 'true')
    })

})