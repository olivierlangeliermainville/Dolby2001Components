import {defaultLabels} from './defaults'

type CarouselType = 'default' | 'infinite'

export type DragOptions = {
    momentum?: boolean     // flicks carry across several slides (default false)
    reach?: number         // seconds of extra travel a flick adds (default 0.25)
    maxSlides?: number     // most slides one flick can add (default 8)
    friction?: number      // above 0. Higher stops sooner, lower glides longer (default 1)
    duration?: number      // ms: settle time when there is no flick (defaults to `duration`)
    minDuration?: number   // ms: shortest flick settle (default 0)
    maxDuration?: number   // ms: longest flick settle (default 10000)
}

type ScrollOptions = {
    inverse?: boolean // scroll up moves forward, down moves backward (default false)
    intervalAdjustment?: number   // ms: how much to change the interval when a scroll is detected (default 0)
    directionChangeDuration?: number // ms: how long to interpolate the scroll direction change (default 200)
}

type AutoPlayBase = {
    pauseOnHover?: boolean // pause when the pointer is over the carousel (default true). Removing this option is not recommended, since it makes the carousel hard to use for people with motor impairments.
    pauseOnFocus?: boolean // pause when a child has focus (default true). Removing this option is not recommended, since it makes the carousel hard to use for people with motor impairments.
    scrollInfluence?: boolean | ScrollOptions // whether a use scoll changes the carousel autoplay direction (default false). If true, the carousel will move in the direction of the scroll. If false, the carousel will not move in response to scroll events. If an object, it can contain options for customizing the scroll behavior.
    playPauseButton?: boolean // whether to show a play/pause button (default false). If true, a button will be rendered that allows the user to pause and resume the autoplay. If false, no button will be rendered.
    pauseOffScreen?: boolean // whether to pause when the carousel is off-screen (default true). If true, the carousel will pause when it is not visible on the screen. If false, the carousel will continue to autoplay even when it is off-screen.
}
type StepAutoPlay = AutoPlayBase & {
    interval?: number // ms between moves (default 5000)
    speed?: never
    playPauseEasingDuration? : never
    playPauseEasing?: never
    releaseEasingDuration? : never
    releaseEasing?: never
}
// Glide: move continuously, never settling on a slide
type GlideAutoPlay = AutoPlayBase & {
    speed: number // slides per second
    interval?: never
    playPauseEasingDuration? : number
    playPauseEasing?: (t: number) => number
    releaseEasingDuration? : number
    releaseEasing?: (t: number) => number
}

export type AutoPlayOptions = StepAutoPlay | GlideAutoPlay

export type CarouselLabels = typeof defaultLabels



export type CarouselContextValue = {
    position: number     // settled slide (whole number): where it is heading
    livePosition: number // animated position (fractional): where it is drawn
    visible: number      // how many whole slides fit in the track
    gap: number          // px
    type: CarouselType
    labels: CarouselLabels
    canPrev: boolean
    canNext: boolean
    draggable: boolean
    dragging: boolean
    autoPlayable: boolean 
    playing: boolean
    playPauseButton: boolean
    setPlaying: (playing: boolean) => void
    setCount: (n: number) => void
    setVisible: (n: number) => void
    goBy: (steps: number) => void
    startDrag: () => void
    moveDrag: (slides: number) => void      // distance dragged, in slides (right = positive)
    releaseDrag: (velocity: number) => void // slides per second, forward = positive
}



export type NameProps = { 'aria-label': string } | { 'aria-labelledby': string }

export type SharedProps = {
    gap?: number             // px between slides
    duration?: number        // ms: how long Prev and Next take to settle
    reducedMotion?: boolean  // omit to follow the system setting
    drag?: boolean | DragOptions
    labels?: Partial<CarouselLabels>
}

// `type` is the discriminant: its value decides which shape applies
export type ModeProps =
    | { type?: 'default'; autoPlay?: never }
    | { type: 'infinite'; autoPlay?: boolean | AutoPlayOptions }

export type CarouselProps = Omit<React.ComponentPropsWithoutRef<'section'>, 'aria-label' | 'aria-labelledby'> &
    NameProps &
    SharedProps &
    ModeProps




export type ButtonProps = React.ComponentPropsWithoutRef<'button'>