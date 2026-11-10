import CarouselRoot, {
    CarouselTrack,
    CarouselSlide,
    CarouselPrev,
    CarouselNext,
} from './Carousel'

export const Carousel = Object.assign(CarouselRoot, {
    Track: CarouselTrack,
    Slide: CarouselSlide,
    Prev: CarouselPrev,
    Next: CarouselNext,
})

export { CarouselTrack, CarouselSlide, CarouselPrev, CarouselNext }