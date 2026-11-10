"use client"
import {
    createContext,
    useContext,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    useSyncExternalStore,
    Children,
    isValidElement,
} from 'react'

type CarouselType = 'default' | 'infinite'

const SETTLE = 5.8 // omega × seconds for a critically damped spring to settle

type DragOptions = {
    momentum?: boolean     // flicks carry across several slides (default false)
    reach?: number         // seconds of extra travel a flick adds (default 0.25)
    maxSlides?: number     // most slides one flick can add (default 8)
    friction?: number      // above 0. Higher stops sooner, lower glides longer (default 1)
    duration?: number      // ms: settle time when there is no flick (defaults to `duration`)
    minDuration?: number   // ms: shortest flick settle (default 0)
    maxDuration?: number   // ms: longest flick settle (default 10000)
}

type CarouselContextValue = {
    position: number     // settled slide (whole number): where it is heading
    livePosition: number // animated position (fractional): where it is drawn
    active: number       // position wrapped into 0..count-1
    count: number        // real slides only
    visible: number      // how many whole slides fit in the track
    gap: number          // px
    type: CarouselType
    canPrev: boolean
    canNext: boolean
    draggable: boolean
    dragging: boolean
    setCount: (n: number) => void
    setVisible: (n: number) => void
    go: (direction: 1 | -1) => void
    goBy: (steps: number) => void
    startDrag: () => void
    moveDrag: (slides: number) => void      // distance dragged, in slides (right = positive)
    releaseDrag: (velocity: number) => void // slides per second, forward = positive
}

const CarouselContext = createContext<CarouselContextValue | null>(null)

function useCarousel() {
    const context = useContext(CarouselContext)
    if (!context) throw new Error('Carousel parts must be used inside <Carousel>')
    return context
}

// Reads the system "reduce motion" setting. Assumes "no preference" on the server.
function useSystemReducedMotion() {
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

const mod = (n: number, m: number) => ((n % m) + m) % m
const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max)

type CarouselProps = React.ComponentPropsWithoutRef<'section'> & {
    type?: CarouselType
    gap?: number             // px between slides
    duration?: number        // ms: how long Prev and Next take to settle
    reducedMotion?: boolean  // omit to follow the system setting
    drag?: boolean | DragOptions
}

