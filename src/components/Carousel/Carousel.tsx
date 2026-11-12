"use client"
import {
    useContext,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    Children,
    isValidElement,
} from 'react'
import type { CarouselProps, DragOptions, AutoPlayOptions, ButtonProps } from './types'
import { defaultLabels, SETTLE } from './defaults'
import { visuallyHidden, useSystemReducedMotion, clamp, mod } from './helpers'
import { useCarousel, CarouselContext, SlideContext } from './context'


export default function Carousel({
    children,
    type = 'default',
    gap = 0,
    duration = 300,
    reducedMotion,
    drag = false,
    autoPlay = false,
    labels: labelOverrides,
    ...props
}: CarouselProps) {
    // --- Options --------------------------------------------------------------------

    const draggable = drag !== false
    const {
        momentum = false,
        reach = 0.25,
        maxSlides = 8,
        friction = 1,
        duration: releaseDuration = duration,
        minDuration = 0,
        maxDuration = 10000,
    }: DragOptions = typeof drag === 'object' ? drag : {}
    const {
        interval = 5000,
        speed,
        playPauseEasingDuration = 0,
        releaseEasingDuration = playPauseEasingDuration,
        pauseOnHover = true,
        pauseOnFocus = true,
        playPauseButton=true,
        releaseEasing = (t: number) => t,
        playPauseEasing = (t: number) => t,
    }: AutoPlayOptions = typeof autoPlay === 'object' ? autoPlay : {}
    const labels = { ...defaultLabels, ...labelOverrides }

    // --- State ----------------------------------------------------------------------

    const [live, setLive] = useState(0)       // drawn position (float)
    const [settled, setSettled] = useState(0) // target slide (whole number)
    const [count, setCount] = useState(0)
    const [visible, setVisible] = useState(1)
    const [dragging, setDragging] = useState(false)
    const [moved, setMoved] = useState(false) // false until the first move: nothing is announced on load
    const [playing, setPlaying] = useState(true)  // the user's choice: the play/pause button, or keyboard focus
    const [hovered, setHovered] = useState(false) // a temporary pause: autoplay resumes when the pointer leaves

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
    const scrollable = infinite || count > visible
    const maxPosition = Math.max(0, count - visible)

    // In default mode the last slide stops at the right edge; resizing can't leave us past it
    const position = infinite ? settled : Math.min(settled, maxPosition)
    const livePosition = infinite ? live : clamp(live, 0, maxPosition)

    const easings = useRef({ playPause: playPauseEasing, release: releaseEasing })
    useLayoutEffect(() => {
        easings.current = { playPause: playPauseEasing, release: releaseEasing }
    })

    // Autoplay is derived in three levels, each stricter than the last, never stored:
    // autoPlayOn: autoplay is switched on and allowed to move.
    // canRun:     ...and nobody is dragging (a drag takes over at once, with no easing).
    // running:    ...and no soft pause (button, keyboard focus, hover), which glide mode eases into.
    const autoPlayOn = !!autoPlay && infinite && !reduced
    const canRun = autoPlayOn && !dragging
    const running = canRun && playing && !hovered

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
        setMoved(true)

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

    // Builds on the target we are heading to, so clicking fast adds up.
    // The Prev/Next buttons already refuse to call this when they can't move.
    const goBy = (steps: number) => {
        const base = infinite ? targetRef.current : Math.min(targetRef.current, maxPosition)
        animateTo(infinite ? base + steps : clamp(base + steps, 0, maxPosition), velocityRef.current)
    }

    // --- Autoplay -------------------------------------------------------------------

    // goBy is recreated on every render (and the carousel renders every animation frame), so the
    // timer reads the latest one through a ref instead of restarting itself whenever it changes
    const goByRef = useRef(goBy)
    useLayoutEffect(() => {
        goByRef.current = goBy
    })

    // Step mode: wait `interval` ms, then move one slide with a spring.
    // `settled` is a dependency, so any move (including a manual one) restarts the wait.
    useEffect(() => {
        if (!running || speed) return

        let frame = 0
        let last = performance.now()
        let elapsed = 0 // ms since the last step

        const tick = (now: number) => {
            // Capped, so coming back to a hidden tab doesn't trigger a jump
            elapsed += Math.min(now - last, 50)
            last = now

            if (elapsed >= interval) {
                elapsed = 0
                goByRef.current(1)
            }
            frame = requestAnimationFrame(tick)
        }

        frame = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(frame)
    }, [running, interval, speed, settled])

    // Glide mode: move a little every frame at `glideVelocity` (slides per second).
    // Every time the goal changes (resume, pause, drag release) the effect restarts and eases the
    // velocity from wherever it is now to the new goal: `speed` while running, 0 while paused.
    // The velocity lives in a ref, so it survives the restart.
    const glideVelocity = useRef(0)
    const afterRelease = useRef(false) // set by a drag release, so its ease can be slower

    useEffect(() => {
        if (!speed || !canRun) {
            glideVelocity.current = 0 // not gliding, or a drag has taken over
            return
        }
        const goal = running ? speed : 0
        const ease = afterRelease.current
            ? { duration: releaseEasingDuration, easing: easings.current.release }
            : { duration: playPauseEasingDuration, easing: easings.current.playPause }
        afterRelease.current = false
        if (goal === 0 && glideVelocity.current === 0) return // already still: nothing to run

        let from = glideVelocity.current // where the ease starts: rest, a flick, or mid-ease
        let eased = 0                    // ms into the ease
        let frame = 0
        let last = performance.now()

        const tick = (now: number) => {
            // Capped, so coming back to a hidden tab doesn't trigger a jump
            const dt = Math.min(now - last, 50)
            last = now

            if (frameRef.current !== null) {
                // A spring is settling (a Prev/Next press, or a drag release that didn't hand over).
                // It owns the position and ends at rest, so the ease starts over from zero after it.
                glideVelocity.current = 0
                from = 0
                eased = 0
            } else {
                // Ease-in-out (smoothstep): the velocity starts changing gently, speeds up the change,
                // then settles into the goal. Zero duration means no easing.
                eased += dt
                const p = ease.duration > 0 ? Math.min(eased / ease.duration, 1) : 1
                glideVelocity.current = p >= 1 ? goal : from + (goal - from) * ease.easing(p)
                if (p<1){
                    console.log(glideVelocity.current)
                }

                if (glideVelocity.current !== 0) {
                    liveRef.current += (glideVelocity.current * dt) / 1000
                    const slide = Math.round(liveRef.current)
                    targetRef.current = slide // so a later Prev/Next builds on where we are
                    setSettled(slide)         // drives which slides screen readers can reach
                    setLive(liveRef.current)
                }
            }

            // Eased all the way to a stop: no more frames until it is resumed
            if (goal === 0 && glideVelocity.current === 0) return
            frame = requestAnimationFrame(tick)
        }

        frame = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(frame)
    }, [running, canRun, speed, playPauseEasingDuration, releaseEasingDuration])

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

        // Glide mode: a release aims for `speed`, not for a stop. Skip the snap-to-a-slide spring and
        // carry the release velocity into the glide, which eases from it to `speed`. A mouse is still
        // over the carousel at this point, so clear the hover pause too (the next time the pointer
        // enters, it applies again). Only a deliberate pause (button or keyboard focus) is respected.
        if (speed && autoPlayOn && playing) {
            glideVelocity.current = v
            afterRelease.current = true
            setHovered(false)
            return
        }

        const startSlide = Math.round(dragBase.current)
        const dragged = liveRef.current - dragBase.current
        const flick = clamp(v * reach, -maxSlides, maxSlides)

        let target = Math.round(liveRef.current + flick)

        // Ended on the slide it started on: a clear flick or a drag past 20% still moves one slide.
        // A flick wins over the drag direction when both exist.
        if (target === startSlide) {
            if (Math.abs(flick) > 0.1) target = startSlide + Math.sign(flick)
            else if (Math.abs(dragged) > 0.2) target = startSlide + Math.sign(dragged)
        }
        if (!infinite) target = clamp(target, 0, maxPosition)

        // A flick sets its own duration: the spring settles at the speed you threw it
        const distance = Math.abs(target - liveRef.current)
        const flickSpeed = Math.abs(v)
        const movingToward = Math.sign(target - liveRef.current) === Math.sign(v)

        let ms = releaseDuration
        if (momentum && movingToward && flickSpeed > 0.5 && distance > 0) {
            const natural = (SETTLE * distance * 1000) / flickSpeed / Math.max(friction, 0.01)
            ms = clamp(natural, minDuration, maxDuration)
        }

        animateTo(target, v, ms)
    }

    // --- Derived values -------------------------------------------------------------

    // Announced after Prev, Next or a drag, since focus stays on the button. It reads the settled
    // position, so it speaks once per move rather than on every animation frame. It stays silent
    // while autoplay is running, or a screen reader would read out a new slide every few seconds.
    const first = (count > 0 ? mod(position, count) : 0) + 1
    const last = visible >= count ? first : mod(position + visible - 1, count) + 1
    const status = moved && !dragging && !running ? labels.status(first, last, count) : ''

    return (
        <CarouselContext.Provider
            value={{
                position,
                livePosition,
                visible,
                gap,
                type,
                labels,
                canPrev: scrollable && (infinite || position > 0),
                canNext: scrollable && (infinite || position < maxPosition),
                draggable: draggable && scrollable,
                dragging,
                autoPlayable: !!autoPlay,
                playing,
                playPauseButton,
                setPlaying,
                setCount,
                setVisible,
                goBy,
                startDrag,
                moveDrag,
                releaseDrag,
            }}
        >
            <section
                aria-roledescription="carousel"
                {...props}
                // Your own handlers still run: these wrap them instead of replacing them
                onPointerEnter={(event) => {
                    props.onPointerEnter?.(event)
                    // Mouse only: a touch has no "leave", so it would leave autoplay stuck on pause
                    if (pauseOnHover && event.pointerType === 'mouse') setHovered(true)
                }}
                onPointerLeave={(event) => {
                    props.onPointerLeave?.(event)
                    setHovered(false)
                }}
                onFocus={(event) => {
                    props.onFocus?.(event)
                    // Keyboard focus stops rotation until the user presses play (not on mouse clicks,
                    // or clicking the pause button would pause, then un-pause itself)
                    if (pauseOnFocus && event.target.matches(':focus-visible')) setPlaying(false)
                }}
            >
                {children}
                <div role="status" aria-atomic="true" style={visuallyHidden}>
                    {status}
                </div>
            </section>
        </CarouselContext.Provider>
    )
}


