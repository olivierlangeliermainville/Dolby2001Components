import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { Carousel } from './index'

// jsdom has no layout, so give every element a size: the track is 300px wide and each
// slide is 100px wide, which means 3 slides fit at once.
let systemReduced = false

beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 100 })
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 300 })
    vi.stubGlobal(
        'ResizeObserver',
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        }
    )
    Element.prototype.setPointerCapture = vi.fn()
})

beforeEach(() => {
    systemReduced = false
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: systemReduced && query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
        onchange: null,
    })) as unknown as typeof window.matchMedia
})

type SetupProps = Omit<React.ComponentProps<typeof Carousel>, 'children'> & { slides?: number }

// Reduced motion is on by default so a move finishes instantly and tests don't wait for frames
function setup({ slides = 5, ...props }: SetupProps = {}) {
    return render(
        <Carousel aria-label="Featured" reducedMotion {...props}>
            <Carousel.Track>
                {Array.from({ length: slides }, (_, i) => (
                    <Carousel.Slide key={i}>Slide {i + 1}</Carousel.Slide>
                ))}
            </Carousel.Track>
            <Carousel.Prev>Prev</Carousel.Prev>
            <Carousel.Next>Next</Carousel.Next>
        </Carousel>
    )
}

const allSlides = () => Array.from(document.querySelectorAll<HTMLElement>('[data-carousel-slide]'))
const exposedSlides = () => allSlides().filter((el) => el.getAttribute('aria-hidden') === 'false')
const exposedText = () => exposedSlides().map((el) => el.textContent)
const prev = () => screen.getByRole('button', { name: 'Previous slide' })
const next = () => screen.getByRole('button', { name: 'Next slide' })

describe('Carousel structure', () => {
    it('renders a labelled carousel', () => {
        setup()
        const carousel = screen.getByRole('region', { name: 'Featured' })
        expect(carousel).toHaveAttribute('aria-roledescription', 'carousel')
    })

    it('marks every slide as a slide and labels it "n of N"', () => {
        setup()
        const slides = allSlides()
        expect(slides).toHaveLength(5)
        slides.forEach((slide, i) => {
            expect(slide).toHaveAttribute('role', 'group')
            expect(slide).toHaveAttribute('aria-roledescription', 'slide')
            expect(slide).toHaveAttribute('aria-label', `${i + 1} of 5`)
        })
    })

    it('has no axe violations', async () => {
        const { container } = setup()
        expect((await axe(container)).violations).toHaveLength(0)
    })

    it('throws a clear error when a part is used outside Carousel', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
        expect(() => render(<Carousel.Next>Next</Carousel.Next>)).toThrow(
            'Carousel parts must be used inside <Carousel>'
        )
        spy.mockRestore()
    })
})