export default function Carousel({
    children,
    type = 'default',
    gap = 0,
    duration = 300,
    reducedMotion,
    drag = false,
    ...props
}: CarouselProps) {
    // --- Options --------------------------------------------------------------------

    const dragOptions = typeof drag === 'object' ? drag : {}
    const draggable = drag !== false
    const momentum = dragOptions.momentum ?? false
    const reach = dragOptions.reach ?? 0.25
    const maxSlides = dragOptions.maxSlides ?? 8
    const friction = Math.max(dragOptions.friction ?? 1, 0.01)
    const releaseDuration = dragOptions.duration ?? duration
    const minDuration = dragOptions.minDuration ?? 0
    const maxDuration = dragOptions.maxDuration ?? 10000

    // --- State ----------------------------------------------------------------------

    const [live, setLive] = useState(0)       // drawn position (float)
    const [settled, setSettled] = useState(0) // target slide (whole number)
    const [count, setCount] = useState(0)
    const [visible, setVisible] = useState(1)
    const [dragging, setDragging] = useState(false)
    const systemReduced = useSystemReducedMotion()
    const reduced = reducedMotion ?? systemReduced

    // The animation reads and writes these directly, so it never works from stale state
    const liveRef = useRef(0)
    const velocityRef = useRef(0)   // slides per second
    const targetRef = useRef(0)
    const dragBase = useRef(0)
    const frameRef = useRef<number | null>(null)
    const dragFrameRef = useRef<number | null>(null)

    const infinite = type === 'infinite' && count > 1
    // Infinite mode can always move (the track adds copies as needed); default mode only if slides overflow
    const scrollable = infinite ? true : count > visible
    const maxPosition = Math.max(0, count - visible)

    // In default mode the last slide stops at the right edge; resizing can't leave us past it
    const position = infinite ? settled : Math.min(settled, maxPosition)
    const livePosition = infinite ? live : clamp(live, 0, maxPosition)

    useEffect(
        () => () => {
            if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
            if (dragFrameRef.current !== null) cancelAnimationFrame(dragFrameRef.current)
        },
        []
    )

    const stop = () => {
        if (frameRef.current !== null) {
            cancelAnimationFrame(frameRef.current)
            frameRef.current = null
        }
    }

    // --- Animation ------------------------------------------------------------------

    // Moves the drawn position to `target` with a spring that keeps the velocity it is given
    const animateTo = (target: number, velocity = 0, ms = duration) => {
        stop()
        targetRef.current = target
        setSettled(target)

        if (reduced || ms <= 0) {
            liveRef.current = target
            velocityRef.current = 0
            setLive(target)
            return
        }

        // Critically damped spring: no wobble, settles in roughly `ms` milliseconds
        const omega = SETTLE / (ms / 1000)
        const distance = target - liveRef.current
        const toward = Math.sign(distance)
        const maxSpeed = omega * Math.abs(distance)
        velocityRef.current =
            velocity * toward > 0 ? Math.min(Math.abs(velocity), maxSpeed) * toward : 0
        let last = performance.now()

        const tick = (now: number) => {
            let remaining = Math.min((now - last) / 1000, 1 / 20)
            last = now
            // Small fixed sub-steps keep the spring stable even if a frame is slow
            while (remaining > 0) {
                const h = Math.min(remaining, 1 / 120)
                const accel =
                    -omega * omega * (liveRef.current - target) - 2 * omega * velocityRef.current
                velocityRef.current += accel * h
                liveRef.current += velocityRef.current * h
                remaining -= h
            }

            const done =
                Math.abs(liveRef.current - target) < 0.0005 && Math.abs(velocityRef.current) < 0.01
            if (done) {
                liveRef.current = target
                velocityRef.current = 0
                frameRef.current = null
            }
            setLive(liveRef.current)
            if (!done) frameRef.current = requestAnimationFrame(tick)
        }
        frameRef.current = requestAnimationFrame(tick)
    }

    // Builds on the target we are heading to, so clicking fast adds up
    const goBy = (steps: number) => {
        if (!scrollable || steps === 0) return
        const base = infinite ? targetRef.current : Math.min(targetRef.current, maxPosition)
        const target = infinite ? base + steps : clamp(base + steps, 0, maxPosition)
        animateTo(target, velocityRef.current)
    }
    const go = (direction: 1 | -1) => goBy(direction)

    // --- Drag -----------------------------------------------------------------------

    const startDrag = () => {
        stop() // grab the carousel, even mid-flight
        dragBase.current = liveRef.current
        velocityRef.current = 0
        setDragging(true)
    }

    const moveDrag = (slides: number) => {
        const next = dragBase.current - slides
        liveRef.current = infinite ? next : clamp(next, 0, maxPosition)
        // At most one render per frame, however fast the pointer reports
        if (dragFrameRef.current === null) {
            dragFrameRef.current = requestAnimationFrame(() => {
                dragFrameRef.current = null
                setLive(liveRef.current)
            })
        }
    }

    const releaseDrag = (velocity: number) => {
        setDragging(false)
        if (dragFrameRef.current !== null) {
            cancelAnimationFrame(dragFrameRef.current)
            dragFrameRef.current = null
        }

        const v = momentum ? velocity : 0
        const startSlide = Math.round(dragBase.current)
        const moved = liveRef.current - dragBase.current
        const flick = clamp(v * reach, -maxSlides, maxSlides)

        let target = Math.round(liveRef.current + flick)

        // Ended on the slide it started on: a clear flick or a drag past 20% still moves one slide.
        // A flick wins over the drag direction when both exist.
        if (target === startSlide) {
            if (Math.abs(flick) > 0.1) target = startSlide + Math.sign(flick)
            else if (Math.abs(moved) > 0.2) target = startSlide + Math.sign(moved)
        }
        if (!infinite) target = clamp(target, 0, maxPosition)

        // A flick sets its own duration: the spring settles at the speed you threw it
        const distance = Math.abs(target - liveRef.current)
        const speed = Math.abs(v)
        const movingToward = Math.sign(target - liveRef.current) === Math.sign(v)

        let ms = releaseDuration
        if (momentum && movingToward && speed > 0.5 && distance > 0) {
            const natural = (SETTLE * distance * 1000) / speed / friction
            ms = clamp(natural, minDuration, maxDuration)
        }

        animateTo(target, v, ms)
    }

    // --- Derived values -------------------------------------------------------------

    const active = count > 0 ? mod(position, count) : 0
    const canPrev = scrollable && (infinite || position > 0)
    const canNext = scrollable && (infinite || position < maxPosition)

    return (
        <CarouselContext.Provider
            value={{
                position,
                livePosition,
                active,
                count,
                visible,
                gap,
                type,
                canPrev,
                canNext,
                draggable: draggable && scrollable,
                dragging,
                setCount,
                setVisible,
                go,
                goBy,
                startDrag,
                moveDrag,
                releaseDrag,
            }}
        >
            <section aria-roledescription="carousel" {...props}>
                {children}
            </section>
        </CarouselContext.Provider>
    )
}