export function CarouselTrack({ children, style, ...props }: React.ComponentPropsWithoutRef<'div'>) {
    const {
        setCount,
        setVisible,
        gap,
        type,
        position,
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

    // Slides are placed with transforms, so screen readers and Tab follow the DOM order, not the
    // drawn order. The visible slides are consecutive around the ring, but the DOM is a line, so
    // they would be read out of order when they wrap past its end. Start the list at a "seam"
    // that moves in blocks, so the visible slides always sit in one run (the ring always has at
    // least visible + 3 slides, so a block is at least 4 and the list reorders only occasionally).
    const total = ring.length
    const block = total - visible + 1
    const seam = infinite ? mod(Math.floor(position / block) * block, total) : 0
    const ordered = [...ring.slice(seam), ...ring.slice(0, seam)]

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

    const dragProps = draggable
        ? {
              onPointerDown,
              onPointerMove,
              onPointerUp: onPointerEnd,
              onPointerCancel: onPointerEnd,
              // swallow the click that follows a drag
              onClickCapture: (event: React.MouseEvent) => {
                  if (justDragged.current) {
                      event.preventDefault()
                      event.stopPropagation()
                  }
              },
          }
        : {}

    return (
        // overflow hidden clips off-screen slides; grid keeps the height of the tallest slide
        <div
            {...props}
            ref={trackRef}
            data-dragging={dragging ? '' : undefined}
            {...dragProps}
            style={{
                display: 'grid',
                overflow: 'hidden',
                touchAction: 'pan-y', // vertical page scrolling still works on touch
                ...style,
            }}
        >
            {ordered.map(({ slide, index, realIndex, isClone }) => (
                <SlideContext.Provider
                    key={`${slide.key ?? realIndex}-${isClone ? index : 'real'}`}
                    value={{ index, total, realIndex, realCount: n, isClone }}
                >
                    {slide}
                </SlideContext.Provider>
            ))}
        </div>
    )
}

export function CarouselSlide({ children, style, ...props }: React.ComponentPropsWithoutRef<'div'>) {
    const { position, livePosition, visible, gap, type, labels } = useCarousel()
    const { index, total, realIndex, realCount, isClone } = useContext(SlideContext)

    // Window of [-1, total - 2]: one slide waits on the left, the rest line up to the right.
    // A slide leaving the window reappears at the other end, always off-screen, so the wrap
    // is invisible. The position changes a little every frame, so no jump detection is needed.
    const loops = type === 'infinite' && realCount > 1 && total > 0
    const wrap = (o: number) => (loops ? mod(o + 1, total) - 1 : o)

    const offset = wrap(index - livePosition) // where it is drawn: follows the animation
    const restOffset = wrap(index - position) // where it settles: used for accessibility

    // Only the slides on screen are exposed to screen readers and the keyboard, using the settled
    // position so nothing flickers mid-animation. Copies are exposed only when the visible window
    // lands on them instead of the originals, which keeps each real slide exposed at most once.
    const isVisible = restOffset >= 0 && restOffset < visible && (!isClone || realCount >= visible)

    return (
        <div
            // `inert` is set as a property because React 18 ignores the attribute and React 19
            // treats it as a boolean. The property behaves the same in both.
            ref={(el) => {
                if (el) el.inert = !isVisible
            }}
            role="group"
            aria-roledescription="slide"
            aria-label={realCount > 0 ? labels.slide(realIndex + 1, realCount) : undefined}
            aria-hidden={isVisible ? undefined : true}
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


function CarouselButton({ direction, onClick, ...props }: ButtonProps & { direction: 1 | -1 }) {
    const { goBy, canPrev, canNext, labels } = useCarousel()
    const enabled = direction === 1 ? canNext : canPrev
    return (
        <button
            aria-label={direction === 1 ? labels.next : labels.prev}
            aria-disabled={enabled ? undefined : true}
            {...props}
            type="button"
            onClick={(event) => {
                if (!enabled) return
                onClick?.(event)
                goBy(direction)
            }}
        />
    )
}

export function CarouselPrev(props: ButtonProps) {
    return <CarouselButton direction={-1} {...props} />
}

export function CarouselNext(props: ButtonProps) {
    return <CarouselButton direction={1} {...props} />
}

// Place this first inside <Carousel>, before the slides, so it is first in the Tab order.
// The label changes with what pressing it will do, so it carries no aria-pressed.
export function CarouselPlayPause({ onClick, ...props }: ButtonProps) {
    const { playing, setPlaying, autoPlayable, labels, playPauseButton } = useCarousel()
    if (!autoPlayable && !playPauseButton) return null
    return (
        <button
            aria-label={playing ? labels.pause : labels.play}
            {...props}
            type="button"
            onClick={(event) => {
                onClick?.(event)
                setPlaying(!playing)
            }}
        />
    )
}