describe('Carousel buttons', () => {
    it('has default labels that can be overridden', () => {
        render(
            <Carousel aria-label="Featured" reducedMotion>
                <Carousel.Track>
                    {[1, 2, 3, 4, 5].map((n) => (
                        <Carousel.Slide key={n}>{n}</Carousel.Slide>
                    ))}
                </Carousel.Track>
                <Carousel.Prev aria-label="Précédent">P</Carousel.Prev>
                <Carousel.Next>N</Carousel.Next>
            </Carousel>
        )
        expect(screen.getByRole('button', { name: 'Précédent' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Next slide' })).toBeInTheDocument()
    })

    it('calls a user onClick as well as moving', async () => {
        const user = userEvent.setup()
        const onClick = vi.fn()
        render(
            <Carousel aria-label="Featured" reducedMotion>
                <Carousel.Track>
                    {[1, 2, 3, 4, 5].map((n) => (
                        <Carousel.Slide key={n}>Slide {n}</Carousel.Slide>
                    ))}
                </Carousel.Track>
                <Carousel.Prev>Prev</Carousel.Prev>
                <Carousel.Next onClick={onClick}>Next</Carousel.Next>
            </Carousel>
        )

        await user.click(next())
        expect(onClick).toHaveBeenCalledTimes(1)
        expect(exposedText()).toEqual(['Slide 2', 'Slide 3', 'Slide 4'])
    })
})

describe('Carousel in default mode', () => {
    it('exposes only the slides that fit', () => {
        setup()
        expect(exposedText()).toEqual(['Slide 1', 'Slide 2', 'Slide 3'])
        allSlides()
            .slice(3)
            .forEach((slide) => expect(slide).toHaveAttribute('aria-hidden', 'true'))
    })

    it('starts with Prev disabled', () => {
        setup()
        expect(prev()).toBeDisabled()
        expect(next()).toBeEnabled()
    })

    it('moves one slide at a time and stops at the end', async () => {
        const user = userEvent.setup()
        setup()

        await user.click(next())
        expect(exposedText()).toEqual(['Slide 2', 'Slide 3', 'Slide 4'])

        await user.click(next())
        expect(exposedText()).toEqual(['Slide 3', 'Slide 4', 'Slide 5'])
        expect(next()).toBeDisabled()
        expect(prev()).toBeEnabled()
    })

    it('moves back with Prev', async () => {
        const user = userEvent.setup()
        setup()

        await user.click(next())
        await user.click(prev())
        expect(exposedText()).toEqual(['Slide 1', 'Slide 2', 'Slide 3'])
        expect(prev()).toBeDisabled()
    })

    it('disables both buttons when every slide already fits', () => {
        setup({ slides: 3 })
        expect(prev()).toBeDisabled()
        expect(next()).toBeDisabled()
        expect(exposedText()).toEqual(['Slide 1', 'Slide 2', 'Slide 3'])
    })

    it('adds no copies', () => {
        setup()
        expect(allSlides()).toHaveLength(5)
        expect(document.querySelectorAll('[data-carousel-clone]')).toHaveLength(0)
    })
})

describe('Carousel in infinite mode', () => {
    it('adds copies when there are too few slides, and hides them', () => {
        setup({ type: 'infinite' })
        // 5 slides, 3 visible: the ring is padded to 10
        const clones = document.querySelectorAll<HTMLElement>('[data-carousel-clone]')
        expect(allSlides()).toHaveLength(10)
        expect(clones).toHaveLength(5)
        clones.forEach((clone) => expect(clone).toHaveAttribute('aria-hidden', 'true'))
    })

    it('labels copies by the real slide count', () => {
        setup({ type: 'infinite' })
        allSlides().forEach((slide) => {
            expect(slide.getAttribute('aria-label')).toMatch(/^[1-5] of 5$/)
        })
    })

    it('keeps both buttons enabled', async () => {
        const user = userEvent.setup()
        setup({ type: 'infinite' })
        expect(prev()).toBeEnabled()
        expect(next()).toBeEnabled()

        await user.click(prev())
        expect(prev()).toBeEnabled()
        expect(next()).toBeEnabled()
    })

    it('goes forward past the last slide and comes back to the first', async () => {
        const user = userEvent.setup()
        setup({ type: 'infinite' })

        for (let i = 0; i < 5; i++) await user.click(next())
        expect(exposedText()).toEqual(['Slide 1', 'Slide 2', 'Slide 3'])
    })

    it('exposes a full set of slides after going back from the start', async () => {
        const user = userEvent.setup()
        setup({ type: 'infinite' })

        await user.click(prev())
        // Slide 5 is now on screen at the left edge, so it must be reachable.
        // Sorted, because its copy comes last in the DOM even though it is drawn first.
        expect(exposedText().sort()).toEqual(['Slide 1', 'Slide 2', 'Slide 5'])
    })
})

describe('Carousel motion', () => {
    it('moves the slides instantly when reduced motion is on', async () => {
        const user = userEvent.setup()
        setup()

        await user.click(next())
        expect(allSlides()[0].style.transform).toContain('calc(-100%')
    })

    it('follows the system setting when reducedMotion is not passed', async () => {
        const user = userEvent.setup()
        systemReduced = true
        setup({ reducedMotion: undefined })

        await user.click(next())
        expect(allSlides()[0].style.transform).toContain('calc(-100%')
    })

    it('animates when reduced motion is off, so the slides have not arrived yet', async () => {
        const user = userEvent.setup()
        setup({ reducedMotion: false })

        await user.click(next())
        // The settled slide has changed (for assistive technology) but the drawn position has not
        expect(exposedText()).toEqual(['Slide 2', 'Slide 3', 'Slide 4'])
        expect(allSlides()[0].style.transform).toContain('calc(0%')
    })
})

describe('Carousel drag', () => {
    const track = () => allSlides()[0].parentElement as HTMLElement

    // Moves in small steps, like a real pointer. The drag is measured from the point where it
    // passes the 5px threshold, so a single big jump would count as zero distance.
    function drag(from: number, to: number) {
        const opts = { pointerId: 1, pointerType: 'mouse' }
        fireEvent.pointerDown(track(), { clientX: from, button: 0, ...opts })
        const direction = to > from ? 1 : -1
        for (let x = from + direction * 10; direction * (to - x) > 0; x += direction * 10) {
            fireEvent.pointerMove(track(), { clientX: x, ...opts })
        }
        fireEvent.pointerMove(track(), { clientX: to, ...opts })
        fireEvent.pointerUp(track(), { clientX: to, ...opts })
    }

    it('does nothing unless drag is turned on', () => {
        setup()
        drag(300, 100)
        expect(exposedText()).toEqual(['Slide 1', 'Slide 2', 'Slide 3'])
    })

    it('moves forward when dragged left past a slide', () => {
        setup({ drag: true })
        drag(300, 90) // about 2 slides left
        expect(exposedText()).toEqual(['Slide 3', 'Slide 4', 'Slide 5'])
    })

    it('moves back when dragged right', () => {
        setup({ drag: true })
        drag(300, 100)
        drag(100, 300)
        expect(exposedText()).toEqual(['Slide 1', 'Slide 2', 'Slide 3'])
    })

    it('stays put on a tiny drag', () => {
        setup({ drag: true })
        drag(300, 297) // under the 5px threshold
        expect(exposedText()).toEqual(['Slide 1', 'Slide 2', 'Slide 3'])
    })

    it('snaps back when the drag is short', () => {
        setup({ drag: true })
        drag(300, 285) // 15px: about 0.15 of a slide, under the 20% threshold
        expect(exposedText()).toEqual(['Slide 1', 'Slide 2', 'Slide 3'])
    })

    it('cannot be dragged past the end in default mode', () => {
        setup({ drag: true })
        drag(300, -300) // 6 slides worth
        expect(exposedText()).toEqual(['Slide 3', 'Slide 4', 'Slide 5'])
        expect(next()).toBeDisabled()
    })
})