const SlideContext = createContext({
    index: 0,       // position in the ring (real slides + copies)
    total: 0,       // ring size
    realIndex: 0,   // index among your real slides
    realCount: 0,
    isClone: false,
})

export function CarouselTrack({ children, style, ...props }: React.ComponentPropsWithoutRef<'div'>) {
    const {
        setCount,
        setVisible,
        gap,
        type,
        visible,
        draggable,
        dragging,
        startDrag,
        moveDrag,
        releaseDrag,
    } = useCarousel()
    const trackRef = useRef<HTMLDivElement>(null)
    const startX = useRef<number | null>(null)
    const originX = useRef(0)         // where the drag really began (after the 5px threshold)
    const stepPx = useRef(1)          // width of one slide + gap, measured when the pointer goes down
    const dragStarted = useRef(false)
    const justDragged = useRef(false) // used to swallow the click that follows a drag
    const samples = useRef<{ x: number; t: number }[]>([])

    // --- Build the ring of slides ---------------------------------------------------

    const slides = Children.toArray(children).filter(isValidElement)
    const n = slides.length
    const infinite = type === 'infinite' && n > 1

    // Repeat the slides until there are enough to fill the track plus a spare on each side.
    // The +3 keeps a wrapping slide from popping in on a partly visible edge.
    const copies = infinite ? Math.ceil((visible + 3) / n) : 1
    const ring = Array.from({ length: n * copies }, (_, index) => ({
        slide: slides[index % n],
        index,
        realIndex: index % n,
        isClone: index >= n,
    }))

    useLayoutEffect(() => {
        setCount(n)
    }, [n, setCount])

    // --- Measure how many whole slides fit, and keep it updated on resize -----------

    useLayoutEffect(() => {
        const track = trackRef.current
        if (!track) return

        const measure = () => {
            const slide = track.querySelector<HTMLElement>('[data-carousel-slide]')
            if (!slide) return
            // offsetWidth ignores transforms, so it's the slide's real width
            const fit = Math.floor((track.clientWidth + gap) / (slide.offsetWidth + gap))
            setVisible(Math.max(1, fit))
        }

        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(track)
        const first = track.querySelector('[data-carousel-slide]')
        if (first) observer.observe(first)
        return () => observer.disconnect()
    }, [gap, n, setVisible])

    // --- Drag and swipe -------------------------------------------------------------

    // Speed over the last ~100ms of movement, in px per ms (negative = moving left)
    const getVelocity = (releaseTime: number) => {
        const s = samples.current
        if (s.length < 2) return 0
        const first = s[0]
        const last = s[s.length - 1]

        // The finger stopped before lifting: no flick
        if (releaseTime - last.t > 50) return 0

        const dt = last.t - first.t
        return dt > 0 ? (last.x - first.x) / dt : 0
    }

    const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return
        const slide = trackRef.current?.querySelector<HTMLElement>('[data-carousel-slide]')
        stepPx.current = slide ? slide.offsetWidth + gap : 1
        startX.current = event.clientX
        originX.current = event.clientX
        samples.current = [{ x: event.clientX, t: event.timeStamp }]
    }

    const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        if (startX.current === null) return

        samples.current.push({ x: event.clientX, t: event.timeStamp })
        while (samples.current.length > 2 && event.timeStamp - samples.current[0].t > 100) {
            samples.current.shift()
        }

        if (!dragStarted.current) {
            if (Math.abs(event.clientX - startX.current) < 5) return // so clicks still work
            dragStarted.current = true
            originX.current = event.clientX // measure from here, so the slides don't jump
            event.currentTarget.setPointerCapture(event.pointerId)
            startDrag()
        }

        moveDrag((event.clientX - originX.current) / stepPx.current)
    }

    const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
        if (startX.current === null) return
        const wasDragging = dragStarted.current
        startX.current = null
        dragStarted.current = false
        if (!wasDragging) return

        justDragged.current = true
        setTimeout(() => {
            justDragged.current = false
        }, 0)

        // px per ms → slides per second, with forward (dragging left) positive
        releaseDrag((-getVelocity(event.timeStamp) * 1000) / stepPx.current)
    }

    return (
        // overflow hidden clips off-screen slides; grid keeps the height of the tallest slide
        <div
            {...props}
            ref={trackRef}
            data-dragging={dragging ? '' : undefined}
            onPointerDown={draggable ? onPointerDown : undefined}
            onPointerMove={draggable ? onPointerMove : undefined}
            onPointerUp={draggable ? onPointerEnd : undefined}
            onPointerCancel={draggable ? onPointerEnd : undefined}
            onClickCapture={
                draggable
                    ? (event) => {
                          if (justDragged.current) {
                              event.preventDefault()
                              event.stopPropagation()
                          }
                      }
                    : undefined
            }
            style={{
                display: 'grid',
                overflow: 'hidden',
                touchAction: 'pan-y', // vertical page scrolling still works on touch
                ...style,
            }}
        >
            {ring.map(({ slide, index, realIndex, isClone }) => (
                <SlideContext.Provider
                    key={`${slide.key ?? realIndex}-${isClone ? index : 'real'}`}
                    value={{ index, total: ring.length, realIndex, realCount: n, isClone }}
                >
                    {slide}
                </SlideContext.Provider>
            ))}
        </div>
    )
}

