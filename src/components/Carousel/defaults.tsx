export const defaultLabels = {
    pause: 'Stop slide rotation',
    play: 'Start slide rotation',
    prev: 'Previous slide',
    next: 'Next slide',
    slide: (index: number, count: number) => `${index} of ${count}`,
    status: (first: number, last: number, count: number) =>
        first === last ? `Slide ${first} of ${count}` : `Slides ${first} to ${last} of ${count}`,
}

export const SETTLE = 5.8 // omega × seconds for a critically damped spring to settle