export function CarouselSlide({ children, style, ...props }: React.ComponentPropsWithoutRef<'div'>) {
    const { position, livePosition, visible, gap, type } = useCarousel()
    const { index, total, realIndex, realCount, isClone } = useContext(SlideContext)

    // Window of [-1, total - 2]: one slide waits on the left, the rest line up to the right.
    // A slide leaving the window reappears at the other end, always off-screen, so the wrap
    // is invisible. The position changes a little every frame, so no jump detection is needed.
    const loops = type === 'infinite' && realCount > 1 && total > 0
    const wrap = (o: number) => (loops ? mod(o + 1, total) - 1 : o)

    const offset = wrap(index - livePosition) // where it is drawn: follows the animation
    const restOffset = wrap(index - position) // where it settles: used for accessibility

    // Copies are never exposed to screen readers or the keyboard.
    // Uses the settled position, so aria attributes don't flicker mid-animation.
    const inWindow = restOffset >= 0 && restOffset < visible
    const isVisible = inWindow && (!isClone || realCount >= visible)

    return (
        <div
            role="group"
            aria-roledescription="slide"
            aria-label={realCount > 0 ? `${realIndex + 1} of ${realCount}` : undefined}
            aria-hidden={!isVisible}
            inert={!isVisible}
            data-active={isVisible ? '' : undefined}
            data-carousel-clone={isClone ? '' : undefined}
            {...props}
            data-carousel-slide=""
            style={{
                gridArea: '1 / 1',
                justifySelf: 'start', // keep the slide's own width instead of stretching
                // 100% in a transform is the slide's own width, so one step = width + gap
                transform: `translateX(calc(${offset} * (100% + ${gap}px)))`,
                willChange: 'transform',
                ...style,
            }}
        >
            {children}
        </div>
    )
}

type ButtonProps = React.ComponentPropsWithoutRef<'button'>

export function CarouselPrev({ children, onClick, ...props }: ButtonProps) {
    const { go, canPrev } = useCarousel()
    return (
        <button
            aria-label="Previous slide"
            disabled={!canPrev}
            {...props}
            type="button"
            onClick={(event) => {
                onClick?.(event)
                go(-1)
            }}
        >
            {children}
        </button>
    )
}

export function CarouselNext({ children, onClick, ...props }: ButtonProps) {
    const { go, canNext } = useCarousel()
    return (
        <button
            aria-label="Next slide"
            disabled={!canNext}
            {...props}
            type="button"
            onClick={(event) => {
                onClick?.(event)
                go(1)
            }}
        >
            {children}
        </button>
    )
}